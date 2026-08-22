# Teacher Toolshed — Standardization & Persistence Plan

**Status: ACTIVE — this is the current work plan.** `ARCHITECTURE.md` describes a possible long-term SaaS future and is *not* being executed now; where the two disagree, this file wins.

This plan is written to be executed phase by phase. Complete phases in order, commit at the end of each phase (one commit per phase minimum), and verify the acceptance checklist before moving on. Do not expand scope beyond what a phase specifies.

---

## Decisions already made (do not re-litigate)

1. **Design system:** the cream + gold system already shared by `seating-chart-maker.html` and `talk-tracker.html` (Lora headings + DM Sans body, `#F7F5F0` background, `#B5843A` accent) becomes the system for the entire site, including the landing page and the hex tool.
2. **Architecture:** stays a static HTML site. No frameworks, no build step, no npm. Shared code goes in plain `.css` and `.js` files.
3. **Persistence:** local-first. A shared roster/data store in the browser (IndexedDB) used by all tools, with JSON export/import as backup. **No accounts, no server, no analytics.** The store is written behind an async interface so a cloud backend could be swapped in later — but no cloud code is written now.
4. **Monetization:** all Pro/pricing/upgrade UI is removed. Everything is free. No fake paywalls.

### FERPA posture (informs several phases)

Because all data stays in the teacher's own browser and no data is ever transmitted to or stored by the site's operator, the site does not receive or maintain education records — the strongest possible privacy posture. Preserve these properties in every change:

- Never add a network call that transmits roster/student data anywhere.
- The hex tool's student-share mechanism encodes the activity in the URL fragment (base64 in `location.hash`) — serverless by design. Keep this mechanism; do not "improve" it into a server-backed one.
- The privacy page (Phase 5) states this plainly.

---

## Current state (verified 2026-08-22)

```
index.html                      landing page — cream + FOREST GREEN accent, Lora + Inter (wrong accent/body font)
css/base.css                    landing tokens (forest palette) + shared buttons
css/nav.css                     landing nav
css/home.css                    landing sections
teacher-tools/
  seating-chart-maker.html      970 lines, self-contained. ✅ already target design. Has Pro/upgrade mockups (~32 mentions). Saves rosters to localStorage key `toolshed:rosters`. Does NOT save charts.
  talk-tracker.html             823 lines, self-contained. ✅ already target design. Has Pro/upgrade mockups (~26 mentions). Saves NOTHING — sessions lost on reload.
  hexthinking.html              872 lines, self-contained. ❌ off-brand: "HexThinking" name, Anybody font, orange #e86b30 accent, own hex logo. Teacher setup + student canvas in one file; sharing via base64 activity in location.hash; student canvas state saved to localStorage keyed by hash.
  FONT-LICENSE.md
ARCHITECTURE.md                 aspirational SaaS doc — superseded for now (see Status note to add in Phase 0)
README.md
```

Known content bug: `index.html` lists tool 03 "Socratic seminar tracker" as *Coming soon*, but `talk-tracker.html` exists and works. Fixed in Phase 2.

---

## The design system (single source of truth)

These tokens are lifted from `seating-chart-maker.html` / `talk-tracker.html` and become `css/toolshed.css`. Every page uses them.

```css
:root{
  /* palette */
  --bg:#F7F5F0; --surface:#FFFFFF; --surface-2:#F0EDE6; --border:#E0DDD4;
  --border-focus:#B5843A;
  --text:#28251E; --text-mid:#6B6457; --text-light:#A8A098;
  --accent:#B5843A; --accent-hover:#9A6E2F; --accent-soft:#FBF4E8;
  --green:#4A7C59; --green-soft:#EBF4EE; --green-border:#B8D9C2;
  --red:#C44A3F; --red-soft:#FAECEA;
  /* shape */
  --radius:10px; --radius-sm:6px;
  --shadow:0 1px 3px rgba(40,37,30,.08),0 1px 2px rgba(40,37,30,.05);
  /* type */
  --font-serif:"Lora",Georgia,serif;
  --font-sans:"DM Sans","Helvetica Neue",sans-serif;
}
```

**Fonts link (identical on every page):**
```html
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
```

**Type rules:** Lora (`--font-serif`) for headings, page titles, card titles, stat numbers, brand name. DM Sans (`--font-sans`) for everything else. Body 15px, line-height 1.5.

