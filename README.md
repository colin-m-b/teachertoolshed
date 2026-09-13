# Teacher Toolshed

teachertoolshed.com — free classroom tools, made by a real teacher.

## The six

1. **Pure Writer** — in-class writing with no spellcheck, no grammar fixes and no pasting from outside. Exports MLA-formatted PDF or Word.
2. **Presentation Tracker** — notes, a timer and rubric scoring while students present, with per-student overrides on a group score.
3. **Stack Splitter** — QR coversheets on handwritten work, one pass through the copier, then split the scan back into one named PDF per student.
4. **Talk Tracker** — tap names during a seminar or debate to record who spoke, and leave with evidence instead of an impression.
5. **Seating Chart Maker** — arrange a room, randomize, swap names, print to PDF.
6. **Hexagonal Activity Creator** — students connect concepts, terms and characters their own way; shared to students by link.

## Also in the shed

- **Brain Breaks** — four no-prep projector activities (Stop the Bus, Make a Group, Word Association, This or That) for when a lesson runs out of air. Deliberately not one of the six: no roster, no setup, nothing saved.
- **Class lists** — the shared roster manager. Build a class once and every tool reuses it.

## Stack

A static site. No build step, no framework, no server, no npm. Plain HTML/CSS/JS, edited and deployed as-is.

```
index.html                landing page
privacy.html              privacy page
pricing.html              Free vs Pro (Pro is not on sale; the page says so)
terms.html                terms of use, draft until a seller exists
for-your-it-department.html  one page for a school's IT / data-protection lead
CLAUDE.md                 the rules that hold across sessions — read this first
css/fonts.css + css/fonts/ self-hosted Playfair Display / Newsreader / Archivo (no Google Fonts request)
css/theme.css             editorial tokens, reset, page frame — the base layer
css/tools.css             shared tool chrome, layered on theme.css
css/home.css              landing page sections
js/                       shared modules: store, sample class, licence, sync, rubric builder, zip writer, PDF font
help/                     one help page per tool (what it is for, first task, what goes wrong)
teacher-tools/            one self-contained HTML page per tool (+ vendored libraries)
_headers                  Netlify: cache lifetimes for fonts and vendored libraries, security headers, CSP
```

**One design system.** The whole site runs an editorial print style — ink on paper, navy accent, Playfair Display / Newsreader / Archivo, hairline rules, square corners. `theme.css` holds the tokens and the page frame, `tools.css` the tool chrome, and each page's own `<style>` block is layout only. An earlier cream-and-gold system for the tool pages has been retired; new tools use the editorial system. See `TOOLS-REBUILD-PLAN.md` for the tool-page style guide.

## Privacy

Everything is stored in the teacher's own browser (IndexedDB, via `js/toolshed-store.js`), with JSON export/import as the backup route. No accounts, no server, no analytics, no cookies, and no outside request of any kind: fonts and libraries are served from the site itself, and no network call ever carries roster or student data. The hex tool's student share links encode the activity in the URL fragment, so even sharing stays serverless. See `privacy.html` and the FERPA note in `PLAN.md`.

## Free and Pro

Every tool is free to run any lesson. `TIERS-PLAN.md` describes a Pro tier for the records afterwards (history, reports, exports, libraries, later sync through the teacher's own cloud drive) that keeps student data in the browser exactly as now. The gates, Pro features, help pages and the sync module are built on the `freemium_plan` branch; no payment provider or OAuth client is configured, so nothing is on sale, sync is off, and the site still makes no outside request.

## Working on it

[`PLAN.md`](./PLAN.md) is the record of what was built and why — current state, the design-system decisions, and the phase-by-phase history. Start there. [`ARCHITECTURE.md`](./ARCHITECTURE.md) sketches a possible SaaS future and is **not** being built.
