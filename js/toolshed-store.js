/* ══════════════════════════════════════════════════════════
   Teacher Toolshed — shared local-first data store

   All data lives in this browser (IndexedDB). Nothing is ever sent
   anywhere: this file contains no network calls of any kind, by design.
   See privacy.html / PLAN.md for the reasoning.

   Every method is async. That is deliberate — it is the seam where a
   cloud-backed adapter could later implement the same API without any
   calling code changing.

   Usage:  await ToolshedStore.listRosters()
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var DB_NAME = 'teachertoolshed';
  var DB_VERSION = 1;
  var LEGACY_ROSTER_KEY = 'toolshed:rosters';
  var EXPORT_VERSION = 1;

  // ── helpers ──────────────────────────────────────────────

  function uid() {
    try {
      if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function now() { return new Date().toISOString(); }

  function req(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  /* A student may arrive as a plain string (legacy data, pasted lists) or as
     an object. Normalize to {id, name} so every tool can rely on stable ids. */
  /* A student carries two identifiers, and they do different jobs:

       id   internal uuid, stable across renames. Every tool keys its own
            data off this (talk tallies, group assignments, grades).
       sid  the school's student number, optional. Human-facing, and the
            only key that stays unique when two students share a name.

     sid is omitted rather than stored empty so records that never had one
     stay clean. */
  function normalizeStudents(students) {
    if (!Array.isArray(students)) return [];
    return students.map(function (s) {
      if (typeof s === 'string') return { id: uid(), name: s.trim() };
      if (s && typeof s === 'object') {
        var out = { id: s.id || uid(), name: String(s.name == null ? '' : s.name).trim() };
        var sid = String(s.sid == null ? '' : s.sid).trim();
        if (sid) out.sid = sid;
        return out;
      }
      return null;
    }).filter(function (s) { return s && s.name; });
  }

  function normalizeRoster(r) {
    return {
      id: r.id || uid(),
      name: String(r.name == null ? '' : r.name).trim(),
      students: normalizeStudents(r.students),
      createdAt: r.createdAt || r.created_at || now(),
      updatedAt: r.updatedAt || r.updated_at || now()
    };
  }

  function normalizeDoc(d) {
    return {
      id: d.id || uid(),
      tool: String(d.tool || ''),
      name: String(d.name == null ? '' : d.name),
      data: d.data === undefined ? null : d.data,
      createdAt: d.createdAt || now(),
      updatedAt: d.updatedAt || now()
    };
  }

  // ── backends ─────────────────────────────────────────────
  // Two interchangeable implementations behind one async interface.

  var idb = null; // set on successful open

  var idbBackend = {
    getAll: function (name) {
      var tx = idb.transaction(name, 'readonly');
      return req(tx.objectStore(name).getAll());
    },
    getAllByIndex: function (name, index, value) {
      var tx = idb.transaction(name, 'readonly');
      return req(tx.objectStore(name).index(index).getAll(value));
    },
    get: function (name, id) {
      var tx = idb.transaction(name, 'readonly');
      return req(tx.objectStore(name).get(id));
    },
    put: function (name, record) {
      var tx = idb.transaction(name, 'readwrite');
      tx.objectStore(name).put(record);
      return txDone(tx).then(function () { return record; });
    },
    del: function (name, id) {
      var tx = idb.transaction(name, 'readwrite');
      tx.objectStore(name).delete(id);
      return txDone(tx);
    },
    clear: function (name) {
      var tx = idb.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      return txDone(tx);
    }
  };

  /* Used when IndexedDB is unavailable — private-mode Safari, browsers with
     site data blocked, some embedded webviews. The tools still work for the
     length of the page visit; ToolshedStore.ephemeral tells them to warn. */
  var memData = { rosters: {}, docs: {} };
  var memBackend = {
    getAll: function (name) {
      return Promise.resolve(Object.keys(memData[name]).map(function (k) { return memData[name][k]; }));
    },
    getAllByIndex: function (name, index, value) {
      return memBackend.getAll(name).then(function (all) {
        return all.filter(function (r) { return r[index] === value; });
      });
    },
    get: function (name, id) { return Promise.resolve(memData[name][id] || null); },
    put: function (name, record) { memData[name][record.id] = record; return Promise.resolve(record); },
    del: function (name, id) { delete memData[name][id]; return Promise.resolve(); },
    clear: function (name) { memData[name] = {}; return Promise.resolve(); }
  };

  function backend() { return idb ? idbBackend : memBackend; }

  // ── init ─────────────────────────────────────────────────

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var request;
      try { request = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }

      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('rosters')) {
          db.createObjectStore('rosters', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('docs')) {
          var docs = db.createObjectStore('docs', { keyPath: 'id' });
          docs.createIndex('tool', 'tool', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
      request.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }

  /* Lift any class lists saved by the older seating-chart-only code into the
     shared store, then drop the old key so this runs exactly once. */
  function migrateLegacyRosters() {
    var raw;
    try { raw = localStorage.getItem(LEGACY_ROSTER_KEY); }
    catch (e) { return Promise.resolve(); }
    if (!raw) return Promise.resolve();

    var legacy;
    try { legacy = JSON.parse(raw); } catch (e) { legacy = null; }
    if (!Array.isArray(legacy) || !legacy.length) {
      try { localStorage.removeItem(LEGACY_ROSTER_KEY); } catch (e) {}
      return Promise.resolve();
    }

    return backend().getAll('rosters').then(function (existing) {
      var taken = {};
      existing.forEach(function (r) { taken[r.name.toLowerCase()] = true; });

      var writes = legacy
        .filter(function (r) { return r && typeof r.name === 'string' && r.name.trim(); })
        .filter(function (r) { return !taken[r.name.trim().toLowerCase()]; })
        .map(function (r) { return backend().put('rosters', normalizeRoster(r)); });

      return Promise.all(writes);
    }).then(function () {
      try { localStorage.removeItem(LEGACY_ROSTER_KEY); } catch (e) {}
    }).catch(function () { /* never block startup on migration */ });
  }

  var readyPromise = null;
  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = openDB().then(function (db) {
      idb = db;
      Store.ephemeral = false;
      // Best-effort: ask the browser not to evict this origin's data.
      try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      } catch (e) {}
      return migrateLegacyRosters();
    }).catch(function () {
      idb = null;
      Store.ephemeral = true; // tools show a "saving unavailable" notice
    });
    return readyPromise;
  }

  // ── public API ───────────────────────────────────────────

  var Store = {
    /* true when IndexedDB could not be opened and data lives only in memory
       for this page visit. Tools should surface a warning when this is set. */
    ephemeral: false,

    ready: ready,

    // ---- rosters ----

    listRosters: function () {
      return ready().then(function () { return backend().getAll('rosters'); }).then(function (all) {
        return all.map(function (r) {
          return { id: r.id, name: r.name, studentCount: r.students.length, updatedAt: r.updatedAt };
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      });
    },

    getRoster: function (id) {
      return ready().then(function () { return backend().get('rosters', id); })
        .then(function (r) { return r || null; });
    },

    saveRoster: function (roster) {
      return ready().then(function () {
        var rec = normalizeRoster(roster || {});
        rec.updatedAt = now();
        return backend().put('rosters', rec);
      });
    },

    deleteRoster: function (id) {
      return ready().then(function () { return backend().del('rosters', id); });
    },

    // ---- per-tool documents ----
    // tool is one of 'seating' | 'tracker' | 'hex' | 'rubric' | 'presentation'

    listDocs: function (tool) {
      return ready().then(function () {
        return tool ? backend().getAllByIndex('docs', 'tool', tool) : backend().getAll('docs');
      }).then(function (all) {
        return all.map(function (d) {
          return { id: d.id, tool: d.tool, name: d.name, updatedAt: d.updatedAt };
        }).sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
      });
    },

    getDoc: function (id) {
      return ready().then(function () { return backend().get('docs', id); })
        .then(function (d) { return d || null; });
    },

    saveDoc: function (doc) {
      return ready().then(function () {
        var rec = normalizeDoc(doc || {});
        rec.updatedAt = now();
        return backend().put('docs', rec);
      });
    },

    deleteDoc: function (id) {
      return ready().then(function () { return backend().del('docs', id); });
    },

    // ---- backup ----

    exportAll: function () {
      return ready().then(function () {
        return Promise.all([backend().getAll('rosters'), backend().getAll('docs')]);
      }).then(function (results) {
        return JSON.stringify({
          version: EXPORT_VERSION,
          exportedAt: now(),
          rosters: results[0],
          docs: results[1]
        }, null, 2);
      });
    },

    /* merge:true  — combine with what's here; for matching ids the newer
                     updatedAt wins, so re-importing an old backup is safe.
       merge:false — replace everything.
       Also accepts a bare array of rosters, which is what the older
       seating-chart "Export" button produced. */
    importAll: function (json, opts) {
      var merge = !opts || opts.merge !== false;
      return ready().then(function () {
        var parsed;
        try { parsed = typeof json === 'string' ? JSON.parse(json) : json; }
        catch (e) { throw new Error('That file is not valid JSON.'); }

        var rosters, docs;
        if (Array.isArray(parsed)) {           // legacy class-lists.json
          rosters = parsed;
          docs = [];
        } else if (parsed && typeof parsed === 'object') {
          rosters = Array.isArray(parsed.rosters) ? parsed.rosters : [];
          docs = Array.isArray(parsed.docs) ? parsed.docs : [];
        } else {
          throw new Error('That file is not a Teacher Toolshed backup.');
        }
        if (!rosters.length && !docs.length) {
          throw new Error('That file contains no rosters or saved work.');
        }

        var clear = merge
          ? Promise.resolve()
          : Promise.all([backend().clear('rosters'), backend().clear('docs')]);

        return clear.then(function () {
          return Promise.all([backend().getAll('rosters'), backend().getAll('docs')]);
        }).then(function (existing) {
          var byId = {};
          existing[0].concat(existing[1]).forEach(function (r) { byId[r.id] = r; });

          var counts = { rosters: 0, docs: 0, skipped: 0 };
          var writes = [];

          rosters.forEach(function (r) {
            var rec = normalizeRoster(r);
            if (!rec.name) return;
            var prev = byId[rec.id];
            if (prev && (prev.updatedAt || '') >= (rec.updatedAt || '')) { counts.skipped++; return; }
            writes.push(backend().put('rosters', rec));
            counts.rosters++;
          });

          docs.forEach(function (d) {
            var rec = normalizeDoc(d);
            if (!rec.tool) return;
            var prev = byId[rec.id];
            if (prev && (prev.updatedAt || '') >= (rec.updatedAt || '')) { counts.skipped++; return; }
            writes.push(backend().put('docs', rec));
            counts.docs++;
          });

          return Promise.all(writes).then(function () { return counts; });
        });
      });
    }
  };

  window.ToolshedStore = Store;
  ready(); // start opening the database immediately
})();
