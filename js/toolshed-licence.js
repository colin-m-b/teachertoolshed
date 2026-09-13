/* ══════════════════════════════════════════════════════════
   Teacher Toolshed — licence (Free / Pro)

   A licence is a proof of purchase, not an account. The teacher pastes a
   key on the Class Lists page; the browser sends ONLY that key to the
   merchant of record's public licence endpoint and keeps the answer here,
   in IndexedDB (the store's `meta` table), so a JSON backup round-trips it.
   No email, no roster, no student data is ever part of the request.
   See TIERS-PLAN.md §D2–D3.

   Enforcement is client-side and honest about it: every gate in the tools
   is a polite notice, not a wall. Nothing a student sees is gated, nothing
   that fires during a lesson is gated, and export of the teacher's own
   data is never gated.

   Until a merchant of record exists, `config.api` is null: activate() then
   explains that Pro is not on sale yet, and every gate still works. To try
   the Pro side of a tool before then, open DevTools and run

       ToolshedLicence.preview(30)      // Pro for 30 days, this browser only
       ToolshedLicence.deactivate()     // back to Free

   Usage:
     await ToolshedLicence.ready()
     ToolshedLicence.can('csv')                  → true / false
     ToolshedLicence.can('classes', count)       → true while under the limit
     ToolshedLicence.assertCan('classes', count) → {ok, limit, tier, upgradeUrl}
     ToolshedLicence.gate('csv', 'CSV export')   → a .notice element to append
     await ToolshedLicence.activate(key)         → status
     await ToolshedLicence.status()              → {tier, plan, validUntil, …}
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var META_KEY = 'licence';
  var DAY = 24 * 60 * 60 * 1000;
  var RECHECK_AFTER = 30 * DAY;   // silent re-validation interval
  var GRACE = 90 * DAY;           // offline grace before reverting to Free

  /* ── Merchant-of-record configuration ─────────────────────
     Filled in when the store exists (TIERS-PLAN.md §D4: Lemon Squeezy).
     `api` null means "not on sale yet". The three endpoints are Lemon
     Squeezy's public License API, which needs no secret and is meant to
     be called from a client:
       POST {api}/activate    license_key, instance_name
       POST {api}/validate    license_key, instance_id
       POST {api}/deactivate  license_key, instance_id
     When this is switched on, add the API origin to connect-src in
     `_headers` (there is a commented line ready for it). */
  var config = {
    provider: 'lemonsqueezy',
    api: null,                 // e.g. 'https://api.lemonsqueezy.com/v1/licenses'
    checkoutUrl: null,         // e.g. 'https://teachertoolshed.lemonsqueezy.com/checkout/buy/…'
    /* Map the MoR's variant name (lower-cased) to a plan id, so the
       activation UI can say "Pro, annual" rather than echo a product name. */
    plans: {
      'pro annual': 'pro-annual',
      'pro monthly': 'pro-monthly',
      'founding year': 'pro-founding',
      'department': 'department',
      'school': 'school'
    }
  };

  /* ── What Free allows ─────────────────────────────────────
     Counted features carry a Free limit; boolean features are Pro-only.
     Keep this table and pricing.html in agreement. */
  var LIMITS = {
    classes: 2,        // saved class lists
    rubrics: 1,        // saved rubrics (shared by both trackers)
    charts: 1,         // saved seating charts
    hexActivities: 1,  // saved hexagon activities
    tasks: 1,          // saved PureWrite tasks
    sessions: 1        // saved tracker sessions kept per tool
  };
  var PRO_ONLY = {
    csv: 'CSV export',
    pdf: 'PDF download',
    history: 'Session history',
    report: 'Term participation report',
    perStudent: 'Per-student view',
    constraints: 'Seating constraints',
    integrityCover: 'Integrity cover page',
    brandedHeader: 'Class-branded export header',
    hexSheets: 'Printable hexagon sheets',
    sync: 'Sync through your own cloud drive'
  };
  var LABELS = {
    classes: 'class lists',
    rubrics: 'saved rubrics',
    charts: 'saved charts',
    hexActivities: 'saved activities',
    tasks: 'saved tasks',
    sessions: 'saved sessions'
  };

  // ── state ────────────────────────────────────────────────

  var record = null;      // what is stored under meta.licence, or null
  var readyPromise = null;

  function now() { return Date.now(); }

  function pricingUrl() {
    return /\/teacher-tools\//.test(location.pathname) ? '../pricing.html' : 'pricing.html';
  }

  function isPro(rec) {
    if (!rec || rec.status !== 'active') return false;
    var checked = Date.parse(rec.checkedAt || '') || 0;
    if (now() - checked > GRACE) return false;                 // 90 days unverified
    if (rec.source === 'preview') {
      return !!rec.validUntil && Date.parse(rec.validUntil) > now();
    }
    return true;
  }

  function tierOf(rec) { return isPro(rec) ? 'pro' : 'free'; }

  function publicStatus() {
    var rec = record;
    return {
      tier: tierOf(rec),
      plan: rec ? rec.plan : null,
      source: rec ? rec.source : null,
      status: rec ? rec.status : null,          // active | expired | invalid | disabled
      validUntil: rec ? rec.validUntil : null,
      checkedAt: rec ? rec.checkedAt : null,
      activations: rec ? rec.activations : null, // {used, limit}
      keyHint: rec && rec.key ? maskKey(rec.key) : null,
      graceEndsAt: rec && rec.checkedAt ? new Date(Date.parse(rec.checkedAt) + GRACE).toISOString() : null,
      onSale: !!config.api,
      checkoutUrl: config.checkoutUrl,
      upgradeUrl: pricingUrl()
    };
  }

  function maskKey(key) {
    var k = String(key);
    return k.length > 8 ? k.slice(0, 4) + '…' + k.slice(-4) : '…';
  }

  // ── persistence (via ToolshedStore.meta) ─────────────────

  function load() {
    return ToolshedStore.getMeta(META_KEY).then(function (v) {
      record = v && typeof v === 'object' ? v : null;
      return record;
    }).catch(function () { record = null; return null; });
  }

  function save(rec) {
    record = rec;
    return (rec ? ToolshedStore.setMeta(META_KEY, rec) : ToolshedStore.deleteMeta(META_KEY))
      .catch(function () {}).then(function () { emit(); return publicStatus(); });
  }

  // ── merchant of record ───────────────────────────────────

  function post(path, fields) {
    if (!config.api) return Promise.reject(new Error('Pro is not on sale yet.'));
    var body = Object.keys(fields).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]);
    }).join('&');
    return fetch(config.api + '/' + path, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        json.__http = res.status;
        return json;
      });
    });
  }

  /* Turn a Lemon Squeezy licence response into our record shape. */
  function recordFrom(json, key, prev) {
    var lk = json.license_key || {};
    var meta = json.meta || {};
    var variant = String(meta.variant_name || '').toLowerCase();
    var status = lk.status || (json.valid ? 'active' : 'invalid');
    return {
      key: key,
      source: config.provider,
      plan: config.plans[variant] || (variant ? variant.replace(/\s+/g, '-') : (prev && prev.plan) || 'pro'),
      status: status,                             // active | inactive | expired | disabled
      validUntil: lk.expires_at || null,
      checkedAt: new Date().toISOString(),
      instanceId: (json.instance && json.instance.id) || (prev && prev.instanceId) || null,
      activations: { used: lk.activation_usage || 0, limit: lk.activation_limit || null }
    };
  }

  function instanceName() {
    var ua = navigator.userAgent || '';
    var browser = /Firefox/.test(ua) ? 'Firefox' : /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Browser';
    var os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : '';
    return (browser + (os ? ' on ' + os : '') + ' · ' + new Date().toISOString().slice(0, 10));
  }

  function activate(key) {
    key = String(key || '').trim();
    if (!key) return Promise.reject(new Error('Paste the licence key from your receipt.'));
    if (!config.api) {
      return Promise.reject(new Error('Pro is not on sale yet. Everything here stays free until it is.'));
    }
    return post('activate', { license_key: key, instance_name: instanceName() }).then(function (json) {
      if (!json.activated && !json.valid) {
        throw new Error(friendlyError(json.error));
      }
      var rec = recordFrom(json, key, null);
      if (rec.status !== 'active') throw new Error(friendlyError(rec.status));
      return save(rec);
    });
  }

  function validate() {
    var rec = record;
    if (!rec || !rec.key || rec.source === 'preview' || !config.api) return Promise.resolve(publicStatus());
    return post('validate', { license_key: rec.key, instance_id: rec.instanceId || '' }).then(function (json) {
      if (json.__http >= 500 || json.__http === 0) return publicStatus(); // MoR trouble: keep last known state
      var next = recordFrom(json, rec.key, rec);
      if (!json.valid && !json.license_key) {
        /* A definite "no such licence / instance": remember the answer
           but keep the key so the activation UI can explain. */
        next.status = /instance/i.test(json.error || '') ? 'inactive' : 'invalid';
      }
      return save(next);
    }).catch(function () {
      return publicStatus(); // offline: keep last known state, grace applies
    });
  }

  function deactivate() {
    var rec = record;
    var remote = (rec && rec.key && rec.instanceId && config.api && rec.source !== 'preview')
      ? post('deactivate', { license_key: rec.key, instance_id: rec.instanceId }).catch(function () {})
      : Promise.resolve();
    return remote.then(function () { return save(null); });
  }

  function friendlyError(err) {
    var e = String(err || '').toLowerCase();
    if (/activation limit|too many/.test(e)) return 'This key is already active on its maximum number of devices. Deactivate one there, or write to us.';
    if (/expired/.test(e)) return 'This licence has expired. Renew it from the link in your receipt.';
    if (/disabled/.test(e)) return 'This licence has been disabled. Write to us if you think that is a mistake.';
    if (/not found|invalid|does not exist/.test(e)) return 'That key was not recognised. Check for a missing character — keys look like XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX.';
    if (/inactive/.test(e)) return 'That key is not active on this device any more.';
    return err ? String(err) : 'Could not reach the licence server. Try again in a moment.';
  }

  /* Owner/test path: Pro on this browser only, no network, expires. */
  function preview(days) {
    var d = Math.max(1, parseInt(days, 10) || 30);
    return save({
      key: null, source: 'preview', plan: 'preview', status: 'active',
      validUntil: new Date(now() + d * DAY).toISOString(),
      checkedAt: new Date().toISOString(), instanceId: null,
      activations: { used: 1, limit: 1 }
    });
  }

  // ── gates ────────────────────────────────────────────────

  function can(feature, count) {
    if (tierOf(record) === 'pro') return true;
    if (feature in LIMITS) return (count || 0) < LIMITS[feature];
    if (feature in PRO_ONLY) return false;
    return true; // unknown feature names are never gated
  }

  function assertCan(feature, count) {
    return {
      ok: can(feature, count),
      tier: tierOf(record),
      limit: feature in LIMITS ? LIMITS[feature] : (feature in PRO_ONLY ? 0 : Infinity),
      label: LABELS[feature] || PRO_ONLY[feature] || feature,
      upgradeUrl: pricingUrl()
    };
  }

  /* One line of copy plus one "See Pro" button, per TIERS-PLAN §T1. */
  function gate(feature, copy) {
    var el = document.createElement('div');
    el.className = 'notice notice--pro';
    var text = document.createElement('span');
    text.className = 'notice__text';
    text.textContent = copy || defaultCopy(feature);
    var a = document.createElement('a');
    a.className = 'btn btn--primary btn--sm';
    a.href = pricingUrl();
    a.textContent = 'See Pro';
    el.appendChild(text);
    el.appendChild(a);
    return el;
  }

  function defaultCopy(feature) {
    if (feature in LIMITS) {
      var n = LIMITS[feature];
      return 'Free keeps ' + n + ' ' + (n === 1 ? LABELS[feature].replace(/s$/, '') : LABELS[feature]) + ' on this device. Pro keeps as many as you like.';
    }
    return (PRO_ONLY[feature] || 'This') + ' is part of Pro.';
  }

  /* Render a gate into a container (replacing whatever is there) and
     return false, or clear the container and return true when allowed.
     The one-liner tools use at each gate:
       if (!ToolshedLicence.guard('csv', 0, box)) return; */
  function guard(feature, count, container, copy) {
    var ok = can(feature, count);
    if (container) {
      container.innerHTML = '';
      container.hidden = ok;
      if (!ok) container.appendChild(gate(feature, copy));
    }
    return ok;
  }

  /* Show/hide every element marked data-pro="feature" and fill every
     element marked data-pro-gate="feature" with a gate notice. Tools call
     this once after ready() and again after any change. */
  function apply(root) {
    root = root || document;
    var pro = tierOf(record) === 'pro';
    var nodes = root.querySelectorAll('[data-pro]');
    for (var i = 0; i < nodes.length; i++) {
      var f = nodes[i].getAttribute('data-pro');
      nodes[i].hidden = !(pro || can(f));
    }
    var gates = root.querySelectorAll('[data-pro-gate]');
    for (var j = 0; j < gates.length; j++) {
      var g = gates[j];
      var feat = g.getAttribute('data-pro-gate');
      var show = !(pro || can(feat));
      g.hidden = !show;
      if (show && !g.firstChild) g.appendChild(gate(feat, g.getAttribute('data-pro-copy') || undefined));
    }
    document.documentElement.setAttribute('data-tier', tierOf(record));
  }

  // ── events ───────────────────────────────────────────────

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() {
    var s = publicStatus();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
    apply();
  }

  // ── boot ─────────────────────────────────────────────────

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = ToolshedStore.ready().then(load).then(function (rec) {
      apply();
      if (!rec || rec.source === 'preview' || !config.api) return publicStatus();
      var checked = Date.parse(rec.checkedAt || '') || 0;
      var due = now() - checked > RECHECK_AFTER;
      var lapsed = rec.validUntil && Date.parse(rec.validUntil) < now() - 7 * DAY;
      if ((due || lapsed) && navigator.onLine !== false) validate(); // silent, in the background
      return publicStatus();
    });
    return readyPromise;
  }

  window.ToolshedLicence = {
    config: config,
    LIMITS: LIMITS,
    PRO_ONLY: PRO_ONLY,
    ready: ready,
    status: function () { return ready().then(publicStatus); },
    activate: activate,
    validate: validate,
    /* After a backup import, re-read the record the import may have brought. */
    reload: function () { return ready().then(load).then(function () { emit(); return publicStatus(); }); },
    deactivate: deactivate,
    preview: preview,
    can: can,
    assertCan: assertCan,
    gate: gate,
    guard: guard,
    apply: apply,
    onChange: onChange,
    pricingUrl: pricingUrl
  };

  if (window.ToolshedStore) ready();
})();
