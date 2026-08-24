'use strict';
/* ══════════════════════════════════════════════════════════
   Stack Splitter

   Two halves of one workflow:
     1. print a QR coversheet per student
     2. read those QRs back out of a scan of the collected stack and
        cut it into one PDF per student

   Everything runs locally. The scan is read with FileReader, split with
   pdf-lib, and written straight back to disk — there is no upload path
   in this file.
   ══════════════════════════════════════════════════════════ */

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function showToast(msg, dur) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), dur || 2600);
}

/* ── lazy library loading ─────────────────────────────────
   The split half pulls ~2.3MB of pdf.js/pdf-lib/jsQR. A teacher who
   only wants coversheets should never pay for it, so nothing below is
   fetched until the work that needs it actually starts. */
const loaded = {};
function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { delete loaded[src]; reject(new Error('Could not load ' + src)); };
    document.head.appendChild(s);
  });
  return loaded[src];
}
async function needJsPDF() {
  await loadScript('vendor/jspdf.umd.min.js');
  return window.jspdf.jsPDF;
}
let pdfjsLib = null;
async function needPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('./vendor/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.mjs';
  }
  return pdfjsLib;
}
async function needPdfLib() {
  await loadScript('vendor/pdf-lib.min.js');
  return window.PDFLib;
}
async function needJsQR() {
  await loadScript('vendor/jsQR.js');
  return window.jsQR;
}

/* ══════════════════════════════════════════════════════════
   PAYLOAD

   TT1|<batch>|<pos>|<class>|<assignment>|<sid>|<name>

   batch  4-char tag for one print run, so a coversheet from a
          different assignment that wanders into the stack is caught
          rather than silently trusted
   pos    "3/28" for a student, "S1/3" for a spare
   sid    school student number, may be empty
   name   may be empty (spares). Last field, so it is rejoined rather
          than split, in case a name ever contains the separator.

   Kept short on purpose: 45-odd characters is a 33x33 QR, which at
   1.5in printed is ~1.15mm per module — about nine pixels per module
   in a 200 DPI scan, with room to spare for a staple hole.
   ══════════════════════════════════════════════════════════ */
const PAYLOAD_V = 'TT1';

function cleanField(s) {
  // The separator cannot appear inside a field.
  return String(s == null ? '' : s).replace(/\|/g, '/').trim();
}
function buildPayload(batch, pos, className, assignment, sid, name) {
  return [PAYLOAD_V, batch, pos, cleanField(className), cleanField(assignment),
          cleanField(sid), cleanField(name)].join('|');
}
function parsePayload(raw) {
  if (typeof raw !== 'string') return null;
  const p = raw.split('|');
  if (p.length < 7 || p[0] !== PAYLOAD_V) return null;
  const pos = p[2] || '';
  const m = pos.match(/^(S?)(\d+)\/(\d+)$/);
  if (!m) return null;
  return {
    batch: p[1],
    spare: m[1] === 'S',
    index: parseInt(m[2], 10),
    total: parseInt(m[3], 10),
    className: p[3],
    assignment: p[4],
    sid: p[5],
    name: p.slice(6).join('|'),
    raw: raw
  };
}

function newBatchTag() {
  return Math.random().toString(36).slice(2, 6);
}

/* ══════════════════════════════════════════════════════════
   1 · COVERSHEETS
   ══════════════════════════════════════════════════════════ */
let rosters = [];

async function initCovers() {
  await ToolshedStore.ready();
  rosters = await ToolshedStore.listRosters();
  const sel = $('cov-roster');
  if (!rosters.length) {
    sel.innerHTML = '<option value="">No class lists yet</option>';
    $('cov-warnings').innerHTML =
      '<div class="warn-box">You have no class lists yet. Make one in ' +
      '<a class="link" href="rosters.html">My class lists</a> first.</div>';
    return;
  }
  sel.innerHTML = '<option value="">Choose a class…</option>' +
    rosters.map(r => `<option value="${esc(r.id)}">${esc(r.name)} — ${r.studentCount} students</option>`).join('');
  sel.addEventListener('change', checkRosterWarnings);
}

