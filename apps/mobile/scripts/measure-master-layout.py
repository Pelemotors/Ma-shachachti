"""Measure MASTER home.png: now-card, petals, header, bank, composer."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
src = np.array(Image.open(ROOT / "test-results/ui-visual/reference-crops/home.png").convert("RGB"))
H, W = src.shape[:2]
print("size", W, H)

def at(x, y):
    r, g, b = src[y, x]
    return int(r), int(g), int(b)

# sample page vs now-band
print("page y=100 x=20", at(20, 100))
print("page y=100 x=139", at(139, 100))
print("below hero y=345 x=20", at(20, 345))
print("below hero y=345 x=139", at(139, 345))
print("now title y=360 x=200", at(200, 360))
print("now mid y=400 x=20", at(20, 400))
print("now mid y=400 x=40", at(40, 400))
print("row interior y=435 x=80", at(80, 435))
print("between rows y=458 x=80", at(80, 458))
print("after rows y=512 x=80", at(80, 512))
print("bank y=552 x=139", at(139, 552))
print("composer y=600 x=139", at(139, 600))

# horizontal scan of now band for a card edge (lighter/different cream)
print("\n--- now band luma rows ---")
luma = 0.3 * src[:,:,0] + 0.59 * src[:,:,1] + 0.11 * src[:,:,2]
for y in range(330, 540, 4):
    row = luma[y]
    # left edge: first pixel that isn't page-like
    page = (src[y,:,0] > 248) & (src[y,:,1] > 242) & (src[y,:,2] > 234)
    if (~page).sum() > 8:
        xs = np.where(~page)[0]
        print(f"y{y:3d} ink/nonpage x={int(xs.min()):3d}-{int(xs.max()):3d} n={int((~page).sum()):3d} luma_mid={row[W//2]:.0f} rgb20={at(20,y)} rgb40={at(40,y)}")

print("\n--- left botanical samples ---")
for y in range(16, 140, 12):
    print(f"y{y:3d}", [at(x, y) for x in (8, 20, 36, 52, 70, 90)])
