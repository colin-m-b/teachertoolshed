# Embedded font licence

`js/toolshed-pdf-font.js` holds a subset of **Liberation Sans Bold** (base64) so
that PDF exports can render diacritics. jsPDF's built-in fonts use WinAnsi/CP1252
encoding, which cannot represent Vietnamese, Polish, Czech, Turkish or
Scandinavian characters — a name like `Nguyễn` comes out as `NguyÅn`.

Used by `seating-chart-maker.html` (desk labels) and `stack-splitter.js`
(coversheet names). It lived inline in the seating chart until Stack Splitter
needed the same face; `ToolshedPdfFont.register(doc)` returns the family name to
pass to `setFont`.

| | |
|---|---|
| Font | Liberation Sans Bold |
| Copyright | Copyright (c) 2012 Red Hat, Inc.<br>Digitized data copyright (c) 2010 Google Corporation. |
| Licence | SIL Open Font License, Version 1.1 — https://scripts.sil.org/OFL |
| Trademark | Liberation is a trademark of Red Hat, Inc. |

The SIL OFL permits embedding and redistribution, including in commercial work.
It requires that this notice travel with the font, that the font itself is not
sold on its own, and that any modified version is not distributed under the
"Liberation" reserved name. The subset here is unmodified in outline — glyphs
outside the ranges below were removed, nothing was redrawn — and it is embedded
under the internal name `ToolshedSans`, not "Liberation".

## Subset contents

Roughly 590 glyphs:

- U+0020–U+007E — Basic Latin
- U+00A0–U+00FF — Latin-1 Supplement (French, German, Spanish, Nordic)
- U+0100–U+017F — Latin Extended-A (Polish, Czech, Turkish, Baltic; includes `Đ`/`đ`)
- U+01A0, U+01A1, U+01AF, U+01B0 — `Ơ ơ Ư ư`
- U+1E00–U+1EFF — Latin Extended Additional (Vietnamese tone marks)
- Selected punctuation, combining marks, and U+25B2

## Regenerating

If a script outside these ranges is ever needed, re-subset from the upstream
font and replace the base64 string:

```python
from fontTools import subset
from fontTools.ttLib import TTFont
import base64

f = TTFont('LiberationSans-Bold.ttf')
opts = subset.Options()
opts.layout_features = []
opts.hinting = False
opts.desubroutinize = True
opts.drop_tables += ['GSUB', 'GPOS', 'GDEF', 'FFTM']
s = subset.Subsetter(options=opts)
s.populate(unicodes=[...])          # the ranges above, plus whatever is new
s.subset(f)
f.save('subset.ttf')
print(base64.b64encode(open('subset.ttf', 'rb').read()).decode())
```

Note that CJK, Arabic, Thai and other large scripts are not practical to embed
this way — the fonts run to several megabytes. If a student's name ever needs
one, use the Print button and choose "Save as PDF": the browser renders text
with real system fonts and handles any script.

---

## `purewrite-export.js` — Liberation Serif Regular

`purewrite.html`'s PDF export needs a serif face for MLA formatting (Times New
Roman), so it embeds a subset of **Liberation Serif Regular** instead —
Liberation Serif is the metric-compatible, SIL OFL-licensed substitute for
Times New Roman, the same role Liberation Sans plays for Arial/Helvetica.
Same font family as the system already ships (`/usr/share/fonts/truetype/liberation/`
on most Linux distros, and it's what LibreOffice substitutes for Times New
Roman by default), same OFL terms, same subsetting technique as above —
embedded under the internal name `PureWriteSerif`, not "Liberation".

| | |
|---|---|
| Font | Liberation Serif Regular |
| Copyright | Copyright (c) 2012 Red Hat, Inc.<br>Digitized data copyright (c) 2010 Google Corporation. |
| Licence | SIL Open Font License, Version 1.1 — https://scripts.sil.org/OFL |
| Trademark | Liberation is a trademark of Red Hat, Inc. |

### Subset contents

The same range list as `ToolshedSans` above, plus typographic punctuation
common in essay writing that Basic Latin doesn't cover:

- U+0020–U+007E, U+00A0–U+00FF, U+0100–U+017F, U+01A0–U+01A1, U+01AF–U+01B0,
  U+1E00–U+1EFF (see above for what each range covers)
- U+2013, U+2014 — en dash, em dash
- U+2018, U+2019, U+201C, U+201D — curly single/double quotes
- U+2026 — ellipsis

`purewrite.html` checks a student's text against this exact range list before
a PDF export and, if it finds anything outside it (CJK, Arabic, Thai, etc.),
suggests the Word (.docx) download instead — a `.docx` stores literal text
rather than drawn glyphs, so it has no equivalent limitation.

### Regenerating

Same recipe as above, with `LiberationSerif-Regular.ttf` as the source and
the extended range list.

---

## `vendor/jspdf.umd.min.js`

jsPDF (MIT licence) — see `vendor/jspdf-LICENSE.txt`. Vendored locally rather
than loaded from a CDN, unlike its lazy-loaded use in
`seating-chart-maker.html`, because `purewrite.html` must keep working with
no network connection once a student has loaded it.

---

## `vendor/` — Stack Splitter libraries

All four are fetched with `npm pack` and committed unmodified. Their licence
texts sit beside them in `vendor/`.

| File | Library | Licence |
|---|---|---|
| `qrcode.js` | QR Code Generator for JavaScript (Kazuhiko Arase) | MIT |
| `jsQR.js` | jsQR | Apache-2.0 |
| `pdf.min.mjs`, `pdf.worker.min.mjs` | PDF.js (Mozilla) — the `legacy` build, for wider browser support | Apache-2.0 |
| `pdf-lib.min.js` | pdf-lib | MIT |

They are vendored rather than loaded from a CDN for the same reason as jsPDF:
the tool has to keep working on a school network that blocks third-party hosts,
and a scan of student work should never depend on an outside request.

`qrcode.js` is loaded eagerly (56KB). The other three total roughly 2.3MB and are
fetched only when a teacher actually drops a scan in — a teacher who only wants
coversheets never pays for them.

"The word 'QR Code' is a registered trademark of DENSO WAVE INCORPORATED."
