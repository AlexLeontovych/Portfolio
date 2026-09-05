# -*- coding: utf-8 -*-
"""
Strip the checkerboard backdrop out of the tower sheets.

Ten of the twelve upgrade sheets arrived with the transparency checker drawn
into the picture as actual grey pixels. Removing it is not a colour key: the
towers are grey stone, and keying grey would eat them. What separates backdrop
from stone is that the backdrop is perfectly neutral, comes in exactly two
tones, and touches the edge of the sheet — so the cut is a flood fill inwards
from the border, and anything the fill cannot reach stays.

A flood fill alone leaves two kinds of litter: single checker pixels it could
not reach through the seams, and whole squares walled in by the art. So the
checker itself is modelled — its square size and phase are measured off the
sheet — and any pixel holding exactly the tone its cell should hold is cut,
reachable or not.

The last pixel before the art is a blend of the two, which would leave a grey
fringe against the map. So the border of the cut is re-scored: alpha there
rises with how far the pixel has moved away from the backdrop tone.

Usage:
    python scripts/td_cutout.py <folder with crossbow/ cannon/ magic/ rocket/>

The folder's manifest.json gives the cell size; without one, 256 is assumed.
Writes art-src/td/towers/<kind>/level_<n>.webp
"""
import json
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "art-src", "td", "towers")

KINDS = ["crossbow", "cannon", "magic", "rocket"]
#: how close to a backdrop tone counts as backdrop
TONE = 10
#: how neutral: the spread between a pixel's channels
NEUTRAL = 8
#: colour distance at which a fringe pixel is fully opaque again
FRINGE = 42
#: the checker squares meet in a blurred seam that is neither tone; the fill
#: has to step over it or it never leaves the first square
BRIDGE = 2


def backdrop_tones(a):
    """The two greys the checker is made of, read off the sheet's border."""
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]).reshape(-1, 3)
    tones, counts = np.unique(border, axis=0, return_counts=True)
    order = np.argsort(-counts)
    picked = []
    for i in order:
        t = tones[i].astype(np.int16)
        if int(t.max() - t.min()) > NEUTRAL:
            continue
        if any(abs(int(t.mean()) - int(p.mean())) < 20 for p in picked):
            continue
        picked.append(t)
        if len(picked) == 2:
            break
    return picked


def _dilate(m, r):
    """Grow by a square of radius r. Separable, so 4r shifts and not 4r^2."""
    out = m.copy()
    for d in range(-r, r + 1):
        if d:
            out |= np.roll(m, d, axis=0)
    m2 = out.copy()
    for d in range(-r, r + 1):
        if d:
            out |= np.roll(m2, d, axis=1)
    return out


def _erode(m, r):
    return ~_dilate(~m, r)


def despeckle(keep, r=5):
    """
    Drop everything too thin to be part of a tower, and nothing else.

    Opening alone would round the art off; opening by reconstruction does not.
    Erode to a marker that only solid shapes survive, then grow that marker
    back inside the original — the tower returns to its exact outline, the
    leftover checker squares never come back because nothing seeded them.
    """
    seed = _erode(keep, r)
    while True:
        grown = _dilate(seed, 4) & keep
        if grown.sum() == seed.sum():
            return grown
        seed = grown


def flood_from_border(m):
    """The part of mask m reachable from the sheet's edge."""
    h, w = m.shape
    seed = np.zeros_like(m)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    seed &= m
    while True:
        grown = seed.copy()
        grown[1:] |= seed[:-1]
        grown[:-1] |= seed[1:]
        grown[:, 1:] |= seed[:, :-1]
        grown[:, :-1] |= seed[:, 1:]
        grown &= m
        if grown.sum() == seed.sum():
            return grown
        seed = grown


#: square sizes to look for; the sheets use 8, the walled-in patches others
CHECKER_SIZES = (6, 8, 10, 12, 14, 16, 17, 18, 20, 24)


