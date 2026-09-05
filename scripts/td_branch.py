# -*- coding: utf-8 -*-
"""
Build a map's second road out of the author's spare stroke.

Some maps are marked with more than one red line. The longest is the road;
another that reaches the edge of the board is a way out for part of the
horde, and without it whole corners of a map are never walked and the plots
there are never worth buying.

The spare stroke only covers the far half of that route — where it leaves
the main road is not marked, because on the picture it is simply a fork in
the sand. So the join is found rather than drawn: from the stroke's off-board
end, walk the road the map is painted with until the main road is met. The
result is stored as a COMPLETE path from the same spawn as the main one, so
the engine has nothing to decide at the fork.

Usage:
    python scripts/td_branch.py <map id>
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_from_annotation as fa                            # noqa: E402
import td_trace_road as tr                                 # noqa: E402

W, H = fa.W, fa.H
#: a stroke has to be at least this big to be a road rather than an arrow
MIN_STROKE = 800


def strokes(mask):
    left = mask.copy()
    out = []
    while left.any():
        ys, xs = np.nonzero(left)
        c = fa.component(left, (ys[0], xs[0]))
        left &= ~c
        if c.sum() >= MIN_STROKE:
            out.append(c)
    out.sort(key=lambda c: -c.sum())
    return out


def edge_end(mask):
    """The point of a stroke that lies nearest the edge of the board."""
    ys, xs = np.nonzero(mask)
    d = np.minimum(np.minimum(xs, W - 1 - xs), np.minimum(ys, H - 1 - ys))
    i = int(np.argmin(d))
    return int(xs[i]), int(ys[i])


def main():
    mid = sys.argv[1] if len(sys.argv) > 1 else "forge"
    art = os.path.join(fa.ART)
    pic, _ = fa.to_board(Image.open(os.path.join(art, "markup", f"{mid}.webp")).convert("RGB"))
    under = Image.open(os.path.join(art, "maps", f"{mid}.webp")).convert("RGB") \
        .resize((W, H), Image.LANCZOS)
    a = np.asarray(pic, dtype=np.int16)

    marks = fa.red_mask(a) & fa.changed(pic, under)
    pieces = strokes(marks)
    if len(pieces) < 2:
        raise SystemExit(f"{mid}: only one stroke — nothing to make a branch from")
    main_stroke, spare = pieces[0], pieces[1]
    ground = fa.ground_mask(pic, under, main_stroke)

    data = json.load(open(os.path.join(art, "maps.json"), encoding="utf-8"))
    road = [tuple(p) for p in data[mid]["road"]]

    # the author's own strokes count as ground: they were drawn ON the road,
    # and the paint hides the very pixels the route needs to walk over
    walkable = ground | fa._dilate(marks, 3)
    tip = edge_end(spare)

    # nearest point of the main road, measured through the ground rather than
    # in a straight line: the fork is where the sand actually divides
    dep = tr.depth(walkable)
    best = None
    for i in range(0, len(road), 2):
        q = road[i]
        if not (0 <= q[0] < W and 0 <= q[1] < H):
            continue
        pixels = tr.route(walkable, dep, tip, q)
        if not len(pixels):
            continue
        off = sum(1 for x, y in pixels
                  if not walkable[int(np.clip(y, 0, H - 1)), int(np.clip(x, 0, W - 1))])
        # a branch that leaves the painted ground at all is invented, not
        # traced — on the forge every candidate crossed lava, and that is the
        # honest answer there rather than a road through it
        if off > len(pixels) * 0.01:
            continue
        length = sum(math.dist(pixels[k], pixels[k + 1]) for k in range(len(pixels) - 1))
        if best is None or length < best[0]:
            best = (length, i, pixels)
    if best is None:
        raise SystemExit(f"{mid}: no way along the ground from the spare stroke to the road")

    length, join, pixels = best
    tail = tr.smooth(np.array(pixels, dtype=np.float64))[::-1]      # junction -> tip
    keep = [tuple(tail[0])]
    for p in tail[1:]:
        if math.dist(p, keep[-1]) >= tr.THIN:
            keep.append(tuple(p))
    keep.append(tuple(tail[-1]))

    branch = [[round(float(x)), round(float(y))] for x, y in road[:join]] + \
             [[round(float(x)), round(float(y))] for x, y in keep]
    data[mid]["branch"] = branch
    json.dump(data, open(os.path.join(art, "maps.json"), "w", encoding="utf-8"), indent=1)
    print(f"{mid}: branch leaves the road at point {join} of {len(road)} "
          f"({road[join]}) and runs {length:.0f}u to {branch[-1]}")
    print(f"        {len(branch)} points; now run scripts/td_maps.py")


if __name__ == "__main__":
    main()
