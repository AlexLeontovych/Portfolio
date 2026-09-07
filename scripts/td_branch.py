# -*- coding: utf-8 -*-
"""
Build a map's other ways across out of the author's spare strokes.

A markup can carry more than one red line. The longest is the road, already
traced; every other one is a way the author wants part of the horde to take,
and without them whole corners of a map are never walked and the plots there
are never worth buying. The forge has two: a fork that peels off the road and
leaves by the eastern arch, and a short lane in at the southern edge and out
through the mine gate. That is the author's sentence made literal — in by a
gate, out by OTHER gates.

Each spare stroke is read the same way the road was:

  * pieces of one stroke are stitched back together. A stroke drawn over a
    prop comes back broken, and the forge's southern lane is in two parts
    with the mine gate between them;
  * the stroke is routed down its own middle, so the lane sits where the pen
    sat rather than where a straight line would put it;
  * a stroke that starts ON the road is a FORK, and is stored complete from
    the road's own spawn, so the engine has nothing to decide at the join.
    One that starts nowhere near it is a lane of its own, entered at the edge
    of the board it touches.

Nothing here checks the lane runs over sand. The author drew every pixel of
it and meant it — the forge's crosses a mine and a rail trestle, which read
as road to anyone looking at the picture. That check belongs to a join the
machine invents, and there is no such join here.

Usage:
    python scripts/td_branch.py <map id> [lanes to keep, e.g. 0,2]
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_from_annotation as fa                            # noqa: E402
import td_trace_road as tr                                 # noqa: E402

W, H = fa.W, fa.H
#: a mark this small is an arrowhead, not a way across
MIN_STROKE = 700
#: how much of a mark has to survive being eroded by this much to be a pen
#: stroke. The canyon's markup is a screenshot, and the map under it has been
#: through an encoder since, so the kerb of every sand road differences into a
#: hairline hundreds of pixels long. A pen leaves a core; a hairline does not
PEN = 2
MIN_CORE = 300
#: how wide the road's own stroke is taken to be, when subtracting it
ROAD_BAND = 26
#: two pieces this close are one stroke with the pen lifted between them. The
#: glacier's crossing breaks either side of the rope bridge it runs over
STITCH = 130
#: a stroke starting this close to the road joins it rather than standing alone
JOIN = 22


def pieces_of(mask, floor=MIN_STROKE):
    left = mask.copy()
    out = []
    while left.any():
        ys, xs = np.nonzero(left)
        c = fa.component(left, (ys[0], xs[0]))
        left &= ~c
        if c.sum() >= floor:
            out.append(c)
    out.sort(key=lambda c: -c.sum())
    return out


def is_pen(m):
    """Was this drawn with the pen, or is it an edge the encoder moved?"""
    return int((~tr._dilate(~m, PEN)).sum()) >= MIN_CORE


def union(group):
    m = group[0].copy()
    for p in group[1:]:
        m |= p
    return m


def edges(m):
    """The pixels of a mask, as an (x, y) array."""
    return np.column_stack(np.nonzero(m)[::-1])


def nearest(a, b):
    """The closest pair of points between two masks, and how far apart."""
    pa, pb = edges(a), edges(b)
    d = np.hypot(pa[:, None, 0] - pb[None, :, 0], pa[:, None, 1] - pb[None, :, 1])
    i, j = np.unravel_index(np.argmin(d), d.shape)
    return float(d[i, j]), tuple(pa[i]), tuple(pb[j])


def stitch(group):
    """Draw a group of pieces back into one stroke, nearest pair first."""
    whole = group[0].copy()
    joined, left, bridges = [group[0]], list(group[1:]), []
    while left:
        best = None
        for a in joined:
            for j, b in enumerate(left):
                d, p, q = nearest(a, b)
                if best is None or d < best[0]:
                    best = (d, j, p, q)
        d, j, p, q = best
        bridges.append((p, q))
        piece = left.pop(j)
        joined.append(piece)
        whole |= piece
        print(f"      a {d:.0f}px pen lift at {p} closed")
    canvas = Image.fromarray(whole.astype(np.uint8) * 255)
    draw = ImageDraw.Draw(canvas)
    for p, q in bridges:
        draw.line([p, q], fill=255, width=9)
    return np.asarray(canvas) > 127


def group_strokes(marks):
    """Split the spare marks into lanes, one per stroke however many pens."""
    parts = pieces_of(marks)
    groups = []
    for p in parts:
        for g in groups:
            if min(nearest(p, q)[0] for q in g) <= STITCH:
                g.append(p)
                break
        else:
            groups.append([p])
    return groups


def thin(pts):
    keep = [tuple(pts[0])]
    for p in pts[1:]:
        if math.dist(p, keep[-1]) >= tr.THIN:
            keep.append(tuple(p))
    keep.append(tuple(pts[-1]))
    return keep


def straighten(pts, reach=8, worth=60):
    """
    Take the loop out of a way that comes back to where it has already been.

    A fork is stored complete, road and all, and the road is followed as far
    as the junction the stroke was found to meet. On the glacier that junction
    was eighty units PAST the point where the branch actually leaves: the way
    went down the road, turned, climbed back and rejoined itself five units
    from a point it had already walked. Two hundred and twenty units of going
    nowhere, and on screen a column of creeps marching down and then turning
    round, which reads as a mistake because it is one.

    Any pair of points on a way that close together with that much walking
    between them is such a loop, and the walking between them is dropped.
    """
    best = None
    for j in range(len(pts)):
        for i in range(j):
            if math.dist(pts[i], pts[j]) > reach:
                continue
            gain = sum(math.dist(pts[k], pts[k + 1]) for k in range(i, j))
            if gain > worth and (best is None or gain > best[0]):
                best = (gain, i, j)
    if not best:
        return pts
    gain, i, j = best
    print(f"      cut {gain:.0f}u of doubling back at {tuple(map(round, pts[i]))}")
    return pts[:i + 1] + pts[j:]


def to_edge(p):
    """How far a point is from the nearest edge of the board."""
    return min(p[0], W - 1 - p[0], p[1], H - 1 - p[1])


def main():
    mid = sys.argv[1] if len(sys.argv) > 1 else "forge"
    art = fa.ART
    pic, _ = fa.to_board(Image.open(os.path.join(art, "markup", f"{mid}.webp")).convert("RGB"))
    under = Image.open(os.path.join(art, "maps", f"{mid}.webp")).convert("RGB") \
        .resize((W, H), Image.LANCZOS)
    a = np.asarray(pic, dtype=np.int16)
    marks = fa.red_mask(a) & fa.changed(pic, under)

    data = json.load(open(os.path.join(art, "maps.json"), encoding="utf-8"))
    road = [tuple(p) for p in data[mid]["road"]]
    drawn = Image.new("1", (W, H), 0)
    ImageDraw.Draw(drawn).line(road, fill=1, width=ROAD_BAND)
    drawn = np.asarray(drawn) > 0

    groups = [g for g in group_strokes(marks & ~drawn) if is_pen(union(g))]
    groups.sort(key=lambda g: -int(union(g).sum()))
    if not groups:
        raise SystemExit(f"{mid}: nothing drawn besides the road")
    wanted = ({int(i) for i in sys.argv[2].split(",")}
              if len(sys.argv) > 2 else set(range(len(groups))))
    print(f"{mid}: {len(groups)} way(s) across besides the road, keeping {sorted(wanted)}")

    lanes = []
    for gi, g in enumerate(groups):
        if gi not in wanted:
            print(f"   {gi}: skipped")
            continue
        lane = fa.close(stitch(g) if len(g) > 1 else g[0], 3)
        p, q = fa.ends(lane)

        # a stroke that touches the road shares it: the end nearer the road is
        # the join, and the free end says which half of the road comes with it.
        # A free end out by the road's own spawn is another way IN, so the road
        # follows the stroke; one out by its exit is another way OUT, so the
        # stroke follows the road. Either way the lane is stored whole, and the
        # engine has nothing to decide at the join
        dp = min(math.dist(p, r) for r in road)
        dq = min(math.dist(q, r) for r in road)
        if min(dp, dq) <= JOIN:
            join, free = (p, q) if dp < dq else (q, p)
            inward = math.dist(free, road[0]) < math.dist(free, road[-1])
            spur = thin(tr.smooth(np.array(
                tr.route(lane, tr.depth(lane), free if inward else join,
                         join if inward else free), dtype=np.float64)))
            near = min(range(len(road)),
                       key=lambda i: math.dist(road[i], spur[-1] if inward else spur[0]))
            if inward:
                pts = spur + [tuple(map(float, road[i])) for i in range(near + 1, len(road))]
                print(f"   {gi}: another way IN at {tuple(map(round, spur[0]))}, "
                      f"onto the road at point {near} of {len(road)} {road[near]}")
            else:
                pts = [tuple(map(float, road[i])) for i in range(near)] + spur
                print(f"   {gi}: another way OUT at {tuple(map(round, spur[-1]))}, "
                      f"off the road at point {near} of {len(road)} {road[near]}")
        else:
            # a lane of its own: in at whichever end reaches an edge of the board
            start, finish = (p, q) if to_edge(p) < to_edge(q) else (q, p)
            pts = thin(tr.smooth(np.array(tr.route(lane, tr.depth(lane), start, finish),
                                          dtype=np.float64)))
            print(f"   {gi}: a lane of its own, in at {tuple(map(round, pts[0]))}, "
                  f"out at {tuple(map(round, pts[-1]))}")
        pts = straighten(pts)
        length = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        print(f"      {len(pts)} points, {length:.0f}u, ends {to_edge(pts[0]):.0f} and "
              f"{to_edge(pts[-1]):.0f} from the edge of the board")
        lanes.append([[round(float(x)), round(float(y))] for x, y in pts])

    data[mid].pop("branch", None)
    data[mid]["branches"] = lanes
    json.dump(data, open(os.path.join(art, "maps.json"), "w", encoding="utf-8"), indent=1)
    print("        now run scripts/td_maps.py")

    over = pic.copy()
    d = ImageDraw.Draw(over)
    d.line(road, fill=(255, 255, 255), width=3)
    for i, lane in enumerate(lanes):
        col = [(60, 220, 255), (255, 220, 60), (200, 120, 255)][i % 3]
        d.line([tuple(p) for p in lane], fill=col, width=4)
    os.makedirs(fa.OUT, exist_ok=True)
    over.save(os.path.join(fa.OUT, f"branch_{mid}.png"))
    print(f"        overlay: art-src/td/traces/branch_{mid}.png")


if __name__ == "__main__":
    main()
