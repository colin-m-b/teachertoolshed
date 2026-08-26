'use strict';
/* ══════════════════════════════════════════════════════════
   Teacher Toolshed — class list import

   Turns whatever a teacher pastes or drops in — a spreadsheet paste, a
   CSV file, a markdown table, a numbered list an LLM wrote out — into
   {sid, name} rows, without ever separating an ID from the name it
   belongs to. That pairing is the whole safety model: a two-box "names
   here, IDs here" design lets one blank line silently shift every ID
   down a row with nothing to detect it. Keeping ID and name on the same
   row makes that failure structurally impossible — the worst a bad
   paste can do is corrupt the one row it touches, and that row is
   visible in the preview.

   Pure functions only, no DOM — testable with a plain `require()`.
   Exported as window.RosterImport in the browser, module.exports under
   Node (guarded so the browser build ignores it).
   ══════════════════════════════════════════════════════════ */

/* ── field-shape predicates ─────────────────────────────── */

function looksLikeId(v) {
  // No whitespace anywhere, and at least one digit. Catches 82984196,
  // S12345, 2024A17, AB1234, ID-9928 — anything a school actually issues
  // — without assuming a leading digit, which misses the S/AB-prefixed
  // forms that are common in practice.
  v = String(v || '');
  return v.length > 0 && !/\s/.test(v) && /\d/.test(v);
}
function looksLikeEmail(v) {
  return /\S+@\S+\.\S+/.test(String(v || ''));
}
function looksLikeSmallInt(v) {
  // A bare 1-2 digit number reads as a grade or homeroom, not a student
  // ID — used only to break a tie when two columns both look ID-ish.
  return /^\d{1,2}$/.test(String(v || '').trim());
}

function modeOf(nums) {
  const counts = new Map();
  let best = nums[0], bestCount = 0;
  nums.forEach(n => {
    const c = (counts.get(n) || 0) + 1;
    counts.set(n, c);
    if (c > bestCount) { bestCount = c; best = n; }
  });
  return best;
}

/* ── low-level delimited parsing (quote-aware) ──────────────
   RFC4180-ish: "" escapes a quote inside a quoted field, and a quoted
   field may contain the delimiter or a literal newline. Needed for real
   correctness on CSV files (Excel quotes a cell that contains a comma)
   and on a spreadsheet paste of the same shape. */
function parseDelimited(text, delim) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') { inQuotes = true; continue; }
    if (c === delim) { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

/* ── turning free-form pasted text into rows ────────────── */

function stripListMarker(line) {
  return line.replace(/^\s*(?:[-*•▪]|\d+[.)])\s+/, '');
}

function trimEdgeEmpties(row) {
  const r = row.slice();
  if (r.length && r[0].trim() === '') r.shift();
  if (r.length && r[r.length - 1].trim() === '') r.pop();
  return r;
}

// Priority when more than one delimiter is plausible: tab and pipe are
// unambiguous (a name essentially never contains one), semicolon nearly
// so; comma is the weakest signal since "Nguyen, Van An" is a legitimate
// single value, so it only wins when nothing else is present.
const DELIM_PRIORITY = { '\t': 4, '|': 3, ';': 2, ',': 1 };

function tryDelimited(text) {
  let best = null;
  for (const delim of ['\t', '|', ';', ',']) {
    let rows = parseDelimited(text, delim).filter(r => r.some(f => f.trim()));
    if (!rows.length) continue;
    if (delim === '|') {
      rows = rows.map(trimEdgeEmpties).filter(r => !r.every(f => /^:?-+:?$/.test(f.trim())));
    }
    if (!rows.length) continue;
    const counts = rows.map(r => r.length);
    const mode = modeOf(counts);
    if (mode < 2) continue;   // this delimiter never actually produced a second column
    // Comma is ambiguous enough ("Nguyen, Van An" is a legitimate single
    // value) that one line alone is never enough evidence — a real table
    // needs at least a second row to confirm the shape repeats. Tab, pipe
    // and semicolon are unambiguous even from a single line.
    if (delim === ',' && rows.length < 2) continue;
    const consistency = counts.filter(c => c === mode).length / counts.length;
    // 0.6 rather than something stricter: on a small class list (a
    // handful of rows) one genuinely ragged row can otherwise swing
    // consistency below a tighter cutoff and make the whole delimiter go
    // undetected — worse than accepting it and flagging that one row.
    if (consistency < 0.6) continue;
    const score = consistency * DELIM_PRIORITY[delim];
    if (!best || score > best.score) best = { delim, rows, score };
  }
  if (!best) return null;
  return { rows: best.rows.map(r => r.map(f => f.trim())), delimiter: best.delim };
}

