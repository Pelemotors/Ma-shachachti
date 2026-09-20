"""Smooth cubic-Bézier clover lobes fitted to MASTER home.png."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
ASSETS = ROOT / "apps/mobile/assets/ui"
DECOR = ROOT / "apps/mobile/src/assets/decorative"
MEAS = ROOT / "test-results/ui-visual/measurements"
MASTER = Image.open(ROOT / "test-results/ui-visual/reference-crops/home.png").convert("RGBA")

W, H = 278, 640
CX, CY = 139, 248
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
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def path_d(segments) -> str:
    parts = [f"M {segments[0][0][0]:.1f} {segments[0][0][1]:.1f}"]
    for _p0, c1, c2, p3 in segments:
        parts.append(f"C {c1[0]:.1f} {c1[1]:.1f}, {c2[0]:.1f} {c2[1]:.1f}, {p3[0]:.1f} {p3[1]:.1f}")
    return " ".join(parts) + " Z"


def bbox_of(segments):
    pts = []
    for seg in segments:
        pts.extend(cubic(*seg, n=24))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = min(xs), min(ys)
    return (int(x0) - 1, int(y0) - 1, int(max(xs) - x0) + 3, int(max(ys) - y0) + 3)


def render_path(segments, fill, name):
    box = bbox_of(segments)
    x0, y0, bw, bh = box
    pad = 3
    im = Image.new("RGBA", ((bw + pad * 2) * SS, (bh + pad * 2) * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    pts = []
    for seg in segments:
        pts.extend(cubic(*seg, n=64))
    local = [((x - x0 + pad) * SS, (y - y0 + pad) * SS) for x, y in pts]
    dr.polygon(local, fill=fill)
    out = im.resize((bw + pad * 2, bh + pad * 2), Image.Resampling.LANCZOS)
    out = out.crop((pad, pad, pad + bw, pad + bh))
    out.save(ASSETS / f"petal-{name}.png")
    local_segs = [
        tuple((p[0] - x0, p[1] - y0) for p in seg) for seg in segments
    ]
    hexfill = "#%02X%02X%02X" % fill[:3]
    (DECOR / f"petal{name.title()}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {bw} {bh}">\n'
        f'  <path d="{path_d(local_segs)}" fill="{hexfill}"/>\n</svg>\n',
        encoding="utf-8",
    )
    return box


# TOP — wide clover fan (dome): wide top, softer join into the center
top_segs = [
    ((112, 200), (86, 192), (72, 162), (84, 136)),
    ((84, 136), (94, 114), (116, 110), (139, 110)),
    ((139, 110), (162, 110), (184, 114), (194, 136)),
    ((194, 136), (206, 162), (192, 192), (166, 200)),
    ((166, 200), (154, 204), (124, 204), (112, 200)),
]

# LEFT — outward teardrop, rounder on the left tip, tucked into center
left_segs = [
    ((132, 218), (118, 188), (82, 176), (48, 186)),
    ((48, 186), (18, 196), (8, 222), (10, 252)),
    ((10, 252), (12, 286), (32, 322), (68, 326)),
    ((68, 326), (102, 330), (128, 304), (134, 272)),
    ((134, 272), (138, 250), (138, 236), (132, 218)),
]

# RIGHT — mirror
right_segs = [
    ((146, 218), (160, 188), (196, 176), (230, 186)),
    ((230, 186), (260, 196), (270, 222), (268, 252)),
    ((268, 252), (266, 286), (246, 322), (210, 326)),
    ((210, 326), (176, 330), (150, 304), (144, 272)),
    ((144, 272), (140, 250), (140, 236), (146, 218)),
]

TOP = render_path(top_segs, FILLS["top"], "top")
LEFT = render_path(left_segs, FILLS["left"], "left")
RIGHT = render_path(right_segs, FILLS["right"], "right")
print("boxes", TOP, LEFT, RIGHT)

# overlay on MASTER to judge fit
ov = MASTER.copy()
tint = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tint)
for segs, col in ((top_segs, (255, 160, 40, 110)), (left_segs, (40, 180, 80, 110)), (right_segs, (255, 80, 80, 110))):
    pts = []
    for seg in segs:
        pts.extend(cubic(*seg, n=48))
    td.polygon(pts, fill=col)
td.ellipse((CX - 37, CY - 37, CX + 37, CY + 37), fill=(160, 80, 50, 120))
ov = Image.alpha_composite(ov, tint)
ov.save(MEAS / "home-bezier-overlay.png")

# cream composite
preview = Image.new("RGBA", (W, H), (253, 248, 242, 255))
for name, box in (("top", TOP), ("left", LEFT), ("right", RIGHT)):
    preview.alpha_composite(Image.open(ASSETS / f"petal-{name}.png"), (box[0], box[1]))
dr = ImageDraw.Draw(preview)
dr.ellipse((CX - 37, CY - 37, CX + 37, CY + 37), fill=(161, 104, 87, 255))
preview.save(MEAS / "home-traced-hero.png")

# soft botanical — smaller, paler
br_w, br_h = 96, 104
br = Image.new("RGBA", (br_w * SS, br_h * SS), (0, 0, 0, 0))
bdr = ImageDraw.Draw(br)
bdr.line(
    [(14 * SS, 98 * SS), (30 * SS, 70 * SS), (50 * SS, 40 * SS), (74 * SS, 16 * SS)],
    fill=(180, 170, 150, 55),
    width=max(2, SS // 3),
)
import math

leaves = [(18, 88, -58, 0.78), (30, 66, -40, 0.7), (46, 44, -22, 0.86), (62, 26, -4, 0.7), (72, 18, 16, 0.58)]
for lx, ly, rot, sc in leaves:
    rad = math.radians(rot)
    ca, sa = math.cos(rad), math.sin(rad)
    pts = []
    for seg in [((0, 0), (-6, -9), (-7, -20), (0, -26)), ((0, -26), (7, -20), (6, -9), (0, 0))]:
        for i in range(25):
            t = i / 24
            u = 1 - t
            x = u**3 * seg[0][0] + 3 * u**2 * t * seg[1][0] + 3 * u * t**2 * seg[2][0] + t**3 * seg[3][0]
            y = u**3 * seg[0][1] + 3 * u**2 * t * seg[1][1] + 3 * u * t**2 * seg[2][1] + t**3 * seg[3][1]
            x, y = x * sc, y * sc
            pts.append(((lx + x * ca - y * sa) * SS, (ly + x * sa + y * ca) * SS))
    bdr.polygon(pts, fill=(190, 180, 158, 72))
br = br.resize((br_w, br_h), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
br.save(ASSETS / "branch-from-master.png")

spec = {
    "source": "test-results/ui-visual/reference-crops/home.png",
    "width": W,
    "height": H,
    "center": {"cx": CX, "cy": CY, "d": 74, "nx": 0.5, "ny": 0.3875, "nd": round(74 / W, 4)},
    "petals": {
        "top": {"x": TOP[0], "y": TOP[1], "w": TOP[2], "h": TOP[3], "nx": round(TOP[0] / W, 4), "ny": round(TOP[1] / H, 4), "nw": round(TOP[2] / W, 4), "nh": round(TOP[3] / H, 4)},
        "left": {"x": LEFT[0], "y": LEFT[1], "w": LEFT[2], "h": LEFT[3], "nx": round(LEFT[0] / W, 4), "ny": round(LEFT[1] / H, 4), "nw": round(LEFT[2] / W, 4), "nh": round(LEFT[3] / H, 4)},
        "right": {"x": RIGHT[0], "y": RIGHT[1], "w": RIGHT[2], "h": RIGHT[3], "nx": round(RIGHT[0] / W, 4), "ny": round(RIGHT[1] / H, 4), "nw": round(RIGHT[2] / W, 4), "nh": round(RIGHT[3] / H, 4)},
    },
    "botanical": {"x": 6, "y": 12, "w": br_w, "h": br_h, "opacity": 0.4, "nx": round(6 / W, 4), "ny": round(12 / H, 4), "nw": round(br_w / W, 4), "nh": round(br_h / H, 4)},
    "layout": {
        "header": {"x": 18, "y": 40, "w": 242, "h": 68, "nx": 0.0647, "ny": 0.0625, "nw": 0.8705, "nh": 0.1062},
        "tagline": {"x": 22, "y": 44, "h": 14},
        "greeting": {"x": 22, "y": 78, "h": 24, "fontSize": 22},
        "hero": {"x": 0, "y": 108, "w": 278, "h": 228},
        "nowCard": {"x": 10, "y": 342, "w": 258, "h": 176, "radius": 28, "fill": "#FFF8F1", "nx": 0.036, "ny": 0.5344, "nw": 0.9281, "nh": 0.275},
        "nowTitle": {"x": 22, "y": 354, "h": 16},
        "nowCaption": {"x": 22, "y": 372, "h": 12},
        "progress": {"x": 22, "y": 390, "w": 234, "h": 3},
        "row1": {"x": 20, "y": 404, "w": 238, "h": 42},
        "row2": {"x": 20, "y": 452, "w": 238, "h": 42},
        "chevron": {"y": 524},
        "bank": {"x": 76, "y": 540, "w": 126, "h": 28, "nx": 0.2734, "ny": 0.8438, "nw": 0.4532, "nh": 0.0437},
        "composer": {"x": 14, "y": 578, "w": 250, "h": 42, "nx": 0.0504, "ny": 0.9031, "nw": 0.8993, "nh": 0.0656},
        "nav": {"h": 56},
    },
}
(MEAS / "home-geometry.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False), encoding="utf-8")
print("ok")
