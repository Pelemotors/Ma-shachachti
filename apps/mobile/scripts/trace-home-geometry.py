"""Trace MASTER home.png into 3 independent petal silhouettes + layout spec."""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
SRC = ROOT / "test-results/ui-visual/reference-crops/home.png"
ASSETS = ROOT / "apps/mobile/assets/ui"
MEAS = ROOT / "test-results/ui-visual/measurements"
DECOR = ROOT / "apps/mobile/src/assets/decorative"
MEAS.mkdir(parents=True, exist_ok=True)
DECOR.mkdir(parents=True, exist_ok=True)

im = Image.open(SRC).convert("RGBA")
a = np.array(im)
H, W = a.shape[:2]
r = a[:, :, 0].astype(np.int16)
g = a[:, :, 1].astype(np.int16)
b = a[:, :, 2].astype(np.int16)
luma = 0.3 * r + 0.59 * g + 0.11 * b
yy, xx = np.indices((H, W))
CX, CY = 139, 248
ang = np.degrees(np.arctan2(yy - CY, xx - CX))
rad = np.hypot(xx - CX, yy - CY)

page = (r > 246) & (g > 238) & (b > 228) & (g >= 236)
center = (r > 130) & (r < 200) & (g > 70) & (g < 155) & (b > 50) & (b < 130) & ((r - g) > 20) & (rad < 40)
top_c = (r > 246) & (g >= 226) & (g <= 241) & (b >= 214) & (b <= 230) & ((r - b) > 18) & ~page
left_c = (r >= 216) & (r <= 238) & (g >= 216) & (g <= 236) & (b >= 206) & (b <= 226) & (np.abs(r - g) <= 10)
right_c = (r >= 238) & (r <= 252) & (g >= 210) & (g <= 232) & (b >= 200) & (b <= 222) & ((r - g) >= 14) & ~page
hero = (yy >= 108) & (yy <= 338) & (luma > 110)

top = hero & top_c & (ang < -35) & (ang > -145) & (rad > 30) & (rad < 125)
left = hero & left_c & (xx < CX) & (rad > 30) & (rad < 140)
right = hero & right_c & (xx >= CX) & (rad > 30) & (rad < 140)


def morph(mask: np.ndarray, op: str, k: int = 3) -> np.ndarray:
    img = Image.fromarray((mask.astype(np.uint8) * 255), "L")
    if op == "close":
        img = img.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
    else:
        img = img.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    return np.array(img) > 127


top = morph(morph(top, "close", 3), "open", 3)
left = morph(morph(left, "close", 3), "open", 3)
right = morph(morph(right, "close", 3), "open", 3)
top &= ~center
left &= ~center & ~top
right &= ~center & ~top & ~left


def fill_small_holes(mask: np.ndarray, max_area: int = 60) -> np.ndarray:
    h, w = mask.shape
    alpha = mask.astype(np.uint8) * 255
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if alpha[y, x] == 0 and not seen[y, x]:
                q.append((x, y))
                seen[y, x] = True
    for y in range(h):
        for x in (0, w - 1):
            if alpha[y, x] == 0 and not seen[y, x]:
                q.append((x, y))
                seen[y, x] = True
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx] and alpha[ny, nx] == 0:
                seen[ny, nx] = True
                q.append((nx, ny))
    holes = (~seen) & (alpha == 0)
    # keep only small holes
    out = mask.copy()
    ys, xs = np.where(holes)
    labeled = set()
    for x, y in zip(xs.tolist(), ys.tolist()):
        if (x, y) in labeled:
            continue
        q = deque([(x, y)])
        comp = []
        seen2 = {(x, y)}
        while q:
            cx, cy = q.popleft()
            comp.append((cx, cy))
            for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen2 and holes[ny, nx]:
                    seen2.add((nx, ny))
                    q.append((nx, ny))
        labeled |= seen2
        if len(comp) <= max_area:
            for px, py in comp:
                out[py, px] = True
    return out


top = fill_small_holes(top, 1200)
left = fill_small_holes(left, 1200)
right = fill_small_holes(right, 1200)
# drop only 1px specks, keep inner lobe area that meets the center
top = morph(top, "close", 3)
left = morph(left, "close", 3)
right = morph(right, "close", 3)

FILLS = {
    "top": (252, 236, 223, 255),
    "left": (228, 227, 217, 255),
    "right": (246, 222, 213, 255),
}


def box_of(mask: np.ndarray) -> dict:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return {"x": 0, "y": 0, "w": 0, "h": 0, "cx": 0, "cy": 0, "area": 0}
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    return {
        "x": x0,
        "y": y0,
        "w": x1 - x0,
        "h": y1 - y0,
        "cx": int(round(float(xs.mean()))),
        "cy": int(round(float(ys.mean()))),
        "area": int(mask.sum()),
        "nx": round(x0 / W, 4),
        "ny": round(y0 / H, 4),
        "nw": round((x1 - x0) / W, 4),
        "nh": round((y1 - y0) / H, 4),
    }


