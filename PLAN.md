# Teacher Toolshed — Standardization & Persistence Plan

**Status: every phase below is BUILT (last verified 2026-09-08).** `ARCHITECTURE.md` describes a possible long-term SaaS future and is *not* being executed now; where the two disagree, this file wins.

The phases are kept as the record of *why* the site is shaped the way it is — the decisions, the specs, and the acceptance checks each one had to pass. They are no longer a queue of work. Read "Current state" below for what actually exists today; read a phase when you need to know why something was built that way. New work gets a new phase, the way Phases 6 and 7 did — one commit per phase minimum, and the phase's acceptance checklist verified before it is marked BUILT.

---

## Decisions already made (do not re-litigate)

1. **Design system:** ~~the cream + gold system already shared by `seating-chart-maker.html` and `talk-tracker.html`… becomes the system for the tools~~ — **superseded, 2026-09-07.** The site now runs a single design system: the landing page's editorial print system (ink `#0D1116` / paper `#FFFFFF`, Playfair Display + Newsreader + Archivo, hairline-ruled grid, square — tokens in `css/theme.css`) extends to every tool page via `css/tools.css`. `css/toolshed.css` (cream, gold, Lora/DM Sans, radii, shadows) is being retired tool by tool per `TOOLS-REBUILD-PLAN.md`, which is the ground truth for tool-page style. Do not re-introduce the cream/gold system anywhere.
2. **Architecture:** stays a static HTML site. No frameworks, no build step, no npm. Shared code goes in plain `.css` and `.js` files.
3. **Persistence:** local-first. A shared roster/data store in the browser (IndexedDB) used by all tools, with JSON export/import as backup. **No accounts, no server, no analytics.** The store is written behind an async interface so a cloud backend could be swapped in later — but no cloud code is written now.
4. **Monetization:** all Pro/pricing/upgrade UI is removed. Everything is free. No fake paywalls.

### FERPA posture (informs several phases)

Because all data stays in the teacher's own browser and no data is ever transmitted to or stored by the site's operator, the site does not receive or maintain education records — the strongest possible privacy posture. Preserve these properties in every change:

- Never add a network call that transmits roster/student data anywhere.
- The hex tool's student-share mechanism encodes the activity in the URL fragment (base64 in `location.hash`) — serverless by design. Keep this mechanism; do not "improve" it into a server-backed one.
- The privacy page (Phase 5) states this plainly.

---

## Current state (verified 2026-09-08)

```
index.html                      landing page
privacy.html                    privacy page
favicon.svg                     "tts" wordmark, navy ground
CLAUDE.md                       the rules that hold across sessions — read first
TOOLS-REBUILD-PLAN.md           tool-page style guide (ground truth for tools)
css/theme.css                   editorial tokens, reset, page frame — the base layer
css/tools.css                   shared tool chrome layered on theme.css
css/home.css                    landing sections: masthead, tool grid, shelf, note
js/toolshed-store.js            IndexedDB rosters + per-tool docs, JSON export/import
js/toolshed-rubric.js           shared rubric builder (presentation grader, talk tracker)
js/toolshed-zip.js              zip writer (stack splitter, purewrite)
js/toolshed-pdf-font.js         embedded PDF font helper
teacher-tools/
  brain-breaks.html             the projector activities — see Phase 7
  hexthinking.html
  presentation-grader.html
  purewrite.html                sw.js caches its shell for offline use
  purewrite-setup.html
  rosters.html                  the class-list manager
  seating-chart-maker.html
  stack-splitter.html + .js
  talk-tracker.html
  vendor/                       jsQR, jsPDF, pdf-lib, pdf.js, qrcode-generator (+ licences)
ARCHITECTURE.md                 aspirational SaaS doc — superseded, see its own status note
```

**One system, everywhere.** Landing page, tool pages and privacy page all run
the editorial print system: `theme.css` for tokens and frame, `tools.css` for
tool chrome, a page `<style>` for layout only. There is no second system to keep
track of any more, and no page-by-page exception to remember.

### Consolidated onto `main`, 2026-09-08

Everything that was living in open pull requests is now on `main`, and the
branches are gone:

