"""Compare emulator Home to the official Board 6 MASTER phone."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
BOARD = ROOT / "test-results/ui-visual/design-lock/ma_shachachti_home_design_lock/references/master-board-6.png"
EMU = ROOT / "test-results/ui-visual/comparisons/home/emulator-raw.png"
OUT = ROOT / "test-results/ui-visual/comparisons/home"
FLOWER = OUT / "flower"
OUT.mkdir(parents=True, exist_ok=True)
FLOWER.mkdir(parents=True, exist_ok=True)

# Center Home phone screen inside Board 6 (inner bezel).
board = Image.open(BOARD).convert("RGB")
ref = board.crop((418, 168, 704, 772)).resize((390, 844), Image.Resampling.LANCZOS)
ref.save(OUT / "reference-lock.png")

emu = Image.open(EMU).convert("RGB")
tw, th = emu.size
y0, y1 = 72, max(73, th - 48)
body = emu.crop((0, y0, tw, y1)).resize((390, 844), Image.Resampling.LANCZOS)
ba = np.array(body)
sample = ba[24:32, 180:210].mean(axis=(0, 1))
ba[8:56, 334:384] = sample
body = Image.fromarray(ba)

ra = np.array(ref, dtype=np.int16)
ea = np.array(body, dtype=np.int16)
d = np.abs(ra - ea).mean(axis=2)

ref.save(OUT / "reference.png")
body.save(OUT / "emulator.png")
Image.blend(ref, body, 0.5).save(OUT / "overlay-50.png")
Image.fromarray(((ra * 0.5 + ea * 0.5).astype(np.uint8))).save(OUT / "overlay.png")
Image.fromarray(np.clip(d * 2.2, 0, 255).astype(np.uint8)).save(OUT / "diff.png")

fy0, fy1 = 130, 420
ref.crop((0, fy0, 390, fy1)).save(FLOWER / "reference.png")
body.crop((0, fy0, 390, fy1)).save(FLOWER / "emulator.png")
Image.blend(ref.crop((0, fy0, 390, fy1)), body.crop((0, fy0, 390, fy1)), 0.5).save(FLOWER / "overlay-50.png")
fd = d[fy0:fy1, :]
Image.fromarray(np.clip(fd * 2.4, 0, 255).astype(np.uint8)).save(FLOWER / "diff.png")

geom = {
    "header": (20, 40, 350, 90),
    "top_botanical": (0, 10, 130, 220),
    "top_petal": (114, 144, 172, 106),
    "left_petal": (48, 216, 106, 189),
    "center_circle": (121, 218, 154, 154),
    "right_petal": (248, 216, 104, 187),
    "now_card": (21, 417, 359, 244),
    "bank_cta": (125, 648, 151, 48),
    "composer": (21, 701, 359, 67),
    "nav": (1, 772, 389, 72),
}
components = []
for name, box in geom.items():
    x, y, w, h = box
    x1, y1 = min(390, x + w), min(844, y + h)
    mean = float(d[y:y1, x:x1].mean()) if y1 > y and x1 > x else 99.0
    components.append({"name": name, "mean_pixel_delta": round(mean, 2)})

metrics = {
    "iteration": "official-design-lock-390x844",
    "mean_visual_delta": round(float(d.mean()), 2),
    "flower_mean_delta": round(float(fd.mean()), 2),
    "emu_crop": {"y0": y0, "y1": y1, "src": [tw, th]},
    "components": components,
    "status": "READY FOR HUMAN REVIEW",
    "note": "Human visual review overrides numeric scores. Do not treat bbox or delta as pass.",
}
(OUT / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
print(json.dumps({"mean": metrics["mean_visual_delta"], "flower": metrics["flower_mean_delta"], "per": {c["name"]: c["mean_pixel_delta"] for c in components}}, indent=2))
