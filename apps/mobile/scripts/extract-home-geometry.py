"""Flood-fill trace of Board-6 Home. Writes JSON + 3 separate petal PNGs."""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(r"C:\Users\iraka\Projects\Ma-shachachti")
CROP = ROOT / "test-results/ui-visual/reference-crops/home.png"
OUT = ROOT / "test-results/ui-visual/measurements"
ASSET = ROOT / "apps/mobile/assets/ui"
OUT.mkdir(parents=True, exist_ok=True)
ASSET.mkdir(parents=True, exist_ok=True)


def flood(rgb: np.ndarray, seed: tuple[int, int], tol: float) -> np.ndarray:
    h, w = rgb.shape[:2]
    sx, sy = seed
    target = rgb[sy, sx].astype(np.int16)
    seen = np.zeros((h, w), dtype=bool)
    out = np.zeros((h, w), dtype=bool)
    q = deque([(sx, sy)])
    seen[sy, sx] = True
    while q:
        x, y = q.popleft()
        pix = rgb[y, x].astype(np.int16)
        if np.abs(pix - target).sum() > tol:
            continue
        out[y, x] = True
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((nx, ny))
    return out


def bbox(mask: np.ndarray) -> dict:
    ys, xs = np.where(mask)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    return {
        "x": x0,
        "y": y0,
        "w": x1 - x0 + 1,
        "h": y1 - y0 + 1,
        "cx": int(round(float(xs.mean()))),
        "cy": int(round(float(ys.mean()))),
    }


def nrm(b: dict, W: int, H: int) -> dict:
    return {
        **b,
        "xN": round(b["x"] / W, 4),
        "yN": round(b["y"] / H, 4),
        "wN": round(b["w"] / W, 4),
        "hN": round(b["h"] / H, 4),
        "cxN": round(b["cx"] / W, 4),
        "cyN": round(b["cy"] / H, 4),
    }


def export_mask(arr: np.ndarray, mask: np.ndarray, path: Path, pad: int = 6) -> dict:
    b = bbox(mask)
    x0 = max(0, b["x"] - pad)
    y0 = max(0, b["y"] - pad)
    x1 = min(arr.shape[1], b["x"] + b["w"] + pad)
    y1 = min(arr.shape[0], b["y"] + b["h"] + pad)
    tile = arr[y0:y1, x0:x1].copy()
    m = mask[y0:y1, x0:x1]
    tile[..., 3] = np.where(m, 255, 0).astype(np.uint8)
    Image.fromarray(tile).save(path)
    b["pad"] = pad
    b["assetX"] = x0
    b["assetY"] = y0
    b["asset"] = str(path.relative_to(ROOT)).replace("\\", "/")
    return b


def sample(rgb, x, y):
    p = rgb[y, x]
    return "#{:02X}{:02X}{:02X}".format(*p)


def main() -> None:
    im = Image.open(CROP).convert("RGBA")
    W, H = im.size
    arr = np.array(im)
    rgb = arr[:, :, :3]

    # seeds chosen on the 278x640 MASTER crop
    seeds = {
        "center": (139, 208),
        "top": (139, 118),
        "left": (52, 222),
        "right": (224, 222),
    }
    tols = {"center": 70, "top": 28, "left": 32, "right": 32}

    masks = {name: flood(rgb, seed, tols[name]) for name, seed in seeds.items()}

    # keep center compact: largest circular-ish component around seed
    # reject if flood escaped (too big)
    for name, m in list(masks.items()):
        area = int(m.sum())
        print(f"flood {name} area={area}")
        if name == "center" and area > 12000:
            # fallback: color distance from seed pixel in a disk
            sx, sy = seeds[name]
            target = rgb[sy, sx].astype(np.int16)
            yy, xx = np.indices((H, W))
            dist = np.abs(rgb.astype(np.int16) - target).sum(axis=2)
            rad2 = (xx - sx) ** 2 + (yy - sy) ** 2
            masks[name] = (dist < 55) & (rad2 < 42 * 42)

    extracted = {}
    for name in ("top", "left", "right"):
        extracted[name] = export_mask(arr, masks[name], ASSET / f"petal-{name}.png")

    center_b = bbox(masks["center"])

    debug = im.copy()
    dr = ImageDraw.Draw(debug)
    colors = {"center": (180, 60, 40), "top": (40, 80, 200), "left": (40, 160, 80), "right": (200, 140, 40)}
    for name, m in masks.items():
        ys, xs = np.where(m)
        if len(xs) == 0:
            continue
        b = bbox(m)
        dr.rectangle([b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]], outline=colors[name], width=2)
        sx, sy = seeds[name]
        dr.ellipse([sx - 2, sy - 2, sx + 2, sy + 2], fill=colors[name])
    debug.save(OUT / "home-boxes.png")

    geom = {
        "source": "test-results/ui-visual/reference-crops/home.png",
        "width": W,
        "height": H,
        "statusBarH": 22,
        "seeds": seeds,
        "colors": {name: sample(rgb, *seed) for name, seed in seeds.items()},
        "page": sample(rgb, 20, 40),
        "center": nrm(center_b, W, H),
        "petals": {k: nrm(v, W, H) for k, v in extracted.items()},
        "layout": {
            "tagline": {"xN": 0.08, "y": 30, "yN": 30 / H},
            "greeting": {"xN": 0.08, "y": 48, "yN": 48 / H, "h": 26},
            "nowTitle": {"y": 312, "yN": 312 / H},
            "nowCaption": {"y": 330, "yN": 330 / H},
            "progress": {"x": 16, "y": 348, "w": 246, "h": 4, "xN": 16 / W, "yN": 348 / H, "wN": 246 / W},
            "row1": {"x": 16, "y": 360, "w": 246, "h": 42, "xN": 16 / W, "yN": 360 / H, "hN": 42 / H},
            "row2": {"x": 16, "y": 410, "w": 246, "h": 42, "xN": 16 / W, "yN": 410 / H, "hN": 42 / H},
            "chevron": {"y": 458, "yN": 458 / H},
            "bank": {"y": 478, "w": 118, "h": 28, "yN": 478 / H, "wN": 118 / W, "hN": 28 / H},
            "composer": {"x": 16, "y": 516, "w": 246, "h": 36, "xN": 16 / W, "yN": 516 / H, "hN": 36 / H},
        },
    }
    (OUT / "home-geometry.json").write_text(json.dumps(geom, indent=2), encoding="utf-8")
    print(json.dumps({k: geom[k] for k in ("width", "height", "colors", "center", "petals")}, indent=2))


if __name__ == "__main__":
    main()