- The tool-page migration onto the editorial system (was PR #4).
- Stack Splitter's configurable filenames (was PR #3), re-applied by hand — it
  was written against the pre-migration page and could not be merged. It now
  uses the shared `.toggle` switch instead of the raw checkboxes it had.
- The favicon became a `tts` wordmark: navy ground, paper letters. The
  four-rectangle mark it replaced was an orphan, since the migration dropped
  that icon from every page header in favour of the wordmark.

---

## The design system (single source of truth)

`css/theme.css` owns the tokens; `css/tools.css` owns the tool chrome;
`TOOLS-REBUILD-PLAN.md` is the style guide. Those three files are the truth —
this section is deliberately not a fourth copy of the palette to drift out of
date. See `CLAUDE.md` for the short version.

The cream + gold token block that used to be printed here described
`css/toolshed.css`, which has been retired. It is not reproduced, to remove any
chance of a future change reviving it from this document.

---

## Phase 0 — Housekeeping — DONE

*(`ARCHITECTURE.md` carries its status note; `README.md` was rewritten — and rewritten again on 2026-09-08, since it had gone stale by three tools.)*

1. Add this note at the top of `ARCHITECTURE.md`, right under the title:
   > **Status: aspirational / superseded.** This document sketches a possible future SaaS version. Current active work is defined in `PLAN.md`. Notably, the dark/lime design system in §11 has been rejected in favor of the cream/gold system, and the Next.js migration is not happening now.
2. Update `README.md` to a short real readme: what the site is, the three tools, "static site, no build step," link to PLAN.md.

**Accept:** both files updated; nothing else touched.

## Phase 1 — Shared design system — DONE, then SUPERSEDED

*(This phase built `css/toolshed.css` and put every tool on it, which is what "the tools all share one style" refers to — one style as each other, cream and gold. Decision 1 was later reversed and that sheet retired in favour of `css/theme.css` + `css/tools.css`. Kept as history; do not execute.)*

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

### 1b. Restyle the landing page — SUPERSEDED, do not execute

The landing page has already been redesigned onto its own editorial print system (see "Decisions already made" above) and must **not** be re-skinned into cream + gold. `index.html` links `css/theme.css` + `css/home.css`, not `css/toolshed.css`; `css/base.css` and `css/nav.css` have been deleted (their contents are superseded by `css/theme.css`). Leave the landing page alone in this phase — skip straight to 1c.

### 1c. Restyle the hex tool

`teacher-tools/hexthinking.html`:
- Apply the orange→gold mapping table above (CSS variables, hardcoded SVG hexes in markup, and SVG attributes generated in JS — search the whole file for `e86b30`, `d45a22`, `6b635a`, `Anybody`).
- Fonts link → standard link (keep DM Sans; Anybody and its weights go away). `brand h1`, `h2`, `h3`, modal headings switch to `var(--font-serif)`.
- Replace the "HexThinking" brand block (both occurrences, teacher header + student header, lines ~277 and ~321) with the shared `ts-header` pattern: brand → "Teacher Toolshed / Hexagonal Thinking". Title tag → `Hexagonal Thinking — Teacher Toolshed`. The hex logo SVG may remain as a small tool glyph next to the tool name if it looks good recolored, or be dropped.
- **Do not touch** the canvas logic, drag/connection code, hash-based sharing, or the teacher/student mode switch. This phase is visual only.

### 1d. Deduplicate the two on-brand tools

In `seating-chart-maker.html` and `talk-tracker.html`: link `css/toolshed.css` and delete only the now-duplicated token/reset/button/input/card/modal/header rules from their inline `<style>` blocks. Keep all tool-specific rules inline. Convert their headers to the `ts-` classes. If a deletion is uncertain, keep the inline rule — duplication is safer than breakage.

**Accept (Phase 1):** open all four pages in a browser. Identical fonts everywhere (Lora/DM Sans — no Inter, no Anybody, check DevTools computed styles); identical header brand on the three tools; landing nav matches; no orange anywhere in hex chrome; no visual regressions in seating drag-drop, tracker live session, hex canvas (drag hexes, draw connections, open a student share link, confirm student canvas still loads from hash and still auto-saves).

## Phase 2 — Remove monetization mockups — DONE

*(Zero case-insensitive hits for upgrade / pro plan / pricing / paywall across the HTML. The one `upgrade` in `js/toolshed-store.js` is IndexedDB's `onupgradeneeded`.)*

- `index.html`: delete the Pricing section, the `#pricing` nav link, and the "Get started" nav button (or point it to `#tools`). Hero CTA "Try free — no account needed" → "Free to use — no account needed" or similar. Fix the tools grid: tool 03 becomes **Talk Tracker — Live**, linking to `teacher-tools/talk-tracker.html` (it exists; the "coming soon" card is stale).
- `seating-chart-maker.html` + `talk-tracker.html`: remove all upgrade modals, "Upgrade to Pro" buttons/cards, pro-lock overlays, and any project-count limits gating features. Anything that was fake-locked behind Pro either becomes freely usable (if implemented) or is removed entirely (if it was a mockup with no behavior). Search each file for `pro`, `upgrade`, `Pro` case-insensitively and account for every hit. Remove the JS that opened these modals too — no dead handlers.
- `css/home.css`: delete now-orphaned pricing styles.

**Accept:** zero case-insensitive matches for "upgrade" in all HTML; no mention of Pro, pricing, $5, or trials anywhere; all remaining buttons do something real; tools grid shows three live tools.

## Phase 3 — Shared roster store — DONE

*(`js/toolshed-store.js` ships; `rosters.html` is the manager; six tool pages load the store — hex, presentation grader, rosters, seating chart, stack splitter, talk tracker. PureWrite deliberately uses plain `localStorage` for a student's in-progress draft and holds no roster.)*

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

## Phase 4 — Privacy page & polish — DONE

*(Every page verified 2026-09-08 to carry the `[Tool] — Teacher Toolshed` title pattern, a meta description, the SVG favicon, a footer, and a privacy link.)*

- `privacy.html`: plain-language, on-system page: everything is stored only in your browser; nothing is sent to us — we run no server and no analytics; export/import is how you back up; clearing site data deletes everything; note for Safari users that unused-site storage may be cleared after ~7 days, so export backups; for FERPA-minded readers: no student data is transmitted to or held by Teacher Toolshed, and hex share links encode the activity in the link itself. Contact email. Link from footer of every page.
- Consistent `<title>` pattern `[Tool] — Teacher Toolshed`, meta descriptions on all pages, shared footer on tools (small: brand + privacy link).
- Favicon: simple SVG favicon in brand gold (`/favicon.svg` + link tags on all pages).
- Mobile pass: landing page fully responsive; tools at minimum non-broken at tablet width with a "works best on a larger screen" notice under 768px where the tool genuinely needs one (hex canvas, seating grid).

**Accept:** privacy page linked from every page; every page has proper title/meta/favicon; nothing broken at 768px.

## Phase 5 — Final QA — DONE

*(Re-run 2026-09-08: `Anybody` and `2d5a1b` are gone; no page loads Inter; the surviving `e86b30` is the student-facing hex-tile palette, and the `Inter` grep hits are substrings of "interface", "interval" and friends.)*

Walk each flow end-to-end in a fresh browser profile: landing → each tool; seating chart full flow (roster → layout → assign → save → reload → load); tracker full flow (roster → live session → tag participation → end → summary → past sessions); hex full flow (create activity → save → share link in a private window → student places hexes → reload persists). Then: no console errors on any page; grep the codebase for `e86b30`, `Anybody`, `Inter`, `upgrade`, `2d5a1b` — all zero (except FONT-LICENSE.md if it mentions fonts); run through the Phase 3 network check once more.

---

## Phase 6 — Presentation Grader + shared rubrics — DONE

*(`presentation-grader.html` and `js/toolshed-rubric.js` ship; the rubric module is wired into Talk Tracker too, which Phase 6 listed as optional follow-on.)*

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

## Built outside the numbered phases

`purewrite.html` / `purewrite-setup.html` (+ `purewrite-export.js`, `sw.js`) and `stack-splitter.html` (+ `stack-splitter.js`) were added after Phase 6 without phases of their own, and the landing page was redesigned onto the editorial system in the same period. They are listed here so the phase list is not mistaken for the whole history.

---

## Phase 7 — Brain Breaks (new tool, new shelf) — BUILT

**Depends on nothing.** This is the first tool that touches neither `ToolshedStore` nor a roster, so it can ship in any order relative to the other phases.

Shipped as `teacher-tools/brain-breaks.html`, plus the `.shelf` block in `css/home.css` and `index.html`. Two content calls were made in the build and are easy to reverse:

- The draft's *Boy's Name* / *Girl's Name* categories became **Name** and **Famous Person** — same job, without splitting the room by gender to answer a warm-up.
- *Colour* became **Color**, to match the site's own US-spelled copy ("Digitize", "Randomize").

### Is it a tool? Yes — its own page, not folded into an existing one

There is no host for it. Hex Thinking is the only other page students look at, but it is a built activity with an author, a share link, and saved canvas state; brain breaks are the opposite of authored. Bolting a tab onto it would ruin both.

### Is it separate from the rest? Yes — deliberately, and visibly

Every one of the six is the same shape: teacher-facing, roster-aware, produces a record (PDF, CSV, print, named files), persists through the shared store. Brain Breaks is student-facing, roster-free, stateless on purpose, and produces nothing at all. It fails every property that makes the six a set.

The landing page is also built around the number: `<title>` says "Six small tools", the masthead says "Six small tools I built for my own classes", the nav says "The six", the cards are numbered No. 01–06. Making this No. 07 means renaming all of that to "seven" and dropping a projector toy into a row of gradebook workflow tools — and it means renumbering again for the next one.

So: **its own page, and its own band on the landing page below the six.** The utility bar already does this for Class Lists, which sits outside "The six" for exactly the same reason. The band is also where the obvious follow-ons go (countdown timer, random picker, noise meter) without ever touching the six.

### 7a. `teacher-tools/brain-breaks.html`

Four tabs, one page: Stop the Bus, Make a Group, Word Association, This or That. The uploaded draft is the content and interaction source; it needs re-shelling to house conventions and four bug fixes before it ships.

**Built on the shared component set**
- The draft arrived as a standalone page with its own copy of the retired cream + gold tokens. All of it is gone: the page links `css/theme.css` + `css/tools.css` and its own `<style>` block is layout only, per `CLAUDE.md`.
- Chrome, buttons, tabs, cards and the alert colour are all `tools.css`: `.tool-header` with the Present action, `.page-head`/`.page-eyebrow`/`.page-title`/`.page-sub`, `.tabs`/`.tab` (which style off `aria-selected`, so the JS drives them directly), `.card`, `.hairline-grid` for the category and group cells, `.btn--primary`/`--secondary`/`--danger`, and `--flag` for the last fifteen seconds of the clock.
- What the page genuinely owns, and all it owns: the stage — the letter badge, the timer, the word display, the this-or-that row, and one scale of custom properties that presentation mode swaps for viewport-relative values.

**Fix these four before shipping**
1. **The timer starts itself.** `newRound()` runs at init, so a 60-second round is already draining before the class is looking at the board. Render the letter and categories at rest and start on an explicit "Start round".
2. **Switching tabs kills a running round.** The tab handler calls `stopTimer()` when you come *back* to Stop the Bus, so glancing at another tab silently ends the round. Pick a behaviour and implement it deliberately — a round that survives tab switches, or an explicit pause.
3. **Round length is hard-coded to 60 s.** Offer 30 / 60 / 90 / 120.
4. **The clock counts `setInterval` ticks**, which drifts and stalls outright when the tab is backgrounded. Compute remaining time from a `Date.now()` deadline.

**Projector requirements** — this is the only page in the shed meant to be read from the back of a room, so they are requirements, not polish:
- A present/fullscreen toggle (`requestFullscreen`) that scales the stage up.
- Room-sized type. The 46px word display is right on a laptop and small on a projector at twenty feet; drive the stage type off `clamp()` with a much higher ceiling in presentation mode.
- Keyboard control: Space advances the active tab (new round / shuffle / new word / next pair), `F` toggles fullscreen. Nobody should have to walk back to the laptop.
- No hover-only affordances — there is no cursor on the projector.

**Content pass before shipping**
- "Boy's Name" / "Girl's Name" split every class into two lists by gender to answer a warm-up. "A name" and "A name from a book" do the same job. Teacher's call, but do not ship it unconsidered.
- "Colour" — the rest of the site's copy is US-spelled ("Digitize", "Randomize"). Pick one and be consistent.
- Read the This-or-That pairs once as a parent would. The Q/X/Z-skipping comment in the letters string is correct; keep it.

**Deliberately not built:** no `ToolshedStore`, no saved state, no rosters, no student names, no export, no scoring. Loaded once, it must keep working with the network off — which also means there is no reason to touch `sw.js` (that cache is PureWrite's).

### 7b. Landing page placement

- Leave the six-card grid, its numbering, the masthead, the `<title>`, and the meta description alone. They still describe the six.
- Add one band under `#tools`: a single wide card, styles in `css/home.css`, kicker "Also in the shed", in the landing page's ink/paper editorial system (not cream — Decision 1 still holds). Copy sells the actual value: nothing to set up, nothing saved, put it on the board when the energy dips.
- Add "Brain breaks" to the utility-bar nav after "Class lists".

### 7c. Same band later (not now)

Countdown/stopwatch for timed tasks, random name picker (the only one that would want rosters), noise meter, would-you-rather. Each is a tab or a sibling page in the same band — never a seventh numbered card.

**Accept (Phase 7):** page loads with the clock at rest; start a round, switch tabs and come back, confirm the round is where you left it; background the tab for thirty seconds and confirm the clock is still honest; each tab advances on Space; `F` fills the screen and the type is readable from the back of a classroom; kill the network and confirm every tab still works; no `ToolshedStore` call and zero network requests after load; the landing page still says six, and the new band links through.

---

## Explicitly out of scope (do not build)

- Accounts, auth, Supabase, Stripe, Netlify Functions, emails, analytics.
- Next.js or any build tooling.
- New tools or new features beyond persistence described above, **except** the tools specified in their own phases (Presentation Grader, Phase 6; Brain Breaks, Phase 7). PureWrite and Stack Splitter were added the same way, by an added phase, not by widening an existing one.
- Server-side anything.

## Future (for reference only): cloud sync sketch

When/if wanted: a Supabase adapter implements the `ToolshedStore` API (same method signatures) behind a feature flag; Google sign-in; RLS `user_id = auth.uid()` on `rosters`/`docs` tables; local store becomes the offline cache. That step — and only that step — triggers the FERPA "school official" obligations in `ARCHITECTURE.md` §7 (privacy policy update, DPA template, retention/deletion). Not now.
