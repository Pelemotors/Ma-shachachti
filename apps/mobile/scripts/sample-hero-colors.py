from pathlib import Path
import numpy as np
from PIL import Image

im = Image.open(Path(r"C:\Users\iraka\Projects\Ma-shachachti\test-results\ui-visual\reference-crops\home.png")).convert("RGB")
a = np.array(im)
print("size", a.shape)
# print a coarse grid of the hero band
for y in range(120, 340, 12):
    row = []
    for x in range(20, 260, 20):
        r, g, b = a[y, x]
        row.append(f"{x:3d}:{r:3d},{g:3d},{b:3d}")
    print(f"y{y:3d} " + " | ".join(row))
