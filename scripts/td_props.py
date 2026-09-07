# -*- coding: utf-8 -*-
"""
Cut the things a creep should walk BEHIND out of a map, into a layer of
their own.

The maps are one flat picture, so everything drawn on them is behind
everything the game draws: a creep walking through a gate crosses its face,
and one passing the mine walks over the trestle instead of under it.

What separates the two is depth, and in a picture drawn from this angle depth
is the line a thing stands on. So each of these is cut out with the ground it
stands on recorded, and the game draws it after every creep whose feet are
higher up the board than that line and before every creep whose feet are
lower. Gates, trestles, ore carts and the near rail of a bridge then sit in
front of whoever is behind them and behind whoever is in front.

TWO THINGS MAKE THE CUT EASY, and both are worth knowing before changing it.

The layer is cut from the map itself and drawn back at the same place, so
anything included by mistake is painted exactly over what is already there
and cannot be seen. Only two edges of a cut have to be right: it must not
take any ROAD with it, or the road would be painted back over the creeps
standing on it; and it must not reach across to the scenery on the FAR side
of the road, which is behind the creeps and must stay there.

And the road can be found. Every object in this art carries a heavy dark
outline, and the road ends where its outline is — so the road is grown out
from the middle of each way, through pixels that are neither an outline nor
far from the colour the road has just there, and it stops where the painter
stopped it. Subtracting that from a roughly drawn box leaves an edge along
the road that is exact, which is the only place exactness shows.

WHICH things stand in front is the one thing the map cannot say, and it comes
from outside: a redrawn foreground per map under art-src/td/foreground, whose
opaque pixels are read as a mask and nothing else. Those drafts have no exact
registration and do not need any — they only ever CHOOSE, generously, and
what is drawn is cut from the real map at the real map's coordinates. Where
there is no such sheet, the boxes in "props" do the choosing instead.

Usage:
    python scripts/td_props.py [map id ...]

Writes public/games/td/maps/<id>.props.webp and the pieces into the map data.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_from_annotation as fa                            # noqa: E402

W, H = fa.W, fa.H
ART = fa.ART
OUT = os.path.join(fa.ROOT, "public", "games", "td", "maps")
#: how wide the ribbon is that the road is grown from
RIBBON = 6
#: a gradient this steep is a painted outline, and the road stops at it
EDGE = 26
#: and this far from the colour the road has locally is something else
TOL = 74
#: a piece smaller than this is a speck of kerb, not a thing to hide behind
SPECK = 260
#: how much the chosen shapes are grown, to cover a draft drawn a little off
SLOP = 4
#: a thing further than this from any way can never be in front of anybody
NEAR = 54
#: how wide a piece may be before it is sliced
#:
#: A wall running diagonally past a road has no single line it stands on: it
#: is in front at its near end and behind at its far one. Given one line —
#: its lowest pixel, which is its nearest corner — it stood in front along
#: its whole length and painted itself over creeps it was plainly behind.
#: Sliced into columns, each takes the ground under ITS OWN stretch, and the
#: slices reassemble into the same wall because they are cut from one picture
#: and drawn back at one place.
SLICE = 24


def stamp(pts, half):
    line = Image.new("1", (W, H), 0)
    ImageDraw.Draw(line).line([tuple(map(float, p)) for p in pts], fill=1, width=half * 2)
    return np.asarray(line) > 0


def road_region(under, ways):
    """The road, grown from the middle of each way and stopped by the outlines."""
    a = np.asarray(under.filter(ImageFilter.GaussianBlur(0.6)), dtype=np.int16)
    grey = a.sum(axis=2) / 3.0
    gx = np.zeros_like(grey)
    gy = np.zeros_like(grey)
    gx[:, 1:-1] = grey[:, 2:] - grey[:, :-2]
    gy[1:-1] = grey[2:] - grey[:-2]
    edge = np.hypot(gx, gy)

    seed = np.zeros((H, W), dtype=bool)
    for way in ways:
        seed |= stamp(way, RIBBON)
    # the road's own colour, blurred wide so it follows the road as it changes
    soft = np.asarray(under.filter(ImageFilter.GaussianBlur(9)), dtype=np.int16)
    passable = (edge < EDGE) & (np.abs(a - soft).sum(axis=2) < TOL)

    cur = seed & passable
    if not cur.any():
        cur = seed
    while True:
        nxt = fa._dilate(cur, 1) & (passable | seed)
        if nxt.sum() == cur.sum():
            break
        cur = nxt
    return fa.close(cur, 2)


def chosen_by_sheet(mid):
    """The foreground drawn for this map, if one was supplied."""
    p = os.path.join(ART, "foreground", f"{mid}.webp")
    if not os.path.exists(p):
        return None
    sheet = Image.open(p).convert("RGBA").resize((W, H), Image.LANCZOS)
    return np.asarray(sheet)[:, :, 3] > 40


def parts(mask):
    """One piece per thing, each big enough to be worth hiding behind."""
    left = mask.copy()
    out = []
    while left.any():
        ys, xs = np.nonzero(left)
        seed = np.zeros(mask.shape, dtype=bool)
        seed[ys[0], xs[0]] = True
        cur = seed
        while True:
            nxt = fa._dilate(cur, 2) & left
            if nxt.sum() == cur.sum():
                break
            cur = nxt
        left &= ~cur
        if cur.sum() >= SPECK:
            out.append(cur)
    return out


def cut(mid, data):
    src = os.path.join(ART, "maps", f"{mid}.webp")
    board = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    m = data[mid]
    boxes = m.get("props") or []
    if not boxes and chosen_by_sheet(mid) is None:
        print(f"  {mid}: nothing marked to stand in front")
        m.pop("props", None)
        m.pop("pieces", None)
        return None

    ways = [m["road"]] + m.get("branches", [])
    road = road_region(board, ways)
    reach = np.zeros((H, W), dtype=bool)
    for way in ways:
        reach |= stamp(way, NEAR)
    a = np.asarray(board, dtype=np.uint8)
    layer = np.zeros((H, W, 4), dtype=np.uint8)

    chosen = chosen_by_sheet(mid)
    if chosen is None:
        chosen = np.zeros((H, W), dtype=bool)
        for box in boxes:
            x0, y0, x1, y1 = [int(v) for v in box]
            chosen[max(0, y0):y1, max(0, x0):x1] = True
    # generous in the choosing, exact in the cutting: the road is what a piece
    # must never take, because there it would be a wall across the way
    chosen = fa._dilate(chosen, SLOP) & ~road & reach

    # and wherever the map is asked to stay one picture, it stays one picture.
    # Some corners read better whole than sorted: a wall, a bridge and a
    # stair, all leaning past each other, will not come apart into pieces that
    # each stand somewhere, and trying leaves seams instead of depth
    for x0, y0, x1, y1 in m.get("whole") or []:
        chosen[max(0, int(y0)):int(y1), max(0, int(x0)):int(x1)] = False

    pieces = []
    for keep in parts(chosen):
        layer[keep, :3] = a[keep]
        layer[keep, 3] = 255
        ys, xs = np.nonzero(keep)
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        for cx in range(x0, x1, SLICE):
            strip = keep[:, cx:min(cx + SLICE, x1)]
            if not strip.any():
                continue
            sy = np.nonzero(strip.any(axis=1))[0]
            sxs = np.nonzero(strip.any(axis=0))[0]
            pieces.append({
                "x": cx + int(sxs.min()),
                "y": int(sy.min()),
                "w": int(sxs.max() - sxs.min() + 1),
                "h": int(sy.max() - sy.min() + 1),
                # the ground under this stretch of it, not under all of it
                "base": int(sy.max()),
            })
    pieces.sort(key=lambda p: p["base"])
    m["pieces"] = pieces
    print(f"  {mid}: {len(pieces)} piece(s) in front, "
          f"{int((layer[:, :, 3] > 0).sum())} px, road {road.mean() * 100:.1f}% of the board")
    return Image.fromarray(layer, "RGBA")


def main():
    ids = sys.argv[1:] or ["oasis", "canyon", "crystal", "frost", "forge"]
    # one read, one write: cutting each map from its own copy of the file
    # meant only the last map's pieces were ever kept
    data = json.load(open(os.path.join(ART, "maps.json"), encoding="utf-8"))
    for mid in ids:
        layer = cut(mid, data)
        dst = os.path.join(OUT, f"{mid}.props.webp")
        if layer is None:
            if os.path.exists(dst):
                os.remove(dst)
            continue
        os.makedirs(OUT, exist_ok=True)
        layer.resize((1280, 720), Image.LANCZOS).save(dst, "WEBP", quality=92, method=6)
        print(f"        {os.path.getsize(dst) / 1024:.0f} kB")
    if True:
        json.dump(data, open(os.path.join(ART, "maps.json"), "w", encoding="utf-8"), indent=1)
        print("  now run scripts/td_maps.py")


if __name__ == "__main__":
    main()
