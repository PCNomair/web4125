# Fonts used by the renderer

Bundled so that **every machine renders identical text** (your browser, your laptop,
GitHub's Ubuntu runner). Both families are open-source (SIL OFL 1.1):

| File | Covers | Role |
| --- | --- | --- |
| `LiberationSans-Regular/Bold.ttf` | Latin, digits, punctuation | Arial/Helvetica/Tahoma substitute for Latin text |
| `NotoSansArabic-Regular/Bold.ttf` | Arabic + Arabic presentation forms | Arabic shaping (RTL) |

`scripts/scan-fonts.mjs` aliases the family names your HTML asks for — `Tahoma`,
`Arial`, `Helvetica`, `Segoe UI`, `Trebuchet MS`, `Verdana`, `sans-serif` — onto these
files, splitting by `unicode-range` so Arabic and Latin both work under one family name.

## Want pixel-identical Windows Tahoma?

Tahoma itself is proprietary, so it is not shipped here. If you own a Windows licence,
drop the real files into this folder and they win automatically:

```
fonts/Tahoma.ttf        ->  family "Tahoma" (regular)
fonts/Tahoma-Bold.ttf   ->  family "Tahoma" (bold, 700)
```

Also recognised: `Arial.ttf`, `Arial-Bold.ttf`, `Trebuchet.ttf`, `SegoeUI.ttf`,
`Verdana.ttf`. Re-run the workflow and the render uses your file for that family.
