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
  * a gap in the stroke is closed along the road underneath it. Joining the
    pieces with a straight line is what put the forge's creeps through the
    lava: the two ends of the gap sit either side of a bend, and the short
    way between them is not the way the road goes;
  * the marks are found by DIFFERENCE against the map they were drawn over,
    which is in this repository. A colour key works until the map is painted
    in the colour of the pen, and the forge is lava from edge to edge; the
    tightest red key still called a ninth of it road. Against the original
    the lava cannot be a mark, because it did not change;
  * each green ring becomes the centre of the ellipse fitted through it —
    fitted, not averaged, so a ring half-hidden under a tower still yields
    its true centre.

Both are scaled into board space and written into art-src/td/maps.json for
the map named, replacing whatever was traced before. An overlay of the
result on the author's picture goes into art-src/td/traces to check.

The markup can be drawn on a screenshot of the running game rather than on
the bare map. The game letterboxes the board — it fits 960x540 into whatever
canvas it gets and centres it — so the same rule run backwards says which
part of the screenshot is the board, and everything is measured in board
coordinates from there.

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
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_trace_road as tr                      # noqa: E402

#: how far a pixel has to move from the map underneath to count as a mark;
#: the two images have been through a lossy encoder, so it cannot be zero
REPAINT = 70
#: how close to the road's own colours a pixel has to be to be walkable
GROUND_TOL = 34

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art-src", "td")
OUT = os.path.join(ART, "traces")
W, H = tr.W, tr.H

#: a pad's ring has to be at least this many board pixels to count
RING_MIN = 120


def to_board(pic):
    """
    Crop a screenshot down to the board the game drew inside it.

    engine.resize fits the board with min(W/960, H/540) and centres it, so
    the board is a rectangle of that size in the middle of the canvas. A
    markup drawn on a bare map has the board's own aspect and this is a
    no-op; one drawn on a screenshot is not, and measuring it as though it
    were would put every plot a few pixels out and the road further.
    """
    w, h = pic.size
    k = min(w / W, h / H)
    ox, oy = (w - W * k) / 2, (h - H * k) / 2
    box = (round(ox), round(oy), round(ox + W * k), round(oy + H * k))
    return pic.crop(box).resize((W, H), Image.LANCZOS), k


def changed(pic, under):
    """
    Pixels the author put there, by comparing with the map underneath.

    The two images have been through a lossy encoder and differ by a pixel
    or two in size, so every hard edge on the map — and the forge is lava
    against black rock — lands slightly off and differences like a brush
    stroke. Blurring both first fixes that but costs the stroke its
    contrast wherever it runs over ground of its own colour, which is most
    of the canyon. So the comparison is made against the map shifted a
    little in each direction, and a pixel counts as painted only if it
    differs from ALL of them: a misplaced edge matches one of the shifts,
    a stroke matches none.
    """
    if under is None:
        return np.ones((H, W), dtype=bool)
    a = np.asarray(pic, dtype=np.int16)
    b = np.asarray(under, dtype=np.int16)
    worst = np.full((H, W), 1 << 20, dtype=np.int32)
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            sh = np.roll(np.roll(b, dy, axis=0), dx, axis=1)
            worst = np.minimum(worst, np.abs(a - sh).sum(axis=2))
    return worst > REPAINT