**Component conventions** (already in the two on-brand tools — extract, don't invent):
- `.btn` base + `.btn-primary` (accent bg, white text), `.btn-secondary` (surface-2 bg, border), `.btn-ghost` (no bg, text-mid). Radius `--radius-sm`, 13px, weight 600.
- Inputs/selects/textareas: `--surface-2` bg, 1.5px `--border`, radius `--radius-sm`, focus → `--border-focus`.
- Cards: `--surface` bg, 1px `--border`, radius `--radius`, `--shadow`.
- Modals: centered, `--surface`, radius `--radius`, dimmed overlay.
- Shared header (see Phase 1).

**Orange→gold mapping for the hex tool** (Phase 1c):

| hexthinking.html today | becomes |
|---|---|
| `--bg: #f4f1ec` | `#F7F5F0` |
| `--bg-warm: #eae5dd` | `#F0EDE6` |
| `--border: #d8d2c8` / `--border-light: #e8e3db` | `#E0DDD4` |
| `--text: #2c2924` / `--text-mid: #6b635a` / `--text-dim: #9e9588` | `#28251E` / `#6B6457` / `#A8A098` |
| `--accent: #e86b30` / `--accent-hover: #d45a22` | `#B5843A` / `#9A6E2F` |
| `--accent-light: rgba(232,107,48,0.08)` | `#FBF4E8` |
| `--red: #c94040` | `#C44A3F` |
| font `Anybody` (all uses) | `Lora` (weights 600/700; drop 800) |
| hardcoded `#e86b30` in inline SVGs (brand logo, canvas) | `#B5843A` |
| hardcoded `#6b635a` in JS-generated SVG text | `#6B6457` |

Note: hexagon *category colors* chosen by the teacher (the per-category color swatches) are content, not chrome — leave that palette alone.

---

## Phase 0 — Housekeeping (15 min)

1. Add this note at the top of `ARCHITECTURE.md`, right under the title:
   > **Status: aspirational / superseded.** This document sketches a possible future SaaS version. Current active work is defined in `PLAN.md`. Notably, the dark/lime design system in §11 has been rejected in favor of the cream/gold system, and the Next.js migration is not happening now.
2. Update `README.md` to a short real readme: what the site is, the three tools, "static site, no build step," link to PLAN.md.

**Accept:** both files updated; nothing else touched.

## Phase 1 — Shared design system (the big one)

### 1a. Create `css/toolshed.css`

Tokens above + reset + base body styles + shared components (buttons, inputs, cards, modal, header) extracted from `seating-chart-maker.html`/`talk-tracker.html`. Also the shared header component:

```html
<header class="ts-header">
  <div class="ts-header-left">
    <a class="ts-brand" href="/"> [brand icon SVG] <span class="ts-brand-name">Teacher<span>Toolshed</span></span></a>
    <span class="ts-header-sep">/</span>
    <span class="ts-header-tool">[Tool Name]</span>
  </div>
  <div class="ts-header-right">[per-page actions]</div>
</header>
```

Use the brand icon SVG currently in `seating-chart-maker.html` (lines ~182–190) as the canonical brand mark. Prefix shared classes `ts-` to avoid colliding with existing per-tool class names.

### 1b. Restyle the landing page

- `index.html`: swap fonts link to the standard one (Inter → DM Sans); link `css/toolshed.css` first.
- Rewrite `css/base.css`, `css/nav.css`, `css/home.css` on the new tokens: forest greens → gold accent family (`--forest`→`--accent`, `--forest-bg`→`--accent-soft`, `--forest-border`→ `--border-focus` at ~35% opacity or `#E5D3B3`; amber pill stays in the `--accent-soft`/`--accent` family). Keep layout/structure; this is a re-skin, not a redesign.
- Nav adopts the shared brand mark + wordmark so landing and tools match.
- Keep the existing "Live" status dots green (`--green`).

### 1c. Restyle the hex tool

`teacher-tools/hexthinking.html`:
- Apply the orange→gold mapping table above (CSS variables, hardcoded SVG hexes in markup, and SVG attributes generated in JS — search the whole file for `e86b30`, `d45a22`, `6b635a`, `Anybody`).
- Fonts link → standard link (keep DM Sans; Anybody and its weights go away). `brand h1`, `h2`, `h3`, modal headings switch to `var(--font-serif)`.
- Replace the "HexThinking" brand block (both occurrences, teacher header + student header, lines ~277 and ~321) with the shared `ts-header` pattern: brand → "Teacher Toolshed / Hexagonal Thinking". Title tag → `Hexagonal Thinking — Teacher Toolshed`. The hex logo SVG may remain as a small tool glyph next to the tool name if it looks good recolored, or be dropped.
- **Do not touch** the canvas logic, drag/connection code, hash-based sharing, or the teacher/student mode switch. This phase is visual only.

### 1d. Deduplicate the two on-brand tools

In `seating-chart-maker.html` and `talk-tracker.html`: link `css/toolshed.css` and delete only the now-duplicated token/reset/button/input/card/modal/header rules from their inline `<style>` blocks. Keep all tool-specific rules inline. Convert their headers to the `ts-` classes. If a deletion is uncertain, keep the inline rule — duplication is safer than breakage.

**Accept (Phase 1):** open all four pages in a browser. Identical fonts everywhere (Lora/DM Sans — no Inter, no Anybody, check DevTools computed styles); identical header brand on the three tools; landing nav matches; no orange anywhere in hex chrome; no visual regressions in seating drag-drop, tracker live session, hex canvas (drag hexes, draw connections, open a student share link, confirm student canvas still loads from hash and still auto-saves).

## Phase 2 — Remove monetization mockups

- `index.html`: delete the Pricing section, the `#pricing` nav link, and the "Get started" nav button (or point it to `#tools`). Hero CTA "Try free — no account needed" → "Free to use — no account needed" or similar. Fix the tools grid: tool 03 becomes **Talk Tracker — Live**, linking to `teacher-tools/talk-tracker.html` (it exists; the "coming soon" card is stale).
- `seating-chart-maker.html` + `talk-tracker.html`: remove all upgrade modals, "Upgrade to Pro" buttons/cards, pro-lock overlays, and any project-count limits gating features. Anything that was fake-locked behind Pro either becomes freely usable (if implemented) or is removed entirely (if it was a mockup with no behavior). Search each file for `pro`, `upgrade`, `Pro` case-insensitively and account for every hit. Remove the JS that opened these modals too — no dead handlers.
- `css/home.css`: delete now-orphaned pricing styles.

**Accept:** zero case-insensitive matches for "upgrade" in all HTML; no mention of Pro, pricing, $5, or trials anywhere; all remaining buttons do something real; tools grid shows three live tools.

## Phase 3 — Shared roster store (local-first, cloud-shaped)

### 3a. Create `js/toolshed-store.js`

Plain script (no modules — tools are `file://`-unfriendly either way, but keep it simple) exposing one global:

```js
window.ToolshedStore = {
  // Rosters — a roster is {id, name, students: [{id, name}], createdAt, updatedAt}
  async listRosters() {},        // -> [{id, name, studentCount, updatedAt}]
  async getRoster(id) {},        // -> roster | null
  async saveRoster(roster) {},   // upsert; generates id/timestamps if missing; -> roster
  async deleteRoster(id) {},

  // Generic per-tool documents — {id, tool, name, data, createdAt, updatedAt}
  // tool ∈ 'seating' | 'tracker' | 'hex'
  async listDocs(tool) {},
  async getDoc(id) {},
  async saveDoc(doc) {},
  async deleteDoc(id) {},

  // Backup
  async exportAll() {},          // -> JSON string of everything (versioned: {version:1, exportedAt, rosters, docs})
  async importAll(json, {merge=true}={}) {},  // merge by id, newer updatedAt wins; merge:false replaces
};
```

Implementation requirements:
- **IndexedDB** database `teachertoolshed`, object stores `rosters` and `docs` (index `docs` on `tool`). All methods async (they already are — the interface is the future cloud seam; a Supabase adapter would implement the same API).
- On first init, **migrate** any existing `localStorage['toolshed:rosters']` array into the rosters store, then remove the key.
- Call `navigator.storage.persist()` once on init (best-effort, ignore result).
- IDs: `crypto.randomUUID()`.
- Wrap all IndexedDB access with graceful failure (private-mode Safari etc.): on failure, fall back to an in-memory store and set `ToolshedStore.ephemeral = true` so tools can show a "saving unavailable in this browser mode" notice.
- No network calls of any kind.

### 3b. Roster manager UI

Create `teacher-tools/rosters.html` (standard header, `toolshed.css`): list rosters; create/rename/delete; edit students via a paste-friendly textarea (one name per line — same input style the seating chart already uses); **Export backup** (downloads `teacher-toolshed-backup-YYYY-MM-DD.json` via a Blob link) and **Import backup** (file input → `importAll`, confirm before replacing). Show a persistent one-line note: *"Rosters are saved only in this browser. Export a backup to keep a copy or move to another device."* Link it from the landing nav ("My rosters") and from each tool's roster picker ("Manage rosters →").

### 3c. Wire the tools

- **Seating chart:** replace its private `ROSTER_KEY` localStorage code with `ToolshedStore` roster calls (its roster UI already exists — repoint it). Add save/load of *charts*: "Save chart" (named) and a load menu, via `saveDoc/listDocs('seating')`. Autosave the working chart to a doc named "(unsaved chart)" on change, debounced, so a reload doesn't lose work.
- **Talk tracker:** roster picker to populate participants from a saved roster (keep the existing manual-entry path too). Save finished sessions via `saveDoc('tracker')`; add a simple "Past sessions" list (name, date, open to review the summary screen). Autosave live-session state (debounced) so a mid-discussion reload recovers.
- **Hex tool:** teacher-side "Save activity"/load list via `saveDoc('hex')`, so activities aren't only recoverable from share URLs. Student-side hash/localStorage flow stays exactly as is.

**Accept:** create a roster in the manager → it appears in seating chart and talk tracker pickers; edit it once, both see the change after reload; old `toolshed:rosters` data migrates and the key is gone; export → wipe site data → import restores everything; reload mid-seating-edit and mid-tracker-session recovers state; DevTools Network tab shows zero requests carrying roster data (only fonts).

## Phase 4 — Privacy page & polish

- `privacy.html`: plain-language, on-system page: everything is stored only in your browser; nothing is sent to us — we run no server and no analytics; export/import is how you back up; clearing site data deletes everything; note for Safari users that unused-site storage may be cleared after ~7 days, so export backups; for FERPA-minded readers: no student data is transmitted to or held by Teacher Toolshed, and hex share links encode the activity in the link itself. Contact email. Link from footer of every page.
- Consistent `<title>` pattern `[Tool] — Teacher Toolshed`, meta descriptions on all pages, shared footer on tools (small: brand + privacy link).
- Favicon: simple SVG favicon in brand gold (`/favicon.svg` + link tags on all pages).
- Mobile pass: landing page fully responsive; tools at minimum non-broken at tablet width with a "works best on a larger screen" notice under 768px where the tool genuinely needs one (hex canvas, seating grid).

**Accept:** privacy page linked from every page; every page has proper title/meta/favicon; nothing broken at 768px.

## Phase 5 — Final QA (checklist, no new features)

Walk each flow end-to-end in a fresh browser profile: landing → each tool; seating chart full flow (roster → layout → assign → save → reload → load); tracker full flow (roster → live session → tag participation → end → summary → past sessions); hex full flow (create activity → save → share link in a private window → student places hexes → reload persists). Then: no console errors on any page; grep the codebase for `e86b30`, `Anybody`, `Inter`, `upgrade`, `2d5a1b` — all zero (except FONT-LICENSE.md if it mentions fonts); run through the Phase 3 network check once more.

---

## Phase 6 — Presentation Grader (new tool) + shared rubrics

**Depends on Phase 3.** This phase leans entirely on the shared store (saved rubrics, saved groups, shared rosters). Do not start it before Phase 3 is done.

### Why a separate tool

Talk Tracker's whole interaction model is *frequency counting*: a grid of every student, tapped repeatedly, producing tallies. Presentations are a different job — a sequence of performances, judged once each against a rubric. Different setup, different live screen, different output. Note that the `presentation` option in Talk Tracker's session-type dropdown is **purely cosmetic today** — `session.type` is only ever read as a display label, so nothing breaks by removing it.

Talk Tracker keeps: Socratic seminar, debate, discussion. Presentation Grader takes presentations.

### 6a. Shared rubric module — `js/toolshed-rubric.js`

Rubrics are shared infrastructure, **not** Presentation-Grader-only. Talk Tracker should be able to rubric-score a seminar too. Build the builder + storage once here; wiring it into Talk Tracker is optional follow-on work.

```js
// A rubric: {id, name, criteria: [...], createdAt, updatedAt}
// A criterion: {
//   id,
//   name,                  // required
//   descriptions: [],      // array of strings; only descriptions[0] is surfaced in v1.
//                          // Stored as an array so per-band descriptors can be added
//                          // later WITHOUT a data migration.
//   min: number|null,      // null/blank = comment-only criterion (see below)
//   max: number|null
// }
window.ToolshedRubric = {
  render(container, rubric, {onChange}) {},  // the builder UI
  blankRubric() {}, blankCriterion() {},
};
```

Rules:
- **Criterion name is required; description and score range are both optional.**
- **A blank score range means a comment-only criterion** — it renders as a feedback box with no number input. This is a feature, not missing data: it lets one rubric mix scored criteria ("Criterion C — Producing text, 0–8") with narrative ones ("Overall impression").
- Min **and** max, whole numbers only (MYP is 0–8; many rubrics are 1–4).
- Rubrics persist via `ToolshedStore.saveDoc({tool:'rubric', ...})` and are pickable by name in any tool. Build "MYP Oral Presentation" once, reuse it all year.

**No auto-totalling as the headline number.** In MYP, criteria are reported separately and converted through grade boundaries — a summed "23/32" is meaningless and mildly misleading. Per-criterion scores are the prominent display; a total appears only as a small informational line. The CSV gets **one column per criterion**, plus a total column at the end for teachers who do want it.

### 6b. `teacher-tools/presentation-grader.html`

Standard shared header (`Teacher Toolshed / Presentation Grader`), `css/toolshed.css`, same three-screen shape as Talk Tracker (setup → live → summary).

**Core data model: everything is a group; an individual presenter is a group of one.** This is the decision that keeps the tool simple — one code path, not two. Individual mode just auto-creates one group per student, and a group of one collapses its group-feedback box and individual-feedback box into a single box (they're the same thing).

**Setup screen**
- Session name (required, red asterisk), Class name (optional) — match Talk Tracker's conventions exactly.
- Students: from a saved roster (Phase 3) or pasted list.
- **Grouping:** a mode toggle — *Individual* (auto: one group per student) or *Groups*. In Groups mode: create named groups and assign students to them (drag or click-to-assign), plus an "auto-split into N groups" helper. Unassigned students are shown clearly so nobody gets missed.
- **Rubric:** pick a saved rubric, or build a new one inline via `ToolshedRubric`, or start from none.
- Time limit per presentation (optional).

**Live screen**
- Left: the running order — every group, with a done/current/upcoming state. Click any group to jump to it.
- Center: the current group — name, members listed, and the rubric with a score input per criterion.
- **Scoring: group score with per-individual override.** Score the group once; every member inherits it. Any member's score can then be overridden. The inherited vs. overridden distinction **must be visible at a glance** — e.g. muted `8 (group)` vs. solid `6 · edited` with a one-click revert to inherited. Without this you can't tell who you actually adjusted three groups later.
- Feedback: one group feedback box, plus a per-member feedback box for each student (collapsed by default in large groups). For a group of one, show a single merged box.
- Timer for the current presentation, counting against the limit if set (amber/red when over). Separate from a whole-session clock.
- Advance to next presenter.

**Summary / report screen**
- Per group: rubric scores, group feedback, members.
- Per student: their inherited-or-overridden scores + their individual feedback.
- **Print** — same approach as Talk Tracker: strip chrome, hide empty feedback boxes, produce something you could hand to a student or attach to a gradebook entry.
- **Export CSV** — one row per student:
  `Session Name, Class Name, Class Date, Group, Student, <one column per criterion>, Total, Group Feedback, Individual Feedback`

### 6c. Landing page

Add Presentation Grader as tool 04 (Live). Update Talk Tracker's description to say seminars/debates/discussions so the split is obvious to a visitor.

**Accept (Phase 6):** build a rubric with one scored criterion and one comment-only criterion and save it; start a session in Groups mode with an unassigned student visible; assign them; score a group; override one member; confirm the override is visually distinct and revertible; end the session; confirm print output is clean and the CSV has one column per criterion with the override reflected in that student's row. Reload mid-session recovers state. Zero network requests carrying student data.

### Deliberately deferred

- **Per-band descriptors** (MYP 1–2 / 3–4 / 5–6 / 7–8) and click-a-band-to-score. The data model above already accommodates them (`descriptions` is an array). Worth doing once the basics are in — clicking a band is genuinely faster than typing a number when grading eight groups back to back.
- Wiring the rubric module into Talk Tracker for seminar scoring.
- Rubric import/export as JSON files, and rubric sharing between teachers.

---

## Explicitly out of scope (do not build)

- Accounts, auth, Supabase, Stripe, Netlify Functions, emails, analytics.
- Next.js or any build tooling.
- New tools or new features beyond persistence described above, **except** the Presentation Grader specified in Phase 6.
- Server-side anything.

## Future (for reference only): cloud sync sketch

When/if wanted: a Supabase adapter implements the `ToolshedStore` API (same method signatures) behind a feature flag; Google sign-in; RLS `user_id = auth.uid()` on `rosters`/`docs` tables; local store becomes the offline cache. That step — and only that step — triggers the FERPA "school official" obligations in `ARCHITECTURE.md` §7 (privacy policy update, DPA template, retention/deletion). Not now.
