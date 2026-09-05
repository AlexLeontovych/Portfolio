# -*- coding: utf-8 -*-
"""
Turn a rough hand-traced route into a road that actually follows the painting.

This is how art-src/td/maps.json got its roads. Re-run it after changing a
route below, look at the overlay it writes into art-src/td/traces, then paste
the result into maps.json and re-run scripts/td_maps.py.

Reading exact coordinates off a picture is slow and inaccurate; recognising
which way the road goes is instant. So the hand-traced part is only the
topology — a dozen points that pick the right branch at every fork — and this
script does the accuracy: it learns the road's colour from those points, then
walks the route sliding each sample sideways onto the middle of the band.

Run it, look at the overlay it writes, move a point if a branch went wrong.
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art-src", "td")
OUT = os.path.join(ROOT, "art-src", "td", "traces")
#: the board the roads are expressed in
W, H = 960, 540

# The hand-traced routes, read off the maps. Only the shape matters: each one
# picks the branch to take at every fork, and the snapping below supplies the
# accuracy. Move a point when a road takes a turn it should not.
ROUTES = {
    "oasis": {
        "tol": 30,
        "route": [
            (-10, 105), (120, 110), (240, 118), (300, 150),
            (325, 215), (300, 285), (330, 350), (430, 372),
            (540, 370), (620, 340), (665, 290), (705, 235),
            (770, 200), (840, 235), (885, 300), (900, 375),
            (970, 400),
        ],
    },
    "crystal": {
        "tol": 34,
        "route": [
            (-10, 160), (150, 200), (240, 255), (340, 258),
            (430, 250), (500, 305), (570, 355), (660, 372),
            (740, 330), (790, 270), (860, 245), (970, 235),
        ],
    },
    "canyon": {
        "tol": 30,
        "route": [
            (-10, 95), (120, 105), (250, 95), (350, 100),
            (450, 125), (545, 130), (635, 120), (705, 150),
            (740, 220), (700, 290), (620, 325), (530, 345),
            (470, 360), (520, 420), (590, 460), (605, 560),
        ],
    },
    "forge": {
        "tol": 34,
        "route": [
            (-10, 100), (90, 125), (160, 180), (245, 215),
            (320, 225), (395, 210), (455, 250), (535, 262),
            (615, 245), (675, 215), (700, 275), (730, 340),
            (790, 390), (860, 415), (970, 425),
        ],
    },
    "frost": {
        "tol": 26,
        "route": [
            (-10, 35), (70, 70), (140, 105), (210, 145),
            (260, 205), (250, 275), (300, 320), (380, 340),
            (460, 368), (550, 375), (630, 395), (700, 425),
            (790, 445), (880, 440), (970, 440),
        ],
    },
}


def densify(pts, step=6.0):
    out = []
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        d = np.hypot(x1 - x0, y1 - y0)
        n = max(1, int(d / step))
        for k in range(n):
            t = k / n
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    out.append(tuple(pts[-1]))
    return np.array(out, dtype=np.float64)


def road_mask(a, pts, tol):
    """Pixels within `tol` of any colour the route passes over."""
    samples = []
    for (x, y) in pts:
        xi, yi = int(np.clip(x, 2, W - 3)), int(np.clip(y, 2, H - 3))
        samples.append(a[yi - 2:yi + 3, xi - 2:xi + 3].reshape(-1, 3))
    samples = np.concatenate(samples)
    # a handful of representative tones beats one mean: a road is lit and shaded
    keys = samples[np.argsort(samples.sum(axis=1))]
    keys = keys[::max(1, len(keys) // 24)][:24]
    d = np.full((H, W), 1e9, dtype=np.float32)
    for k in keys:
        d = np.minimum(d, np.abs(a - k).sum(axis=2))
    m = close(d < tol, 1)
    # Colour alone also catches every pale rock and ruin on the map. The road
    # is the part of that which the route can actually walk to, so grow the
    # route into the mask and keep only what it reaches.
    seed = np.zeros((H, W), dtype=bool)
    for (x, y) in pts:
        seed[int(np.clip(y, 1, H - 2)), int(np.clip(x, 1, W - 2))] = True
    while True:
        grown = _shift_or(seed, 2) & m
        if grown.sum() == seed.sum():
            return grown
        seed = grown


def _shift_or(m, r):
    """Dilate by a square of radius r, using shifts rather than a convolution."""
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, axis=0), dx, axis=1)
    return out


def close(m, r):
    return ~_shift_or(~_shift_or(m, r), r)


def snap(mask, path, reach=26):
    """Slide every sample sideways onto the middle of the band under it."""
    out = []
    n = len(path)
    for i, (x, y) in enumerate(path):
        j0, j1 = max(0, i - 3), min(n - 1, i + 3)
        tx, ty = path[j1][0] - path[j0][0], path[j1][1] - path[j0][1]
        L = np.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L           # unit normal
        lo = hi = 0
        for s in range(1, reach):
            xi, yi = int(x + nx * s), int(y + ny * s)
            if not (0 <= xi < W and 0 <= yi < H) or not mask[yi, xi]:
                break
            hi = s
        for s in range(1, reach):
            xi, yi = int(x - nx * s), int(y - ny * s)
            if not (0 <= xi < W and 0 <= yi < H) or not mask[yi, xi]:
                break
            lo = s
        shift = (hi - lo) / 2
        out.append((x + nx * shift, y + ny * shift, (hi + lo) / 2))
    return np.array(out)


def smooth(path, passes=6):
    p = path.copy()
    for _ in range(passes):
        q = p.copy()
        q[1:-1] = (p[:-2] + 2 * p[1:-1] + p[2:]) / 4
        p = q
    return p


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    result = {}
    for name, cfg in ROUTES.items():
        if only and name != only:
            continue
        im = Image.open(os.path.join(ART, "maps", f"{name}.webp")).convert("RGB").resize((W, H), Image.LANCZOS)
        a = np.asarray(im, dtype=np.int16)
        rough = np.array(cfg["route"], dtype=np.float64)
        dense = densify(rough)
        mask = road_mask(a, rough, cfg.get("tol", 90))
        snapped = snap(mask, dense, cfg.get("reach", 26))
        pts = smooth(snapped[:, :2])
        width = float(np.median(snapped[:, 2]))

        # overlay: everything off the road dimmed, so a route that wanders off
        # it is obvious; the hand trace in white, the snapped result in red
        px = np.asarray(im).astype(np.float32)
        px[~mask] *= 0.35
        over = Image.fromarray(px.astype(np.uint8))
        d = ImageDraw.Draw(over)
        d.line([tuple(p) for p in rough], fill=(255, 255, 255), width=2)
        d.line([tuple(p) for p in pts], fill=(255, 40, 90), width=4)
        for x, y in rough:
            d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 255, 0), width=2)
        os.makedirs(OUT, exist_ok=True)
        over.save(os.path.join(OUT, f"road_{name}.png"))

        # thin the result down to the handful of points the game needs
        keep = [pts[0]]
        for p in pts[1:-1]:
            if np.hypot(*(p - keep[-1])) > 22:
                keep.append(p)
        keep.append(pts[-1])
        result[name] = {"road": [[round(float(x), 1), round(float(y), 1)] for x, y in keep],
                        "halfWidth": round(width, 1)}
        print(f"{name}: {len(keep)} points, half-width {width:.0f}px, "
              f"mask covers {mask.mean() * 100:.1f}% of the board")

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "roads.json")
    old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    old.update(result)
    json.dump(old, open(path, "w", encoding="utf-8"), indent=1)
    print("wrote roads.json")


if __name__ == "__main__":
    main()
