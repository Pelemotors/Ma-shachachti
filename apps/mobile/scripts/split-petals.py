from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
im = Image.open(ROOT / "test-results/ui-visual/reference-crops/home.png").convert("RGBA")
a = np.array(im)
H, W = a.shape[:2]
r, g, b = a[:,:,0].astype(np.int16), a[:,:,1].astype(np.int16), a[:,:,2].astype(np.int16)
cx, cy = 139, 248
yy, xx = np.indices((H, W))
ang = np.degrees(np.arctan2(yy - cy, xx - cx))

# exclude near-black (bezel) and near-white cards
luma = 0.3*r + 0.59*g + 0.11*b
not_dark = luma > 140
not_white = ~((r > 250) & (g > 248) & (b > 244))
hero = (yy > 110) & (yy < 340)
# petal-ish warm/sage
petal = not_dark & not_white & hero & (r > 215) & (g > 205) & (b > 190)
# punch out brown center disk
rad2 = (xx - cx) ** 2 + (yy - cy) ** 2
center = rad2 < 36 ** 2
petal = petal & ~center

top = petal & (ang < -40) & (ang > -140)
left = petal & ~top & (xx < cx)
right = petal & ~top & (xx >= cx)

def save(mask, name):
    ys, xs = np.where(mask)
    print(name, 'n', len(xs), 'bbox', int(xs.min()), int(ys.min()), int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1))
    x0,y0,x1,y1 = int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1
    tile = a[y0:y1, x0:x1].copy()
    tile[~mask[y0:y1, x0:x1], 3] = 0
    p = ROOT / f"apps/mobile/assets/ui/petal-{name}.png"
    Image.fromarray(tile).save(p)
    return {"x": x0, "y": y0, "w": x1-x0, "h": y1-y0, "cx": int(xs.mean()), "cy": int(ys.mean())}

geom = {n: save(m, n) for n,m in (("top", top), ("left", left), ("right", right))}
(ROOT / "test-results/ui-visual/measurements/home-geometry.json").write_text(json.dumps({"width": W, "height": H, "center": {"cx": cx, "cy": cy, "d": 72}, "petals": geom}, indent=2))
print(geom)
