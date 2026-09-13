/* ══════════════════════════════════════════════════════════
   Teacher Toolshed — sync through the teacher's OWN cloud drive (Pro)

   TIERS-PLAN.md §T3. Off by default. When a Pro teacher switches it on,
   the browser keeps a copy of the same JSON that Export produces in the
   app-private folder of the teacher's own Google Drive or OneDrive:

     export on change (debounced)  →  upload
     import on open                →  download, merge, newer wins

   The OAuth token comes straight from Google or Microsoft to this page
   and is stored in the store's `meta` table. Nothing — token or file —
   ever passes through a server we run; there is none. The licence
   record is deliberately NOT part of the synced file: a licence is
   per device, the data is not.

   Until the OAuth clients exist, `config.google.clientId` and
   `config.microsoft.clientId` are null and connect() explains that sync
   is not switched on yet. When they are set, add these to connect-src
   in `_headers` (see the comment there):
     https://www.googleapis.com  https://graph.microsoft.com
     https://login.microsoftonline.com
   Google uses the implicit token flow (no secret, ~1 hour tokens, so a
   "Reconnect" appears on Class Lists when it lapses). Microsoft uses the
   authorization-code flow with PKCE, which its SPA registrations allow
   from a browser and which refreshes itself.

   Only Class Lists starts a connection (it needs a redirect back to the
   page). Every other teacher page loads this module too, so a change made
   in a tool is pushed and a fresh open pulls first. Student pages never
   load it.

   Usage:
     await ToolshedSync.ready()
     ToolshedSync.status()            → {enabled, provider, state, lastSyncedAt, error}
     ToolshedSync.connect('google')   → redirects to consent, returns here
     ToolshedSync.syncNow()           → pull, merge, push
     ToolshedSync.disconnect()        → forget the token; the file stays in the drive
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var META_KEY = 'sync';
  var PUSH_DELAY = 4000;

  var config = {
    fileName: 'teacher-toolshed-backup.json',
    google: {
      clientId: null,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      api: 'https://www.googleapis.com'
    },
    microsoft: {
      clientId: null,
      scope: 'Files.ReadWrite.AppFolder offline_access',
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      api: 'https://graph.microsoft.com/v1.0'
    }
  };

  var record = null;       // {provider, enabled, token, tokenExpiresAt, refreshToken, lastSyncedAt, lastHash, remoteId}
  var state = 'off';       // off | ok | syncing | reconnect | error | unavailable
  var lastError = null;
  var busy = null;         // promise of the sync in flight
  var pushTimer = null;
  var listeners = [];
  var readyPromise = null;

  // ── helpers ──────────────────────────────────────────────

  function now() { return Date.now(); }
  function iso() { return new Date().toISOString(); }
  function rand() {
    var a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return b64url(a);
  }
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return b64url(new Uint8Array(buf));
    });
  }
  function hashOf(str) {           // cheap change detector for "did the data change since the last push"
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function redirectUri() {
    return location.origin + location.pathname;
  }
  function onClassLists() {
    return /\/rosters\.html$/.test(location.pathname);
  }
  function available(provider) {
    return !!(config[provider] && config[provider].clientId);
  }

  function setState(s, err) {
    state = s;
    lastError = err ? String(err.message || err) : null;
    listeners.forEach(function (fn) { try { fn(status()); } catch (e) {} });
  }

  function status() {
    return {
      enabled: !!(record && record.enabled),
      provider: record ? record.provider : null,
      state: record && record.enabled ? state : 'off',
      lastSyncedAt: record ? record.lastSyncedAt : null,
      error: lastError,
      available: { google: available('google'), microsoft: available('microsoft') }
    };
  }

  function load() {
    return ToolshedStore.getMeta(META_KEY).then(function (v) { record = v && typeof v === 'object' ? v : null; return record; })
      .catch(function () { record = null; return null; });
  }
  function save(rec) {
    record = rec;
    return (rec ? ToolshedStore.setMeta(META_KEY, rec) : ToolshedStore.deleteMeta(META_KEY)).catch(function () {});
  }

  // ── tokens ───────────────────────────────────────────────

  function tokenValid() {
    return !!(record && record.token && (!record.tokenExpiresAt || Date.parse(record.tokenExpiresAt) - 60000 > now()));
  }

  function ensureToken() {
    if (tokenValid()) return Promise.resolve(record.token);
    if (record && record.provider === 'microsoft' && record.refreshToken) {
      var ms = config.microsoft;
      return fetch(ms.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ client_id: ms.clientId, grant_type: 'refresh_token', refresh_token: record.refreshToken, scope: ms.scope })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.access_token) throw new Error('reconnect');
        record.token = j.access_token;
        record.refreshToken = j.refresh_token || record.refreshToken;
        record.tokenExpiresAt = new Date(now() + (j.expires_in || 3600) * 1000).toISOString();
        return save(record).then(function () { return record.token; });
      });
    }
    return Promise.reject(new Error('reconnect'));
  }

  function form(obj) {
    return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }

  // ── connect / redirect handling (Class Lists only) ───────

  function connect(provider) {
    if (!window.ToolshedLicence || !ToolshedLicence.can('sync')) {
      return Promise.reject(new Error('Sync is part of Pro.'));
    }
    if (!available(provider)) {
      return Promise.reject(new Error('Sync is not switched on yet. Until it is, Export and Import on this page do the same job by hand.'));
    }
    if (!onClassLists()) return Promise.reject(new Error('Connect from the Class Lists page.'));
    var st = rand();
    if (provider === 'google') {
      var g = config.google;
      return save({ provider: 'google', enabled: false, pendingState: st }).then(function () {
        location.assign(g.authUrl + '?' + form({
          client_id: g.clientId, redirect_uri: redirectUri(), response_type: 'token',
          scope: g.scope, state: st, include_granted_scopes: 'true', prompt: 'select_account'
        }));
      });
    }
    var ms = config.microsoft;
    var verifier = rand();
    return sha256(verifier).then(function (challenge) {
      return save({ provider: 'microsoft', enabled: false, pendingState: st, pendingVerifier: verifier }).then(function () {
        location.assign(ms.authUrl + '?' + form({
          client_id: ms.clientId, redirect_uri: redirectUri(), response_type: 'code',
          scope: ms.scope, state: st, code_challenge: challenge, code_challenge_method: 'S256', response_mode: 'query'
        }));
      });
    });
  }

  /* On Class Lists, finish a connection the provider redirected back from. */
  function handleRedirect() {
    if (!record || !record.pendingState) return Promise.resolve(false);
    var params;
    if (record.provider === 'google' && /access_token=/.test(location.hash)) {
      params = new URLSearchParams(location.hash.slice(1));
      if (params.get('state') !== record.pendingState) return Promise.resolve(false);
      history.replaceState(null, '', location.pathname);
      return save({
        provider: 'google', enabled: true, token: params.get('access_token'),
        tokenExpiresAt: new Date(now() + (parseInt(params.get('expires_in'), 10) || 3600) * 1000).toISOString(),
        lastSyncedAt: null, lastHash: null, remoteId: null
      }).then(function () { return true; });
    }
    if (record.provider === 'microsoft' && /[?&]code=/.test(location.search)) {
      params = new URLSearchParams(location.search);
      if (params.get('state') !== record.pendingState) return Promise.resolve(false);
      history.replaceState(null, '', location.pathname);
      var ms = config.microsoft;
      return fetch(ms.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ client_id: ms.clientId, grant_type: 'authorization_code', code: params.get('code'),
                     redirect_uri: redirectUri(), code_verifier: record.pendingVerifier, scope: ms.scope })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.access_token) throw new Error(j.error_description || 'Microsoft did not return a token.');
        return save({
          provider: 'microsoft', enabled: true, token: j.access_token, refreshToken: j.refresh_token || null,
          tokenExpiresAt: new Date(now() + (j.expires_in || 3600) * 1000).toISOString(),
          lastSyncedAt: null, lastHash: null, remoteId: null
        }).then(function () { return true; });
      });
    }
    if (/error=/.test(location.hash + location.search)) {
      history.replaceState(null, '', location.pathname);
      return save(null).then(function () { throw new Error('The sign-in was cancelled or refused.'); });
    }
    return Promise.resolve(false);
  }

  function disconnect() {
    clearTimeout(pushTimer);
    return save(null).then(function () { setState('off'); });
  }

  // ── drive clients ────────────────────────────────────────
  // Each returns {pull(): Promise<string|null>, push(text): Promise<void>}.

  function authed(token, extra) {
    var h = { Authorization: 'Bearer ' + token };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  var google = {
    find: function (token) {
      if (record.remoteId) return Promise.resolve(record.remoteId);
      var url = config.google.api + '/drive/v3/files?' + form({
        spaces: 'appDataFolder', fields: 'files(id,name)', q: "name='" + config.fileName + "'"
      });
      return fetch(url, { headers: authed(token) }).then(checkAuth).then(function (r) { return r.json(); }).then(function (j) {
        var f = (j.files || [])[0];
        return f ? f.id : null;
      });
    },
    pull: function (token) {
      return google.find(token).then(function (id) {
        if (!id) return null;
        record.remoteId = id;
        return fetch(config.google.api + '/drive/v3/files/' + id + '?alt=media', { headers: authed(token) })
          .then(checkAuth).then(function (r) { return r.text(); });
      });
    },
    push: function (token, text) {
      return google.find(token).then(function (id) {
        if (id) {
          return fetch(config.google.api + '/upload/drive/v3/files/' + id + '?uploadType=media', {
            method: 'PATCH', headers: authed(token, { 'Content-Type': 'application/json' }), body: text
          }).then(checkAuth);
        }
        var boundary = 'tts' + rand().slice(0, 12);
        var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify({ name: config.fileName, parents: ['appDataFolder'] }) +
          '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + text + '\r\n--' + boundary + '--';
        return fetch(config.google.api + '/upload/drive/v3/files?uploadType=multipart&fields=id', {
          method: 'POST', headers: authed(token, { 'Content-Type': 'multipart/related; boundary=' + boundary }), body: body
        }).then(checkAuth).then(function (r) { return r.json(); }).then(function (j) { record.remoteId = j.id || null; });
      });
    }
  };

  var microsoft = {
    url: function () { return config.microsoft.api + '/me/drive/special/approot:/' + encodeURIComponent(config.fileName) + ':/content'; },
    pull: function (token) {
      return fetch(microsoft.url(), { headers: authed(token) }).then(function (r) {
        if (r.status === 404) return null;
        return checkAuth(r).text();
      });
    },
    push: function (token, text) {
      return fetch(microsoft.url(), { method: 'PUT', headers: authed(token, { 'Content-Type': 'application/json' }), body: text })
        .then(checkAuth);
    }
  };

  function checkAuth(r) {
    if (r.status === 401 || r.status === 403) throw new Error('reconnect');
    if (!r.ok) throw new Error('The drive answered ' + r.status + '.');
    return r;
  }

  function client() { return record.provider === 'microsoft' ? microsoft : google; }

  // ── the sync itself ──────────────────────────────────────

  /* The synced file is the backup minus the licence record. */
  function exportForSync() {
    return ToolshedStore.exportAll().then(function (json) {
      var obj = JSON.parse(json);
      delete obj.meta;
      return JSON.stringify(obj);
    });
  }

  var importing = false;

  function syncNow(opts) {
    opts = opts || {};
    if (!record || !record.enabled) return Promise.resolve(status());
    if (busy) return busy;
    setState('syncing');
    busy = ensureToken().then(function (token) {
      var c = client();
      var pull = opts.pushOnly ? Promise.resolve(null) : c.pull(token);
      return pull.then(function (remote) {
        if (remote) {
          importing = true;
          return ToolshedStore.importAll(remote, { merge: true }).catch(function () {}).then(function () { importing = false; });
        }
      }).then(exportForSync).then(function (text) {
        var h = hashOf(text);
        if (h === record.lastHash && !opts.force) return;
        return c.push(token, text).then(function () { record.lastHash = h; });
      }).then(function () {
        record.lastSyncedAt = iso();
        return save(record);
      }).then(function () { setState('ok'); });
    }).catch(function (e) {
      if (String(e.message) === 'reconnect') setState('reconnect', new Error('Sign in again to keep syncing.'));
      else setState('error', e);
    }).then(function () { busy = null; return status(); });
    return busy;
  }

  function schedulePush() {
    if (!record || !record.enabled || importing) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { syncNow({ pushOnly: true }); }, PUSH_DELAY);
  }

  // ── boot ─────────────────────────────────────────────────

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = ToolshedStore.ready().then(load).then(function () {
      ToolshedStore.onChange(schedulePush);
      if (!record) { setState('off'); return status(); }
      if (record.pendingState && onClassLists()) {
        return handleRedirect().then(function (finished) {
          if (finished) return syncNow({ force: true });
          setState('off');
          return status();
        }).catch(function (e) { setState('error', e); return status(); });
      }
      if (!record.enabled) { setState('off'); return status(); }
      if (!available(record.provider)) { setState('unavailable', new Error('Sync is not switched on in this build.')); return status(); }
      if (!tokenValid() && !(record.provider === 'microsoft' && record.refreshToken)) { setState('reconnect', new Error('Sign in again to keep syncing.')); return status(); }
      // Import on open, then push anything newer.
      return syncNow();
    });
    return readyPromise;
  }

  window.ToolshedSync = {
    config: config,
    ready: ready,
    status: status,
    connect: connect,
    disconnect: disconnect,
    syncNow: syncNow,
    onChange: function (fn) { listeners.push(fn); }
  };

  if (window.ToolshedStore) ready();
})();
