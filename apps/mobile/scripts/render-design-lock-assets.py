"""Rasterize official Home Design Lock SVGs into @4x PNGs."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
LOCK = ROOT / "test-results/ui-visual/design-lock/ma_shachachti_home_design_lock"
OUT = ROOT / "apps/mobile/assets/ui"
COPY = ROOT / "apps/mobile/assets/design-lock"
OUT.mkdir(parents=True, exist_ok=True)
COPY.mkdir(parents=True, exist_ok=True)

SS = 8
SCALE = 4


def parse_path(d: str):
    tokens = re.findall(r"[A-Za-z]|-?\d*\.?\d+", d.replace(",", " "))
    cmds = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            nums = []
            while i < len(tokens) and not tokens[i].isalpha():
                nums.append(float(tokens[i]))
                i += 1
            cmds.append((cmd, nums))
        else:
            i += 1
    return cmds


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


def path_points(d: str):
    cmds = parse_path(d)
    pts = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    for cmd, nums in cmds:
        if cmd == "M":
            cur = (nums[0], nums[1])
            start = cur
            pts.append(cur)
        elif cmd == "C":
            for j in range(0, len(nums), 6):
                c1 = (nums[j], nums[j + 1])
                c2 = (nums[j + 2], nums[j + 3])
                p3 = (nums[j + 4], nums[j + 5])
                pts.extend(cubic(cur, c1, c2, p3)[1:])
                cur = p3
        elif cmd == "Z":
            pts.append(start)
            cur = start
    return pts


def hex_rgba(h: str, a: int = 255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def render_filled(d: str, vb, fill, name: str, stroke=None, stroke_w=3):
    w, h = vb
    pad = 8
    im = Image.new("RGBA", ((w + pad * 2) * SS, (h + pad * 2) * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    pts = [((x + pad) * SS, (y + pad) * SS) for x, y in path_points(d)]
    if len(pts) > 2:
        dr.polygon(pts, fill=fill)
        if stroke:
            dr.line(pts + [pts[0]], fill=stroke, width=max(2, int(stroke_w * SS)), joint="curve")
    cropped = im.crop((pad * SS, pad * SS, (w + pad) * SS, (h + pad) * SS))
    cropped.resize((w * 3, h * 3), Image.Resampling.LANCZOS).save(OUT / name.replace(".png", "@3x.png"))
    out = cropped.resize((w, h), Image.Resampling.LANCZOS)
    out.save(OUT / name)
    return out.size


def render_branch(name: str, vb, stem_d: str, stem_color, stem_w: float, leaves, opacity: float):
    w, h = vb
    im = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    stem = [(x * SS, y * SS) for x, y in path_points(stem_d)]
    if len(stem) > 1:
        dr.line(stem, fill=stem_color, width=max(2, int(stem_w * SS)), joint="curve")
    for d, col in leaves:
        pts = [(x * SS, y * SS) for x, y in path_points(d)]
        if len(pts) > 2:
            dr.polygon(pts, fill=col)
    hi = im.resize((w * 3, h * 3), Image.Resampling.LANCZOS)
    out = im.resize((w, h), Image.Resampling.LANCZOS)
    if opacity < 1:
        ha = hi.split()[3].point(lambda p: int(p * opacity))
        hi.putalpha(ha)
        a = out.split()[3].point(lambda p: int(p * opacity))
        out.putalpha(a)
    hi.save(OUT / name.replace(".png", "@3x.png"))
    out.save(OUT / name)


render_filled(
    "M87 2 C121 2 157 20 169 48 C175 61 169 72 157 80 C137 94 118 100 104 103 C97 105 91 100 87 96 C83 100 77 105 70 103 C56 100 37 94 17 80 C5 72 -1 61 5 48 C17 20 53 2 87 2 Z",
    (174, 106),
    hex_rgba("FBECDF"),
    "hero-top.png",
    hex_rgba("FFFDFC"),
)
render_filled(
    "M82 6 C96 15 104 31 105 52 C106 77 102 105 99 127 C96 150 86 174 67 184 C51 193 31 184 19 168 C5 149 1 124 3 99 C5 72 11 47 24 27 C38 6 61 -6 82 6 Z",
    (108, 190),
    hex_rgba("E5E1D8"),
    "hero-left.png",
    hex_rgba("FFFDFC"),
)
render_filled(
    "M24 6 C10 15 2 31 1 52 C0 77 4 105 7 127 C10 150 20 174 39 184 C55 193 75 184 87 168 C101 149 105 124 103 99 C101 72 95 47 82 27 C68 6 45 -6 24 6 Z",
    (106, 190),
    hex_rgba("F3DDD4"),
    "hero-right.png",
    hex_rgba("FFFDFC"),
)

c = Image.new("RGBA", (128 * SS, 128 * SS), (0, 0, 0, 0))
cd = ImageDraw.Draw(c)
cd.ellipse((3.5 * SS, 3.5 * SS, 124.5 * SS, 124.5 * SS), fill=hex_rgba("A66B59"), outline=hex_rgba("FFFDFC"), width=3 * SS)
c.resize((128 * 3, 128 * 3), Image.Resampling.LANCZOS).save(OUT / "hero-center@3x.png")
c.resize((128, 128), Image.Resampling.LANCZOS).save(OUT / "hero-center.png")

render_branch(
    "branch-from-master.png",
    (120, 224),
    "M8 216 C27 174 38 133 47 89 C54 55 63 28 77 8",
    hex_rgba("8D8165", 200),
    2.2,
    [
        ("M40 128 C31 113 18 105 4 104 C10 122 23 133 40 136 Z", hex_rgba("A8A28B", 210)),
        ("M47 101 C34 89 19 84 5 87 C14 103 28 111 46 109 Z", hex_rgba("B3AD95", 210)),
        ("M52 79 C44 61 45 47 53 34 C65 49 65 64 57 81 Z", hex_rgba("9E9881", 210)),
        ("M58 61 C67 43 80 34 94 34 C90 51 78 61 59 67 Z", hex_rgba("A8A28B", 210)),
        ("M63 43 C69 27 80 17 94 14 C92 31 82 41 65 48 Z", hex_rgba("B8B19A", 210)),
        ("M33 152 C20 140 7 136 -4 139 C4 154 17 162 33 160 Z", hex_rgba("AEA791", 210)),
        ("M26 178 C14 169 2 167 -8 171 C1 183 12 188 27 185 Z", hex_rgba("9E9881", 210)),
    ],
    0.52,
)

render_branch(
    "branch-bottom-right.png",
    (150, 190),
    "M142 182 C111 150 91 118 78 83 C67 55 54 31 34 9",
    hex_rgba("9B9076", 180),
    3,
    [
        ("M90 108 C108 92 126 89 143 95 C131 111 113 117 91 116 Z", hex_rgba("A8A28B", 210)),
        ("M77 81 C95 68 112 66 128 72 C116 86 99 91 79 89 Z", hex_rgba("B3AD95", 210)),
        ("M64 58 C76 41 78 25 72 10 C58 25 54 42 58 60 Z", hex_rgba("9E9881", 210)),
        ("M105 136 C119 124 134 121 149 125 C139 140 124 146 107 144 Z", hex_rgba("A8A28B", 210)),
    ],
    0.20,
)

for folder in ("hero", "decorative", "icons"):
    src = LOCK / "design-assets/home" / folder
    dest = COPY / folder
    dest.mkdir(parents=True, exist_ok=True)
    for svg in src.glob("*.svg"):
        shutil.copy2(svg, dest / svg.name)

print("ok", [p.name for p in OUT.glob("hero-*.png")], [p.name for p in OUT.glob("branch-*.png")])
