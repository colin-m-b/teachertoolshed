/* ══════════════════════════════════════════════════════════
   Teacher Toolshed — sample class

   A fictional roster so every tool can be explored before a real class
   list exists, and so help pages, screenshots and videos never need to
   show a real student. Every name here is invented; two first names are
   deliberately shared so the tools' disambiguation shows.

   Saved under a fixed id, so loading it twice replaces rather than
   duplicates. Like everything else, it lives only in this browser.

   Usage:  await ToolshedSample.load()   → the saved roster
           ToolshedSample.isSample(id)   → true for the sample roster's id
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var SAMPLE_ID = 'sample-class';
  var SAMPLE_NAME = 'Period 3 — sample class';

  var NAMES = [
    'Amara Okafor',
    'Ben Fischer',
    'Chloé Martin',
    'Daniel Reyes',
    'Elif Yilmaz',
    'Finn O’Sullivan',
    'Grace Kim',
    'Hiro Tanaka',
    'Isabela Souza',
    'Jonas Berg',
    'Kavya Raman',
    'Liam Walsh',
    'Maya Cohen',
    'Noah Adeyemi',
    'Olivia Novak',
    'Priya Nair',
    'Rafael Costa',
    'Sofia Petrova',
    'Tomás Herrera',
    'Yasmin Haddad',
    'Zoe Laurent',
    'Maya Lindqvist',
    'Daniel Park',
    'Wei Zhang'
  ];

  function build() {
    return {
      id: SAMPLE_ID,
      name: SAMPLE_NAME,
      students: NAMES.map(function (name, i) {
        return { id: SAMPLE_ID + '-' + (i + 1), name: name, sid: String(30001 + i) };
      })
    };
  }

  window.ToolshedSample = {
    id: SAMPLE_ID,
    name: SAMPLE_NAME,
    isSample: function (id) { return id === SAMPLE_ID; },
    load: function () {
      return ToolshedStore.saveRoster(build());
    }
  };
})();
