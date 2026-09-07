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

Usage:
    python scripts/td_props.py [map id ...]

Reads the boxes from art-src/td/maps.json ("props"), writes
public/games/td/maps/<id>.props.webp and the pieces into the map data.
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
SPECK = 90


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


def cut(mid):
    src = os.path.join(ART, "maps", f"{mid}.webp")
    board = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    data = json.load(open(os.path.join(ART, "maps.json"), encoding="utf-8"))
    m = data[mid]
    boxes = m.get("props") or []
    if not boxes:
        print(f"  {mid}: nothing marked to stand in front")
        m.pop("props", None)
        m.pop("pieces", None)
        return data, None

    ways = [m["road"]] + m.get("branches", [])
    road = road_region(board, ways)
    a = np.asarray(board, dtype=np.uint8)
    layer = np.zeros((H, W, 4), dtype=np.uint8)
    pieces = []
    for box in boxes:
        x0, y0, x1, y1 = [int(v) for v in box]
        keep = np.zeros((H, W), dtype=bool)
        keep[max(0, y0):y1, max(0, x0):x1] = True
        keep &= ~road
        # a kerb stone caught at the edge of the box is not a thing to hide
        # behind, and its foot would drag the whole piece's ground line down
        keep = fa._dilate(~fa._dilate(~keep, 1), 1)
        if keep.sum() < SPECK:
            print(f"  !! {mid}: the box {box} holds nothing but road")
            continue
        ys, xs = np.nonzero(keep)
        layer[keep, :3] = a[keep]
        layer[keep, 3] = 255
        pieces.append({
            "x": int(xs.min()), "y": int(ys.min()),
            "w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1),
            # the ground it stands on: its lowest pixel
            "base": int(ys.max()),
        })
    m["pieces"] = pieces
    print(f"  {mid}: {len(pieces)} piece(s) in front, "
          f"{int((layer[:, :, 3] > 0).sum())} px, road {road.mean() * 100:.1f}% of the board")
    return data, Image.fromarray(layer, "RGBA")


def main():
    ids = sys.argv[1:] or ["oasis", "canyon", "crystal", "frost", "forge"]
    data = None
    for mid in ids:
        data, layer = cut(mid)
        dst = os.path.join(OUT, f"{mid}.props.webp")
        if layer is None:
            if os.path.exists(dst):
                os.remove(dst)
            continue
        os.makedirs(OUT, exist_ok=True)
        layer.resize((1280, 720), Image.LANCZOS).save(dst, "WEBP", quality=92, method=6)
        print(f"        {os.path.getsize(dst) / 1024:.0f} kB")
    if data is not None:
        json.dump(data, open(os.path.join(ART, "maps.json"), "w", encoding="utf-8"), indent=1)
        print("  now run scripts/td_maps.py")


if __name__ == "__main__":
    main()
