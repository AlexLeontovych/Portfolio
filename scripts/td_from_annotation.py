# -*- coding: utf-8 -*-
"""
Read a road and its build pads off a map the author has marked up.

The author draws the road as one red stroke and rings each build pad in
bright green, on a screenshot of the map at any size. That is the authority
on both, and this script takes it literally:

  * the red stroke, restricted to the one piece the entrance connects to (so
    a red flower elsewhere on the map is not road), is routed down its middle
    from its left end to its right end — the same centreline router the
    tracer uses, now on a band the author drew rather than one guessed from
    the sand's colour;
  * each green ring becomes the centre of the ring.

Both are scaled into board space and written into art-src/td/maps.json for
the map named, replacing whatever was traced before. An overlay of the
result on the author's picture goes into art-src/td/traces to check.

The author's markups are kept in art-src/td/markup/<map>.webp, so a map can
be re-read from them at any time.

Usage:
    python scripts/td_from_annotation.py <map id> [annotated image]
    (defaults to art-src/td/markup/<map id>.webp)
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_trace_road as tr                      # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art-src", "td")
OUT = os.path.join(ART, "traces")
W, H = tr.W, tr.H

#: a pad's ring has to be at least this many board pixels to count
RING_MIN = 120


def red_mask(a):
    """The author's stroke: red well above the other two channels."""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r - np.maximum(g, b) > 90) & (r > 160)


def green_mask(a):
    """The author's rings: a neon green no foliage on these maps reaches."""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (g > 170) & (b < 45) & (g - r > 70)


def component(mask, seed):
    """Grow one seed pixel through the mask."""
    m = np.zeros_like(mask)
    m[seed] = True
    while True:
        grown = tr._dilate(m, 2) & mask
        if grown.sum() == m.sum():
            return grown
        m = grown


def biggest(mask):
    """The largest connected piece of the mask."""
    left = mask.copy()
    best = None
    while left.any():
        ys, xs = np.nonzero(left)
        c = component(left, (ys[0], xs[0]))
        left &= ~c
        if best is None or c.sum() > best.sum():
            best = c
    return best


def rings(mask):
    """Centre and size of every separate green blob."""
    left = mask.copy()
    out = []
    while left.any():
        ys, xs = np.nonzero(left)
        c = component(left, (ys[0], xs[0]))
        left &= ~c
        cy, cx = np.nonzero(c)
        if cx.size >= RING_MIN:
            out.append((float(cx.mean()), float(cy.mean()), int(cx.size)))
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    mid = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ART, "markup", f"{mid}.webp")
    data = json.load(open(os.path.join(ART, "maps.json"), encoding="utf-8"))
    if mid not in data:
        raise SystemExit(f"no such map: {mid} (have {', '.join(data)})")

    pic = Image.open(src).convert("RGB")
    # work on the board's grid: the router is built for it, and a pixel of
    # error at 960 wide is nothing on a road forty wide
    a = np.asarray(pic.resize((W, H), Image.LANCZOS), dtype=np.int16)

    # --- the road ----------------------------------------------------------
    red = red_mask(a)
    if not red.any():
        raise SystemExit("no red stroke found")
    # the stroke is the biggest red thing on the map by far; the rest is
    # flowers, and one of them may well sit further left than the entrance
    road = biggest(red)
    road = ~tr._dilate(~tr._dilate(road, 2), 2)          # close pen gaps
    ys, xs = np.nonzero(road)
    start = (int(ys[np.argmin(xs)]), int(np.min(xs)))
    # the far end is whichever road pixel is furthest along from the start
    i = np.argmax((xs - start[1]) ** 2 + (ys - start[0]) ** 2)
    end = (int(xs[i]), int(ys[i]))
    dep = tr.depth(road)
    pixels = tr.route(road, dep, (start[1], start[0]), end)
    pts = tr.smooth(pixels)
    keep = [tuple(pts[0])]
    for p in pts[1:-1]:
        if np.hypot(p[0] - keep[-1][0], p[1] - keep[-1][1]) >= tr.THIN:
            keep.append(tuple(p))
    keep.append(tuple(pts[-1]))
    data[mid]["road"] = [[round(float(x)), round(float(y))] for x, y in keep]

    # --- the pads ----------------------------------------------------------
    pads = rings(green_mask(a))
    pads.sort(key=lambda p: (p[1] // 90, p[0]))       # read like text
    data[mid]["plots"] = [[round(x), round(y)] for x, y, _ in pads]

    json.dump(data, open(os.path.join(ART, "maps.json"), "w", encoding="utf-8"), indent=1)
    print(f"{mid}: road {len(keep)} points from {keep[0]} to {keep[-1]}, "
          f"{len(pads)} pads")
    for x, y, n in pads:
        print(f"   pad at ({x:.0f}, {y:.0f})  ring {n}px")

    # --- overlay on the author's picture, so the two can be compared ---------
    os.makedirs(OUT, exist_ok=True)
    over = pic.resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(over)
    d.line([tuple(p) for p in keep], fill=(255, 255, 255), width=3)
    for x, y, _ in pads:
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 255, 255))
        d.ellipse([x - 28, y - 28, x + 28, y + 28], outline=(0, 0, 0), width=2)
    over.save(os.path.join(OUT, f"annot_{mid}.png"))
    print(f"overlay: art-src/td/traces/annot_{mid}.png — now run scripts/td_maps.py")


if __name__ == "__main__":
    main()
