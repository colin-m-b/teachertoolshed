/* Workout Log — local data store (IndexedDB).
   Nothing leaves the phone. No network calls in this file. */

(function () {
  'use strict';

  var DB_NAME = 'workout-log';
  var DB_VERSION = 1;
  var EXPORT_VERSION = 1;

  var DEFAULT_EXERCISES = [
    // Programme lifts (GreySkull LP). `key` is what the day templates refer to.
    { key: 'ohp', name: 'Overhead Press', type: 'weights', program: true, scheme: '3x5+', increment: 2.5, barbell: true },
    { key: 'bench', name: 'Bench Press (Machine)', type: 'weights', program: true, scheme: '3x5+', increment: 2.5, barbell: false },
    { key: 'squat', name: 'Squat', type: 'weights', program: true, scheme: '3x5+', increment: 5, barbell: true },
    { key: 'deadlift', name: 'Deadlift', type: 'weights', program: true, scheme: '1x5+', increment: 5, barbell: true },
    // Accessories
    { name: 'Pec Deck', type: 'weights' },
    { name: 'Leg Press', type: 'weights' },
    { name: 'Leg Curl', type: 'weights' },
    { name: 'Bicep Curl', type: 'weights' },
    { name: 'Incline Press', type: 'weights', barbell: true },
    { name: 'Bench Press', type: 'weights', barbell: true },
    { name: "Farmer's Carry", type: 'weights' },
    { name: 'Zercher Carry', type: 'weights', barbell: true },
    // Cardio
    { name: 'Treadmill', type: 'cardio' },
    { name: 'Elliptical', type: 'cardio' }
  ];

  var DEFAULT_SETTINGS = {
    unit: 'kg',
    distanceUnit: 'km',
    bar: 20,
    plates: [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5],
    restSeconds: 90,
    restSeconds2: 180
  };

  function uid() {
    try {
      if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function now() { return new Date().toISOString(); }

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  var dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('workouts')) {
          var w = db.createObjectStore('workouts', { keyPath: 'id' });
          w.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
    return dbPromise;
  }

  async function getAll(store) {
    var db = await openDB();
    return req(db.transaction(store, 'readonly').objectStore(store).getAll());
  }
  async function put(store, value) {
    var db = await openDB();
    var tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await txDone(tx);
    return value;
  }
  async function del(store, key) {
    var db = await openDB();
    var tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await txDone(tx);
  }
  async function clearAll() {
    var db = await openDB();
    var tx = db.transaction(['exercises', 'workouts', 'settings'], 'readwrite');
    tx.objectStore('exercises').clear();
    tx.objectStore('workouts').clear();
    tx.objectStore('settings').clear();
    await txDone(tx);
  }

  // ---- normalisers ----

  function num(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function normalizeExercise(e) {
    var out = {
      id: e.id || uid(),
      name: String(e.name == null ? '' : e.name).trim(),
      type: e.type === 'cardio' ? 'cardio' : 'weights',
      order: typeof e.order === 'number' ? e.order : 0,
      archived: !!e.archived,
      program: !!e.program,
      barbell: !!e.barbell
    };
    if (e.key) out.key = String(e.key);
    if (out.program) {
      out.scheme = e.scheme === '1x5+' ? '1x5+' : '3x5+';
      out.increment = num(e.increment) || 2.5;
    }
    return out;
  }

  function normalizeEntry(en) {
    var out = { id: en.id || uid(), exerciseId: en.exerciseId };
    if (Array.isArray(en.sets)) {
      out.sets = en.sets.map(function (s) {
        var o = { weight: num(s.weight), reps: num(s.reps) };
        if (s.warmup) o.warmup = true;
        return o;
      });
    }
    if (en.target != null) out.target = num(en.target);
    if (en.cardio && typeof en.cardio === 'object') {
      out.cardio = {
        minutes: num(en.cardio.minutes),
        distance: num(en.cardio.distance),
        speed: num(en.cardio.speed),
        incline: num(en.cardio.incline)
      };
      if (en.cardio.warmup) out.cardio.warmup = true;
    }
    return out;
  }

  function normalizeWorkout(w) {
    return {
      id: w.id || uid(),
      date: w.date || now().slice(0, 10),
      note: String(w.note == null ? '' : w.note),
      dayKey: w.dayKey || null,
      entries: Array.isArray(w.entries) ? w.entries.map(normalizeEntry) : [],
      createdAt: w.createdAt || now(),
      updatedAt: w.updatedAt || now()
    };
  }

  // ---- public API ----

  var Store = {
    uid: uid,

    DEFAULT_SETTINGS: DEFAULT_SETTINGS,

    async init() {
      var ex = await getAll('exercises');
      if (ex.length === 0) {
        for (var i = 0; i < DEFAULT_EXERCISES.length; i++) {
          await put('exercises', normalizeExercise(Object.assign({ order: i }, DEFAULT_EXERCISES[i])));
        }
        return;
      }
      /* Older installs: attach programme metadata to lifts that match by name. */
      for (var j = 0; j < ex.length; j++) {
        if (ex[j].key || ex[j].program) continue;
        for (var k = 0; k < DEFAULT_EXERCISES.length; k++) {
          var d = DEFAULT_EXERCISES[k];
          if (d.program && d.name === ex[j].name) {
            await put('exercises', normalizeExercise(Object.assign({}, ex[j], d, { id: ex[j].id, order: ex[j].order })));
          }
        }
      }
    },

    async getSettings() {
      var rows = await getAll('settings');
      var out = Object.assign({}, DEFAULT_SETTINGS);
      rows.forEach(function (r) { if (r && r.key in out) out[r.key] = r.value; });
      return out;
    },

    async listExercises() {
      var ex = await getAll('exercises');
      return ex.map(normalizeExercise).sort(function (a, b) { return a.order - b.order || a.name.localeCompare(b.name); });
    },
    async saveExercise(e) { return put('exercises', normalizeExercise(e)); },
    async deleteExercise(id) { return del('exercises', id); },

    async listWorkouts() {
      var ws = await getAll('workouts');
      return ws.map(normalizeWorkout).sort(function (a, b) { return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt); });
    },
    async getWorkoutByDate(date) {
      var db = await openDB();
      var all = await req(db.transaction('workouts', 'readonly').objectStore('workouts').index('date').getAll(date));
      return all.length ? normalizeWorkout(all[0]) : null;
    },
    async saveWorkout(w) {
      var n = normalizeWorkout(w);
      n.updatedAt = now();
      return put('workouts', n);
    },
    async deleteWorkout(id) { return del('workouts', id); },

    async getSetting(key, fallback) {
      var db = await openDB();
      var r = await req(db.transaction('settings', 'readonly').objectStore('settings').get(key));
      return r ? r.value : fallback;
    },
    async setSetting(key, value) { return put('settings', { key: key, value: value }); },

    async exportJSON() {
      var settings = await getAll('settings');
      return JSON.stringify({
        app: 'workout-log',
        version: EXPORT_VERSION,
        exportedAt: now(),
        exercises: await this.listExercises(),
        workouts: await this.listWorkouts(),
        settings: settings
      }, null, 2);
    },

    /* Merge import: existing records with the same id are overwritten,
       everything else is kept. */
    async importJSON(text) {
      var data = JSON.parse(text);
      if (!data || data.app !== 'workout-log') throw new Error('Not a Workout Log export');
      var i;
      for (i = 0; i < (data.exercises || []).length; i++) await put('exercises', normalizeExercise(data.exercises[i]));
      for (i = 0; i < (data.workouts || []).length; i++) await put('workouts', normalizeWorkout(data.workouts[i]));
      for (i = 0; i < (data.settings || []).length; i++) if (data.settings[i] && data.settings[i].key) await put('settings', data.settings[i]);
      return { exercises: (data.exercises || []).length, workouts: (data.workouts || []).length };
    },

    async wipe() { await clearAll(); }
  };

  window.WorkoutStore = Store;
})();
