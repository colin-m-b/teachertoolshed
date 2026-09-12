# Teacher Toolshed — tool rebuild: style guide + plan

Handoff for Claude Code. Repo: `colin-m-b/teachertoolshed`, branch `main`.

The landing page (`index.html` + `css/theme.css` + `css/home.css`) has been
redesigned into an **editorial / newspaper** style. The six tools plus the roster
manager still run the previous style (`css/toolshed.css`: gold accent, cream
ground, 10px radii, soft shadows, Lora/DM Sans). This document is the target
style and the order of work to get the tools onto it.

**Ground truth for style is `css/theme.css`, not this document.** Where they
disagree, theme.css wins.

---

## 0. The two problems, stated plainly

1. **Two design systems are live in one site.** `theme.css` (new, landing) and
   `toolshed.css` (old, tools) define a conflicting `--accent` and `--radius`.
   Clicking a tool card currently changes typeface, ground colour and accent hue.
2. **Every tool page carries its own `<style>` block** with locally-invented
   component CSS (`.page-title`, `.drop`, `.group`, `.toggle-switch`,
   `.privacy-note`, `.thumb` …). Some of it is genuinely tool-specific layout;
   much of it is a component that belongs in the shared sheet.

The fix is one shared app stylesheet layered on theme.css, and per-page
`<style>` blocks cut down to layout only.

---

## 1. Files

```
css/theme.css      KEEP AS IS.  Tokens, reset, links, focus, utility bar, footer.
css/home.css       KEEP AS IS.  Landing page only.
css/tools.css       NEW.  App chrome + controls for tool pages.  (Provided:
                    tools.css in this handoff — drop it in at this path.)
css/toolshed.css   DELETE once the last tool is migrated.  Not before.
```

**Load order — identical in every tool page:**

```html
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="stylesheet" href="../css/fonts.css">
<link rel="stylesheet" href="../css/theme.css">
<link rel="stylesheet" href="../css/tools.css">
<style> /* layout for THIS page only */ </style>
```

Answering the open question: **one shared stylesheet, not per-tool copies.** The
site is static with no build step, so a second `<link>` is the whole cost, and
six pages that each copy tokens is six pages that drift.

---

## 2. Tokens

All defined in `theme.css`. Use the variable, never the hex.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0D1116` | body text, header bar, footer bar, toast |
| `--paper` | `#FFFFFF` | page and card ground |
| `--paper-hover` | `#F1F4F9` | row hover, neutral notice ground |
| `--rule` | `#C9D0DA` | every border (via `--hairline`) |
| `--body-muted` | `#3C4655` | body prose |
| `--meta` | `#5B6779` | labels, hints, secondary meta |
| `--accent` | `#1B3C8C` | primary buttons, links, active tab, stat numbers |
| `--accent-on-dark` | `#8FB0FF` | links on ink |
| `--on-dark-muted` | `#9AA6B8` | secondary text on ink |
| `--hairline` | `1px solid var(--rule)` | **the** border |
| `--radius` | `0` | everything is square |
| `--column` / `--gutter` | `1140px` / `32px` | page frame |

`tools.css` adds only what an app needs and the landing page never did:
`--accent-press`, `--accent-wash`, `--field`, `--ok`/`--ok-wash`,
`--flag`/`--flag-wash`, `--note`/`--note-wash`, `--control-h`.

The three semantic inks are ink-adjacent on purpose — deep, printed-looking, not
UI-kit traffic lights: `--ok #1B5C3C`, `--flag #8C1B1B`, `--note #6B4A0F`.

**The old gold `#B5843A` and green `#4A7C59` are retired.** That includes
`favicon.svg` and the inline brand-icon SVG pasted into every tool header —
recolour both to `--ink`/`--accent`.

---

## 3. Type

Three faces, three jobs. Never mix the jobs.