async function checkRosterWarnings() {
  const box = $('cov-warnings');
  box.innerHTML = '';
  const id = $('cov-roster').value;
  if (!id) return;
  const roster = await ToolshedStore.getRoster(id);
  if (!roster) return;

  const noId = roster.students.filter(s => !s.sid);
  const seen = {}, dupes = {};
  roster.students.forEach(s => {
    const k = s.name.toLowerCase();
    if (seen[k]) dupes[k] = s.name; else seen[k] = true;
  });
  const dupeNames = Object.keys(dupes).map(k => dupes[k]);

  /* Duplicate names with no ID to tell them apart is the one combination
     that cannot be resolved later: two coversheets would carry identical
     QR payloads, and two output files would want the same filename. */
  if (dupeNames.length && noId.length) {
    box.innerHTML =
      '<div class="warn-box bad"><strong>These students share a name and have no ID number:</strong>' +
      '<ul>' + dupeNames.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' +
      'Their coversheets would be identical and their files would overwrite each other. ' +
      'Add ID numbers in <a class="link" href="rosters.html">My class lists</a> first.</div>';
  } else if (noId.length) {
    box.innerHTML =
      '<div class="warn-box">' + noId.length + ' of ' + roster.students.length +
      ' students have no ID number. That works — names alone are enough here — but adding IDs ' +
      'in <a class="link" href="rosters.html">My class lists</a> makes the split safer if a class ' +
      'ever gains two students with the same name.</div>';
  }
}

/* Draws a QR as vector rectangles rather than an embedded bitmap, with
   horizontal runs merged into single rects. Vector means the printer
   renders it at its own full resolution instead of resampling a raster,
   which is exactly what a code that has to survive print-then-scan
   wants. */
function drawQr(doc, text, x, y, size) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];   // diacritics
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = size / n;
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      const from = c;
      while (c < n && qr.isDark(r, c)) c++;
      doc.rect(x + from * m, y + r * m, (c - from) * m, m, 'F');
    }
  }
  return n;
}

/* The printed name is not decoration: when a QR fails to scan it is what
   lets a teacher identify the sheet from a thumbnail and fix the split by
   hand. So anything a teacher typed or a roster supplied is drawn in the
   embedded font — jsPDF's built-in faces are WinAnsi and would turn
   "Nguyễn" into "NguyÅn". Fixed ASCII chrome can stay on helvetica. */
