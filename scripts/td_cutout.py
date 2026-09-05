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

The sheets are also not on the grid their manifest claims. The four rows of
facings were packed at whatever height each came out — 180px on one sheet,
240px on the next — so a cut along 256px rows takes the top off one tower and
hands it to the frame above. The rows are therefore found on the picture: the
valleys of the opaque-pixel count down the sheet, of which there are always
three between four rows. Each tower is then re-laid onto a true 256px grid,
its base on a common line, and only then is anything decided per cell.

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
#: how wide a strip at a cell's edge counts as "came in from next door"
EDGE_BAND = 4
#: alpha above which a pixel is part of a shape rather than its halo
SOLID = 24


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


def _shift(m, dy, dx):
    """m moved by (dy, dx), with nothing wrapping round the edges."""
    out = np.zeros_like(m)
    h, w = m.shape
    ys, yd = (slice(max(0, -dy), h - max(0, dy)), slice(max(0, dy), h - max(0, -dy)))
    xs, xd = (slice(max(0, -dx), w - max(0, dx)), slice(max(0, dx), w - max(0, -dx)))
    out[yd, xd] = m[ys, xs]
    return out


def _dilate(m, r):
    """
    Grow by a square of radius r. Separable, so 4r shifts and not 4r^2.

    The shift does NOT wrap. Written with np.roll it did, and the left edge
    of a cell was therefore a neighbour of its right edge: a flash sitting at
    x=0 counted as touching the tower at x=255, the flood fill walked round
    the back of the image, and every intruder came out "part of the tower".
    """
    out = m.copy()
    for d in range(-r, r + 1):
        if d:
            out |= _shift(m, d, 0)
    m2 = out.copy()
    for d in range(-r, r + 1):
        if d:
            out |= _shift(m2, 0, d)
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


def _reconstruct(seed, within, step=4):
    """
    Grow seed through `within` until nothing more is reached.

    `step` is how far it reaches each round. Four is fast and fine when the
    question is "what is this shape", but it also steps over a gap of up to
    four pixels — and the flash a neighbouring frame leaves behind stops two
    pixels short of the tower. Deciding what is CONNECTED to what has to walk
    one pixel at a time or it joins things that are merely close.
    """
    while True:
        grown = _dilate(seed, step) & within
        if grown.sum() == seed.sum():
            return grown
        seed = grown


def drop_stragglers(keep, neutral, cell=None):
    """
    Throw away whatever is in a cell but is not that cell's tower.

    Two kinds of intruder. Grey litter: walled-in checker patches solid enough
    to survive the opening. And the neighbours: the generator did not keep
    every tower's muzzle flash inside its cell, so the frame next door leaves
    a piece of its flash in this one — which is why a second texture appeared
    beside a tower only while it was firing.

    Connectivity settles both, and it is done one cell at a time. Trying it on
    the whole sheet with a thin wall drawn between the cells did not work: the
    fill grows in steps of four pixels and simply stepped over the wall, so
    every tower claimed its neighbours and nothing was ever dropped. Inside a
    single cell there is nothing to step over.

    A tower fills the bottom middle of its cell, so what can be walked to from
    there is the tower. Of the rest, anything grey goes, and anything reaching
    the cell's edge goes — that is where a neighbour comes in from. Coloured
    sparks floating clear of both stay.

    Connectivity is judged on the SOLID pixels only. Every shape here carries
    a faint halo of antialiasing, and at full transparency those halos touch:
    the flash next door and the tower are two separate things joined by a
    thread one alpha step above nothing, and following that thread made the
    tower swallow the intruder and the rule remove nothing at all.

    Returns the mask of what to erase, halo included.
    """
    cell = cell or CELL
    h, w = keep.shape
    out = np.zeros_like(keep)
    for cy in range(0, h - cell + 1, cell):
        for cx in range(0, w - cell + 1, cell):
            box = keep[cy:cy + cell, cx:cx + cell]
            if not box.any():
                continue
            grey = neutral[cy:cy + cell, cx:cx + cell]

            base = np.zeros_like(box)
            base[int(cell * 0.58):int(cell * 0.88), int(cell * 0.34):int(cell * 0.66)] = True
            tower = _reconstruct(base & box, box, step=1)

            rest = box & ~tower
            # a band at the edge rather than the edge itself: a neighbour's
            # flash may stop a pixel or two short of the boundary, and asking
            # for an exact touch missed every one of them
            rim = np.zeros_like(box)
            rim[:EDGE_BAND, :] = rim[-EDGE_BAND:, :] = True
            rim[:, :EDGE_BAND] = rim[:, -EDGE_BAND:] = True
            intruder = _reconstruct(rim & rest, rest, step=1)

            out[cy:cy + cell, cx:cx + cell] = intruder | (rest & grey)
    # take each intruder's own halo with it, or a ghost outline is left behind
    return _dilate(out, 2)


