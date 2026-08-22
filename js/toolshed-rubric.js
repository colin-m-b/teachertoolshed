/* ══════════════════════════════════════════════════════════
   Teacher Toolshed — shared rubric builder

   Renders an editable list of criteria into any container. Any tool can
   use this to let a teacher build or edit a rubric, then persist the
   result via ToolshedStore.saveDoc({tool:'rubric', name, data:{criteria}}).

   A rubric here is a plain object: {name, criteria: [...]}.
   A criterion: {
     id,
     name,             // required
     descriptions,     // array of strings; only descriptions[0] is used
                        // today. Kept as an array so per-band MYP
                        // descriptors (1-2 / 3-4 / 5-6 / 7-8) can be
                        // added later without a data migration.
     min, max           // whole numbers, or null/null for a criterion
                        // that's comment-only (no score, just notes)
   }

   This module only renders and edits the criteria list — it does not
   talk to ToolshedStore itself, and it does not render a "rubric name"
   field (the host page already has its own name/title input pattern).

   Usage:
     const rubric = ToolshedRubric.blankRubric();
     ToolshedRubric.render(container, rubric, { onChange: () => save(rubric) });
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  function uid() {
    try {
      if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function blankCriterion() {
    return { id: uid(), name: '', descriptions: [''], min: null, max: null };
  }

  function blankRubric() {
    return { name: '', criteria: [blankCriterion()] };
  }

  /* A criterion counts as "scored" once it has both a min and a max.
     Either one missing/blank makes it comment-only. Kept as a named
     export so every tool that reads rubric data agrees on the rule. */
  function isScored(criterion) {
    return criterion && criterion.min != null && criterion.max != null;
  }

  function toIntOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  function render(container, rubric, opts) {
    opts = opts || {};
    var onChange = opts.onChange || function () {};
    var readOnly = !!opts.readOnly;

    if (!rubric.criteria || !rubric.criteria.length) {
      rubric.criteria = [blankCriterion()];
    }

    container.innerHTML = '';
    container.className = (container.className + ' rubric-criteria').trim();

    rubric.criteria.forEach(function (criterion) {
      container.appendChild(renderRow(criterion, rubric, onChange, readOnly));
    });

    if (!readOnly) {
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'rubric-add-criterion';
      addBtn.textContent = '+ Add criterion';
      addBtn.addEventListener('click', function () {
        rubric.criteria.push(blankCriterion());
        render(container, rubric, opts);
        onChange(rubric);
        var lastInput = container.querySelectorAll('.rubric-criterion-top input')[
          container.querySelectorAll('.rubric-criterion-top input').length - 1
        ];
        if (lastInput) lastInput.focus();
      });
      container.appendChild(addBtn);
    }

    return container;
  }

  function renderRow(criterion, rubric, onChange, readOnly) {
    var row = document.createElement('div');
    row.className = 'rubric-criterion-row';

    var top = document.createElement('div');
    top.className = 'rubric-criterion-top';

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Criterion name (required) - e.g. Criterion C: Producing Text';
    nameInput.value = criterion.name || '';
    nameInput.disabled = readOnly;
    nameInput.addEventListener('input', function () {
      criterion.name = nameInput.value;
      onChange(rubric);
    });
    top.appendChild(nameInput);

    if (!readOnly) {
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'rubric-criterion-remove';
      removeBtn.textContent = '\u00D7'; // multiplication sign, escaped so it
                                         // survives regardless of the server's
                                         // charset header for standalone .js files
      removeBtn.title = 'Remove criterion';
      removeBtn.addEventListener('click', function () {
        rubric.criteria = rubric.criteria.filter(function (c) { return c.id !== criterion.id; });
        var container = row.parentElement;
        render(container, rubric, { onChange: onChange, readOnly: readOnly });
        onChange(rubric);
      });
      top.appendChild(removeBtn);
    }
    row.appendChild(top);

    var descInput = document.createElement('textarea');
    descInput.placeholder = 'Description (optional) - what this criterion is looking for';
    descInput.value = (criterion.descriptions && criterion.descriptions[0]) || '';
    descInput.disabled = readOnly;
    descInput.addEventListener('input', function () {
      criterion.descriptions = [descInput.value];
      onChange(rubric);
    });
    row.appendChild(descInput);

    var rangeRow = document.createElement('div');
    rangeRow.className = 'rubric-range-row';

    var minField = document.createElement('div');
    minField.className = 'rubric-range-field';
    var minLabel = document.createElement('label');
    minLabel.textContent = 'Min';
    var minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.step = '1';
    minInput.value = criterion.min == null ? '' : criterion.min;
    minInput.disabled = readOnly;
    minInput.addEventListener('input', function () {
      criterion.min = toIntOrNull(minInput.value);
      onChange(rubric);
    });
    minField.appendChild(minLabel);
    minField.appendChild(minInput);

    var maxField = document.createElement('div');
    maxField.className = 'rubric-range-field';
    var maxLabel = document.createElement('label');
    maxLabel.textContent = 'Max';
    var maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.step = '1';
    maxInput.value = criterion.max == null ? '' : criterion.max;
    maxInput.disabled = readOnly;
    maxInput.addEventListener('input', function () {
      criterion.max = toIntOrNull(maxInput.value);
      onChange(rubric);
    });
    maxField.appendChild(maxLabel);
    maxField.appendChild(maxInput);

    var hint = document.createElement('span');
    hint.className = 'rubric-range-hint';
    hint.textContent = 'Leave both blank for a comment-only criterion (no score, just notes)';

    rangeRow.appendChild(minField);
    rangeRow.appendChild(maxField);
    rangeRow.appendChild(hint);
    row.appendChild(rangeRow);

    return row;
  }

  window.ToolshedRubric = {
    blankCriterion: blankCriterion,
    blankRubric: blankRubric,
    isScored: isScored,
    render: render
  };
})();