| Role | Face | Where |
|---|---|---|
| **Display** — `--font-display`, Playfair Display 500 | page titles, card titles, modal titles, stat numbers, drop-zone titles, brand wordmark | anything that is a heading |
| **Body** — `--font-body`, Newsreader | paragraphs, hints, input values, table cells, list item names | anything the user reads or types |
| **Meta** — `--font-meta`, Archivo 600, uppercase, `letter-spacing .14–.24em` | labels, buttons, tabs, tags, stat labels, header/footer bars, column headers | anything that is a control or a marker |

Scale (tool pages): page title 38px · card title 22px · drop title 24px · stat
number 40px · body/input 16–17px · hint 15px · label 11px · button 11.5px ·
tag/stat-label 10.5px. Floor is 10.5px and only for tracked uppercase Archivo.

Two rules that carry the whole look:

- **Input text is Newsreader at 16px.** The old sheet set 14px DM Sans; typed
  content in a serif at a readable size is most of what makes a tool feel like
  part of this site.
- **Uppercase Archivo is always tracked.** Untracked uppercase looks broken here.

---

## 4. Component translation

Old class → new class. `tools.css` §20 keeps the old names limping so a
half-migrated page still renders; that block is deleted at the end.

| Old (`toolshed.css`) | New (`tools.css`) | What changes |
|---|---|---|
| `.header` `.brand` `.brand-icon` `.brand-name` `.header-tool` `.header-sep` | `.tool-header` + `__brand` `__rule` `__name` `__action` | White bar with a green chip becomes the **ink bar** from the landing page's utility bar. Brand is a Playfair wordmark; drop the icon chip entirely. |
| `.card` `.card-title` | `.card` `.card__title` | Shadow and 10px radius removed; square hairline box. Title gets a hairline under it. **Strip the emoji** from every card title. |
| `.btn` + `.btn-primary`/`-green`/`-outline`/`-ghost`/`-danger`/`-sm`/`-full` | `.btn` + `.btn--primary`/`--secondary`/`--ghost`/`--danger`/`--sm`/`--full`/`--add` | Square, 40px tall, uppercase tracked Archivo. Gold → navy. `btn-green` collapses into `--primary` (there is no second brand colour now). Danger is outlined, filling red only on hover. `.btn-add-tp` and `.rubric-add-criterion` both become `.btn--add`. |
| `input` `textarea` `select` `label` `.hint` `.field` `.row-2` | same names, restyled | Square, `--field` ground, navy 2px focus ring (inset). Labels become tracked uppercase Archivo. Hints become Newsreader 15px. `.row-2` becomes auto-fit so it collapses on mobile without a query. Custom `select` arrow replaces the OS one. |
| `.template-tabs` `.tab` `.tab.active` | `.tabs` `.tab` `.tab[aria-selected=true]` | Filled pill row becomes underlined tabs. **State moves from a class to `aria-selected`** — update the JS that toggles it. |
| `.warn-box` / `.warn-box.bad` / `.privacy-note` / `.export-success` | `.notice` + `--caution`/`--error`/`--privacy`/`--done` | Four ad-hoc banners collapse into one component with four modifiers. Optional `.notice__title` for the tracked label. No emoji icons — the left rule and label carry the meaning. |
| `.group-src` `.group-pages` badges | `.tag` + `--ok`/`--flag`/`--accent` | Rounded pills become square hairline tags. |
| `.stat-row` `.stat-box` `.stat-num` `.stat-lbl` | `.stat-row` `.stat` `.stat__num` `.stat__lbl` | Gapped boxes become a shared-hairline grid, same construction as the landing page's tool grid. Number is Playfair 40px navy. |
| `.group` / list rows (stack-splitter, talk-tracker, rosters) | `.rows` `.row` `.row__main` `.row__name` `.row__meta` `.row--selected` `.row--flagged` | Cards-with-gaps become hairline-separated rows. |
| any results table | `table.data` | Uppercase Archivo `th` on an ink rule; Newsreader `td` on hairlines. |
| `.drop` `.drop-icon` `.drop-title` `.drop-sub` | `.drop` `.drop__title` `.drop__sub` | 1px dashed, square. **Delete `.drop-icon`** (the 38px 📄) — Playfair title carries it. `.over` → `.is-over`. |
| `.prog-outer` `.prog-bar` `.prog-label` | `.prog` `.prog__bar` `.prog__label` | 8px pill → 4px square navy rule. |
| `.toggle-switch` `.on` | `.toggle` `[aria-checked=true]` | Round iOS switch becomes a square track with a square knob. **State moves to `aria-checked`** (which purewrite-setup already sets — just stop reading `.classList.contains('on')`). |
| `.modal-bd.open` `.modal` `.modal-title` `.modal-btns` | `.modal-bd.is-open` `.modal` `.modal__title` `.modal__btns` | Square, ink border, keeps elevation (the only shadow in the system). `ts-pop-in` animation dropped. |
| `.toast.hidden` | `.toast.is-hidden` | Pill → ink slab rising from the bottom edge. |
| `.tool-footer` | `.tool-footer` | Light footer becomes the ink footer, matching `.site-footer`. |
| `.rubric-*` (js/toolshed-rubric.js) | `.rubric-*`, rebuilt on `.rows`/`.field`/`.btn--add` | The only component whose markup lives in JS — see §6. |
| `.section-label` | `.section-label` | Now hairline-underlined, Archivo 700. |

