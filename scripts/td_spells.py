# -*- coding: utf-8 -*-
"""
Take in the three area spells and lay them on a grid the atlas can read.

Each arrives as sixteen frames in a four by four sheet, with real alpha and a
ground ring drawn in the maps' own perspective. Two things need doing before
the packer sees them.

The sheets are 1254 across, which is not four times anything, so the pack's
manifest rounds its cells to 314 and 313 by turns. The packer reads a uniform
grid, and a cell that drifts by a pixel and a half per column would smear the
last frame. So the frames are cut by the manifest's own boxes and re-laid on
a true grid.

And the ring is what the spell is aimed at, so it has to sit in the same place
in every frame. It nearly does — these were generated, and a few frames wander
by a handful of pixels — so each frame is laid over the ring of the first,
found as the widest low-lying band of the drawing.

Usage:
    python scripts/td_spells.py <folder the pack extracted into>

Writes art-src/td/spells/<id>.webp, a 4x4 grid of 320px cells, and publishes
it at half that into public/games/td/spells, which is the size it is drawn at.

They are their own sheets rather than part of the atlas: the atlas is loaded
with every level and these are wanted a few times a game, and keeping them
apart also keeps the ring's place in the cell something this script decides
rather than something the packer's trimming works out.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_from_annotation as fa                             # noqa: E402

OUT = os.path.join(fa.ART, "spells")
PUB = os.path.join(fa.ROOT, "public", "games", "td", "spells")
CELL = 320
#: the cell as published, which is the size the effect is drawn at
DRAWN = 160
#: alpha at or above this is the drawing rather than its soft edge
SOLID = 24


def ring(alpha):
    """
    Where the effect meets the ground: the middle of its lowest solid rows.

    The flame and the smoke wander about above; what does not is the ellipse
    burnt into the ground, and its front edge is the bottom of the drawing.
    """
    m = alpha >= SOLID
    rows = np.nonzero(m.sum(axis=1) >= 6)[0]
    if not rows.size:
        return None
    bottom = int(rows[-1])
    mids = []
    for y in range(max(0, bottom - 10), bottom + 1):
        xs = np.nonzero(m[y])[0]
        if xs.size:
            mids.append((int(xs[0]) + int(xs[-1])) / 2)
    if not mids:
        return None
    return float(np.median(mids)), bottom


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    pack = sys.argv[1]
    manifest = json.load(open(os.path.join(pack, "manifest.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    for spell in manifest["spells"]:
        src = Image.open(os.path.join(pack, spell["image"])).convert("RGBA")
        a = np.asarray(src)
        grid = np.zeros((4 * CELL, 4 * CELL, 4), dtype=np.uint8)
        # every frame's ring goes to the same place in its cell, so the spell
        # is aimed at one point rather than at wherever this frame drifted to
        anchor = (CELL / 2, CELL - 24)
        first = None
        drift = 0.0
        for f in spell["frames"]:
            cell = a[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]]
            at = ring(cell[:, :, 3])
            if at is None:
                continue
            if first is None:
                first = at
            else:
                drift = max(drift, abs(at[0] - first[0]), abs(at[1] - first[1]))
            r, c = divmod(f["index"], 4)
            ox = int(round(c * CELL + anchor[0] - at[0]))
            oy = int(round(r * CELL + anchor[1] - at[1]))
            ph, pw = cell.shape[:2]
            sx0, sy0 = max(0, c * CELL - ox), max(0, r * CELL - oy)
            dx0, dy0 = max(c * CELL, ox), max(r * CELL, oy)
            dw = min(pw - sx0, (c + 1) * CELL - dx0)
            dh = min(ph - sy0, (r + 1) * CELL - dy0)
            if dw <= 0 or dh <= 0:
                continue
            patch = cell[sy0:sy0 + dh, sx0:sx0 + dw]
            dst = grid[dy0:dy0 + dh, dx0:dx0 + dw]
            np.copyto(dst, patch, where=patch[:, :, 3:] > dst[:, :, 3:])
        sheet = Image.fromarray(grid, "RGBA")
        dst = os.path.join(OUT, f"{spell['id']}.webp")
        sheet.save(dst, "WEBP", quality=94, method=6)
        os.makedirs(PUB, exist_ok=True)
        out = os.path.join(PUB, f"{spell['id']}.webp")
        sheet.resize((4 * DRAWN, 4 * DRAWN), Image.LANCZOS).save(
            out, "WEBP", quality=88, method=6)
        print(f"  {spell['id']:13} 16 frames on a {CELL}px grid, rings up to "
              f"{drift:.0f}px apart before; published at {DRAWN}px a cell, "
              f"{os.path.getsize(out) / 1024:.0f} kB")
    print("  now run scripts/td_atlas.py")


if __name__ == "__main__":
    main()
