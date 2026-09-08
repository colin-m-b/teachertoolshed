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
css/theme.css             editorial ink/paper system — landing page tokens and page frame
css/home.css              landing page sections
css/toolshed.css          cream + gold system — the tool pages
js/                       shared modules: store, rubric builder, zip writer, PDF font
teacher-tools/            one self-contained HTML page per tool (+ vendored libraries)
```

**Two design systems, on purpose.** The landing page runs an editorial ink-and-paper system (Playfair Display / Newsreader / Archivo, hairline rules, square corners). The tool pages run a warmer cream-and-gold system (Lora / DM Sans). They are consistent within themselves, not with each other — the tool pages match *each other*, not the homepage. The one crossover is `teacher-tools/brain-breaks.html`, which runs the landing page's system because it is the shelf item under the six rather than one of them. `PLAN.md` records this under "Decisions already made".

## Privacy

Everything is stored in the teacher's own browser (IndexedDB, via `js/toolshed-store.js`), with JSON export/import as the backup route. No accounts, no server, no analytics, and no network call ever carries roster or student data. The hex tool's student share links encode the activity in the URL fragment, so even sharing stays serverless. See `privacy.html` and the FERPA note in `PLAN.md`.

## Working on it

[`PLAN.md`](./PLAN.md) is the record of what was built and why — current state, the design-system decisions, and the phase-by-phase history. Start there. [`ARCHITECTURE.md`](./ARCHITECTURE.md) sketches a possible SaaS future and is **not** being built.
