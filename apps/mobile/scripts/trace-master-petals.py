"""Hand-traced MASTER clover: fan/teardrop petals + inner circular arc."""
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
CX, CY, CR = 141.0, 249.0, 38.0
SS = 8
FILLS = {
    "top": (252, 236, 223, 255),
    "left": (228, 227, 217, 255),
    "right": (246, 222, 213, 255),
}


def cubic(p0, p1, p2, p3, n=64):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(
            (
                u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
            )
        )
    return pts


def ang_pt(deg: float, radius: float):
    rads = math.radians(deg)
    return (CX + radius * math.cos(rads), CY + radius * math.sin(rads))


def arc_cubics(a0: float, a1: float, radius: float, steps: int = 2):
    """Approximate circular arc a0→a1 with cubics (angles in deg, image y-down)."""
    segs = []
    for i in range(steps):
        t0 = i / steps
        t1 = (i + 1) / steps
        aa0 = a0 + (a1 - a0) * t0
        aa1 = a0 + (a1 - a0) * t1
        p0 = ang_pt(aa0, radius)
        p3 = ang_pt(aa1, radius)
        sweep = math.radians(aa1 - aa0)
        k = (4 / 3) * math.tan(sweep / 4)
        r0 = math.radians(aa0)
        r1 = math.radians(aa1)
        c1 = (p0[0] - k * radius * math.sin(r0), p0[1] + k * radius * math.cos(r0))
        c2 = (p3[0] + k * radius * math.sin(r1), p3[1] - k * radius * math.cos(r1))
        segs.append((p0, c1, c2, p3))
    return segs


def path_d(segments) -> str:
    parts = [f"M {segments[0][0][0]:.2f} {segments[0][0][1]:.2f}"]
    for _p0, c1, c2, p3 in segments:
        parts.append(f"C {c1[0]:.2f} {c1[1]:.2f}, {c2[0]:.2f} {c2[1]:.2f}, {p3[0]:.2f} {p3[1]:.2f}")
    return " ".join(parts) + " Z"


def bbox_of(segments):
    pts = []
    for seg in segments:
        pts.extend(cubic(*seg, n=40))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = min(xs), min(ys)
    return (
        int(math.floor(x0)) - 1,
        int(math.floor(y0)) - 1,
        int(math.ceil(max(xs) - x0)) + 3,
        int(math.ceil(max(ys) - y0)) + 3,
    )


