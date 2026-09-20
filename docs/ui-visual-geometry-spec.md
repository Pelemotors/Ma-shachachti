# UI Visual Geometry Spec

Measured from `test-results/ui-visual/reference-crops/home.png` (Board 6 MASTER).  
Crop ≈ **278–292 × 612–640** px.  
Base QA device: Medium Phone **1080 × 2400**.  
Scale used in code: **crop_width → 411 dp** (`s = 411 / 292 ≈ 1.407`).

## Home — reference px and mapped dp

| Element | ref x | ref y | ref w | ref h | %W | %H | mapped dp |
|---|---:|---:|---:|---:|---:|---:|---|
| screen | 0 | 0 | 292 | 612 | 100 | 100 | 411 × 862 |
| tagline | 24 | 30 | 200 | 14 | 68 | 2.3 | 11 fs, y≈42 |
| greeting | 24 | 46 | 220 | 26 | 75 | 4.2 | 22 / 28 |
| hero clover | 18 | 78 | 256 | 208 | 87.7 | 34.0 | 360 × 216 |
| center circle | 107 | 168 | 78 | 78 | 26.7 | 12.7 | **90** |
| top petal lobe | 108 | 78 | 76 | 88 | 26 | 14.4 | 108 × 124 |
| left petal lobe | 18 | 168 | 100 | 100 | 34 | 16.3 | 140 × 140 |
| right petal lobe | 174 | 168 | 100 | 100 | 34 | 16.3 | 140 × 140 |
| now title | 24 | 300 | 140 | 18 | 48 | 2.9 | 15 / 20 |
| now caption | 24 | 318 | 180 | 14 | 62 | 2.3 | 12 |
| progress | 24 | 338 | 244 | 4 | 84 | 0.65 | 4 |
| task row | 20 | 352 | 252 | 44 | 86 | 7.2 | **48** |
| row gap | — | — | — | 8 | — | 1.3 | 8 |
| chevron | — | 454 | — | 14 | — | 2.3 | 16 |
| bank control | 96 | 474 | 100 | 26 | 34 | 4.2 | 32 h, not full-bleed |
| composer | 20 | 508 | 252 | 36 | 86 | 5.9 | **44** |
| mic / send | — | — | 28 | 28 | 9.6 | 4.6 | 36 |
| bottom nav | 0 | 560 | 292 | 52 | 100 | 8.5 | **52 + inset** |
| page margin | 16 | — | — | — | 5.5 | — | **22** |

## Home colors (sampled, not guessed)

| Token | Hex | Sample site |
|---|---|---|
| bg | `#FDF8F2` | page |
| heroCenter | `#A16857` | center fill |
| petalCream | `#FFFCF5` | top / right lobes |
| petalSage | `#EDEDE2` | left lobe |
| surface | `#FFFDF9` | rows / composer |
| text | `#3A2F28` | titles |
| textMuted | `#9A8B7C` | tagline, times |
| accent | `#A67C52` | icons, selected nav |
| progress | `#D4B48A` | bar fill |
| line | `#E8DFD4` | row rings |

## Home type (from crop, not invented)

| Role | size | weight | line | align |
|---|---:|---|---:|---|
| tagline | 11 | 400 | 15 | right |
| greeting | 22 | 700 | 28 | right |
| petal label | 11 | 600 | 14 | center |
| center label | 12 | 700 | 15 | center |
| section | 15 | 600 | 20 | right |
| caption | 12 | 400 | 16 | right |
| row | 14 | 500 | 18 | right |
| composer | 13 | 400 | 18 | right |
| nav | 10 | 500 | 13 | center |

**Font DELTA:** system San Francisco / Roboto. Reference is a soft geometric sans. No custom face in the repo.

## Other screens

Crops exist for mapping. Geometry for those screens is **not** applied until Home is approved.