def checker(a):
    """
    Every pixel that belongs to a checkerboard, whatever its tones, phase or
    square size.

    Matching the two tones read off the border is not enough: some walled-in
    patches were drawn at lower contrast, out of step, and with squares twice
    the size — and those are exactly the patches a flood fill can never reach.
    What every checker does satisfy, wherever its grid happens to fall, is
    that a step of one square lands on the other tone and a step of two lands
    back on the same one. That test needs no phase and no tones, only the
    square size, so it is simply tried at each plausible size.
    """
    lum = a.mean(axis=2)
    neutral = (a.max(axis=2) - a.min(axis=2)) <= NEUTRAL
    out = np.zeros(a.shape[:2], dtype=bool)

    def sh(m, dy, dx):
        return np.roll(np.roll(m, dy, axis=0), dx, axis=1)

    for s in CHECKER_SIZES:
        hit = neutral.copy()
        for dy, dx in ((0, s), (0, -s), (s, 0), (-s, 0)):
            hit &= np.abs(lum - sh(lum, dy, dx)) > 8
        for dy, dx in ((0, 2 * s), (0, -2 * s), (2 * s, 0), (-2 * s, 0)):
            hit &= np.abs(lum - sh(lum, dy, dx)) < 6
        out |= hit
    # the seams between squares are a blend of the two and fail every test
    return _dilate(out, 3)


CELL = 256      # set from the manifest at startup


def drop_stragglers(keep, neutral, cell=None):
    """
    Throw away grey litter that is not attached to the tower.

    Some walled-in checker patches are solid enough to survive the opening, so
    the last word belongs to connectivity: a tower always fills the bottom
    middle of its cell, and everything the tower cannot be walked to from
    there, and that has no colour of its own, is not part of it. Sparks and
    muzzle flare are coloured, so they stay whether they touch or not.
    """
    cell = cell or CELL
    h, w = keep.shape
    seed = np.zeros_like(keep)
    for cy in range(0, h, cell):
        for cx in range(0, w, cell):
            y0, y1 = cy + int(cell * 0.58), cy + int(cell * 0.88)
            x0, x1 = cx + int(cell * 0.34), cx + int(cell * 0.66)
            seed[y0:y1, x0:x1] = keep[y0:y1, x0:x1]
    while True:
        grown = _dilate(seed, 4) & keep
        if grown.sum() == seed.sum():
            break
        seed = grown
    return keep & ~(~seed & neutral)


def cut(path, cell=None):
    src = Image.open(path).convert("RGBA")
    if np.asarray(src)[:, :, 3].min() == 0:
        return src            # two of the twelve arrived cut already

    im = src.convert("RGB")
    a = np.asarray(im).astype(np.int16)
    tones = backdrop_tones(a)
    if not tones:
        return src

    spread = a.max(axis=2) - a.min(axis=2)
    near = np.zeros(a.shape[:2], dtype=bool)
    dist = np.full(a.shape[:2], 1e9, dtype=np.float32)
    for t in tones:
        d = np.abs(a - t).sum(axis=2)
        dist = np.minimum(dist, d)
        near |= d < TONE * 3
    cand = near & (spread <= NEUTRAL)
    # bridge the seams to let the fill cross, then take back only pixels that
    # were the backdrop's own colour, so the bridge cannot eat into the art
    bg = flood_from_border(~_dilate(~_dilate(cand, BRIDGE), BRIDGE)) & _dilate(cand, 1)
    bg |= checker(a)

    alpha = np.where(bg, 0, 255).astype(np.float32)
    # the blend band: pixels the fill stopped at, one step into the art
    edge = np.zeros_like(bg)
    edge[1:] |= bg[:-1]
    edge[:-1] |= bg[1:]
    edge[:, 1:] |= bg[:, :-1]
    edge[:, :-1] |= bg[:, 1:]
    edge &= ~bg
    alpha[edge] = np.clip(dist[edge] / FRINGE * 255, 0, 255)

    alpha *= drop_stragglers(despeckle(alpha > 0), spread <= NEUTRAL, cell)
    out = np.dstack([np.asarray(im), alpha.astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    src = sys.argv[1]
    cells = {}
    mf = os.path.join(src, "manifest.json")
    if os.path.exists(mf):
        for e in json.load(open(mf, encoding="utf-8")):
            cells[e["file"].replace("\\", "/")] = int(e.get("frameWidth", CELL))

    for kind in KINDS:
        os.makedirs(os.path.join(OUT, kind), exist_ok=True)
        for lvl in (1, 2, 3):
            p = os.path.join(src, kind, f"level_{lvl}.png")
            if not os.path.exists(p):
                print(f"  !! missing {kind}/level_{lvl}.png")
                continue
            im = cut(p, cells.get(f"{kind}/level_{lvl}.png"))
            dst = os.path.join(OUT, kind, f"level_{lvl}.webp")
            im.save(dst, "WEBP", quality=92, method=6)
            clear = (np.asarray(im)[:, :, 3] == 0).mean() * 100
            print(f"  {kind}/level_{lvl}: {clear:.0f}% cut away, "
                  f"{os.path.getsize(dst) / 1024:.0f} kB")


if __name__ == "__main__":
    main()