def ground_mask(pic, under, mask):
    """
    What the road is made of here, learned from under the author's own stroke.

    The stroke lies on the road, so the map's colours beneath it are the
    road's colours — no threshold to guess and nothing to tune per map. Two
    things keep that honest. Only the middle of the stroke is sampled: its
    edges overhang the kerb and the rock beside it, and sampling those called
    four fifths of the forge walkable, lava included. And only the ground the
    stroke can actually be walked to is kept, so sand of the same colour on
    the far side of a lava river is not a way across it.
    """
    a = np.asarray(under if under is not None else pic, dtype=np.int16)
    core = ~tr._dilate(~tr._dilate(mask, 3), 3)
    ys, xs = np.nonzero(core if core.any() else mask)
    if not xs.size:
        return np.zeros((H, W), dtype=bool)
    keys = a[ys, xs]
    keys = keys[np.argsort(keys.sum(axis=1))]
    keys = keys[:: max(1, len(keys) // 24)][:24]
    d = np.full((H, W), 1 << 20, dtype=np.int32)
    for k in keys:
        d = np.minimum(d, np.abs(a - k).sum(axis=2))
    near = close(d < GROUND_TOL, 2)

    seed = near & mask
    while True:
        grown = tr._dilate(seed, 2) & near
        if grown.sum() == seed.sum():
            return grown
        seed = grown


def close(m, r):
    return ~tr._dilate(~tr._dilate(m, r), r)


def walk(ground, p, q):
    """
    The way from p to q along the ground, as a mask of the path.

    None when there is no way: the router will always return something, so
    what it returns has to be checked against the ground it was supposed to
    stay on. On the forge the two halves of the stroke sit either side of a
    cliff with a mine cart on it and no road between them at all, and a path
    invented across that is exactly what marched the creeps through the lava.
    """
    patch = ground.copy()
    for pt in (p, q):
        patch[max(0, pt[1] - 4):pt[1] + 5, max(0, pt[0] - 4):pt[0] + 5] = True
    pixels = tr.route(patch, tr.depth(patch), p, q)
    if not len(pixels):
        return None
    on = sum(1 for x, y in pixels
             if 0 <= int(y) < H and 0 <= int(x) < W and ground[int(y), int(x)])
    if on < len(pixels) * 0.9:
        return None
    line = Image.new("1", (W, H), 0)
    ImageDraw.Draw(line).line([tuple(map(int, v)) for v in pixels], fill=1, width=9)
    return np.asarray(line) > 0


def stitch(mask, ground=None, reach=240, floor=700):
    """
    Join the pieces of a stroke that was drawn as one.

    A red line over red lava barely differs from it, so the forge's road
    arrives in pieces with the crossings missing. The pieces are still one
    stroke, so the substantial ones are linked back up nearest-first, exactly
    as far as `reach` allows and no further — a gap that big is a lift of the
    pen, a bigger one is a second road.
    """
    left = mask.copy()
    pieces = []
    while left.any():
        ys, xs = np.nonzero(left)
        c = component(left, (ys[0], xs[0]))
        left &= ~c
        if c.sum() >= floor:
            pieces.append(c)
    if len(pieces) < 2:
        return mask

    pts = [np.column_stack(np.nonzero(p)[::-1]) for p in pieces]     # (x, y)
    pts = [p[:: max(1, len(p) // 1500)] for p in pts]
    out = mask.copy()
    joined = {0}
    canvas = Image.fromarray(out.astype(np.uint8) * 255)
    draw = ImageDraw.Draw(canvas)
    while len(joined) < len(pieces):
        best = None
        for i in joined:
            for j in range(len(pieces)):
                if j in joined:
                    continue
                d = np.hypot(pts[i][:, None, 0] - pts[j][None, :, 0],
                             pts[i][:, None, 1] - pts[j][None, :, 1])
                k, m = np.unravel_index(np.argmin(d), d.shape)
                if best is None or d[k, m] < best[0]:
                    best = (float(d[k, m]), j, tuple(pts[i][k]), tuple(pts[j][m]))
        if best is None or best[0] > reach:
            break
        _, j, p, q = best
        path = walk(ground, p, q) if ground is not None else None
        if path is None:
            print(f"   left a {best[0]:.0f}px gap at {p} alone: no road between "
                  f"those two ends")
            joined.add(j)          # nothing to join it by; stop considering it
            continue
        canvas = Image.fromarray(((np.asarray(canvas) > 127) | path).astype(np.uint8) * 255)
        draw = ImageDraw.Draw(canvas)
        joined.add(j)
        print(f"   stitched a {best[0]:.0f}px gap at {p} along the road")
    return np.asarray(canvas) > 127


def red_mask(a):
    """
    The author's stroke: a red far beyond anything the maps are painted in.

    The canyon is orange rock from edge to edge, and a loose threshold takes
    a seventh of that map for road. The stroke is nearly pure red, so asking
    for a large margin over BOTH other channels and a low green separates it
    from sandstone without touching the line itself.
    """
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r - g > 35) & (r - b > 35) & (r > 140)


def green_mask(a):
    """The author's rings: a neon green no foliage on these maps reaches."""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (g - r > 40) & (g - b > 40) & (g > 120)


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


def far_from(mask, seed):
    """Distance through the stroke from one pixel, and the furthest reached."""
    dist = np.full((H, W), -1, dtype=np.int32)
    dist[seed[1], seed[0]] = 0
    front = np.zeros((H, W), dtype=bool)
    front[seed[1], seed[0]] = True
    step = 0
    while front.any():
        step += 1
        nxt = _dilate(front, 1) & mask & (dist < 0)
        dist[nxt] = step
        front = nxt
    ys, xs = np.nonzero(dist >= 0)
    i = int(np.argmax(dist[ys, xs]))
    return (int(xs[i]), int(ys[i])), dist


#: how close to the board's edge a stroke has to reach to be a way in or out
EDGE = 55


def ends(mask):
    """
    Where the road enters the board and where it leaves.

    Taking the leftmost pixel and then the one furthest away in a straight
    line is only right for a road that runs left to right; the forge's is a
    serpentine, and that rule walked half of it and stranded four of its
    twelve pads. Taking the two points furthest apart ALONG the stroke is
    better but lands on whichever spur is longest — an arrowhead, or the
    branch to the ice cave on the glacier.

    What is actually true of a road is that it comes in at one edge of the
    board and goes out at another. So the candidates are the places the
    stroke touches an edge, and the answer is whichever two of those are
    furthest apart along it. Everything in between, arrows included, is
    something the road passes.
    """
    touch = np.zeros((H, W), dtype=bool)
    touch[:EDGE, :] = touch[-EDGE:, :] = True
    touch[:, :EDGE] = touch[:, -EDGE:] = True
    touch &= mask

    heads = []
    left = touch.copy()
    while left.any():
        ys, xs = np.nonzero(left)
        c = component(left, (ys[0], xs[0])) & touch
        left &= ~c
        cy, cx = np.nonzero(c)
        if cx.size < 12:
            continue
        i = int(np.argmax((cx - W / 2) ** 2 + (cy - H / 2) ** 2))   # the outermost
        heads.append((int(cx[i]), int(cy[i])))

    if len(heads) < 2:
        a, _ = far_from(mask, tuple(np.argwhere(mask)[0][::-1]))
        b, _ = far_from(mask, a)
        return a, b

    best = None
    for i, h in enumerate(heads):
        _, dist = far_from(mask, h)
        for j, k in enumerate(heads):
            if j <= i:
                continue
            d = int(dist[k[1], k[0]])
            if d >= 0 and (best is None or d > best[0]):
                best = (d, h, k)
    if best is None:
        a, _ = far_from(mask, heads[0])
        b, _ = far_from(mask, a)
        return a, b
    print(f"   {len(heads)} ways off the board; the road runs "
          f"{best[1]} to {best[2]}")
    return best[1], best[2]


def _dilate(m, r):
    return tr._dilate(m, r)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    mid = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ART, "markup", f"{mid}.webp")
    data = json.load(open(os.path.join(ART, "maps.json"), encoding="utf-8"))
    if mid not in data:
        raise SystemExit(f"no such map: {mid} (have {', '.join(data)})")

    pic, k = to_board(Image.open(src).convert("RGB"))
    under = os.path.join(ART, "maps", f"{mid}.webp")
    orig = (Image.open(under).convert("RGB").resize((W, H), Image.LANCZOS)
            if os.path.exists(under) else None)
    # work on the board's grid: the router is built for it, and a pixel of
    # error at 960 wide is nothing on a road forty wide
    a = np.asarray(pic, dtype=np.int16)
    fresh = changed(pic, orig)
    print(f"{mid}: markup {os.path.basename(src)} -> board at {k:.3f} px per unit, "
          f"{fresh.mean() * 100:.1f}% of it repainted")

    # --- the road ----------------------------------------------------------
    marks = red_mask(a) & fresh
    red = stitch(marks, ground_mask(pic, orig, biggest(marks)))
    if not red.any():
        raise SystemExit("no red stroke found")
    # the stroke is the biggest red thing on the map by far; the rest is
    # flowers, and one of them may well sit further left than the entrance
    road = biggest(red)
    road = ~tr._dilate(~tr._dilate(road, 2), 2)          # close pen gaps
    start, end = ends(road)
    # left to right where the road allows it, so levels read the same way
    if start[0] > end[0]:
        start, end = end, start
    dep = tr.depth(road)
    pixels = tr.route(road, dep, start, end)
    pts = tr.smooth(pixels)
    keep = [tuple(pts[0])]
    for p in pts[1:-1]:
        if np.hypot(p[0] - keep[-1][0], p[1] - keep[-1][1]) >= tr.THIN:
            keep.append(tuple(p))
    keep.append(tuple(pts[-1]))
    data[mid]["road"] = [[round(float(x)), round(float(y))] for x, y in keep]

    # --- the pads ----------------------------------------------------------
    pads = rings(green_mask(a) & fresh)
    pads.sort(key=lambda p: (p[1] // 90, p[0]))       # read like text
    data[mid]["plots"] = [[round(x), round(y)] for x, y, _ in pads]

    json.dump(data, open(os.path.join(ART, "maps.json"), "w", encoding="utf-8"), indent=1)
    print(f"{mid}: road {len(keep)} points from {keep[0]} to {keep[-1]}, "
          f"{len(pads)} pads")
    for x, y, n in pads:
        print(f"   pad at ({x:.0f}, {y:.0f})  ring {n}px")

    # --- overlay on the author's picture, so the two can be compared ---------
    os.makedirs(OUT, exist_ok=True)
    over = pic.copy()
    d = ImageDraw.Draw(over)
    d.line([tuple(p) for p in keep], fill=(255, 255, 255), width=3)
    for x, y, _ in pads:
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 255, 255))
        d.ellipse([x - 28, y - 28, x + 28, y + 28], outline=(0, 0, 0), width=2)
    over.save(os.path.join(OUT, f"annot_{mid}.png"))
    print(f"overlay: art-src/td/traces/annot_{mid}.png — now run scripts/td_maps.py")


if __name__ == "__main__":
    main()
