# Teacher Toolshed

teachertoolshed.com — free classroom tools, made by a real teacher.

## Tools

- **Seating Chart Maker** — drag-and-drop classroom layouts, PDF export.
- **Talk Tracker** — track participation during discussions and seminars.
- **Hexagonal Thinking** — visual concept mapping with hexagons.

## Stack

A static site. No build step, no framework, no server. Plain HTML/CSS/JS.

```
index.html                 landing page
css/                        shared + landing page styles
teacher-tools/               the three tools (each a self-contained HTML page)
```

All roster and project data is stored locally in the browser (no accounts, no backend) — see `PLAN.md` for the data model and `privacy.html` once published.

## Current work

Active development is tracked in [`PLAN.md`](./PLAN.md). `ARCHITECTURE.md` describes a possible future SaaS version and is not being built right now.
