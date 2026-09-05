# -*- coding: utf-8 -*-
"""
Cut the barracks and its garrison out of the pack they arrived in.

Fifteen sheets: three buildings of four facings by four gate phases, and
twelve squads of four facings by six frames — idle, walk, attack and death
for a recruit, a knight and a paladin.

Three things have to be fixed before any of it can be drawn.

THE BACKDROP. Idle and the buildings carry a real alpha channel; walk,
attack and death have the transparency checker painted into the picture as
grey pixels. That is the same backdrop the tower sheets came with, and it
comes off with the same cut (td_cutout.strip).

THE GRID. The manifest's cells are only where the frames were MEANT to go.
A soldier overruns his cell by a few pixels into the next one, and the four
rows of facings are packed at whatever height each came out — the front view
is a fifth taller than the back. So the rows and the columns are both found
on the picture, at the empty lines between the drawings, and each frame is
re-laid onto a true grid with its feet on a common line. Without that a
soldier slides sideways as he breathes and sinks as he walks.

THE GATE. The pack's four gate phases are four separate drawings of the
whole building, not one building with a moving door: aligned and compared,
a quarter of the pixels differ, and most of that is the thatch, which is
redrawn straw by straw every time. Cycling them would make the roof crawl —
the same fault that put a second texture beside every firing tower. So the
building is taken from ONE frame and only the door is taken from the others,
through a mask that ends where the two frames agree. The roof never moves;
the door opens.

Usage:
    python scripts/td_barracks.py <folder the pack extracted into>

Writes art-src/td/barracks/level_<n>.webp (4 facings x 3 gate phases) and
art-src/td/soldiers/level_<n>/<action>.webp (4 facings x 6 frames).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_cutout as co                                      # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "art-src", "td")

#: the grid every soldier frame is re-laid onto, and where his feet go in it
UNIT_CELL = 288
UNIT_GROUND = 276
#: the same for a building; its base line is found by the atlas, not here
KEEP_CELL = 352
KEEP_GROUND = 330
#: how far from a cell boundary the true gap between two drawings may lie
SLACK = 56
#: a column or row counts as empty below this many opaque pixels
QUIET = 3
#: alpha at or above this is the drawing rather than its antialiased edge
SOLID = 24
#: gate phases kept, out of the pack's four: shut, ajar, open
PHASES = (0, 1, 2)


def bands(mask, n, pitch, slack=SLACK):
    """
    Split a strip into `n` drawings, cutting at the gaps between them.

    The nominal pitch says roughly where each cut goes; the picture says
    exactly. Taking the emptiest line within a slack of the nominal one is
    enough, because the drawings never touch — there is always a clear line
    between two of them, just not always where the manifest says.
    """
    prof = mask.sum(axis=0) if mask.ndim == 2 else mask
    cuts = [0]
    for i in range(1, n):
        lo, hi = max(cuts[-1] + 1, i * pitch - slack), min(len(prof) - 1, i * pitch + slack)
        window = prof[lo:hi]
        quiet = np.nonzero(window <= QUIET)[0]
        # the middle of the widest quiet run, or failing that the emptiest column
        if quiet.size:
            runs, start = [], quiet[0]
            for a, b in zip(quiet, quiet[1:]):
                if b != a + 1:
                    runs.append((start, a))
                    start = b
            runs.append((start, quiet[-1]))
            a, b = max(runs, key=lambda r: r[1] - r[0])
            cuts.append(lo + (a + b) // 2)
        else:
            cuts.append(lo + int(np.argmin(window)))
    cuts.append(len(prof))
    return list(zip(cuts, cuts[1:]))


def foot(alpha):
    """Where a drawing stands: the middle of its lowest rows, and the ground."""
    m = alpha >= SOLID
    rows = np.nonzero(m.sum(axis=1) >= 4)[0]
    if not rows.size:
        return None
    top, bottom = int(rows[0]), int(rows[-1])
    mids = []
    for y in range(max(top, bottom - 8), bottom + 1):
        xs = np.nonzero(m[y])[0]
        if xs.size:
            mids.append((int(xs[0]) + int(xs[-1])) / 2)
    return float(np.median(mids)), bottom


def relay(sheet, rows, cols, cell, ground):
    """
    Re-lay a sheet of drawings onto a true grid, every one stood up straight.

    Each drawing is found between the gaps, measured, and pasted into a fresh
    cell with the middle of its feet on the cell's centre line and its lowest
    pixel on the ground line. From here the grid is real and everything
    downstream — trimming, scaling, anchoring — can believe it.
    """
    a = np.asarray(sheet)
    h, w = a.shape[:2]
    ybands = bands(a[:, :, 3] >= SOLID, rows, h // rows)
    out = np.zeros((rows * cell, cols * cell, 4), dtype=np.uint8)
    drift = 0.0
    for r, (y0, y1) in enumerate(ybands):
        band = a[y0:y1]
        xbands = bands(band[:, :, 3] >= SOLID, cols, w // cols)
        for c, (x0, x1) in enumerate(xbands):
            piece = band[:, x0:x1]
            f = foot(piece[:, :, 3])
            if f is None:
                continue
            fx, fy = f
            drift = max(drift, abs(fx - (x1 - x0) / 2))
            ox = int(round(c * cell + cell / 2 - fx))
            oy = int(round(r * cell + ground - fy))
            ph, pw = piece.shape[:2]
            sx0, sy0 = max(0, -ox), max(0, -oy)
            dx0, dy0 = max(0, ox), max(0, oy)
            dw = min(pw - sx0, cols * cell - dx0)
            dh = min(ph - sy0, rows * cell - dy0)
            if dw <= 0 or dh <= 0:
                continue
            patch = piece[sy0:sy0 + dh, sx0:sx0 + dw]
            dst = out[dy0:dy0 + dh, dx0:dx0 + dw]
            np.copyto(dst, patch, where=patch[:, :, 3:] > dst[:, :, 3:])
    return out, drift


def door_mask(base, other):
    """
    Which pixels of a gate frame are the gate, and not the roof again.

    Every frame redraws the whole building, so differencing two of them lights
    up the thatch as brightly as the doorway. What tells them apart is that
    the door is ONE region: the largest lump of difference, taken whole and
    closed up. The mask is then feathered, and because it ends inside a band
    where the two drawings already agree, there is no seam to see.
    """
    d = np.abs(base[:, :, :3].astype(np.int16) - other[:, :, :3].astype(np.int16)).sum(axis=2)
    hot = (d > 90) & ((base[:, :, 3] >= SOLID) | (other[:, :, 3] >= SOLID))
    hot = co._erode(co._dilate(hot, 3), 3)              # drop the straw speckle
    if not hot.any():
        return None
    best, left = None, hot.copy()
    while left.any():
        ys, xs = np.nonzero(left)
        blob = co._reconstruct(_seed(left, (ys[0], xs[0])), left, 1)
        left &= ~blob
        if best is None or blob.sum() > best.sum():
            best = blob
    if best.sum() < 400:
        return None
    grown = co._dilate(best, 6)
    soft = np.zeros(best.shape, dtype=np.float32)
    soft[grown] = 1.0
    for r in (5, 3, 1):                                  # a short ramp outwards
        soft = np.maximum(soft, np.where(co._dilate(grown, r), 1.0 - r / 7.0, 0.0))
    soft[grown] = 1.0
    return soft


def _seed(mask, at):
    s = np.zeros(mask.shape, dtype=bool)
    s[at] = True
    return s


def gate(cells):
    """One building with a door that moves, out of three of the same building."""
    base = cells[0].astype(np.float32)
    out = [cells[0]]
    for other in cells[1:]:
        m = door_mask(cells[0], other)
        if m is None:
            out.append(cells[0])
            continue
        w = m[:, :, None]
        out.append(np.clip(base * (1 - w) + other.astype(np.float32) * w, 0, 255).astype(np.uint8))
    return out


def holes(solid, cell):
    """Transparent pixels with art all the way round them, cell by cell."""
    out = np.zeros_like(solid)
    h, w = solid.shape
    for cy in range(0, h - cell + 1, cell):
        for cx in range(0, w - cell + 1, cell):
            box = solid[cy:cy + cell, cx:cx + cell]
            if not box.any():
                continue
            gap = ~box
            rim = np.zeros_like(box)
            rim[0, :] = rim[-1, :] = True
            rim[:, 0] = rim[:, -1] = True
            outside = co._reconstruct(rim & gap, gap, 1)
            out[cy:cy + cell, cx:cx + cell] = gap & ~outside
    return out


def mend(rgba, cell):
    """
    Put back what the cut took out of the middle of a drawing.

    A helmet is grey steel and the backdrop is grey squares, so the checker
    model — which removes any pixel holding exactly the tone its square should
    hold, reachable or not — punches a few of them out of the helmet as well.
    Anything the cut left surrounded by art on every side was art, so it is
    made opaque again and its colour grown in from the pixels around it.
    """
    solid = rgba[:, :, 3] >= SOLID
    gap = holes(solid, cell)
    if not gap.any():
        return rgba, 0
    total = int(gap.sum())
    rgba[:, :, 3] = np.where(gap, 255, rgba[:, :, 3])
    todo = gap.copy()
    for _ in range(8):
        if not todo.any():
            break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src = np.roll(np.roll(rgba, dy, axis=0), dx, axis=1)
            ok = np.roll(np.roll(~todo & (solid | ~gap), dy, axis=0), dx, axis=1)
            take = todo & ok
            rgba[take] = src[take]
            todo &= ~take
    return rgba, total


#: how thin a join has to be before it is a leftover hanging off the drawing
BRIDGE = 2
#: a leftover is grey and light: the backdrop's own two tones, plus the
#: ringing round a hard edge that put them slightly out
LITTER_SPREAD = 26
LITTER_DARK = 120


def outsiders(grid, cell):
    """
    Backdrop squares still hanging off the drawing after the cut.

    A checkerboard photographs badly against a black outline: the squares
    nearest one are pulled off their tone by the ringing, so neither the two
    tones read off the border nor the pattern test recognises them, and they
    survive as a dissolving fringe of grey blocks.

    What they never are is part of the drawing. They touch it by a pixel or
    two at most, so the drawing is taken to be what survives being eroded and
    grown back from its own feet — thin joins do not survive that, and a
    sword blade does. Anything left outside it that is grey and light was
    backdrop.
    """
    solid = grid[:, :, 3] > SOLID
    rgb = grid[:, :, :3].astype(np.int16)
    grey = ((rgb.max(axis=2) - rgb.min(axis=2)) <= LITTER_SPREAD) & \
           (rgb.mean(axis=2) >= LITTER_DARK)
    out = np.zeros_like(solid)
    h, w = solid.shape
    for cy in range(0, h - cell + 1, cell):
        for cx in range(0, w - cell + 1, cell):
            box = solid[cy:cy + cell, cx:cx + cell]
            if not box.any():
                continue
            seed = np.zeros_like(box)
            seed[int(cell * 0.55):int(cell * 0.92), int(cell * 0.32):int(cell * 0.68)] = True
            core = co._erode(box, BRIDGE)
            body = co._dilate(co._reconstruct(seed & core, core, 1), BRIDGE) & box
            out[cy:cy + cell, cx:cx + cell] = box & ~body
    return out & grey


def settle(grid, cell, ground):
    """
    Stand every drawing up again once the backdrop's leftovers are gone.

    The first pass measures where a drawing stands before anything has been
    swept up, so a smear of backdrop under a boot counts as the boot and the
    soldier is planted that much too high. Sweeping then leaves him hanging.
    Measuring a second time, on what is left, costs nothing and is the only
    honest place to do it — there is no telling litter from feet until the
    litter is gone.
    """
    h, w = grid.shape[:2]
    moved = 0
    for cy in range(0, h - cell + 1, cell):
        for cx in range(0, w - cell + 1, cell):
            box = grid[cy:cy + cell, cx:cx + cell]
            f = foot(box[:, :, 3])
            if f is None:
                continue
            dx, dy = int(round(cell / 2 - f[0])), int(round(ground - f[1]))
            if not dx and not dy:
                continue
            moved = max(moved, abs(dx), abs(dy))
            shifted = np.zeros_like(box)
            sy0, dy0 = max(0, -dy), max(0, dy)
            sx0, dx0 = max(0, -dx), max(0, dx)
            hh, ww = cell - abs(dy), cell - abs(dx)
            shifted[dy0:dy0 + hh, dx0:dx0 + ww] = box[sy0:sy0 + hh, sx0:sx0 + ww]
            grid[cy:cy + cell, cx:cx + cell] = shifted
    return grid, moved


def clean(grid, cell):
    """Drop the backdrop's leftovers and mend what it took by mistake."""
    neutral = (grid[:, :, :3].max(axis=2).astype(np.int16)
               - grid[:, :, :3].min(axis=2)) <= co.NEUTRAL
    litter = co.drop_stragglers(grid[:, :, 3] > SOLID, neutral, cell)
    litter |= co._dilate(outsiders(grid, cell), 2)
    grid[:, :, 3] *= ~litter
    grid, mended = mend(grid, cell)
    return grid, int(litter.sum()), mended