#: where a tower's base sits in its normalised cell, from the cell's top
BASELINE = 236
ROWS, COLS = 4, 6


def row_bands(alpha, cell):
    """
    The four rows of facings, found on the picture rather than on a grid.

    Count opaque pixels per line, smooth, and take the three deepest valleys
    that sit at least half a cell apart: a flash may bridge two rows but it
    is never as wide as a tower, so the gap between rows stays the low point.
    Each band is then trimmed to its own content.
    """
    h = alpha.shape[0]
    prof = alpha.sum(axis=1).astype(np.float64)
    k = 9
    prof = np.convolve(np.pad(prof, k // 2, mode="edge"), np.ones(k) / k, mode="valid")
    mins = [y for y in range(1, h - 1) if prof[y] <= prof[y - 1] and prof[y] <= prof[y + 1]]
    mins.sort(key=lambda y: prof[y])
    cuts = []
    for y in mins:
        if cell * 0.4 < y < h - cell * 0.4 and all(abs(y - c) >= cell * 0.5 for c in cuts):
            cuts.append(y)
        if len(cuts) == ROWS - 1:
            break
    if len(cuts) != ROWS - 1:
        return [(r * cell, (r + 1) * cell) for r in range(ROWS)]
    edges = [0] + sorted(cuts) + [h]
    bands = []
    for y0, y1 in zip(edges[:-1], edges[1:]):
        counts = alpha[y0:y1].sum(axis=1)
        rows = np.nonzero(counts > 4)[0]
        if not rows.size:
            bands.append((y0, y1))
            continue
        # the base is the bottom of the tower's mass, not of whatever litter
        # or smoke trails below it: the last line still a fifth as wide as
        # the widest one
        solid = np.nonzero(counts >= counts.max() * 0.2)[0]
        bands.append((y0 + int(rows[0]), y0 + int(solid[-1]) + 1))
    return bands


def normalise(rgba, cell):
    """Re-lay every tower onto a true grid, base on a common line."""
    h, w = rgba.shape[:2]
    bands = row_bands(rgba[:, :, 3] > 12, cell)
    out = np.zeros((ROWS * cell, COLS * cell, 4), dtype=np.uint8)
    for r, (y0, y1) in enumerate(bands):
        bh = min(y1 - y0, cell)
        top = max(0, min(cell - bh, BASELINE - bh))
        for c in range(COLS):
            src = rgba[y1 - bh:y1, c * cell:(c + 1) * cell]
            out[r * cell + top:r * cell + top + bh, c * cell:c * cell + src.shape[1]] = src
    return out, bands


def cut(path, cell=None):
    src = Image.open(path).convert("RGBA")
    if np.asarray(src)[:, :, 3].min() == 0:
        # two of the twelve arrived cut already, but not on the grid
        rgba, bands = normalise(np.asarray(src).copy(), cell or CELL)
        print(f"      rows at {', '.join(f'{a}-{b}' for a, b in bands)}")
        return Image.fromarray(rgba, "RGBA")

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

    alpha *= despeckle(alpha > 0)
    rgba = np.dstack([np.asarray(im), alpha.astype(np.uint8)])
    rgba, bands = normalise(rgba, cell or CELL)
    neut = (rgba[:, :, :3].max(axis=2).astype(np.int16)
            - rgba[:, :, :3].min(axis=2)) <= NEUTRAL
    rgba[:, :, 3] *= ~drop_stragglers(rgba[:, :, 3] > SOLID, neut, cell)
    print(f"      rows at {', '.join(f'{a}-{b}' for a, b in bands)}")
    return Image.fromarray(rgba, "RGBA")


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