// "82984196 — Nguyen Van An" / "Nguyen Van An (82984196)" — the shapes a
// numbered or bulleted list tends to take, especially one an LLM wrote.
// One pattern is picked for the WHOLE list (by majority vote) and then
// applied uniformly, rather than re-decided per line — mixing id-first
// and name-first rows would put an ID in column 0 on some rows and
// column 1 on others, corrupting the very column model this file relies
// on. A line that doesn't fit becomes a name-only row instead.
function tryLinePattern(lines) {
  if (!lines.length) return null;

  const parenRe = /^(.+?)\s*\(([^()]+)\)\s*$/;
  const parenHits = lines.filter(l => { const m = l.match(parenRe); return m && looksLikeId(m[2].trim()); });

  const dashRe = /^(.*?)\s+[-–—]\s+(.*)$/;
  const dashMatches = lines.map(l => l.match(dashRe)).filter(Boolean);
  const dashHits = dashMatches.filter(m => looksLikeId(m[1].trim()) || looksLikeId(m[2].trim()));

  if (parenHits.length >= dashHits.length && parenHits.length / lines.length >= 0.6) {
    return lines.map(l => {
      const m = l.match(parenRe);
      if (m && looksLikeId(m[2].trim())) return [m[1].trim(), m[2].trim()];
      return [l];
    });
  }
  if (dashHits.length / lines.length >= 0.6) {
    const idOnLeft = dashHits.filter(m => looksLikeId(m[1].trim())).length >=
                      dashHits.filter(m => looksLikeId(m[2].trim())).length;
    return lines.map(l => {
      const m = l.match(dashRe);
      if (!m) return [l];
      return idOnLeft ? [m[1].trim(), m[2].trim()] : [m[2].trim(), m[1].trim()];
    });
  }
  return null;
}

/* Top-level: turn raw pasted/typed text into rows of fields. Tries a
   real table first (comma/tab/semicolon/pipe), then a one-line "ID —
   Name" pattern, then falls back to one name per line — the format this
   tool has always accepted. */
function buildRows(text) {
  if (!text || !text.trim()) return { rows: [], format: 'empty' };

  const delimited = tryDelimited(text);
  if (delimited) return { rows: delimited.rows, format: 'delimited', delimiter: delimited.delimiter };

  const lines = text.split(/\r\n|\r|\n/).map(stripListMarker).map(s => s.trim()).filter(Boolean);

  const patterned = tryLinePattern(lines);
  if (patterned) return { rows: patterned, format: 'pattern' };

  // Legacy convenience: one line of comma-separated NAMES is a roster —
  // unless it is a single "ID, Name" pair, which stays one student.
  if (lines.length === 1 && lines[0].includes(',')) {
    const parts = lines[0].split(',').map(s => s.trim()).filter(Boolean);
    const looksLikePair = parts.length === 2 && (looksLikeId(parts[0]) || looksLikeId(parts[1]));
    if (looksLikePair) return { rows: [parts], format: 'pattern' };
    return { rows: parts.map(p => [p]), format: 'comma-list' };
  }

  return { rows: lines.map(l => [l]), format: 'plain' };
}

/* ── column roles: which column is the ID, which are the name ── */

const HEADER_WORDS = new Set([
  'id', 'student id', 'studentid', 'sid', 'number', 'no', '#',
  'name', 'student name', 'full name', 'first', 'first name', 'given name',
  'last', 'last name', 'surname', 'family name',
  'email', 'email address', 'grade', 'class', 'homeroom', 'section', 'period', 'year', 'form'
]);

function detectColumnRoles(rows) {
  const numCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const roles = [];
  const stats = [];

  for (let c = 0; c < numCols; c++) {
    const vals = rows.map(r => (r[c] || '').trim()).filter(Boolean);
    if (!vals.length) { roles.push('skip'); stats.push(null); continue; }
    const emailFrac = vals.filter(looksLikeEmail).length / vals.length;
    const idFrac = vals.filter(looksLikeId).length / vals.length;
    const smallIntFrac = vals.filter(looksLikeSmallInt).length / vals.length;
    if (emailFrac >= 0.5) { roles.push('skip'); stats.push(null); continue; }
    if (idFrac >= 0.6) { roles.push('id-candidate'); stats.push({ idFrac, smallIntFrac }); continue; }
    roles.push('name'); stats.push(null);
  }

  // Only one column can actually feed sid. Among the candidates, prefer
  // the one that looks LEAST like a bare grade/homeroom number.
  const candidateIdx = roles.map((r, i) => r === 'id-candidate' ? i : -1).filter(i => i >= 0);
  if (candidateIdx.length) {
    candidateIdx.sort((a, b) => stats[a].smallIntFrac - stats[b].smallIntFrac);
    const winner = candidateIdx[0];
    candidateIdx.forEach(i => { roles[i] = i === winner ? 'id' : 'skip'; });
  }
  return roles;
}

function detectHeaderRow(rows, roles) {
  if (rows.length < 2) return false;
  const first = rows[0];
  const norm = f => f.trim().toLowerCase().replace(/:$/, '');
  const keywordHits = first.filter(f => HEADER_WORDS.has(norm(f))).length;
  const keywordFrac = first.length ? keywordHits / first.length : 0;
  if (keywordFrac >= 0.4) return true;

  const idCol = roles.indexOf('id');
  if (idCol >= 0) {
    const v = (first[idCol] || '').trim();
    if (v && !looksLikeId(v)) return true;
  }
  return false;
}

/* ── assembling students, and flagging what needs a human look ── */

