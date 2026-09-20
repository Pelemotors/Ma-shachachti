from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
src = np.array(Image.open(ROOT / "test-results/ui-visual/reference-crops/home.png").convert("RGBA"))
H, W = src.shape[:2]
r, g, b = src[:,:,0].astype(np.int16), src[:,:,1].astype(np.int16), src[:,:,2].astype(np.int16)
luma = 0.3*r + 0.59*g + 0.11*b
yy, xx = np.indices((H, W))
page = (r > 248) & (g > 242) & (b > 234)
# header watercolor: anything in top-left that is not page and not dark ink
band = (yy >= 4) & (yy < 145) & (xx < 200)
keep = band & ~page & (luma > 118) & (luma < 232)
# drop greeting/tagline ink (darker, right side of header)
ink = band & (luma < 155) & (xx > 70)
keep &= ~ink
img = Image.fromarray((keep.astype(np.uint8)*255), "L").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
keep = np.array(img) > 80
ys, xs = np.where(keep)
x0,y0,x1,y1 = int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1
tile = src[y0:y1, x0:x1].copy()
tile[~keep[y0:y1, x0:x1], 3] = 0
out = ROOT / "apps/mobile/assets/ui/branch-from-master.png"
Image.fromarray(tile).save(out)
print("branch", tile.shape, "bbox", x0,y0,x1-x0,y1-y0, "area", int(keep.sum()))
