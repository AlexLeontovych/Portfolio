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
  * each green ring becomes the centre of the ellipse fitted through it —
    fitted, not averaged, so a ring half-hidden under a tower still yields
    its true centre.

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


def ellipse_centre(xs, ys):
    """
    Centre of the ellipse the pixels lie on, by least squares.

    The pads are drawn in perspective, so a ring is an ellipse, and part of
    it may be hidden under a tower the author happened to have built there.
    The centroid of the visible pixels then slides towards the visible side;
    the ellipse through them does not. A general conic is fitted and its
    centre taken; if the fit is not an ellipse the centroid is used after all.
    """
    x = xs - xs.mean()
    y = ys - ys.mean()
    D = np.column_stack([x * x, x * y, y * y, x, y, np.ones_like(x)])
    # smallest singular vector of the design matrix is the conic
    _, _, vt = np.linalg.svd(D, full_matrices=False)
    A, B, C, Dd, E, _ = vt[-1]
    det = 4 * A * C - B * B
    if det <= 1e-9:
        return float(xs.mean()), float(ys.mean())
    cx = (B * E - 2 * C * Dd) / det
    cy = (B * Dd - 2 * A * E) / det
    if abs(cx) > 60 or abs(cy) > 60:            # fit ran away: a ring is not that big
        return float(xs.mean()), float(ys.mean())
    return float(cx + xs.mean()), float(cy + ys.mean())


def rings(mask):
    """
    Centre and size of every separate green ring.

    Every pad on a map is the same size, so the rings the author draws round
    them are too. That is the fact that rescues a ring half-hidden under a
    tower: measure the size off the rings that are whole, then for each ring
    ask only where a ring of THAT size best fits the pixels it does show. A
    free fit through half an arc drifts; a fit that already knows the radius
    lands on the centre.
    """
    left = mask.copy()
    blobs = []
    while left.any():
        ys, xs = np.nonzero(left)
        c = component(left, (ys[0], xs[0]))
        left &= ~c
        cy, cx = np.nonzero(c)
        if cx.size >= RING_MIN:
            blobs.append((cx.astype(np.float64), cy.astype(np.float64)))

    # the size of a whole ring: the median bounding box of the widest blobs
    spans = sorted(((cx.max() - cx.min()) / 2, (cy.max() - cy.min()) / 2)
                   for cx, cy in blobs)
    whole = spans[len(spans) // 2:]
    A = float(np.median([w for w, _ in whole]))
    B = float(np.median([h for _, h in whole]))

    out = []
    for cx, cy in blobs:
        ex, ey = ellipse_centre(cx, cy)
        # then slide a ring of the known size around the free fit and keep
        # the spot where the visible pixels sit closest to its rim
        best = (np.inf, ex, ey)
        for px in np.arange(ex - 24, ex + 25, 1.0):
            for py in np.arange(ey - 24, ey + 25, 1.0):
                r = ((cx - px) / A) ** 2 + ((cy - py) / B) ** 2 - 1
                sq = float((r * r).mean())
                if sq < best[0]:
                    best = (sq, px, py)
        out.append((best[1], best[2], int(cx.size)))
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