function buildStudents(rows, roles, hasHeader) {
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const idCol = roles.indexOf('id');
  const nameCols = roles.map((r, i) => r === 'name' ? i : -1).filter(i => i >= 0);

  return dataRows.map(row => {
    const sid = idCol >= 0 ? (row[idCol] || '').trim() : '';
    const name = nameCols.map(i => (row[i] || '').trim()).filter(Boolean).join(' ').trim();
    return { sid, name, fieldCount: row.length };
  }).filter(s => s.name);
}

/* Per-student flags for the preview — not blocking, just visible.
   Duplicate IDs and a ragged row are worth a look on any list; an
   odd-length ID only means anything once there is a real pattern to be
   the odd one out of. */
function analyzeStudents(students) {
  const sidCounts = new Map();
  students.forEach(s => { if (s.sid) sidCounts.set(s.sid, (sidCounts.get(s.sid) || 0) + 1); });

  const sidLengths = students.filter(s => s.sid).map(s => s.sid.length);
  const modeLen = sidLengths.length >= 3 ? modeOf(sidLengths) : null;

  const fieldCounts = students.map(s => s.fieldCount);
  const modeFields = fieldCounts.length ? modeOf(fieldCounts) : null;
  const numColsVaries = modeFields !== null && fieldCounts.some(c => c !== modeFields);

  return students.map(s => ({
    ...s,
    warnDuplicateId: !!s.sid && sidCounts.get(s.sid) > 1,
    warnOddId: !!s.sid && modeLen !== null && s.sid.length !== modeLen,
    warnRagged: numColsVaries && s.fieldCount !== modeFields
  }));
}

/* ── orchestrator ─────────────────────────────────────────
   overrideRoles, if given, replaces auto-detected roles 1:1 (from a
   teacher's per-column dropdown choice). overrideHeader, if a boolean,
   replaces auto-detected header-row skipping. */
function parseRoster(text, opts) {
  opts = opts || {};
  const { rows, format, delimiter } = buildRows(text);
  if (!rows.length) return { students: [], rows: [], roles: [], hasHeader: false, format, numCols: 0 };

  // Two passes. The first types columns using every row, including a
  // possible header line, and that's enough to find the header (a header
  // word or two barely dents a fraction taken across a whole class). But
  // on a short list a header row can dilute that same fraction below the
  // threshold for the column it's heading — "ID" and "82984196" is 1 real
  // ID in 2 rows, which reads as "doesn't look like an ID column" even
  // though it obviously is once the header is out of the count. So the
  // roles actually used are recomputed from data rows alone.
  const rolesPass1 = detectColumnRoles(rows);
  const autoHeader = detectHeaderRow(rows, rolesPass1);
  const hasHeader = typeof opts.overrideHeader === 'boolean' ? opts.overrideHeader : autoHeader;

  const dataRowsForTyping = hasHeader ? rows.slice(1) : rows;
  const autoRoles = dataRowsForTyping.length ? detectColumnRoles(dataRowsForTyping) : rolesPass1;
  const roles = opts.overrideRoles && opts.overrideRoles.length === autoRoles.length
    ? opts.overrideRoles : autoRoles;

  const rawStudents = buildStudents(rows, roles, hasHeader);
  const students = analyzeStudents(rawStudents);

  return { students, rows, roles, autoRoles, hasHeader, autoHeader, format, delimiter, numCols: roles.length };
}

/* ── CSV file import ──────────────────────────────────────
   Reads a File's bytes and normalises them into the same tab-joined
   text the paste path produces, so everything downstream — column
   detection, preview, save — is one code path regardless of source.
   Fields are whitespace-collapsed before the tab-join specifically so an
   embedded newline or stray tab inside a quoted CSV cell can't be
   mistaken for a row or column break once it's back in plain text. */

function isZipMagic(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function decodeCsvBytes(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function detectCsvDelimiter(text) {
  const sample = text.split(/\r\n|\r|\n/).slice(0, 20);
  const count = (ch) => sample.reduce((n, l) => n + (l.split(ch).length - 1), 0);
  return count(';') > count(',') ? ';' : ',';
}

class UnsupportedFileError extends Error {}

function csvBytesToRosterText(bytes) {
  if (isZipMagic(bytes)) {
    throw new UnsupportedFileError(
      'That looks like an Excel, Numbers, or LibreOffice file, not a CSV. ' +
      'Open it and use File → Save As → CSV, then import that file instead.');
  }
  const text = stripBom(decodeCsvBytes(bytes));
  const delim = detectCsvDelimiter(text);
  const rows = parseDelimited(text, delim).filter(r => r.some(f => f.trim()));
  return rows.map(r => r.map(f => f.replace(/\s+/g, ' ').trim()).join('\t')).join('\n');
}

const api = {
  looksLikeId, looksLikeEmail, looksLikeSmallInt,
  parseDelimited, buildRows, detectColumnRoles, detectHeaderRow,
  buildStudents, analyzeStudents, parseRoster,
  isZipMagic, decodeCsvBytes, stripBom, detectCsvDelimiter, csvBytesToRosterText,
  UnsupportedFileError
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RosterImport = api;
