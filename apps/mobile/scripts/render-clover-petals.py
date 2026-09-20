"""Rebuild Home flower as 3 overlapping circular clover lobes + larger center."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
SRC = ROOT / "test-results/ui-visual/reference-crops/home.png"
ASSETS = ROOT / "apps/mobile/assets/ui"
DECOR = ROOT / "apps/mobile/src/assets/decorative"
MEAS = ROOT / "test-results/ui-visual/measurements"
FLOWER = ROOT / "test-results/ui-visual/comparisons/home/flower"
for p in (MEAS, DECOR, FLOWER, ASSETS):
    p.mkdir(parents=True, exist_ok=True)

MASTER = Image.open(SRC).convert("RGBA")
W, H = 278, 640
SS = 8

# Flower nucleus — larger than the previous 76px button.
CX, CY = 140.0, 244.0
CR = 44.0

# Three round clover lobes. Centers sit close so the lobes hug the nucleus.
LOBES = {
    "top": {"cx": 140.0, "cy": 176.0, "r": 70.0, "fill": (252, 236, 223, 255)},
    "left": {"cx": 62.0, "cy": 250.0, "r": 72.0, "fill": (228, 227, 217, 255)},
    "right": {"cx": 218.0, "cy": 250.0, "r": 72.0, "fill": (246, 222, 213, 255)},
}


def circle_cubics(cx: float, cy: float, r: float):
    k = r * 0.5522847498
    return [
        ((cx, cy - r), (cx + k, cy - r), (cx + r, cy - k), (cx + r, cy)),
        ((cx + r, cy), (cx + r, cy + k), (cx + k, cy + r), (cx, cy + r)),
        ((cx, cy + r), (cx - k, cy + r), (cx - r, cy + k), (cx - r, cy)),
        ((cx - r, cy), (cx - r, cy - k), (cx - k, cy - r), (cx, cy - r)),
    ]


def path_d(segments, ox=0.0, oy=0.0) -> str:
    parts = [f"M {segments[0][0][0] - ox:.2f} {segments[0][0][1] - oy:.2f}"]
    for _p0, c1, c2, p3 in segments:
        parts.append(
            f"C {c1[0] - ox:.2f} {c1[1] - oy:.2f}, {c2[0] - ox:.2f} {c2[1] - oy:.2f}, {p3[0] - ox:.2f} {p3[1] - oy:.2f}"
        )
    return " ".join(parts) + " Z"


def render_lobe(name: str, spec: dict):
    cx, cy, r = spec["cx"], spec["cy"], spec["r"]
    pad = 2
    x0, y0 = int(math.floor(cx - r)) - 1, int(math.floor(cy - r)) - 1
    bw = int(math.ceil(2 * r)) + 3
    bh = int(math.ceil(2 * r)) + 3
    canvas = Image.new("RGBA", ((bw + pad * 2) * SS, (bh + pad * 2) * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(canvas)
    box = (
        (cx - r - x0 + pad) * SS,
        (cy - r - y0 + pad) * SS,
        (cx + r - x0 + pad) * SS,
        (cy + r - y0 + pad) * SS,
    )
    dr.ellipse(box, fill=spec["fill"])
    out = canvas.resize((bw + pad * 2, bh + pad * 2), Image.Resampling.LANCZOS)
    out = out.crop((pad, pad, pad + bw, pad + bh))
    out.save(ASSETS / f"petal-{name}.png")
    segs = circle_cubics(cx, cy, r)
    hexfill = "#%02X%02X%02X" % spec["fill"][:3]
    (DECOR / f"petal{name.title()}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {bw} {bh}">\n'
        f'  <path d="{path_d(segs, x0, y0)}" fill="{hexfill}"/>\n</svg>\n',
        encoding="utf-8",
    )
    return {"x": x0, "y": y0, "w": bw, "h": bh, "cx": cx, "cy": cy, "r": r}


boxes = {name: render_lobe(name, spec) for name, spec in LOBES.items()}
print("boxes", boxes)

# overlay on MASTER
ov = MASTER.copy()
tint = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tint)
for name, spec, col in (
    ("top", LOBES["top"], (255, 140, 0, 100)),
    ("left", LOBES["left"], (20, 170, 70, 100)),
    ("right", LOBES["right"], (230, 50, 50, 100)),
):
    td.ellipse((spec["cx"] - spec["r"], spec["cy"] - spec["r"], spec["cx"] + spec["r"], spec["cy"] + spec["r"]), fill=col)
td.ellipse((CX - CR, CY - CR, CX + CR, CY + CR), outline=(80, 40, 30, 230), width=2)
ov = Image.alpha_composite(ov, tint)
ov.save(MEAS / "home-bezier-overlay.png")

fy0, fy1 = 92, 330
ref_f = MASTER.crop((0, fy0, W, fy1))
ref_f.save(FLOWER / "reference.png")
prev = Image.new("RGBA", (W, H), (253, 248, 242, 255))
for name, box in boxes.items():
    prev.alpha_composite(Image.open(ASSETS / f"petal-{name}.png"), (box["x"], box["y"]))
pdr = ImageDraw.Draw(prev)
pdr.ellipse((CX - CR, CY - CR, CX + CR, CY + CR), fill=(161, 104, 87, 255))
prev.save(MEAS / "home-traced-hero.png")
emu_f = prev.crop((0, fy0, W, fy1))
emu_f.save(FLOWER / "emulator.png")
Image.blend(ref_f.convert("RGB"), emu_f.convert("RGB"), 0.25).save(FLOWER / "overlay-25.png")
Image.blend(ref_f.convert("RGB"), emu_f.convert("RGB"), 0.50).save(FLOWER / "overlay-50.png")
da = np.abs(np.array(ref_f.convert("RGB"), dtype=np.int16) - np.array(emu_f.convert("RGB"), dtype=np.int16)).mean(axis=2)
Image.fromarray(np.clip(da * 2.4, 0, 255).astype(np.uint8)).save(FLOWER / "diff.png")
print("flower mean", round(float(da.mean()), 2))

# stronger botanical extract
a = np.array(MASTER)
r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
luma = 0.3 * r + 0.59 * g + 0.11 * b
yy, xx = np.indices((H, W))
page = (r > 248) & (g > 242) & (b > 232)
ink = luma < 145
leaf = (yy >= 4) & (yy < 132) & (xx < 168) & ~page & ~ink & (luma > 140) & (luma < 232) & ((r - b) >= 3)
leaf = np.array(Image.fromarray((leaf.astype(np.uint8) * 255), "L").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))) > 127
leaf &= ~ink
if leaf.any():
    ys, xs = np.where(leaf)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    tile = a[y0:y1, x0:x1].copy()
    tile[~leaf[y0:y1, x0:x1], 3] = 0
    tile[:, :, 3] = (tile[:, :, 3].astype(np.float32) * 0.82).astype(np.uint8)
    Image.fromarray(tile).save(ASSETS / "branch-from-master.png")
    botanical = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
else:
    botanical = {"x": 0, "y": 10, "w": 140, "h": 110}
print("botanical", botanical)

spec = {
    "center": {"cx": CX, "cy": CY, "r": CR, "d": CR * 2},
    "petals": boxes,
    "botanical": botanical,
    "flower_mean_delta": round(float(da.mean()), 2),
}
(MEAS / "home-petal-trace.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
print(json.dumps(spec, indent=2))
