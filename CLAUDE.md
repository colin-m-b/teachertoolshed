# Teacher Toolshed — working notes

A static site: plain HTML, CSS and JS. No build step, no framework, no npm, no
server. Files are edited and deployed as-is.

## One branch: `main`

`main` is the site. There are no long-lived feature branches, and there is no
second place to look — if something is not on `main`, it is not on the site.

This rule exists because the repository once ran the other way. In September
2026 the tool pages' entire redesign sat in an open pull request for a week
while `main` still held the old one, and an audit of `main` confidently
reported a design system the live site had already replaced. Work on a branch
if you like, but land it on `main` and delete the branch — do not leave real
work parked in an open PR.

## One design system

The whole site — landing page, tool pages, privacy page — runs a single
**editorial print** system: ink `#0D1116` on paper `#FFFFFF`, navy accent
`#1B3C8C`, Playfair Display / Newsreader / Archivo, hairline rules, square
corners, no shadows.

```
css/theme.css   tokens, reset, links, focus, utility bar, site footer.
                Owns --ink/--paper/--rule/--accent, the three fonts,
                .column, .t-display/.t-body/.t-meta. Never redefine these.
css/tools.css   shared tool chrome layered on theme.css: .app, .work,
                .tool-header, .page-head/.page-title/.page-sub, .card,
                .hairline-grid, .btn (+ --primary/--secondary/--ghost/--danger),
                .tabs/.tab, .notice, .tag, .stat, .rows/.row, form controls.
css/home.css    landing page sections only: masthead, tool grid, shelf, note.
```

Load order in a tool page: Google Fonts → `theme.css` → `tools.css` → the page's
own `<style>`, which holds **layout only**. Reach for a `tools.css` component
before writing your own; if you find yourself defining a button, a tab strip, a
card or an alert colour in a page, it already exists.

**A previous cream-and-gold system (`css/toolshed.css`: `#F7F5F0` ground, gold
`#B5843A`, Lora / DM Sans, 10px radii, soft shadows) has been retired. Do not
reintroduce it, and do not translate its components into the editorial palette
by hand — use `tools.css`.** New tools use the editorial system, no exceptions.

`TOOLS-REBUILD-PLAN.md` is the style guide for tool pages. Where it and
`css/theme.css` disagree, theme.css wins.

## Privacy is a hard constraint, not a preference

Everything lives in the teacher's own browser (IndexedDB via
`js/toolshed-store.js`), with JSON export/import as the only backup route. No
accounts, no server, no analytics. **Never add a network call that carries
roster or student data.** The hex tool shares activities through the URL
fragment specifically to stay serverless — keep it that way.

## Documents

- `CLAUDE.md` (this file) — the rules that hold across sessions.
- `PLAN.md` — what was built and why: decisions, phase history, current state.
- `TOOLS-REBUILD-PLAN.md` — the tool-page style guide.
- `ARCHITECTURE.md` — an aspirational SaaS future. **Not** being built.

Keep `PLAN.md` and `README.md` true when you change the site. They have drifted
badly twice; both times the fix cost more than the update would have.
