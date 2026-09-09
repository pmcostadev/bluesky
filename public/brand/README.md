# Brand assets

Canonical paths from the pmcosta.dev design system. The code references these
exact filenames, so an asset that is renamed silently 404s.

| File | What it is | Used by |
| --- | --- | --- |
| `logo-96.png` | Head-and-shoulders crop, square | 96px favicon |
| `logo-400.png` | Full figure, square | Anywhere the mark appears above 96px |
| `icon-192.png` | Maskable app icon | `site.webmanifest` |
| `icon-512.png` | Maskable app icon | `site.webmanifest` |
| `og-default.png` | 1200x630 social card | Open Graph and Twitter |

Two more live one level up, in `public/`, because platforms expect them at the
root: `favicon.ico` and `apple-touch-icon.png`.

## Rules

- Square crop always, never a circle. Where a platform forces a circular avatar,
  supply the square and let it crop.
- Below 96px use the head-and-shoulders crop. The full figure turns to mud at
  small sizes.
- Never place the mark on an orange surface: the figure's own warmth disappears.
- Never recolour, stretch, rotate, round-crop, or add a glow.
- OG images keep all text in the left 55%. The right side is where the hill sits,
  and text never crosses the sun disc.