def finish(grid, cell, ground, stripped):
    """Sweep up after the cut, mend it, and stand everything up straight."""
    if not stripped:
        return grid, ""
    grid, litter, mended = clean(grid, cell)
    grid, moved = settle(grid, cell, ground)
    return grid, (f", {litter} px of backdrop swept up, {mended} mended, "
                  f"{moved}px of standing up again")


def sheet_of(pack, rel):
    """The sheet, and whether the backdrop had to be cut out of it."""
    src = Image.open(os.path.join(pack, rel)).convert("RGBA")
    if np.asarray(src)[:, :, 3].min() > 0:               # backdrop painted in
        rgba = co.strip(src)
        if rgba is None:
            print(f"  !! {rel}: no backdrop found, and no alpha either")
            return src, False
        return Image.fromarray(rgba, "RGBA"), True
    return src, False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    pack = sys.argv[1]
    manifest = json.load(open(os.path.join(pack, "manifest.json"), encoding="utf-8"))
    squads = {s["level"]: s for s in manifest["squads"]}

    for level in (1, 2, 3):
        # ---- the building -------------------------------------------------
        sheet, stripped = sheet_of(pack, f"barracks/level_{level}/gate.png")
        grid, drift = relay(sheet, 4, 4, KEEP_CELL, KEEP_GROUND)
        grid, _ = finish(grid, KEEP_CELL, KEEP_GROUND, stripped)
        out = np.zeros((4 * KEEP_CELL, len(PHASES) * KEEP_CELL, 4), dtype=np.uint8)
        for r in range(4):
            row = [grid[r * KEEP_CELL:(r + 1) * KEEP_CELL, p * KEEP_CELL:(p + 1) * KEEP_CELL]
                   for p in PHASES]
            for c, frame in enumerate(gate(row)):
                out[r * KEEP_CELL:(r + 1) * KEEP_CELL, c * KEEP_CELL:(c + 1) * KEEP_CELL] = frame
        os.makedirs(os.path.join(OUT, "barracks"), exist_ok=True)
        dst = os.path.join(OUT, "barracks", f"level_{level}.webp")
        Image.fromarray(out, "RGBA").save(dst, "WEBP", quality=94, method=6)
        print(f"  barracks level {level}: 4 facings x {len(PHASES)} phases, "
              f"drawings were up to {drift:.0f}px off centre, "
              f"{os.path.getsize(dst) / 1024:.0f} kB")

        # ---- its garrison --------------------------------------------------
        unit = squads[level]["unit"]
        folder = os.path.join(OUT, "soldiers", f"level_{level}")
        os.makedirs(folder, exist_ok=True)
        for action in ("idle", "walk", "attack", "death"):
            sheet, stripped = sheet_of(pack, f"units/level_{level}/{action}.png")
            grid, drift = relay(sheet, 4, 6, UNIT_CELL, UNIT_GROUND)
            grid, note = finish(grid, UNIT_CELL, UNIT_GROUND, stripped)
            dst = os.path.join(folder, f"{action}.webp")
            Image.fromarray(grid, "RGBA").save(dst, "WEBP", quality=94, method=6)
            print(f"    {unit:8} {action:6}: 4 facings x 6 frames, "
                  f"up to {drift:.0f}px off centre{note}, "
                  f"{os.path.getsize(dst) / 1024:.0f} kB")


if __name__ == "__main__":
    main()