def render_path(segments, fill, name):
    box = bbox_of(segments)
    x0, y0, bw, bh = box
    pad = 2
    canvas = Image.new("RGBA", ((bw + pad * 2) * SS, (bh + pad * 2) * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(canvas)
    pts = []
    for seg in segments:
        pts.extend(cubic(*seg, n=80))
    local = [((x - x0 + pad) * SS, (y - y0 + pad) * SS) for x, y in pts]
    dr.polygon(local, fill=fill)
    out = canvas.resize((bw + pad * 2, bh + pad * 2), Image.Resampling.LANCZOS)
    out = out.crop((pad, pad, pad + bw, pad + bh))
    out.save(ASSETS / f"petal-{name}.png")
    local_segs = [tuple((p[0] - x0, p[1] - y0) for p in seg) for seg in segments]
    hexfill = "#%02X%02X%02X" % fill[:3]
    (DECOR / f"petal{name.title()}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {bw} {bh}">\n'
        f'  <path d="{path_d(local_segs)}" fill="{hexfill}"/>\n</svg>\n',
        encoding="utf-8",
    )
    return box, path_d(local_segs)


# Inner attach sits just outside the disk so the petal hugs it.
IN = CR + 0.8

# TOP — wide fan. Narrower at the circle, broad rounded outer arch.
# Measured tip ~ (141, 108). Shoulders ~ (88, 128) and (194, 128).
A0_TOP, A1_TOP = -148.0, -32.0
top_segs = [
    (ang_pt(A0_TOP, IN), (64, 178), (58, 138), (72, 122)),
    ((72, 122), (90, 108), (116, 103), (141, 104)),
    ((141, 104), (166, 103), (192, 108), (210, 122)),
    ((210, 122), (224, 138), (218, 178), ang_pt(A1_TOP, IN)),
    *arc_cubics(A1_TOP, A0_TOP, IN, steps=3),
]

# LEFT — teardrop wrapping west. Outer tip ~ (10, 250). Lower curve ~ (48, 328).
A0_LEFT, A1_LEFT = 122.0, 232.0
top_left_join = ang_pt(A1_LEFT, IN)
bot_left_join = ang_pt(A0_LEFT, IN)
left_segs = [
    (bot_left_join, (96, 324), (52, 338), (34, 326)),
    ((34, 326), (12, 310), (4, 284), (6, 250)),
    ((6, 250), (7, 214), (14, 182), (30, 166)),
    ((30, 166), (52, 148), (86, 160), top_left_join),
    *arc_cubics(A1_LEFT, A0_LEFT, IN, steps=3),
]

# RIGHT — mirror teardrop. Outer tip ~ (272, 250).
A0_RIGHT, A1_RIGHT = -52.0, 58.0
top_right_join = ang_pt(A0_RIGHT, IN)
bot_right_join = ang_pt(A1_RIGHT, IN)
right_segs = [
    (top_right_join, (196, 160), (230, 148), (252, 166)),
    ((252, 166), (268, 182), (275, 214), (276, 250)),
    ((276, 250), (278, 284), (270, 310), (248, 326)),
    ((248, 326), (230, 338), (186, 324), bot_right_join),
    *arc_cubics(A1_RIGHT, A0_RIGHT, IN, steps=3),
]

TOP, top_d = render_path(top_segs, FILLS["top"], "top")
LEFT, left_d = render_path(left_segs, FILLS["left"], "left")
RIGHT, right_d = render_path(right_segs, FILLS["right"], "right")
print("boxes", TOP, LEFT, RIGHT)

# overlays
ov = MASTER.copy()
tint = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tint)
for segs, col in (
    (top_segs, (255, 140, 0, 110)),
    (left_segs, (20, 170, 70, 110)),
    (right_segs, (230, 50, 50, 110)),
):
    pts = []
    for seg in segs:
        pts.extend(cubic(*seg, n=60))
    td.polygon(pts, fill=col)
td.ellipse((CX - CR, CY - CR, CX + CR, CY + CR), outline=(80, 40, 30, 220), width=2)
ov = Image.alpha_composite(ov, tint)
ov.save(MEAS / "home-bezier-overlay.png")

fy0, fy1 = 96, 342
ref_f = MASTER.crop((0, fy0, W, fy1))
ref_f.save(FLOWER / "reference.png")
prev = Image.new("RGBA", (W, H), (253, 248, 242, 255))
for name, box in (("top", TOP), ("left", LEFT), ("right", RIGHT)):
    prev.alpha_composite(Image.open(ASSETS / f"petal-{name}.png"), (box[0], box[1]))
pdr = ImageDraw.Draw(prev)
pdr.ellipse((CX - CR, CY - CR, CX + CR, CY + CR), fill=(161, 104, 87, 255))
prev.save(MEAS / "home-traced-hero.png")
emu_f = prev.crop((0, fy0, W, fy1))
emu_f.save(FLOWER / "emulator.png")
Image.blend(ref_f.convert("RGB"), emu_f.convert("RGB"), 0.25).save(FLOWER / "overlay-25.png")
Image.blend(ref_f.convert("RGB"), emu_f.convert("RGB"), 0.50).save(FLOWER / "overlay-50.png")
da = np.abs(np.array(ref_f.convert("RGB"), dtype=np.int16) - np.array(emu_f.convert("RGB"), dtype=np.int16)).mean(axis=2)
Image.fromarray(np.clip(da * 2.4, 0, 255).astype(np.uint8)).save(FLOWER / "diff.png")
print("flower mean delta", round(float(da.mean()), 2))

# botanical: real watercolor, keep left cluster only
a = np.array(MASTER)
r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
luma = 0.3 * r + 0.59 * g + 0.11 * b
yy, xx = np.indices((H, W))
page = (r > 248) & (g > 242) & (b > 232)
# ink / greeting (dark)
ink = luma < 150
leaf = (
    (yy >= 6)
    & (yy < 128)
    & (xx < 155)
    & ~page
    & ~ink
    & (luma > 145)
    & (luma < 230)
    & ((r - b) >= 4)
)
leaf = np.array(Image.fromarray((leaf.astype(np.uint8) * 255), "L").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))) > 127
leaf &= ~ink
if leaf.any():
    ys, xs = np.where(leaf)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    tile = a[y0:y1, x0:x1].copy()
    local = leaf[y0:y1, x0:x1]
    tile[~local, 3] = 0
    tile[:, :, 3] = (tile[:, :, 3].astype(np.float32) * 0.58).astype(np.uint8)
    Image.fromarray(tile).save(ASSETS / "branch-from-master.png")
    botanical = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "opacity": 0.58}
else:
    botanical = {"x": 4, "y": 10, "w": 110, "h": 100, "opacity": 0.45}
print("botanical", botanical)

spec = {
    "center": {"cx": CX, "cy": CY, "r": CR, "d": CR * 2},
    "petals": {
        "top": {"x": TOP[0], "y": TOP[1], "w": TOP[2], "h": TOP[3], "cx": 141, "cy": 148},
        "left": {"x": LEFT[0], "y": LEFT[1], "w": LEFT[2], "h": LEFT[3], "cx": 48, "cy": 252},
        "right": {"x": RIGHT[0], "y": RIGHT[1], "w": RIGHT[2], "h": RIGHT[3], "cx": 234, "cy": 252},
    },
    "botanical": botanical,
    "flower_mean_delta": round(float(da.mean()), 2),
}
(MEAS / "home-petal-trace.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
print(json.dumps(spec, indent=2))
