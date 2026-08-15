# Embedded font licence

`seating-chart-maker.html` embeds a subset of **Liberation Sans Bold** (base64,
in the `vn-font` script block at the end of the file) so that the PDF export can
render diacritics. jsPDF's built-in fonts use WinAnsi/CP1252 encoding, which
cannot represent Vietnamese, Polish, Czech, Turkish or Scandinavian characters.

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
