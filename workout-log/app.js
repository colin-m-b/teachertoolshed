/* Workout Log — UI. All data goes through WorkoutStore (IndexedDB). */

(function () {
  'use strict';

  var S = window.WorkoutStore;
  var view = document.getElementById('view');
  var titleEl = document.getElementById('title');
  var unitBadge = document.getElementById('unit-badge');

  /* The four lifting days. Lighter lift first. */
  var DAYS = [
    { key: 'ohp-squat', lifts: ['ohp', 'squat'] },
    { key: 'bench-squat', lifts: ['bench', 'squat'] },
    { key: 'ohp-deadlift', lifts: ['ohp', 'deadlift'] },
    { key: 'bench-deadlift', lifts: ['bench', 'deadlift'] }
  ];

  var WARMUP_BARBELL = [{ pct: 0, reps: 5 }, { pct: 0.5, reps: 5 }, { pct: 0.7, reps: 3 }, { pct: 0.9, reps: 2 }];
  var WARMUP_MACHINE = [{ pct: 0.5, reps: 5 }, { pct: 0.7, reps: 3 }, { pct: 0.9, reps: 2 }];

  var state = {
    tab: 'today',
    exercises: [],
    settings: Object.assign({}, S.DEFAULT_SETTINGS),
    openHistoryId: null,
    progressExerciseId: null,
    progressIncludeWarmups: false
  };

  // ---- helpers ----

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function todayISO() {
    var d = new Date();
    var off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
  }

  function fmtDate(iso, long) {
    var p = iso.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString(undefined, long
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function fmtNum(n) {
    if (n == null) return '–';
    return Math.round(n * 100) / 100 + '';
  }

  function unit() { return state.settings.unit; }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  function exById(id) {
    for (var i = 0; i < state.exercises.length; i++) if (state.exercises[i].id === id) return state.exercises[i];
    return { id: id, name: '(deleted exercise)', type: 'weights', archived: true };
  }
  function exByKey(key) {
    for (var i = 0; i < state.exercises.length; i++) if (state.exercises[i].key === key) return state.exercises[i];
    return null;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function dayLabel(dayKey) {
    var d = DAYS.filter(function (x) { return x.key === dayKey; })[0];
    if (!d) return null;
    return d.lifts.map(function (k) { var e = exByKey(k); return e ? e.name : k; }).join(' + ');
  }

  // ---- plates ----

  /* Smallest weight step the bar can make: two of the smallest plate. */
  function barResolution() {
    var plates = state.settings.plates;
    var min = plates.length ? Math.min.apply(null, plates) : 1.25;
    return min * 2;
  }
  function roundTo(v, step) { return Math.round(v / step) * step; }

  /* Returns { perSide: [..], total, exact } for a barbell weight. */
  function platesFor(total) {
    var bar = state.settings.bar;
    var plates = state.settings.plates.slice().sort(function (a, b) { return b - a; });
    var side = (total - bar) / 2;
    var out = [], remaining = side;
    if (side < 0) return { perSide: [], total: bar, exact: false, belowBar: true };
    plates.forEach(function (p) {
      while (remaining >= p - 1e-9) { out.push(p); remaining -= p; }
    });
    var made = bar + 2 * out.reduce(function (a, b) { return a + b; }, 0);
    return { perSide: out, total: made, exact: Math.abs(made - total) < 1e-9 };
  }

  function platesLine(total) {
    if (total == null || !isFinite(total)) return null;
    var r = platesFor(total);
    var line = el('div', { class: 'plates' });
    if (r.belowBar) { line.textContent = 'Below the bar (' + fmtNum(state.settings.bar) + ' ' + unit() + ')'; return line; }
    if (!r.perSide.length) { line.textContent = 'Empty bar'; return line; }
    line.appendChild(el('span', { class: 'muted', text: 'Per side: ' }));
    r.perSide.forEach(function (p) { line.appendChild(el('span', { class: 'plate', text: fmtNum(p) })); });
    if (!r.exact) line.appendChild(el('span', { class: 'muted', text: ' = ' + fmtNum(r.total) + ' ' + unit() + ' (nearest)' }));
    return line;
  }

  // ---- programme logic ----

  function workingSets(entry) { return (entry.sets || []).filter(function (s) { return !s.warmup; }); }

  /* Working weight of an entry: its target, else the heaviest working set. */
  function entryWorkingWeight(entry) {
    if (entry.target != null) return entry.target;
    var ws = workingSets(entry).filter(function (s) { return s.weight != null; });
    if (!ws.length) return null;
    return Math.max.apply(null, ws.map(function (s) { return s.weight; }));
  }

  /* GreySkull rule on the last (AMRAP) working set. */
  function suggestNext(ex, entry) {
    var ws = workingSets(entry).filter(function (s) { return s.weight != null; });
    if (!ws.length) return null;
    var amrap = ws[ws.length - 1];
    var w = entryWorkingWeight(entry);
    var inc = ex.increment || 2.5;
    var step = ex.barbell ? barResolution() : 0.5;
    if (amrap.reps == null) return { weight: w, why: 'repeat (no reps logged)' };
    if (amrap.reps >= 10) return { weight: w + 2 * inc, why: amrap.reps + ' reps: double bump, +' + fmtNum(2 * inc) };
    if (amrap.reps >= 5) return { weight: w + inc, why: amrap.reps + ' reps: +' + fmtNum(inc) };
    return { weight: roundTo(w * 0.9, step), why: amrap.reps + ' reps: deload 10%' };
  }

  function buildSets(ex, target) {
    var sets = [];
    var bar = state.settings.bar;
    var step = ex.barbell ? barResolution() : 1;
    var ramp = ex.barbell ? WARMUP_BARBELL : WARMUP_MACHINE;
    var seen = {};
    ramp.forEach(function (r) {
      var w = r.pct === 0 ? bar : roundTo(target * r.pct, step);
      if (ex.barbell && w < bar) w = bar;
      if (w >= target) return;
      if (seen[w]) return;
      seen[w] = true;
      sets.push({ weight: w, reps: r.reps, warmup: true });
    });
    var n = ex.scheme === '1x5+' ? 1 : 3;
    for (var i = 0; i < n; i++) sets.push({ weight: target, reps: null });
    return sets;
  }

  function summariseEntry(en) {
    var ex = exById(en.exerciseId);
    if (ex.type === 'cardio') {
      var c = en.cardio || {};
      var bits = [];
      if (c.minutes != null) bits.push(c.minutes + ' min');
      if (c.distance != null) bits.push(c.distance + ' ' + state.settings.distanceUnit);
      if (c.speed != null) bits.push(c.speed + ' ' + state.settings.distanceUnit + '/h');
      if (c.incline != null) bits.push(c.incline + '%');
      var s = bits.join(' · ') || 'no data';
      return c.warmup ? 'warmup · ' + s : s;
    }
    var sets = (en.sets || []).filter(function (s) { return s.weight != null || s.reps != null; });
    if (!sets.length) return 'no sets';
    function group(list) {
      var out = [], cur = null;
      list.forEach(function (s) {
        if (cur && cur.weight === s.weight) cur.reps.push(s.reps);
        else { cur = { weight: s.weight, reps: [s.reps] }; out.push(cur); }
      });
      return out.map(function (g) { return fmtNum(g.weight) + ' × ' + g.reps.map(fmtNum).join(', '); }).join(' | ');
    }
    var wu = sets.filter(function (s) { return s.warmup; });
    var wk = sets.filter(function (s) { return !s.warmup; });
    var parts = [];
    if (wk.length) parts.push(group(wk));
    if (wu.length) parts.push('warmup ' + group(wu));
    return parts.join('  ·  ');
  }

  /* Most recent entry for an exercise, skipping one workout. */
  function lastEntryFor(workouts, exerciseId, excludeWorkoutId) {
    for (var i = 0; i < workouts.length; i++) {
      var w = workouts[i];
      if (w.id === excludeWorkoutId) continue;
      for (var j = 0; j < w.entries.length; j++) {
        if (w.entries[j].exerciseId === exerciseId) return { workout: w, entry: w.entries[j] };
      }
    }
    return null;
  }

  // ---- rest timer ----

  var timer = { startedAt: null, dinged: {}, tick: null };
  var timerBar = document.getElementById('timer');
  var timerText = document.getElementById('timer-text');
  var audioCtx = null;

  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* no audio */ }
  }
  document.addEventListener('touchend', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);

  function ding(times) {
    try { if (navigator.vibrate) navigator.vibrate(times === 2 ? [200, 100, 200, 100, 200] : [200, 100, 200]); } catch (e) { /* ignore */ }
    if (!audioCtx) return;
    var t = audioCtx.currentTime;
    for (var i = 0; i < (times === 2 ? 3 : 2); i++) {
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = times === 2 ? 1046 : 880;
      g.gain.setValueAtTime(0.0001, t + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.5, t + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.35 + 0.3);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + i * 0.35); o.stop(t + i * 0.35 + 0.32);
    }
  }

  function startRest() {
    unlockAudio();
    timer.startedAt = Date.now();
    timer.dinged = {};
    timerBar.hidden = false;
    timerBar.classList.remove('is-due', 'is-over');
    clearInterval(timer.tick);
    timer.tick = setInterval(tickRest, 250);
    tickRest();
  }
  function stopRest() {
    clearInterval(timer.tick);
    timer.startedAt = null;
    timerBar.hidden = true;
  }
  function tickRest() {
    if (!timer.startedAt) return;
    var s = Math.floor((Date.now() - timer.startedAt) / 1000);
    var r1 = state.settings.restSeconds, r2 = state.settings.restSeconds2;
    timerText.textContent = 'Rest ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    if (s >= r1 && !timer.dinged.one) { timer.dinged.one = true; timerBar.classList.add('is-due'); ding(1); }
    if (s >= r2 && !timer.dinged.two) { timer.dinged.two = true; timerBar.classList.add('is-over'); ding(2); }
  }
  document.getElementById('timer-restart').addEventListener('click', startRest);
  document.getElementById('timer-stop').addEventListener('click', stopRest);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tickRest(); });

  // ---- workout editor (shared by Today and History) ----

  function renderWorkoutEditor(workout, workouts, opts) {
    var root = el('div', { class: 'stack' });
    var save = debounce(function () { S.saveWorkout(workout); }, 300);
    var saveNow = function () { return S.saveWorkout(workout); };

    function numInput(obj, key, attrs, onChange) {
      var inp = el('input', Object.assign({
        type: 'number', inputmode: 'decimal', step: 'any', value: obj[key] == null ? '' : obj[key]
      }, attrs || {}));
      inp.addEventListener('input', function () {
        obj[key] = inp.value === '' ? null : Number(inp.value);
        save();
      });
      if (onChange) inp.addEventListener('change', onChange);
      return inp;
    }

    function setsTable(en, ex) {
      var table = el('table', { class: 'sets' });
      table.appendChild(el('thead', null, [el('tr', null, [
        el('th', { text: 'set' }), el('th', { text: unit() }), el('th', { text: 'reps' }), el('th')
      ])]));
      var tbody = el('tbody');
      var workIdx = 0, wuIdx = 0;
      var nWork = workingSets(en).length;
      en.sets.forEach(function (s, i) {
        var label;
        if (s.warmup) label = 'W' + (++wuIdx);
        else { workIdx++; label = (ex.program && workIdx === nWork) ? workIdx + ' (5+)' : String(workIdx); }
        var tr = el('tr', { class: s.warmup ? 'is-warmup' : '' }, [
          el('td', null, [el('button', { class: 'setlabel', text: label, title: 'Tap to toggle warmup', onclick: function () {
            s.warmup = !s.warmup;
            saveNow().then(rerender);
          } })]),
          el('td', null, [numInput(s, 'weight')]),
          el('td', null, [numInput(s, 'reps', { inputmode: 'numeric', step: '1' }, function () {
            if (s.reps != null && opts.live) startRest();
          })]),
          el('td', { class: 'x' }, [el('button', { class: 'btn btn-ghost btn-icon', text: '×', 'aria-label': 'Remove set', onclick: function () {
            en.sets.splice(i, 1);
            saveNow().then(rerender);
          } })])
        ]);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      return table;
    }

    function entryCard(en) {
      var ex = exById(en.exerciseId);
      var last = lastEntryFor(workouts, en.exerciseId, workout.id);
      var card = el('div', { class: 'card' + (ex.program ? ' is-program' : '') });
      card.appendChild(el('div', { class: 'card-head' }, [
        el('h3', null, [ex.name, ex.program ? el('span', { class: 'tag', text: ex.scheme }) : null]),
        el('button', { class: 'btn btn-ghost btn-sm', text: 'Remove', onclick: function () {
          if (!confirm('Remove ' + ex.name + ' from this workout?')) return;
          workout.entries = workout.entries.filter(function (e) { return e !== en; });
          saveNow().then(rerender);
        } })
      ]));

      // ---- cardio ----
      if (ex.type === 'cardio') {
        en.cardio = en.cardio || { minutes: null, distance: null, speed: null, incline: null };
        card.appendChild(el('div', { class: 'hint', text: last
          ? 'Last time (' + fmtDate(last.workout.date) + '): ' + summariseEntry(last.entry)
          : 'First time logging this.' }));
        var wuLabel = el('label', { class: 'check' });
        var wuBox = el('input', { type: 'checkbox' });
        wuBox.checked = !!en.cardio.warmup;
        wuBox.addEventListener('change', function () { en.cardio.warmup = wuBox.checked || undefined; saveNow(); });
        wuLabel.appendChild(wuBox);
        wuLabel.appendChild(document.createTextNode(' Warmup before lifting'));
        card.appendChild(wuLabel);
        var g = el('div', { class: 'cardio-grid' });
        g.appendChild(el('label', { class: 'field', text: 'Minutes' }, [numInput(en.cardio, 'minutes')]));
        g.appendChild(el('label', { class: 'field', text: 'Distance (' + state.settings.distanceUnit + ')' }, [numInput(en.cardio, 'distance')]));
        g.appendChild(el('label', { class: 'field', text: 'Speed (' + state.settings.distanceUnit + '/h)' }, [numInput(en.cardio, 'speed')]));
        g.appendChild(el('label', { class: 'field', text: 'Incline (%)' }, [numInput(en.cardio, 'incline')]));
        card.appendChild(g);
        if (last && last.entry.cardio) {
          card.appendChild(el('button', { class: 'btn btn-sm btn-block', text: 'Copy last time', onclick: function () {
            en.cardio = Object.assign({}, last.entry.cardio);
            saveNow().then(rerender);
          } }));
        }
        return card;
      }

      en.sets = en.sets || [];

      // ---- programme lift: target weight, plates, generated sets ----
      if (ex.program) {
        var sug = last ? suggestNext(ex, last.entry) : null;
        if (last) {
          card.appendChild(el('div', { class: 'last' }, [
            el('div', { class: 'hint', text: 'Last time (' + fmtDate(last.workout.date) + '): ' + summariseEntry(last.entry) }),
            sug ? el('div', { class: 'hint hint-strong', text: 'Target: ' + fmtNum(sug.weight) + ' ' + unit() + ' — ' + sug.why }) : null
          ]));
        } else {
          card.appendChild(el('div', { class: 'hint', text: 'First session. Enter a working weight to build warmups and sets.' }));
        }

        var targetRow = el('div', { class: 'row' });
        var targetInp = el('input', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: 'working ' + unit(), 'aria-label': 'Working weight' });
        targetInp.value = en.target != null ? en.target : (sug && !en.sets.length ? sug.weight : '');
        var buildBtn = el('button', { class: 'btn btn-primary', text: en.sets.length ? 'Rebuild sets' : 'Build sets', onclick: function () {
          var t = Number(targetInp.value);
          if (!t) return;
          if (en.sets.length && !confirm('Replace the current sets with a fresh ramp at ' + fmtNum(t) + ' ' + unit() + '?')) return;
          en.target = t;
          en.sets = buildSets(ex, t);
          saveNow().then(rerender);
        } });
        targetInp.addEventListener('input', function () {
          var t = Number(targetInp.value);
          var pl = card.querySelector('.plates-slot');
          pl.innerHTML = '';
          if (ex.barbell && t) pl.appendChild(platesLine(t));
        });
        targetRow.appendChild(targetInp);
        targetRow.appendChild(buildBtn);
        card.appendChild(targetRow);
        var slot = el('div', { class: 'plates-slot' });
        if (ex.barbell && Number(targetInp.value)) slot.appendChild(platesLine(Number(targetInp.value)));
        card.appendChild(slot);

        if (en.sets.length) card.appendChild(setsTable(en, ex));
        card.appendChild(el('div', { class: 'row' }, [
          el('button', { class: 'btn grow', text: '+ Set', onclick: function () {
            var prev = workingSets(en).slice(-1)[0] || { weight: en.target, reps: null };
            en.sets.push({ weight: prev.weight, reps: null });
            saveNow().then(rerender);
          } })
        ]));
        return card;
      }

      // ---- accessory lift ----
      card.appendChild(el('div', { class: 'hint', text: last
        ? 'Last time (' + fmtDate(last.workout.date) + '): ' + summariseEntry(last.entry)
        : 'First time logging this.' }));
      if (en.sets.length) card.appendChild(setsTable(en, ex));
      if (ex.barbell) {
        var lastW = en.sets.length ? en.sets[en.sets.length - 1].weight : null;
        if (lastW != null) card.appendChild(platesLine(lastW));
      }
      var actions = el('div', { class: 'row' });
      actions.appendChild(el('button', { class: 'btn btn-primary grow', text: '+ Set', onclick: function () {
        var prev = en.sets[en.sets.length - 1] || (last && last.entry.sets && workingSets(last.entry)[0]) || { weight: null, reps: null };
        en.sets.push({ weight: prev.weight, reps: prev.reps });
        saveNow().then(function () {
          rerender();
          var inputs = root.querySelectorAll('[data-entry="' + en.id + '"] .sets input');
          if (inputs.length >= 2) inputs[inputs.length - 2].focus();
        });
      } }));
      if (last && last.entry.sets && last.entry.sets.length && !en.sets.length) {
        actions.appendChild(el('button', { class: 'btn', text: 'Copy last time', onclick: function () {
          en.sets = last.entry.sets.map(function (s) { var o = { weight: s.weight, reps: s.reps }; if (s.warmup) o.warmup = true; return o; });
          saveNow().then(rerender);
        } }));
      }
      card.appendChild(actions);
      return card;
    }

    function addEntry(ex) {
      var en = { id: S.uid(), exerciseId: ex.id };
      if (ex.type === 'cardio') en.cardio = { minutes: null, distance: null, speed: null, incline: null };
      else en.sets = [];
      workout.entries.push(en);
      return en;
    }

    function dayChooser() {
      var box = el('div', { class: 'card day-chooser' });
      box.appendChild(el('div', { class: 'card-head' }, [el('h3', { text: 'Which lifting day?' })]));
      DAYS.forEach(function (d) {
        var lifts = d.lifts.map(exByKey).filter(Boolean);
        if (lifts.length !== d.lifts.length) return;
        var opt = el('button', { class: 'dayopt', onclick: function () {
          workout.dayKey = d.key;
          var ins = [];
          lifts.forEach(function (ex) {
            if (workout.entries.some(function (e) { return e.exerciseId === ex.id; })) return;
            var en = { id: S.uid(), exerciseId: ex.id, sets: [] };
            var last = lastEntryFor(workouts, ex.id, workout.id);
            var sug = last ? suggestNext(ex, last.entry) : null;
            if (sug) { en.target = sug.weight; en.sets = buildSets(ex, sug.weight); }
            ins.push(en);
          });
          workout.entries = ins.concat(workout.entries);
          saveNow().then(rerender);
        } });
        opt.appendChild(el('div', { class: 'dayopt-title', text: lifts.map(function (e) { return e.name; }).join(' + ') }));
        lifts.forEach(function (ex) {
          var last = lastEntryFor(workouts, ex.id, workout.id);
          var sug = last ? suggestNext(ex, last.entry) : null;
          opt.appendChild(el('div', { class: 'dayopt-line' }, [
            el('b', { text: ex.name + ': ' }),
            last ? summariseEntry(last.entry) + (sug ? '  →  ' + fmtNum(sug.weight) + ' ' + unit() : '') : 'never done'
          ]));
        });
        box.appendChild(opt);
      });
      return box;
    }

    function rerender() {
      root.innerHTML = '';

      if (!workout.dayKey) root.appendChild(dayChooser());
      else root.appendChild(el('div', { class: 'daylabel' }, [
        el('span', { text: dayLabel(workout.dayKey) }),
        el('button', { class: 'btn btn-ghost btn-sm', text: 'Change', onclick: function () {
          if (!confirm('Clear the lifting day? The lift entries stay; you can remove them by hand.')) return;
          workout.dayKey = null;
          saveNow().then(rerender);
        } })
      ]));

      workout.entries.forEach(function (en) {
        var c = entryCard(en);
        c.setAttribute('data-entry', en.id);
        root.appendChild(c);
      });

      var used = {};
      workout.entries.forEach(function (e) { used[e.exerciseId] = true; });
      var avail = state.exercises.filter(function (e) { return !e.archived && !used[e.id]; });
      if (avail.length) {
        root.appendChild(el('h2', { text: 'Add accessory or cardio' }));
        var chips = el('div', { class: 'chips' });
        avail.forEach(function (ex) {
          chips.appendChild(el('button', { class: 'chip' + (ex.program ? ' chip-program' : ''), text: ex.name, onclick: function () {
            var en = addEntry(ex);
            if (ex.program) {
              var last = lastEntryFor(workouts, ex.id, workout.id);
              var sug = last ? suggestNext(ex, last.entry) : null;
              if (sug) { en.target = sug.weight; en.sets = buildSets(ex, sug.weight); }
            }
            saveNow().then(rerender);
          } }));
        });
        root.appendChild(chips);
      }

      root.appendChild(el('h2', { text: 'Note' }));
      var note = el('textarea', { placeholder: 'How did it go?' });
      note.value = workout.note || '';
      note.addEventListener('input', function () { workout.note = note.value; save(); });
      root.appendChild(note);

      if (opts.footer) root.appendChild(opts.footer());
    }

    rerender();
    return root;
  }

  // ---- Today ----

  async function renderToday() {
    titleEl.textContent = 'Today';
    var date = todayISO();
    var workouts = await S.listWorkouts();
    var workout = await S.getWorkoutByDate(date);
    if (!workout) workout = { id: S.uid(), date: date, note: '', dayKey: null, entries: [] };

    view.innerHTML = '';
    view.appendChild(el('p', { class: 'muted small', text: fmtDate(date, true) }));
    view.appendChild(renderWorkoutEditor(workout, workouts, { live: true }));
  }

  // ---- History ----

  async function renderHistory() {
    titleEl.textContent = 'History';
    var workouts = await S.listWorkouts();
    view.innerHTML = '';

    var addRow = el('div', { class: 'row' });
    var dateInp = el('input', { type: 'date', value: todayISO(), 'aria-label': 'Date' });
    addRow.appendChild(dateInp);
    addRow.appendChild(el('button', { class: 'btn', text: 'Add', onclick: async function () {
      if (!dateInp.value) return;
      var existing = await S.getWorkoutByDate(dateInp.value);
      if (existing) { state.openHistoryId = existing.id; toast('Already have that date'); return render(); }
      var w = await S.saveWorkout({ id: S.uid(), date: dateInp.value, note: '', entries: [] });
      state.openHistoryId = w.id;
      render();
    } }));
    view.appendChild(addRow);

    if (!workouts.length) {
      view.appendChild(el('p', { class: 'empty', text: 'No workouts yet.' }));
      return;
    }

    var lastMonth = '';
    workouts.forEach(function (w) {
      var month = w.date.slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        var p = month.split('-');
        view.appendChild(el('h2', { text: new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }));
      }
      var open = state.openHistoryId === w.id;
      var card = el('div', { class: 'card' });
      var label = w.dayKey ? dayLabel(w.dayKey) : (w.entries.length + (w.entries.length === 1 ? ' exercise' : ' exercises'));
      card.appendChild(el('div', { class: 'card-head hist', onclick: function () {
        state.openHistoryId = open ? null : w.id;
        render();
      } }, [
        el('h3', { text: fmtDate(w.date) }),
        el('span', { class: 'muted small', text: label })
      ]));

      if (open) {
        // Older workouts: the editor's "last time" should be relative to that date.
        var earlier = workouts.filter(function (x) { return x.date < w.date || (x.date === w.date && x.id !== w.id); });
        card.appendChild(renderWorkoutEditor(w, earlier, {
          footer: function () {
            return el('div', { class: 'row', style: 'margin-top:12px' }, [
              el('button', { class: 'btn btn-ghost grow', text: 'Close', onclick: function () { state.openHistoryId = null; render(); } }),
              el('button', { class: 'btn btn-ghost btn-danger', text: 'Delete workout', onclick: async function () {
                if (!confirm('Delete the workout on ' + fmtDate(w.date) + '?')) return;
                await S.deleteWorkout(w.id);
                state.openHistoryId = null;
                toast('Deleted');
                render();
              } })
            ]);
          }
        }));
      } else {
        w.entries.forEach(function (en) {
          card.appendChild(el('div', { class: 'hist-line' }, [
            el('b', { text: exById(en.exerciseId).name + ' ' }),
            summariseEntry(en)
          ]));
        });
        if (w.note) card.appendChild(el('div', { class: 'hist-line', style: 'margin-top:6px;font-style:italic', text: w.note }));
      }
      view.appendChild(card);
    });
  }

  // ---- Progress ----

  function e1rm(w, reps) { return reps > 0 ? w * (1 + reps / 30) : w; }

  function seriesFor(workouts, ex) {
    var pts = [];
    workouts.slice().reverse().forEach(function (w) {
      w.entries.forEach(function (en) {
        if (en.exerciseId !== ex.id) return;
        if (ex.type === 'cardio') {
          var c = en.cardio || {};
          if (c.warmup && !state.progressIncludeWarmups) return;
          if (c.minutes == null && c.distance == null && c.speed == null) return;
          pts.push({ date: w.date, minutes: c.minutes, distance: c.distance, speed: c.speed });
          return;
        }
        var sets = workingSets(en).filter(function (s) { return s.weight != null && s.reps != null; });
        if (!sets.length) return;
        var best = 0, vol = 0, bestReps = 0, top = null;
        sets.forEach(function (s) {
          vol += s.weight * s.reps;
          if (s.weight > best || (s.weight === best && s.reps > bestReps)) { best = s.weight; bestReps = s.reps; }
          var e = e1rm(s.weight, s.reps);
          if (top == null || e > top) top = e;
        });
        var amrap = sets[sets.length - 1];
        pts.push({ date: w.date, best: best, bestReps: bestReps, volume: vol, sets: sets.length,
          work: entryWorkingWeight(en), amrapReps: amrap.reps, e1rm: Math.round(top * 10) / 10 });
      });
    });
    return pts;
  }

  function lineChart(points, key, label, integer) {
    var W = 600, H = 220, padL = 40, padR = 12, padT = 12, padB = 28;
    var vals = points.map(function (p) { return p[key]; }).filter(function (v) { return v != null; });
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'chart');
    if (vals.length < 1) return svg;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min = min - 1; max = max + 1; }
    var pad = (max - min) * 0.1; min -= pad; max += pad;
    if (integer && min < 0) min = 0;
    var n = points.length;
    function x(i) { return n === 1 ? (padL + (W - padL - padR) / 2) : padL + (W - padL - padR) * i / (n - 1); }
    function y(v) { return padT + (H - padT - padB) * (1 - (v - min) / (max - min)); }
    function svgEl(tag, attrs, text) {
      var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text != null) e.textContent = text;
      return e;
    }
    for (var g = 0; g <= 4; g++) {
      var v = min + (max - min) * g / 4;
      svg.appendChild(svgEl('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(v), y2: y(v) }));
      svg.appendChild(svgEl('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmtNum(integer ? Math.round(v) : Math.round(v * 10) / 10)));
    }
    var d = '';
    points.forEach(function (p, i) {
      if (p[key] == null) return;
      d += (d ? ' L' : 'M') + x(i) + ' ' + y(p[key]);
    });
    svg.appendChild(svgEl('path', { class: 'line', d: d }));
    points.forEach(function (p, i) {
      if (p[key] == null) return;
      var c = svgEl('circle', { class: 'dot', cx: x(i), cy: y(p[key]), r: 4 });
      c.appendChild(svgEl('title', {}, fmtDate(p.date) + ': ' + fmtNum(p[key]) + ' ' + label));
      svg.appendChild(c);
    });
    [0, Math.floor((n - 1) / 2), n - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
      svg.appendChild(svgEl('text', { x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, fmtDate(points[i].date)));
    });
    return svg;
  }

  function stat(v, k) {
    return el('div', { class: 'stat' }, [el('div', { class: 'v', text: v }), el('div', { class: 'k', text: k })]);
  }

  async function renderProgress() {
    titleEl.textContent = 'Progress';
    var workouts = await S.listWorkouts();
    view.innerHTML = '';

    var active = state.exercises.filter(function (e) { return !e.archived; });
    if (!state.progressExerciseId || !active.some(function (e) { return e.id === state.progressExerciseId; })) {
      state.progressExerciseId = active.length ? active[0].id : null;
    }
    if (!state.progressExerciseId) { view.appendChild(el('p', { class: 'empty', text: 'No exercises.' })); return; }

    var sel = el('select', { 'aria-label': 'Exercise' });
    active.forEach(function (e) {
      var o = el('option', { value: e.id, text: e.name });
      if (e.id === state.progressExerciseId) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { state.progressExerciseId = sel.value; render(); });
    view.appendChild(sel);

    var ex = exById(state.progressExerciseId);
    var pts = seriesFor(workouts, ex);

    if (ex.type === 'cardio') {
      var wuLabel = el('label', { class: 'check', style: 'margin-top:10px' });
      var wuBox = el('input', { type: 'checkbox' });
      wuBox.checked = state.progressIncludeWarmups;
      wuBox.addEventListener('change', function () { state.progressIncludeWarmups = wuBox.checked; render(); });
      wuLabel.appendChild(wuBox); wuLabel.appendChild(document.createTextNode(' Include warmup sessions'));
      view.appendChild(wuLabel);
    }
    if (!pts.length) { view.appendChild(el('p', { class: 'empty', text: 'No data for ' + ex.name + ' yet.' })); return; }
    var last = pts[pts.length - 1];

    if (ex.type === 'cardio') {
      var totalMin = 0, totalDist = 0;
      pts.forEach(function (p) { totalMin += p.minutes || 0; totalDist += p.distance || 0; });
      view.appendChild(el('div', { class: 'stats' }, [
        stat(pts.length, 'sessions'), stat(fmtNum(totalMin), 'total min'), stat(fmtNum(totalDist), 'total ' + state.settings.distanceUnit)
      ]));
      [['distance', 'Distance (' + state.settings.distanceUnit + ')'], ['speed', 'Speed (' + state.settings.distanceUnit + '/h)'], ['minutes', 'Minutes']].forEach(function (k) {
        if (!pts.some(function (p) { return p[k[0]] != null; })) return;
        view.appendChild(el('h2', { text: k[1] }));
        view.appendChild(el('div', { class: 'card' }, [lineChart(pts, k[0], k[1])]));
      });
      return;
    }

    if (ex.program) {
      var bestE = pts.reduce(function (a, p) { return p.e1rm > a.e1rm ? p : a; }, pts[0]);
      view.appendChild(el('div', { class: 'stats' }, [
        stat(fmtNum(last.work) + ' ' + unit(), 'current (' + fmtNum(last.amrapReps) + ' on 5+)'),
        stat(fmtNum(bestE.e1rm) + ' ' + unit(), 'best est. 1RM'),
        stat(pts.length, 'sessions')
      ]));
      view.appendChild(el('h2', { text: 'Working weight (' + unit() + ')' }));
      view.appendChild(el('div', { class: 'card' }, [lineChart(pts, 'work', unit())]));
      view.appendChild(el('h2', { text: 'Reps on the 5+ set' }));
      view.appendChild(el('div', { class: 'card' }, [lineChart(pts, 'amrapReps', 'reps', true)]));
      view.appendChild(el('h2', { text: 'Estimated 1RM (' + unit() + ')' }));
      view.appendChild(el('div', { class: 'card' }, [lineChart(pts, 'e1rm', unit())]));
      return;
    }

    var pr = pts.reduce(function (a, p) { return p.best > a.best ? p : a; }, pts[0]);
    view.appendChild(el('div', { class: 'stats' }, [
      stat(fmtNum(pr.best) + ' ' + unit(), 'best (' + pr.bestReps + ' reps)'),
      stat(fmtNum(last.best) + ' ' + unit(), 'last session'),
      stat(pts.length, 'sessions')
    ]));
    view.appendChild(el('h2', { text: 'Top set weight (' + unit() + ')' }));
    view.appendChild(el('div', { class: 'card' }, [lineChart(pts, 'best', unit())]));
    view.appendChild(el('h2', { text: 'Volume (' + unit() + ' × reps)' }));
    view.appendChild(el('div', { class: 'card' }, [lineChart(pts, 'volume', unit())]));
  }

  // ---- Settings ----

  async function renderSettings() {
    titleEl.textContent = 'Settings';
    view.innerHTML = '';
    var st = state.settings;

    async function setSetting(k, v) { st[k] = v; await S.setSetting(k, v); }

    // Plate calculator
    view.appendChild(el('h2', { text: 'Plate calculator' }));
    var calc = el('div', { class: 'card stack' });
    var calcInp = el('input', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: 'total ' + unit() });
    var calcOut = el('div');
    calcInp.addEventListener('input', function () {
      calcOut.innerHTML = '';
      if (Number(calcInp.value)) calcOut.appendChild(platesLine(Number(calcInp.value)));
    });
    calc.appendChild(calcInp); calc.appendChild(calcOut);
    view.appendChild(calc);

    // Equipment
    view.appendChild(el('h2', { text: 'Bar and plates' }));
    var eq = el('div', { class: 'card stack' });
    var barInp = el('input', { type: 'number', inputmode: 'decimal', step: 'any', value: st.bar });
    barInp.addEventListener('change', function () { if (Number(barInp.value) > 0) setSetting('bar', Number(barInp.value)); });
    var platesInp = el('input', { type: 'text', value: st.plates.join(', ') });
    platesInp.addEventListener('change', function () {
      var list = platesInp.value.split(/[,\s]+/).map(Number).filter(function (n) { return n > 0; }).sort(function (a, b) { return b - a; });
      if (list.length) setSetting('plates', list);
    });
    eq.appendChild(el('label', { class: 'field', text: 'Bar weight (' + unit() + ')' }, [barInp]));
    eq.appendChild(el('label', { class: 'field', text: 'Plates you own (one side, comma separated)' }, [platesInp]));
    view.appendChild(eq);

    // Rest timer
    view.appendChild(el('h2', { text: 'Rest timer' }));
    var rt = el('div', { class: 'card stack' });
    var r1 = el('input', { type: 'number', inputmode: 'numeric', value: st.restSeconds });
    var r2 = el('input', { type: 'number', inputmode: 'numeric', value: st.restSeconds2 });
    r1.addEventListener('change', function () { if (Number(r1.value) > 0) setSetting('restSeconds', Number(r1.value)); });
    r2.addEventListener('change', function () { if (Number(r2.value) > 0) setSetting('restSeconds2', Number(r2.value)); });
    rt.appendChild(el('div', { class: 'cardio-grid' }, [
      el('label', { class: 'field', text: 'First ding (seconds)' }, [r1]),
      el('label', { class: 'field', text: 'Second ding (seconds)' }, [r2])
    ]));
    rt.appendChild(el('p', { class: 'muted small', style: 'margin:0', text: 'The timer starts when you enter reps for a set. Sound needs the phone unmuted; on iPhone the ringer switch also silences it.' }));
    rt.appendChild(el('button', { class: 'btn btn-sm', text: 'Test sound', onclick: function () { unlockAudio(); ding(1); } }));
    view.appendChild(rt);

    // Exercises
    view.appendChild(el('h2', { text: 'Exercises' }));
    var list = el('div', { class: 'card' });
    var exs = state.exercises;
    exs.forEach(function (ex, i) {
      var row = el('div', { class: 'ex-row row' + (ex.archived ? ' archived' : '') });
      var typeText = ex.type === 'cardio' ? 'cardio' : (ex.program ? 'programme · ' + ex.scheme + ' · +' + fmtNum(ex.increment) + ' ' + unit() : 'accessory');
      if (ex.barbell) typeText += ' · barbell';
      if (ex.archived) typeText += ' · archived';
      row.appendChild(el('div', { class: 'grow' }, [
        el('div', { class: 'name', text: ex.name }),
        el('div', { class: 'type', text: typeText })
      ]));
      async function swap(j) {
        var other = exs[j];
        var t = ex.order; ex.order = other.order; other.order = t;
        if (ex.order === other.order) { ex.order = j; other.order = i; }
        await S.saveExercise(ex); await S.saveExercise(other);
        await reloadExercises(); render();
      }
      row.appendChild(el('button', { class: 'btn btn-ghost btn-icon', text: '↑', 'aria-label': 'Move up', disabled: i === 0 ? '' : null, onclick: function () { swap(i - 1); } }));
      row.appendChild(el('button', { class: 'btn btn-ghost btn-icon', text: '↓', 'aria-label': 'Move down', disabled: i === exs.length - 1 ? '' : null, onclick: function () { swap(i + 1); } }));
      row.appendChild(el('button', { class: 'btn btn-ghost btn-sm', text: '✎', 'aria-label': 'Edit', onclick: async function () {
        var name = prompt('Exercise name', ex.name);
        if (name == null) return;
        if (name.trim()) ex.name = name.trim();
        if (ex.program) {
          var inc = prompt('Increment per session (' + unit() + ')', ex.increment);
          if (inc != null && Number(inc) > 0) ex.increment = Number(inc);
        }
        if (ex.type === 'weights') ex.barbell = confirm('Loaded on a barbell? (OK = yes, shows plate calculator)');
        await S.saveExercise(ex); await reloadExercises(); render();
      } }));
      row.appendChild(el('button', { class: 'btn btn-ghost btn-sm', text: ex.archived ? 'Restore' : 'Archive', onclick: async function () {
        ex.archived = !ex.archived;
        await S.saveExercise(ex); await reloadExercises(); render();
      } }));
      list.appendChild(row);
    });
    view.appendChild(list);

    var addCard = el('div', { class: 'card stack' });
    var nameInp = el('input', { type: 'text', placeholder: 'New exercise name' });
    var typeSel = el('select', null, [el('option', { value: 'weights', text: 'Weights (sets × reps)' }), el('option', { value: 'barbell', text: 'Barbell (sets × reps, plate calculator)' }), el('option', { value: 'cardio', text: 'Cardio (time, distance, speed)' })]);
    addCard.appendChild(nameInp);
    addCard.appendChild(typeSel);
    addCard.appendChild(el('button', { class: 'btn btn-primary btn-block', text: 'Add exercise', onclick: async function () {
      var name = nameInp.value.trim();
      if (!name) return;
      var maxOrder = exs.reduce(function (m, e) { return Math.max(m, e.order); }, -1);
      await S.saveExercise({ name: name, type: typeSel.value === 'cardio' ? 'cardio' : 'weights', barbell: typeSel.value === 'barbell', order: maxOrder + 1 });
      await reloadExercises(); toast('Added ' + name); render();
    } }));
    view.appendChild(addCard);

    // Units
    view.appendChild(el('h2', { text: 'Units' }));
    var unitsCard = el('div', { class: 'card stack' });
    var unitSel = el('select', { 'aria-label': 'Weight unit' }, [el('option', { value: 'kg', text: 'Kilograms (kg)' }), el('option', { value: 'lb', text: 'Pounds (lb)' })]);
    unitSel.value = st.unit;
    unitSel.addEventListener('change', async function () { await setSetting('unit', unitSel.value); unitBadge.textContent = st.unit; });
    var distSel = el('select', { 'aria-label': 'Distance unit' }, [el('option', { value: 'km', text: 'Kilometres (km)' }), el('option', { value: 'mi', text: 'Miles (mi)' })]);
    distSel.value = st.distanceUnit;
    distSel.addEventListener('change', function () { setSetting('distanceUnit', distSel.value); });
    unitsCard.appendChild(el('label', { class: 'field', text: 'Weight' }, [unitSel]));
    unitsCard.appendChild(el('label', { class: 'field', text: 'Distance' }, [distSel]));
    unitsCard.appendChild(el('p', { class: 'muted small', style: 'margin:0', text: 'Labels only. Changing units does not convert existing numbers.' }));
    view.appendChild(unitsCard);

    // Backup
    view.appendChild(el('h2', { text: 'Backup' }));
    var backup = el('div', { class: 'card stack' });
    backup.appendChild(el('p', { class: 'muted small', style: 'margin:0', text: 'Everything is stored on this phone only. Export a JSON file now and then and keep it somewhere safe.' }));
    backup.appendChild(el('button', { class: 'btn btn-block', text: 'Export JSON', onclick: async function () {
      var json = await S.exportJSON();
      var blob = new Blob([json], { type: 'application/json' });
      var name = 'workout-log-' + todayISO() + '.json';
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: 'application/json' })] })) {
        try { await navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: 'Workout Log export' }); return; } catch (e) { /* fall through */ }
      }
      var a = el('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
    } }));
    var fileInp = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    fileInp.addEventListener('change', async function () {
      var f = fileInp.files[0]; if (!f) return;
      try {
        var r = await S.importJSON(await f.text());
        await reloadAll();
        toast('Imported ' + r.workouts + ' workouts');
        render();
      } catch (e) { alert('Import failed: ' + e.message); }
      fileInp.value = '';
    });
    backup.appendChild(fileInp);
    backup.appendChild(el('button', { class: 'btn btn-block', text: 'Import JSON', onclick: function () { fileInp.click(); } }));
    view.appendChild(backup);

    view.appendChild(el('h2', { text: 'Danger zone' }));
    view.appendChild(el('div', { class: 'card' }, [
      el('button', { class: 'btn btn-ghost btn-danger btn-block', text: 'Delete all data', onclick: async function () {
        if (!confirm('Delete every workout and exercise on this phone? Export first if you want to keep them.')) return;
        if (!confirm('Really delete everything?')) return;
        await S.wipe(); await S.init(); await reloadAll();
        toast('All data deleted'); render();
      } })
    ]));
  }

  // ---- routing ----

  async function reloadExercises() { state.exercises = await S.listExercises(); }
  async function reloadAll() {
    await reloadExercises();
    state.settings = await S.getSettings();
    unitBadge.textContent = state.settings.unit;
  }

  var renderers = { today: renderToday, history: renderHistory, progress: renderProgress, settings: renderSettings };

  function render() {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === state.tab); });
    return renderers[state.tab]().catch(function (e) {
      view.innerHTML = '';
      view.appendChild(el('p', { class: 'empty', text: 'Something went wrong: ' + e.message }));
    });
  }

  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tab = b.dataset.tab;
      window.scrollTo(0, 0);
      render();
    });
  });

  (async function start() {
    await S.init();
    await reloadAll();
    render();
  })();
})();