function coverPage(doc, payload, opts) {
  const PW = 8.5, QR = 1.6, x = (PW - QR) / 2;
  const FONT = ToolshedPdfFont.register(doc);
  drawQr(doc, payload, x, 1.5, QR);

  doc.setFont(FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(opts.assignment, PW / 2, 1.15, { align: 'center' });

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(opts.name ? 20 : 14);
  doc.text(opts.name || 'Name:', PW / 2, QR + 2.05, { align: 'center' });
  if (!opts.name) {
    // A spare is useless without somewhere to actually write.
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.012);
    doc.line(2.2, QR + 2.5, 6.3, QR + 2.5);
    doc.line(2.2, QR + 3.0, 6.3, QR + 3.0);
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('name', 2.2, QR + 2.68);
    doc.text('ID number', 2.2, QR + 3.18);
  }

  if (opts.sid) {
    doc.setFontSize(13);
    doc.setTextColor(90, 90, 90);
    doc.text('ID ' + opts.sid, PW / 2, QR + 2.42, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(opts.className, PW / 2, QR + 2.88, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(150, 150, 150);
  doc.text('Put this sheet on top of your work.', PW / 2, 10.4, { align: 'center' });
}

async function generateCovers() {
  const rosterId = $('cov-roster').value;
  const assignment = $('cov-assignment').value.trim();
  if (!rosterId) { showToast('Choose a class list'); return; }
  if (!assignment) { showToast('Name the assignment'); $('cov-assignment').focus(); return; }

  const roster = await ToolshedStore.getRoster(rosterId);
  if (!roster || !roster.students.length) { showToast('That class list is empty'); return; }

  const spares = Math.max(0, Math.min(20, parseInt($('cov-spares').value, 10) || 0));
  const btn = $('cov-generate');
  btn.disabled = true;
  btn.textContent = 'Building…';

  try {
    const jsPDF = await needJsPDF();
    const doc = new jsPDF({ unit: 'in', format: 'letter' });
    const batch = newBatchTag();
    const n = roster.students.length;

    roster.students.forEach((s, i) => {
      if (i) doc.addPage();
      coverPage(doc, buildPayload(batch, (i + 1) + '/' + n, roster.name, assignment,
                                  s.sid || '', s.name), {
        assignment: assignment, name: s.name, sid: s.sid || '', className: roster.name
      });
    });
    for (let i = 0; i < spares; i++) {
      doc.addPage();
      coverPage(doc, buildPayload(batch, 'S' + (i + 1) + '/' + spares, roster.name,
                                  assignment, '', ''), {
        assignment: assignment, name: '', sid: '', className: roster.name
      });
    }

    const safe = s => String(s).replace(/[^A-Za-z0-9]+/g, '');
    doc.save(safe(roster.name) + '_' + safe(assignment) + '_coversheets.pdf');
    showToast('Coversheets ready — ' + n + ' students' + (spares ? ' + ' + spares + ' spare' : ''), 3600);
  } catch (e) {
    showToast('Could not build the PDF: ' + e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate coversheet PDF';
  }
}

/* ══════════════════════════════════════════════════════════
   2 · SPLIT

   scan.pages[i] = { thumb, qr, boundary, owner }

     qr        parsed payload found on this page, or null
     boundary  true if a student's work starts here
     owner     {sid, name, spare} for a boundary page

   Pages inherit the owner of the nearest boundary at or above them, so
   moving one boundary re-groups everything after it without touching
   any other page.
   ══════════════════════════════════════════════════════════ */
let scan = null;
let cancelRequested = false;

function resetSplit() {
  scan = null;
  cancelRequested = false;
  $('split-upload').style.display = '';
  $('split-progress').style.display = 'none';
  $('split-review').style.display = 'none';
  $('file-input').value = '';
}

function setProgress(frac, label) {
  $('prog-bar').style.width = Math.round(frac * 100) + '%';
  $('prog-label').textContent = label;
}

async function handleFile(file) {
  if (!file) return;
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    showToast('That is not a PDF'); return;
  }
  $('split-upload').style.display = 'none';
  $('split-progress').style.display = '';
  cancelRequested = false;
  setProgress(0, 'Loading libraries…');

  try {
    const [pdfjs, jsQR] = await Promise.all([needPdfJs(), needJsQR()]);
    setProgress(0.02, 'Opening the PDF…');

    const bytes = new Uint8Array(await file.arrayBuffer());
    // pdf.js takes ownership of the buffer it is given, so the copy kept
    // for pdf-lib at export time has to be a separate one.
    // Teardown lives on the loading task in pdf.js v6 — PDFDocumentProxy
    // has no destroy() — so the task reference has to be kept.
    const task = pdfjs.getDocument({ data: bytes.slice() });
    const doc = await task.promise;
    const total = doc.numPages;

    scan = { fileName: file.name, bytes: bytes, numPages: total, pages: [], batches: {} };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const thumbCanvas = document.createElement('canvas');
    const thumbCtx = thumbCanvas.getContext('2d');

    let detector = null;
    if ('BarcodeDetector' in window) {
      try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    }

    for (let i = 1; i <= total; i++) {
      if (cancelRequested) { resetSplit(); showToast('Cancelled'); return; }
      setProgress(0.02 + 0.93 * (i - 1) / total, 'Reading page ' + i + ' of ' + total + '…');

      const page = await doc.getPage(i);
      // Scale 2 puts a 1.5in QR at roughly 9px per module — plenty for
      // detection, and cheap enough to repeat a few hundred times.
      const vp = page.getViewport({ scale: 2 });
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      let found = null;
      if (detector) {
        // Native detection handles rotation itself, so a sheet fed
        // upside down needs no extra pass here.
        try {
          const hits = await detector.detect(canvas);
          for (const h of hits) { const p = parsePayload(h.rawValue); if (p) { found = p; break; } }
        } catch (e) { /* fall through to jsQR */ }
      }
      if (!found) {
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const res = jsQR(img.data, img.width, img.height);
        if (res) found = parsePayload(res.data);
      }

      const tw = 148, th = Math.round(tw * canvas.height / canvas.width);
      thumbCanvas.width = tw; thumbCanvas.height = th;
      thumbCtx.drawImage(canvas, 0, 0, tw, th);

      scan.pages.push({
        thumb: thumbCanvas.toDataURL('image/jpeg', 0.6),
        qr: found,
        boundary: !!found,
        owner: found ? { sid: found.sid, name: found.name, spare: found.spare } : null
      });
      if (found) scan.batches[found.batch] = (scan.batches[found.batch] || 0) + 1;

      page.cleanup();
      await new Promise(r => setTimeout(r, 0));   // let the progress bar paint
    }

    canvas.width = canvas.height = 0;             // release the big buffer
    // Fire-and-forget: everything needed is already extracted, and there
    // is no reason to hold the review screen behind worker cleanup.
    task.destroy().catch(() => {});
    setProgress(1, 'Done');
    await showReview();
  } catch (e) {
    resetSplit();
    showToast('Could not read that PDF: ' + e.message, 6000);
  }
}

/* Groups are derived, never stored — every edit changes a page's
   boundary/owner and the whole grouping is recomputed from that. */
function groupsOf() {
  const out = [];
  let cur = null;
  scan.pages.forEach((p, i) => {
    if (p.boundary) {
      cur = { owner: p.owner, start: i, end: i, source: p.qr ? 'qr' : 'manual' };
      out.push(cur);
    } else if (cur) {
      cur.end = i;
    } else {
      if (!out.length || out[0].orphan !== true) {
        out.unshift({ orphan: true, owner: null, start: 0, end: i, source: 'none' });
      } else {
        out[0].end = i;
      }
    }
  });
  return out;
}

/* The batch tag is what catches a coversheet from another assignment
   sitting in the stack: the majority batch wins and the strays are
   flagged rather than quietly trusted. */
function majorityBatch() {
  let best = null, n = 0;
  Object.keys(scan.batches).forEach(b => { if (scan.batches[b] > n) { n = scan.batches[b]; best = b; } });
  return best;
}

/* ── review ─────────────────────────────────────────────── */
async function showReview() {
  $('split-progress').style.display = 'none';
  $('split-review').style.display = '';
  scan.rosterStudents = await loadRosterStudents();
  renderReview();
}

function renderReview() {
  const groups = groupsOf();
  const real = groups.filter(g => !g.orphan);
  const named = real.filter(g => g.owner && g.owner.name);

  $('stat-found').textContent = named.length;
  $('stat-pages').textContent = scan.numPages;

  // Expected roll-call comes from the QR itself, so it works months
  // later without needing the original class list to still exist.
  const withTotal = scan.pages.find(p => p.qr && !p.qr.spare);
  const expected = withTotal ? withTotal.qr.total : null;
  const missing = expected ? Math.max(0, expected - named.filter(g => !g.owner.spare).length) : 0;
  $('stat-missing').textContent = missing;

  const warn = [];
  const orphan = groups.find(g => g.orphan);
  if (orphan) {
    warn.push('<strong>' + (orphan.end + 1) + ' page' + (orphan.end ? 's' : '') +
      ' before the first coversheet.</strong> They are not in any student\'s file yet — ' +
      'click one to say whose work it is.');
  }
  if (missing > 0) {
    warn.push('<strong>' + missing + ' of ' + expected + ' coversheets were not found.</strong> ' +
      'Either those students did not hand in, or a QR did not scan. Check for a group with ' +
      'more pages than it should have — a missed coversheet lands that student\'s work on the end ' +
      'of the student before them.');
  }
  const mb = majorityBatch();
  const strays = real.filter(g => g.source === 'qr' && scan.pages[g.start].qr.batch !== mb);
  if (strays.length) {
    warn.push('<strong>' + strays.length + ' coversheet' + (strays.length > 1 ? 's are' : ' is') +
      ' from a different assignment.</strong> They are marked below — check they belong in this stack.');
  }
  const unnamed = real.filter(g => !g.owner || !g.owner.name);
  if (unnamed.length) {
    warn.push('<strong>' + unnamed.length + ' group' + (unnamed.length > 1 ? 's have' : ' has') +
      ' no name yet</strong> (spare coversheets). Click the group to assign a student, ' +
      'or it will be left out of the export.');
  }
  $('review-warnings').innerHTML = warn.length
    ? '<div class="warn-box' + (missing > 0 || orphan ? ' bad' : '') + '">' +
      warn.map(w => '<p style="margin:0 0 6px">' + w + '</p>').join('') + '</div>'
    : '';

  $('groups').innerHTML = groups.map(g => {
    const count = g.end - g.start + 1;
    const isSpare = g.owner && g.owner.spare;
    const nameHtml = g.orphan
      ? '<span class="group-name" style="color:var(--accent-hover)">Not assigned</span>'
      : (g.owner && g.owner.name
          ? '<span class="group-name">' + esc(g.owner.name) + '</span>'
          : '<span class="group-name" style="color:var(--accent-hover)">Spare — needs a name</span>');
    const sid = g.owner && g.owner.sid ? '<div class="group-sid">ID ' + esc(g.owner.sid) + '</div>' : '';
    const stray = !g.orphan && g.source === 'qr' && scan.pages[g.start].qr.batch !== mb;

    const thumbs = [];
    for (let i = g.start; i <= g.end; i++) {
      const p = scan.pages[i];
      thumbs.push(
        '<div class="thumb' + (p.boundary ? ' boundary' : '') + '" data-page="' + i + '">' +
        '<img src="' + p.thumb + '" alt="Page ' + (i + 1) + '"/>' +
        (p.boundary ? '<span class="thumb-flag">' + (p.qr ? '🟩' : '✋') + '</span>' : '') +
        '<span class="thumb-num">' + (i + 1) + '</span></div>');
    }
    return '<div class="group' + (g.orphan || !g.owner || !g.owner.name ? ' unassigned' : '') +
      (isSpare ? ' spare' : '') + '">' +
      '<div class="group-head"><div class="group-who">' + nameHtml + sid + '</div>' +
      (stray ? '<span class="group-src manual">other assignment</span>' : '') +
      '<span class="group-src ' + g.source + '">' +
        (g.source === 'qr' ? 'QR' : g.source === 'manual' ? 'by hand' : 'unassigned') + '</span>' +
      '<span class="group-pages">' + count + ' page' + (count === 1 ? '' : 's') + '</span></div>' +
      '<div class="thumbs">' + thumbs.join('') + '</div></div>';
  }).join('');

  $('groups').querySelectorAll('.thumb').forEach(el => {
    el.addEventListener('click', () => openInspector(parseInt(el.dataset.page, 10)));
  });
}

/* ── page inspector ─────────────────────────────────────── */
let inspPage = null;

/* The pick list has to include students whose coversheet never scanned —
   they are precisely the ones needing reassignment, and they appear in no
   QR. So the scan's own QRs are merged with the matching class list,
   looked up by the class name carried in the payload. The QR half alone
   works months later with no class list; the roster half covers the
   failed-coversheet case. */
async function loadRosterStudents() {
  const cls = scanClassName();
  if (!cls) return [];
  try {
    await ToolshedStore.ready();
    const list = await ToolshedStore.listRosters();
    const hit = list.find(r => r.name.toLowerCase() === cls.toLowerCase());
    if (!hit) return [];
    const full = await ToolshedStore.getRoster(hit.id);
    return full ? full.students.map(s => ({ sid: s.sid || '', name: s.name })) : [];
  } catch (e) { return []; }
}

function knownStudents() {
  const seen = {}, out = [];
  const add = s => {
    const k = (s.sid || '') + '|' + s.name;
    if (s.name && !seen[k]) { seen[k] = true; out.push({ sid: s.sid || '', name: s.name }); }
  };
  scan.pages.forEach(p => { if (p.qr) add({ sid: p.qr.sid, name: p.qr.name }); });
  (scan.rosterStudents || []).forEach(add);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function openInspector(i) {
  inspPage = i;
  const p = scan.pages[i];
  $('insp-title').textContent = 'Page ' + (i + 1) + ' of ' + scan.numPages;
  $('insp-img').src = p.thumb;
  $('insp-role').value = p.boundary ? 'boundary' : 'continue';

  const students = knownStudents();
  $('insp-who').innerHTML =
    '<option value="">— choose a student —</option>' +
    students.map(s => '<option value="' + esc(s.sid + '|' + s.name) + '">' +
      esc(s.name) + (s.sid ? ' (ID ' + esc(s.sid) + ')' : '') + '</option>').join('');
  $('insp-who').innerHTML += '<option value="__other">Someone else…</option>';
  if (p.owner && p.owner.name) $('insp-who').value = p.owner.sid + '|' + p.owner.name;
  $('insp-other').value = '';
  $('insp-other-field').style.display = 'none';

  $('insp-detected').textContent = p.qr
    ? 'A QR was read on this page: ' + (p.qr.name || 'spare coversheet') +
      (p.qr.sid ? ' (ID ' + p.qr.sid + ')' : '') + '.'
    : 'No QR was found on this page.';

  syncInspector();
  $('insp').classList.add('open');
}
function syncInspector() {
  const isBoundary = $('insp-role').value === 'boundary';
  $('insp-who-field').style.display = isBoundary ? '' : 'none';
  $('insp-other-field').style.display =
    isBoundary && $('insp-who').value === '__other' ? '' : 'none';
}
function applyInspector() {
  const p = scan.pages[inspPage];
  if ($('insp-role').value === 'boundary') {
    const v = $('insp-who').value;
    if (!v) { showToast('Choose whose work this is'); return; }
    if (v === '__other') {
      const typed = $('insp-other').value.trim();
      if (!typed) { showToast('Type the student\'s name'); $('insp-other').focus(); return; }
      p.boundary = true;
      p.owner = { sid: '', name: typed, spare: false };
    } else {
      const cut = v.indexOf('|');
      p.boundary = true;
      p.owner = { sid: v.slice(0, cut), name: v.slice(cut + 1), spare: false };
    }
  } else {
    if (inspPage === 0) { showToast('The first page has to start a student'); return; }
    p.boundary = false;
    p.owner = null;
  }
  $('insp').classList.remove('open');
  renderReview();
}

/* ── export ─────────────────────────────────────────────── */
function safePart(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Nguyễn → Nguyen, not Nguyn
    .replace(/[^A-Za-z0-9]+/g, '');
}

function scanAssignment() {
  // A hand-placed boundary has no QR of its own, so the assignment name
  // comes from the rest of the batch rather than a generic placeholder.
  const p = scan.pages.find(p => p.qr && p.qr.assignment);
  return p ? p.qr.assignment : 'Work';
}

function scanClassName() {
  const p = scan.pages.find(p => p.qr && p.qr.className);
  return p ? p.qr.className : '';
}

function buildNames(groups) {
  /* Matches PureWrite's Class_ID_Task convention so both tools' output
     sorts together. Falls back to the name when there is no ID, and
     de-duplicates rather than letting one file overwrite another. */
  const used = {};
  return groups.map(g => {
    const who = g.owner.sid ? safePart(g.owner.sid) : safePart(g.owner.name);
    const assignment = safePart(
      (scan.pages[g.start].qr && scan.pages[g.start].qr.assignment) || scanAssignment());
    const cls = safePart(scan.pages[g.start].qr ? scan.pages[g.start].qr.className : scanClassName());
    let base = [cls, who, assignment].filter(Boolean).join('_');
    if (!base) base = 'student';
    let name = base, n = 2;
    while (used[name.toLowerCase()]) name = base + '-' + (n++);
    used[name.toLowerCase()] = true;
    return name + '.pdf';
  });
}

async function exportSplit(forceZip) {
  const groups = groupsOf().filter(g => !g.orphan && g.owner && g.owner.name);
  if (!groups.length) { showToast('Nothing to export yet — assign at least one group'); return; }

  const btn = forceZip ? $('export-zip-btn') : $('export-btn');
  const label = btn.textContent;
  btn.disabled = true;
  $('export-btn').disabled = true;
  $('export-zip-btn').disabled = true;
  btn.textContent = 'Splitting…';

  try {
    const PDFLib = await needPdfLib();
    const src = await PDFLib.PDFDocument.load(scan.bytes);
    const names = buildNames(groups);
    const files = [];

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      btn.textContent = 'Splitting ' + (gi + 1) + '/' + groups.length + '…';
      const out = await PDFLib.PDFDocument.create();
      const idx = [];
      for (let i = g.start; i <= g.end; i++) idx.push(i);
      // copyPages carries the original page streams across, so a 300 DPI
      // scan is moved rather than re-encoded.
      const copied = await out.copyPages(src, idx);
      copied.forEach(pg => out.addPage(pg));
      files.push({ name: names[gi], bytes: await out.save() });
      await new Promise(r => setTimeout(r, 0));
    }

    /* Writing into a folder the teacher picks avoids holding a whole
       second copy of the scan in memory as one Blob. Browsers without
       the picker get a zip instead. */
    if (window.showDirectoryPicker && !forceZip) {
      let dir = null;
      try {
        dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        if (e.name === 'AbortError') { showToast('Export cancelled'); return; }
      }
      if (dir) {
        for (const f of files) {
          const fh = await dir.getFileHandle(f.name, { create: true });
          const w = await fh.createWritable();
          await w.write(f.bytes);
          await w.close();
        }
        showToast('Wrote ' + files.length + ' files to the folder you chose', 4200);
        return;
      }
    }

    const zip = ToolshedZip.makeZip(files);
    const blob = new Blob([zip], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (safePart(scanClassName()) || 'split') + '_split.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('Downloaded ' + files.length + ' files as a zip', 4200);
  } catch (e) {
    showToast('Export failed: ' + e.message, 6000);
  } finally {
    btn.disabled = false;
    $('export-btn').disabled = false;
    $('export-zip-btn').disabled = false;
    btn.textContent = label;
  }
}

/* ══════════════════════════════════════════════════════════
   WIRING
   ══════════════════════════════════════════════════════════ */
function switchTab(which) {
  $('tab-covers').classList.toggle('active', which === 'covers');
  $('tab-split').classList.toggle('active', which === 'split');
  $('screen-covers').classList.toggle('active', which === 'covers');
  $('screen-split').classList.toggle('active', which === 'split');
}

$('tab-covers').addEventListener('click', () => switchTab('covers'));
$('tab-split').addEventListener('click', () => switchTab('split'));
$('cov-generate').addEventListener('click', generateCovers);

$('drop').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', e => handleFile(e.target.files[0]));
['dragenter', 'dragover'].forEach(t => $('drop').addEventListener(t, e => {
  e.preventDefault(); $('drop').classList.add('over');
}));
['dragleave', 'drop'].forEach(t => $('drop').addEventListener(t, e => {
  e.preventDefault(); $('drop').classList.remove('over');
}));
$('drop').addEventListener('drop', e => {
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
$('cancel-scan').addEventListener('click', () => { cancelRequested = true; });
$('start-over').addEventListener('click', resetSplit);
$('export-btn').addEventListener('click', () => exportSplit(false));
$('export-zip-btn').addEventListener('click', () => exportSplit(true));
$('insp-role').addEventListener('change', syncInspector);
$('insp-who').addEventListener('change', syncInspector);
$('insp-cancel').addEventListener('click', () => $('insp').classList.add('hidden'));
$('insp-apply').addEventListener('click', applyInspector);
$('insp').addEventListener('click', e => { if (e.target === $('insp')) $('insp').classList.remove('open'); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('insp').classList.remove('open');
});

if (!window.showDirectoryPicker) {
  // Without the picker there is only one export route, so don't show two.
  $('export-btn').style.display = 'none';
  $('export-zip-btn').classList.remove('btn-outline');
  $('export-zip-btn').classList.add('btn-primary');
}

initCovers();