def contour_path(mask: np.ndarray, box: dict) -> str:
    """March the outer boundary clockwise into a simple SVG path (local coords)."""
    x0, y0, w, h = box["x"], box["y"], box["w"], box["h"]
    local = mask[y0 : y0 + h, x0 : x0 + w]
    # find first boundary pixel
    ys, xs = np.where(local)
    if len(xs) == 0:
        return ""
    start = (int(xs[0]), int(ys[0]))
    # walk 4-connected outline (Moore neighborhood simplified)
    dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
    pts = [start]
    x, y = start
    prev_dir = 0
    for _ in range(8000):
        found = None
        for i in range(8):
            d = (prev_dir + i) % 8
            nx, ny = x + dirs[d][0], y + dirs[d][1]
            if 0 <= nx < w and 0 <= ny < h and local[ny, nx]:
                # boundary if any 4-neighbor is empty
                edge = False
                for ex, ey in ((nx - 1, ny), (nx + 1, ny), (nx, ny - 1), (nx, ny + 1)):
                    if not (0 <= ex < w and 0 <= ey < h and local[ey, ex]):
                        edge = True
                        break
                if edge:
                    found = (nx, ny, (d + 5) % 8)
                    break
        if found is None:
            break
        x, y, prev_dir = found
        if (x, y) == start and len(pts) > 8:
            break
        pts.append((x, y))
    # simplify
    simp = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - simp[-1][0]) + abs(p[1] - simp[-1][1]) >= 3:
            simp.append(p)
    if simp[-1] != pts[0]:
        simp.append(pts[0])
    d = "M " + " L ".join(f"{x} {y}" for x, y in simp) + " Z"
    return d


def save_petal(mask: np.ndarray, name: str) -> dict:
    box = box_of(mask)
    print(name, box)
    if box["area"] == 0:
        return box
    x0, y0, w, h = box["x"], box["y"], box["w"], box["h"]
    tile = np.zeros((h, w, 4), dtype=np.uint8)
    tile[mask[y0 : y0 + h, x0 : x0 + w]] = FILLS[name]
    Image.fromarray(tile).save(ASSETS / f"petal-{name}.png")
    path = contour_path(mask, box)
    fill = "#%02X%02X%02X" % FILLS[name][:3]
    (DECOR / f"petal{name.title()}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">\n'
        f'  <path d="{path}" fill="{fill}"/>\n'
        f"</svg>\n",
        encoding="utf-8",
    )
    box["svgPath"] = path[:80] + "..."
    return box


dbg = a.copy()
dbg[top, :3] = (255, 180, 80)
dbg[left, :3] = (120, 180, 120)
dbg[right, :3] = (255, 140, 140)
dbg[center, :3] = (160, 80, 60)
Image.fromarray(dbg).save(MEAS / "home-masks.png")

geom = {
    "source": "test-results/ui-visual/reference-crops/home.png",
    "width": W,
    "height": H,
    "normalized_basis": "crop_pixels / (width|height)",
    "center": {
        "cx": CX,
        "cy": CY,
        "d": 78,
        "nx": round(CX / W, 4),
        "ny": round(CY / H, 4),
        "nd": round(72 / W, 4),
    },
    "petals": {
        "top": save_petal(top, "top"),
        "left": save_petal(left, "left"),
        "right": save_petal(right, "right"),
    },
}

# botanical: keep original watercolor pixels that are not page/text in the header
leaf = (
    (yy >= 6)
    & (yy < 155)
    & (xx < 210)
    & ~page
    & (luma > 125)
    & (luma < 225)
    & ((r - b) >= 6)
    & (g >= 125)
    & ~((luma < 165) & (xx > 70) & (yy > 36) & (yy < 110))
)
leaf = morph(leaf, "close", 3)
if leaf.any():
    box = box_of(leaf)
    x0, y0, w, h = box["x"], box["y"], box["w"], box["h"]
    # keep original watercolor pixels
    tile = a[y0 : y0 + h, x0 : x0 + w].copy()
    local = leaf[y0 : y0 + h, x0 : x0 + w]
    tile[~local, 3] = 0
    Image.fromarray(tile).save(ASSETS / "branch-from-master.png")
    geom["botanical"] = box
    print("botanical", box)

# composite preview
page_bg = np.full((H, W, 4), (253, 248, 242, 255), dtype=np.uint8)
for name, mask, col in (
    ("top", top, FILLS["top"]),
    ("left", left, FILLS["left"]),
    ("right", right, FILLS["right"]),
):
    page_bg[mask] = col
disk = (xx - CX) ** 2 + (yy - CY) ** 2 <= 36 ** 2
page_bg[disk] = (161, 104, 87, 255)
Image.fromarray(page_bg).save(MEAS / "home-traced-hero.png")

geom["layout"] = {
    "tagline": {"x": 22, "y": 46, "h": 14, "fontSize": 11},
    "greeting": {"x": 22, "y": 84, "h": 20, "fontSize": 20},
    "hero": {"x": 0, "y": 110, "w": 278, "h": 230},
    "nowTitle": {"x": 18, "y": 354, "h": 16, "fontSize": 15},
    "nowCaption": {"x": 18, "y": 374, "h": 12, "fontSize": 12},
    "progress": {"x": 18, "y": 394, "w": 242, "h": 3},
    "row1": {"x": 16, "y": 418, "w": 246, "h": 44, "radius": 22, "checkbox": 18},
    "row2": {"x": 16, "y": 468, "w": 246, "h": 44, "radius": 22, "checkbox": 18},
    "chevron": {"y": 520},
    "bank": {"w": 132, "h": 30, "y": 544},
    "composer": {"x": 16, "y": 586, "w": 246, "h": 38},
    "mic": {"d": 38},
}

(MEAS / "home-geometry.json").write_text(json.dumps(geom, indent=2, ensure_ascii=False), encoding="utf-8")
print("center", geom["center"])