**Removed with no replacement:** `--shadow` on anything but a modal, both radii,
`transform: scale(.97)` on button press, all emoji used as iconography.

---

## 5. Page shells

Three shells cover all seven pages. Pick one per page; don't invent a fourth.

**A · Form tool** — scrolls, working column. *purewrite-setup, stack-splitter, rosters.*

```html
<body class="app">
  <div class="toast is-hidden" id="toast"></div>
  <header class="tool-header">
    <div class="tool-header__left">
      <a class="tool-header__brand" href="../">Teacher Toolshed</a>
      <span class="tool-header__rule"></span>
      <span class="tool-header__name">Stack Splitter</span>
    </div>
  </header>
  <main class="work">
    <div class="page-head">
      <p class="page-eyebrow">No. 03</p>
      <h1 class="page-title">Stack Splitter</h1>
      <p class="page-sub">…</p>
    </div>
    …
  </main>
  <div class="tool-footer">Teacher Toolshed · <a href="../privacy.html">Privacy</a></div>
</body>
```

Carry the landing page's `No. 01`–`No. 06` through as the `.page-eyebrow`. It
costs nothing and ties the two halves of the site together.

**B · Canvas tool** — fixed viewport, no page scroll, chrome + full-bleed stage.
*seating-chart-maker, hexthinking, talk-tracker.* Same header/footer; `<main>`
is `flex:1; min-height:0; overflow:hidden` and holds the stage plus a rail. Put
`.small-screen-notice` directly under the header. No `.page-head` — the tool
name in the header bar is the title.

**C · Student surface** — *purewrite.html.* Chrome to near-zero: no ink bar, no
footer, one hairline status strip (timer, word count, export). Newsreader at
reading size on `--paper`. This page is the one place the system deliberately
recedes; don't decorate it.

---

## 6. Order of work

Sequenced so the shared sheet gets proven on cheap pages before the expensive ones.

