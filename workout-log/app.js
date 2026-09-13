/* Workout Log — UI. All data goes through WorkoutStore (IndexedDB). */

(function () {
  'use strict';

  var S = window.WorkoutStore;
  var view = document.getElementById('view');
  var titleEl = document.getElementById('title');
  var unitBadge = document.getElementById('unit-badge');

  var state = {
    tab: 'today',
    exercises: [],
    unit: 'kg',
    distanceUnit: 'km',
    openHistoryId: null,
    progressExerciseId: null
  };

  // ---- helpers ----

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
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

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function summariseEntry(en) {
    var ex = exById(en.exerciseId);
    if (ex.type === 'cardio') {
      var c = en.cardio || {};
      var bits = [];
      if (c.minutes != null) bits.push(c.minutes + ' min');
      if (c.distance != null) bits.push(c.distance + ' ' + state.distanceUnit);
      if (c.speed != null) bits.push(c.speed + ' ' + state.distanceUnit + '/h');
      if (c.incline != null) bits.push(c.incline + '%');
      return bits.join(' · ') || 'no data';
    }
    var sets = (en.sets || []).filter(function (s) { return s.weight != null || s.reps != null; });
    if (!sets.length) return 'no sets';
    // Group consecutive identical sets: 60×8, 8, 8 → "60 × 8, 8, 8"
    var out = [], cur = null;
    sets.forEach(function (s) {
      if (cur && cur.weight === s.weight) cur.reps.push(s.reps);
      else { cur = { weight: s.weight, reps: [s.reps] }; out.push(cur); }
    });
    return out.map(function (g) {
      return fmtNum(g.weight) + ' × ' + g.reps.map(fmtNum).join(', ');
    }).join('  |  ');
  }

  /* Most recent entry for an exercise before the given date (or workout id). */
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

  // ---- workout editor (shared by Today and History) ----

  function renderWorkoutEditor(workout, workouts, opts) {
    var root = el('div', { class: 'stack' });
    var save = debounce(function () { S.saveWorkout(workout).then(function () { if (opts.onSaved) opts.onSaved(); }); }, 300);
    var saveNow = function () { return S.saveWorkout(workout).then(function () { if (opts.onSaved) opts.onSaved(); }); };

    function numInput(obj, key, attrs) {
      var inp = el('input', Object.assign({
        type: 'number', inputmode: 'decimal', step: 'any', value: obj[key] == null ? '' : obj[key]
      }, attrs || {}));
      inp.addEventListener('input', function () {
        obj[key] = inp.value === '' ? null : Number(inp.value);
        save();
      });
      return inp;
    }

    function entryCard(en) {
      var ex = exById(en.exerciseId);
      var last = lastEntryFor(workouts, en.exerciseId, workout.id);
      var card = el('div', { class: 'card' });
      card.appendChild(el('div', { class: 'card-head' }, [
        el('h3', { text: ex.name }),
        el('button', { class: 'btn btn-ghost btn-sm', text: 'Remove', onclick: function () {
          if (!confirm('Remove ' + ex.name + ' from this workout?')) return;
          workout.entries = workout.entries.filter(function (e) { return e !== en; });
          saveNow().then(rerender);
        } })
      ]));
      card.appendChild(el('div', { class: 'hint', text: last
        ? 'Last time (' + fmtDate(last.workout.date) + '): ' + summariseEntry(last.entry)
        : 'First time logging this.' }));

      if (ex.type === 'cardio') {
        en.cardio = en.cardio || { minutes: null, distance: null, speed: null, incline: null };
        var g = el('div', { class: 'cardio-grid' });
        g.appendChild(el('label', { class: 'field', text: 'Minutes' }, [numInput(en.cardio, 'minutes')]));
        g.appendChild(el('label', { class: 'field', text: 'Distance (' + state.distanceUnit + ')' }, [numInput(en.cardio, 'distance')]));
        g.appendChild(el('label', { class: 'field', text: 'Speed (' + state.distanceUnit + '/h)' }, [numInput(en.cardio, 'speed')]));
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
      var table = el('table', { class: 'sets' });
      table.appendChild(el('thead', null, [el('tr', null, [
        el('th', { text: '#' }), el('th', { text: state.unit }), el('th', { text: 'reps' }), el('th')
      ])]));
      var tbody = el('tbody');
      en.sets.forEach(function (s, i) {
        tbody.appendChild(el('tr', null, [
          el('td', { text: String(i + 1) }),
          el('td', null, [numInput(s, 'weight')]),
          el('td', null, [numInput(s, 'reps', { inputmode: 'numeric', step: '1' })]),
          el('td', { class: 'x' }, [el('button', { class: 'btn btn-ghost btn-icon', text: '×', 'aria-label': 'Remove set', onclick: function () {
            en.sets.splice(i, 1);
            saveNow().then(rerender);
          } })])
        ]));
      });
      table.appendChild(tbody);
      card.appendChild(table);

      var actions = el('div', { class: 'row' });
      actions.appendChild(el('button', { class: 'btn btn-primary grow', text: '+ Set', onclick: function () {
        var prev = en.sets[en.sets.length - 1] || (last && last.entry.sets && last.entry.sets[0]) || { weight: null, reps: null };
        en.sets.push({ weight: prev.weight, reps: prev.reps });
        saveNow().then(function () {
          rerender();
          // focus the new set's weight field
          var inputs = root.querySelectorAll('[data-entry="' + en.id + '"] .sets input');
          if (inputs.length >= 2) inputs[inputs.length - 2].focus();
        });
      } }));
      if (last && last.entry.sets && last.entry.sets.length && !en.sets.length) {
        actions.appendChild(el('button', { class: 'btn', text: 'Copy last time', onclick: function () {
          en.sets = last.entry.sets.map(function (s) { return { weight: s.weight, reps: s.reps }; });
          saveNow().then(rerender);
        } }));
      }
      card.appendChild(actions);
      return card;
    }

    function rerender() {
      root.innerHTML = '';

      if (!workout.entries.length) {
        root.appendChild(el('p', { class: 'empty', text: 'Nothing logged yet. Pick an exercise below.' }));
      }
      workout.entries.forEach(function (en) {
        var c = entryCard(en);
        c.setAttribute('data-entry', en.id);
        root.appendChild(c);
      });

      var used = {};
      workout.entries.forEach(function (e) { used[e.exerciseId] = true; });
      var avail = state.exercises.filter(function (e) { return !e.archived && !used[e.id]; });
      if (avail.length) {
        root.appendChild(el('h2', { text: 'Add exercise' }));
        var chips = el('div', { class: 'chips' });
        avail.forEach(function (ex) {
          chips.appendChild(el('button', { class: 'chip', text: ex.name, onclick: function () {
            var en = { id: S.uid(), exerciseId: ex.id };
            if (ex.type === 'cardio') en.cardio = { minutes: null, distance: null, speed: null, incline: null };
            else en.sets = [];
            workout.entries.push(en);
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
    if (!workout) workout = { id: S.uid(), date: date, note: '', entries: [] };

    view.innerHTML = '';
    view.appendChild(el('p', { class: 'muted small', text: fmtDate(date, true) }));
    view.appendChild(renderWorkoutEditor(workout, workouts, {}));
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
      var head = el('div', { class: 'card-head hist', onclick: function () {
        state.openHistoryId = open ? null : w.id;
        render();
      } }, [
        el('h3', { text: fmtDate(w.date) }),
        el('span', { class: 'muted small', text: w.entries.length + (w.entries.length === 1 ? ' exercise' : ' exercises') })
      ]);
      card.appendChild(head);

      if (open) {
        card.appendChild(renderWorkoutEditor(w, workouts, {
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

  function seriesFor(workouts, ex) {
    // oldest → newest
    var pts = [];
    workouts.slice().reverse().forEach(function (w) {
      w.entries.forEach(function (en) {
        if (en.exerciseId !== ex.id) return;
        if (ex.type === 'cardio') {
          var c = en.cardio || {};
          if (c.minutes == null && c.distance == null && c.speed == null) return;
          pts.push({ date: w.date, minutes: c.minutes, distance: c.distance, speed: c.speed });
        } else {
          var sets = (en.sets || []).filter(function (s) { return s.weight != null && s.reps != null; });
          if (!sets.length) return;
          var best = 0, vol = 0, bestReps = 0;
          sets.forEach(function (s) {
            vol += s.weight * s.reps;
            if (s.weight > best || (s.weight === best && s.reps > bestReps)) { best = s.weight; bestReps = s.reps; }
          });
          pts.push({ date: w.date, best: best, bestReps: bestReps, volume: vol, sets: sets.length });
        }
      });
    });
    return pts;
  }

  function lineChart(points, key, label) {
    var W = 600, H = 220, padL = 40, padR = 12, padT = 12, padB = 28;
    var vals = points.map(function (p) { return p[key]; }).filter(function (v) { return v != null; });
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'chart');
    if (vals.length < 1) return svg;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min = min - 1; max = max + 1; }
    var pad = (max - min) * 0.1; min -= pad; max += pad;
    var n = points.length;
    function x(i) { return n === 1 ? (padL + (W - padL - padR) / 2) : padL + (W - padL - padR) * i / (n - 1); }
    function y(v) { return padT + (H - padT - padB) * (1 - (v - min) / (max - min)); }

    function svgEl(tag, attrs, text) {
      var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text != null) e.textContent = text;
      return e;
    }
    // y gridlines
    for (var g = 0; g <= 4; g++) {
      var v = min + (max - min) * g / 4;
      svg.appendChild(svgEl('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(v), y2: y(v) }));
      svg.appendChild(svgEl('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmtNum(Math.round(v * 10) / 10)));
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
    // x labels: first, middle, last
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
    if (!pts.length) { view.appendChild(el('p', { class: 'empty', text: 'No data for ' + ex.name + ' yet.' })); return; }
    var last = pts[pts.length - 1];

    if (ex.type === 'cardio') {
      var totalMin = 0, totalDist = 0;
      pts.forEach(function (p) { totalMin += p.minutes || 0; totalDist += p.distance || 0; });
      view.appendChild(el('div', { class: 'stats' }, [
        stat(pts.length, 'sessions'), stat(fmtNum(totalMin), 'total min'), stat(fmtNum(totalDist), 'total ' + state.distanceUnit)
      ]));
      [['distance', 'Distance (' + state.distanceUnit + ')'], ['speed', 'Speed (' + state.distanceUnit + '/h)'], ['minutes', 'Minutes']].forEach(function (k) {
        if (!pts.some(function (p) { return p[k[0]] != null; })) return;
        view.appendChild(el('h2', { text: k[1] }));
        view.appendChild(el('div', { class: 'card' }, [lineChart(pts, k[0], k[1])]));
      });
      return;
    }

    var pr = pts.reduce(function (a, p) { return p.best > a.best ? p : a; }, pts[0]);
    view.appendChild(el('div', { class: 'stats' }, [
      stat(fmtNum(pr.best) + ' ' + state.unit, 'best (' + pr.bestReps + ' reps)'),
      stat(fmtNum(last.best) + ' ' + state.unit, 'last session'),
      stat(pts.length, 'sessions')
    ]));
    view.appendChild(el('h2', { text: 'Top set weight (' + state.unit + ')' }));
    view.appendChild(el('div', { class: 'card' }, [lineChart(pts, 'best', state.unit)]));
    view.appendChild(el('h2', { text: 'Volume (' + state.unit + ' × reps)' }));
    view.appendChild(el('div', { class: 'card' }, [lineChart(pts, 'volume', state.unit)]));
  }

  // ---- Settings ----

  async function renderSettings() {
    titleEl.textContent = 'Settings';
    view.innerHTML = '';

    view.appendChild(el('h2', { text: 'Exercises' }));
    var list = el('div', { class: 'card' });
    var exs = state.exercises;
    exs.forEach(function (ex, i) {
      var row = el('div', { class: 'ex-row row' + (ex.archived ? ' archived' : '') });
      row.appendChild(el('div', { class: 'grow' }, [
        el('div', { class: 'name', text: ex.name }),
        el('div', { class: 'type', text: (ex.type === 'cardio' ? 'cardio' : 'weights') + (ex.archived ? ' · archived' : '') })
      ]));
      row.appendChild(el('button', { class: 'btn btn-ghost btn-icon', text: '↑', 'aria-label': 'Move up', disabled: i === 0 ? '' : null, onclick: async function () {
        var other = exs[i - 1];
        var t = ex.order; ex.order = other.order; other.order = t;
        if (ex.order === other.order) { ex.order = i - 1; other.order = i; }
        await S.saveExercise(ex); await S.saveExercise(other);
        await reloadExercises(); render();
      } }));
      row.appendChild(el('button', { class: 'btn btn-ghost btn-icon', text: '↓', 'aria-label': 'Move down', disabled: i === exs.length - 1 ? '' : null, onclick: async function () {
        var other = exs[i + 1];
        var t = ex.order; ex.order = other.order; other.order = t;
        if (ex.order === other.order) { ex.order = i + 1; other.order = i; }
        await S.saveExercise(ex); await S.saveExercise(other);
        await reloadExercises(); render();
      } }));
      row.appendChild(el('button', { class: 'btn btn-ghost btn-sm', text: '✎', 'aria-label': 'Rename', onclick: async function () {
        var name = prompt('Rename exercise', ex.name);
        if (name == null || !name.trim()) return;
        ex.name = name.trim();
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
    var typeSel = el('select', null, [el('option', { value: 'weights', text: 'Weights (sets × reps)' }), el('option', { value: 'cardio', text: 'Cardio (time, distance, speed)' })]);
    addCard.appendChild(nameInp);
    addCard.appendChild(typeSel);
    addCard.appendChild(el('button', { class: 'btn btn-primary btn-block', text: 'Add exercise', onclick: async function () {
      var name = nameInp.value.trim();
      if (!name) return;
      var maxOrder = exs.reduce(function (m, e) { return Math.max(m, e.order); }, -1);
      await S.saveExercise({ name: name, type: typeSel.value, order: maxOrder + 1 });
      await reloadExercises(); toast('Added ' + name); render();
    } }));
    view.appendChild(addCard);

    view.appendChild(el('h2', { text: 'Units' }));
    var unitsCard = el('div', { class: 'card stack' });
    var unitSel = el('select', { 'aria-label': 'Weight unit' }, [el('option', { value: 'kg', text: 'Kilograms (kg)' }), el('option', { value: 'lb', text: 'Pounds (lb)' })]);
    unitSel.value = state.unit;
    unitSel.addEventListener('change', async function () { state.unit = unitSel.value; await S.setSetting('unit', state.unit); unitBadge.textContent = state.unit; });
    var distSel = el('select', { 'aria-label': 'Distance unit' }, [el('option', { value: 'km', text: 'Kilometres (km)' }), el('option', { value: 'mi', text: 'Miles (mi)' })]);
    distSel.value = state.distanceUnit;
    distSel.addEventListener('change', async function () { state.distanceUnit = distSel.value; await S.setSetting('distanceUnit', state.distanceUnit); });
    unitsCard.appendChild(el('label', { class: 'field', text: 'Weight' }, [unitSel]));
    unitsCard.appendChild(el('label', { class: 'field', text: 'Distance' }, [distSel]));
    unitsCard.appendChild(el('p', { class: 'muted small', style: 'margin:0', text: 'Labels only. Changing units does not convert existing numbers.' }));
    view.appendChild(unitsCard);

    view.appendChild(el('h2', { text: 'Backup' }));
    var backup = el('div', { class: 'card stack' });
    backup.appendChild(el('p', { class: 'muted small', style: 'margin:0', text: 'Everything is stored on this phone only. Export a JSON file now and then and keep it somewhere safe.' }));
    backup.appendChild(el('button', { class: 'btn btn-block', text: 'Export JSON', onclick: async function () {
      var json = await S.exportJSON();
      var blob = new Blob([json], { type: 'application/json' });
      var name = 'workout-log-' + todayISO() + '.json';
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: 'application/json' })] })) {
        try { await navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: 'Workout Log export' }); return; } catch (e) { /* fall through to download */ }
      }
      var a = el('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
    } }));
    var fileInp = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    fileInp.addEventListener('change', async function () {
      var f = fileInp.files[0]; if (!f) return;
      try {
        var r = await S.importJSON(await f.text());
        await reloadExercises();
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
        await S.wipe(); await S.init(); await reloadExercises();
        state.unit = 'kg'; state.distanceUnit = 'km'; unitBadge.textContent = 'kg';
        toast('All data deleted'); render();
      } })
    ]));
  }

  // ---- routing ----

  async function reloadExercises() { state.exercises = await S.listExercises(); }

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
    await reloadExercises();
    state.unit = await S.getSetting('unit', 'kg');
    state.distanceUnit = await S.getSetting('distanceUnit', 'km');
    unitBadge.textContent = state.unit;
    render();
  })();
})();
