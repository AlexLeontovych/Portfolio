# -*- coding: utf-8 -*-
"""
Trace the road painted on each map into the polyline the creeps walk.

Reading exact coordinates off a picture is slow and inaccurate; recognising
which way the road goes is instant. So the hand-traced part is only the
topology — a dozen points per map that pick the right branch at every fork —
and this script does the accuracy:

  1. it learns the road's colour from those points and keeps only the part of
     that colour the route can actually walk to (so a pale ruin elsewhere on
     the map is not "road");
  2. it measures how far every road pixel is from the road's edge;
  3. between each pair of hand points it finds the cheapest path through the
     road, where walking near the edge is dear and walking down the middle is
     cheap — which is exactly the centreline, and it bends where the road
     bends rather than cutting the corner.

Run it after changing a route below. It updates the roads in
art-src/td/maps.json in place and writes an overlay per map into
art-src/td/traces to check by eye; then re-run scripts/td_maps.py.
"""
import heapq
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art-src", "td")
OUT = os.path.join(ART, "traces")
#: the board the roads are expressed in
W, H = 960, 540

# The hand-traced routes. Only the shape matters: each one picks the branch
# to take at every fork, and the routing below supplies the accuracy. Move a
# point when a road takes a turn it should not. `tol` is how far a pixel's
# colour may stray from the sampled road tones and still count as road.
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
    "canyon": {
        "tol": 30,
        "route": [
            (-10, 95), (120, 105), (250, 95), (350, 100),
            (450, 125), (545, 130), (635, 120), (705, 150),
            (740, 220), (700, 290), (620, 325), (530, 345),
            (470, 360), (520, 420), (590, 460), (605, 560),
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
    "frost": {
        "tol": 26,
        "route": [
            (-10, 35), (70, 70), (140, 105), (210, 145),
            (260, 205), (250, 275), (300, 320), (380, 340),
            (460, 368), (550, 375), (630, 395), (700, 425),
            (790, 445), (880, 440), (970, 440),
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
}

#: how strongly the route is pushed towards the middle of the road
EDGE_COST = 6.0
#: a point every this many pixels is enough for the game's path
THIN = 18
#: radius of a build pad, carved out of the road before routing
PAD_R = 36


def _dilate(m, r):
    out = m.copy()
    for d in range(-r, r + 1):
        if d:
            out |= np.roll(m, d, axis=0)
    m2 = out.copy()
    for d in range(-r, r + 1):
        if d:
            out |= np.roll(m2, d, axis=1)
    return out


def road_mask(a, pts, tol):
    """Pixels of road colour that the route can walk to."""
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
    m = ~_dilate(~_dilate(d < tol, 1), 1)          # close 1px cracks

    # grow the route into the mask and keep only what it reaches: colour
    # alone also matches every pale rock and ruin on the map
    seed = np.zeros((H, W), dtype=bool)
    for (x, y) in pts:
        seed[int(np.clip(y, 1, H - 2)), int(np.clip(x, 1, W - 2))] = True
    while True:
        grown = _dilate(seed, 2) & m
        if grown.sum() == seed.sum():
            return grown
        seed = grown


def depth(mask):
    """How many pixels each road pixel is from the road's edge."""
    d = np.zeros(mask.shape, dtype=np.float32)
    m = mask.copy()
    for _ in range(40):
        if not m.any():
            break
        d += m
        m = ~_dilate(~m, 1)          # erode
    return d


def route(mask, dep, src, dst):
    """Cheapest 8-connected path from src to dst through the road."""
    def snap(p):
        x, y = int(np.clip(p[0], 0, W - 1)), int(np.clip(p[1], 0, H - 1))
        if mask[y, x]:
            return x, y
        ys, xs = np.nonzero(mask[max(0, y - 40):y + 41, max(0, x - 40):x + 41])
        if not xs.size:
            return x, y
        i = np.argmin((xs + max(0, x - 40) - x) ** 2 + (ys + max(0, y - 40) - y) ** 2)
        return int(xs[i] + max(0, x - 40)), int(ys[i] + max(0, y - 40))

    sx, sy = snap(src)
    tx, ty = snap(dst)
    top = float(dep.max()) or 1.0
    # walking cost per pixel: 1 in the middle, up to 1+EDGE_COST at the edge
    cost = 1.0 + EDGE_COST * (1.0 - dep / top) ** 2
    cost[~mask] = 1e6

    best = np.full((H, W), np.inf, dtype=np.float64)
    prev = {}
    best[sy, sx] = 0.0
    heap = [(0.0, sx, sy)]
    while heap:
        c, x, y = heapq.heappop(heap)
        if (x, y) == (tx, ty):
            break
        if c > best[y, x]:
            continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if not dx and not dy:
                    continue
                nx, ny = x + dx, y + dy
                if not (0 <= nx < W and 0 <= ny < H):
                    continue
                step = 1.41421 if dx and dy else 1.0
                nc = c + step * cost[ny, nx]
                if nc < best[ny, nx]:
                    best[ny, nx] = nc
                    prev[(nx, ny)] = (x, y)
                    heapq.heappush(heap, (nc, nx, ny))

    path = [(tx, ty)]
    while path[-1] != (sx, sy):
        p = prev.get(path[-1])
        if p is None:
            break
        path.append(p)
    return path[::-1]


def smooth(pts, passes=4):
    p = np.array(pts, dtype=np.float64)
    for _ in range(passes):
        q = p.copy()
        q[1:-1] = (p[:-2] + 2 * p[1:-1] + p[2:]) / 4
        p = q
    return p


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    data = json.load(open(os.path.join(ART, "maps.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)

    for name, cfg in ROUTES.items():
        if only and name != only:
            continue
        im = (Image.open(os.path.join(ART, "maps", data[name]["source"]))
              .convert("RGB").resize((W, H), Image.LANCZOS))
        a = np.asarray(im, dtype=np.int16)
        rough = cfg["route"]
        mask = road_mask(a, rough, cfg["tol"])
        # The pads are paved with the same stuff as the road on most maps,
        # and a pad is wider than the road beside it — so the router, told to
        # keep to the middle of the widest band, would happily walk creeps
        # through a build site. Carve every pad out of the road first.
        yy, xx = np.mgrid[0:H, 0:W]
        for (px, py) in data[name]["plots"]:
            mask &= (xx - px) ** 2 + (yy - py) ** 2 > PAD_R ** 2
        dep = depth(mask)

        # the ends sit off-board on purpose; route between the on-board
        # points and put the overhang back afterwards
        inner = [p for p in rough if 0 <= p[0] < W and 0 <= p[1] < H]
        pixels = []
        for s, t in zip(inner[:-1], inner[1:]):
            seg = route(mask, dep, s, t)
            pixels.extend(seg if not pixels else seg[1:])
        pts = smooth(pixels)

        keep = [tuple(pts[0])]
        for p in pts[1:-1]:
            if np.hypot(p[0] - keep[-1][0], p[1] - keep[-1][1]) >= THIN:
                keep.append(tuple(p))
        keep.append(tuple(pts[-1]))
        road = [list(rough[0])] + [[round(float(x)), round(float(y))] for x, y in keep] \
             + [list(rough[-1])]
        data[name]["road"] = road

        # overlay: off-road dimmed, hand points in yellow, the result in red
        px = np.asarray(im).astype(np.float32)
        px[~mask] *= 0.4
        over = Image.fromarray(px.astype(np.uint8))
        d = ImageDraw.Draw(over)
        d.line([tuple(p) for p in road], fill=(255, 40, 90), width=3)
        for x, y in rough:
            d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 255, 0), width=2)
        for x, y in data[name]["plots"]:
            d.ellipse([x - 26, y - 26, x + 26, y + 26], outline=(70, 255, 140), width=2)
        over.save(os.path.join(OUT, f"road_{name}.png"))
        print(f"{name}: {len(road)} points, road depth up to {dep.max():.0f}px, "
              f"mask {mask.mean() * 100:.0f}% of the board")

    json.dump(data, open(os.path.join(ART, "maps.json"), "w", encoding="utf-8"), indent=1)
    print("maps.json updated — now run scripts/td_maps.py")


if __name__ == "__main__":
    main()