| # | Step | Files | Notes |
|---|---|---|---|
| 1 | Add `css/tools.css`; recolour `favicon.svg` to ink/navy | `css/tools.css`, `favicon.svg` | No page changes yet. |
| 2 | **stack-splitter.html** — first migration | `teacher-tools/stack-splitter.html` | Smallest page, uses the widest set of components (tabs, drop, progress, stats, rows, tags, modal, toast, notices). It is the reference implementation — get it right, then copy patterns. Its `<style>` should end up ~15 lines: `.work` overrides, `.thumbs`/`.thumb`, `.insp-body`. |
| 3 | **purewrite-setup.html** | same | Shell A. Strip card-title emoji, move toggles to `aria-checked` and fix the JS read, restyle the link row with `.mono`. Also: replace the `scrollIntoView` call on `#link-card` — reveal it in place instead. |
| 4 | **rosters.html** | `rosters.html`, `rosters-import.js` | Shell A. Student lists → `.rows`; import warnings → `.notice--caution`; any import preview → `table.data`. Check `rosters-import.js` for injected markup. |
| 5 | **js/toolshed-rubric.js** | that file | Shared component in JS, used by presentation-grader and possibly purewrite. Rebuild its emitted markup on `.rows` + `.field` + `.btn--add` before touching the grader. |
| 6 | **presentation-grader.html** | 57 KB | Biggest form tool. Shell A or B depending on whether the live scoring view needs a fixed viewport — prefer B for the scoring screen. Score inputs and per-student overrides → `table.data` + `.field`. |
| 7 | **talk-tracker.html** | 49 KB | Shell B. The tap-a-name grid is the design decision here: square hairline name cells, Playfair name, navy count, min 44px touch target. Session summary → `.stat-row` + `table.data`. |
| 8 | **seating-chart-maker.html** | 39 KB | Shell B. Desk objects and the room stage need their own local CSS — keep it local, but pull colours from tokens only. Verify print output (it prints to PDF). |
| 9 | **hexthinking.html** | 51 KB | Shell B. Hexes get ink hairline strokes and `--accent-wash`/`--paper-hover` fills; student-facing so keep chrome light. |
| 10 | **purewrite.html** | 29 KB | Shell C. Least visual change, most care — it is what students see under time pressure. |
| 11 | Delete `css/toolshed.css` and §20 of `tools.css`; grep the repo for `#B5843A`, `#4A7C59`, `#F7F5F0`, `Lora`, `DM Sans`, `border-radius`, `box-shadow` | all | Should return nothing outside vendor/. |

Do one tool per commit. Do not start a tool before the previous one renders and
functions.

---

## 7. Rules

**Do**
- Reach for a token or an existing class before writing CSS.
- Keep every per-page `<style>` block to layout: widths, grid, stage geometry,
  show/hide, print. If you're styling a button or an input in a page, stop.
- Hairlines for separation. Whitespace and rules do the work colour used to.
- One primary button per screen.
- 44px minimum touch target for anything a teacher taps mid-lesson (talk-tracker
  names, seating desks) — `--control-h` is 40px, so bump those explicitly.
- Keep every `id`, every event wiring, and every `localStorage` key exactly as
  it is. This is a restyle.

**Don't**
- No new colours. No gradients. No shadows outside `.modal`.
- No border radius. Anywhere. `--radius` is `0` and that is the look.
- No emoji as iconography — they were the old system's icon set. If a glyph is
  genuinely needed, a small inline SVG stroked in `currentColor`.
- No `scrollIntoView` (there is one in purewrite-setup; remove it).
- Don't rename files or change tool URLs — the landing page links straight to them.
- Don't touch `teacher-tools/vendor/`, `sw.js`, `toolshed-pdf-font.js`,
  `toolshed-store.js`, `toolshed-zip.js`, or the PDF export code in
  `purewrite-export.js` / `stack-splitter.js`. Exported PDFs have their own
  typography and are out of scope.

---

## 8. Per-tool acceptance check

Before marking a tool done:

- [ ] Loads theme.css then tools.css, in that order, with the three-font link.
- [ ] Page `<style>` block contains no colours except `var(--…)`, no
      `border-radius`, no `box-shadow`, no font-family declarations.
- [ ] Header is the ink bar; footer is the ink strip; no gold or green anywhere.
- [ ] Tab and toggle state read from `aria-selected` / `aria-checked`, and the
      JS was updated to match.
- [ ] Tab through the whole page: every control shows the navy focus ring, in a
      sensible order.
- [ ] 375px wide: nothing clipped, nothing horizontally scrolling, no control
      under 40px tall.
- [ ] Ink on paper for all body text; nothing at 10.5px that isn't tracked
      uppercase Archivo.
- [ ] The tool's actual job still works end to end — including any PDF/ZIP export
      and any roster read/write.
- [ ] Print preview, if the tool prints, shows the artefact and no chrome.
