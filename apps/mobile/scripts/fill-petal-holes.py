from pathlib import Path
from collections import deque
import json
import numpy as np
from PIL import Image

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
ASSETS = ROOT / "apps/mobile/assets/ui"
MEAS = ROOT / "test-results/ui-visual/measurements"
geom = json.loads((MEAS / "home-geometry.json").read_text(encoding="utf-8"))
src = np.array(Image.open(ROOT / "test-results/ui-visual/reference-crops/home.png").convert("RGBA"))
H, W = src.shape[:2]
page = np.full((H, W, 4), (253, 248, 242, 255), dtype=np.uint8)

FILLS = {
    "top": (252, 236, 223, 255),
    "left": (228, 227, 217, 255),
    "right": (246, 222, 213, 255),
}


def fill_holes(alpha: np.ndarray) -> np.ndarray:
    h, w = alpha.shape
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        if alpha[0, x] == 0:
            q.append((x, 0))
            seen[0, x] = True
        if alpha[h - 1, x] == 0:
            q.append((x, h - 1))
            seen[h - 1, x] = True
    for y in range(h):
        if alpha[y, 0] == 0 and not seen[y, 0]:
            q.append((0, y))
            seen[y, 0] = True
        if alpha[y, w - 1] == 0 and not seen[y, w - 1]:
            q.append((w - 1, y))
            seen[y, w - 1] = True
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx] and alpha[ny, nx] == 0:
                seen[ny, nx] = True
                q.append((nx, ny))
    holes = (~seen) & (alpha == 0)
    out = alpha.copy()
    out[holes] = 255
    return out


comp = page.copy()
for name in ("top", "left", "right"):
    p = ASSETS / f"petal-{name}.png"
    tile = np.array(Image.open(p).convert("RGBA"))
    tile[:, :, 3] = fill_holes(tile[:, :, 3])
    tile[tile[:, :, 3] > 0] = FILLS[name]
    Image.fromarray(tile).save(p)
    box = geom["petals"][name]
    x0, y0, w, h = box["x"], box["y"], box["w"], box["h"]
    # composite
    dest = comp[y0 : y0 + h, x0 : x0 + w]
    alpha = (tile[:, :, 3:4].astype(np.float32) / 255.0)
    dest[:] = (tile.astype(np.float32) * alpha + dest.astype(np.float32) * (1 - alpha)).astype(np.uint8)

# center disk
cx, cy, d = 139, 248, 72
yy, xx = np.ogrid[:H, :W]
disk = (xx - cx) ** 2 + (yy - cy) ** 2 <= (d / 2) ** 2
comp[disk] = (161, 104, 87, 255)
Image.fromarray(comp).save(MEAS / "home-traced-hero.png")
print("wrote filled petals + composite")
