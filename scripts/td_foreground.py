# -*- coding: utf-8 -*-
"""
Take in the drafts that say WHICH parts of a map stand in front.

The drafts are redrawn foregrounds, one per map, and their own manifest is
honest about what they are: no alpha, the checkerboard painted into the
picture, and shapes that moved while they were being drawn. They cannot be
laid over the maps and are not meant to be.

What they are good for is the one thing that could not be worked out from the
map alone: which of the things beside a road are in front of it. So the
backdrop comes off, and what is left is kept as a MASK — the pixels the game
draws come from the real map, at the real map's coordinates, and the draft
only ever chooses them. A shape that moved by a few pixels while it was drawn
therefore costs nothing: the choosing is generous, and the cutting is exact.

Usage:
    python scripts/td_foreground.py <folder the pack extracted into>

Writes art-src/td/foreground/<map id>.webp, which scripts/td_props.py reads.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_cutout as co                                      # noqa: E402
import td_from_annotation as fa                             # noqa: E402

OUT = os.path.join(fa.ART, "foreground")


def match(sheet):
    """Which of our maps this folder is, decided on its own copy of it."""
    a = np.asarray(sheet.convert("RGB").resize((240, 135), Image.LANCZOS), dtype=np.float32)
    best, score = None, 1e9
    for mid in ("oasis", "canyon", "crystal", "frost", "forge"):
        p = os.path.join(fa.ART, "maps", f"{mid}.webp")
        b = np.asarray(Image.open(p).convert("RGB").resize((240, 135), Image.LANCZOS),
                       dtype=np.float32)
        d = float(np.abs(a - b).mean())
        if d < score:
            best, score = mid, d
    return best, score


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    pack = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    for folder in sorted(os.listdir(pack)):
        draft = os.path.join(pack, folder, "foreground_DRAFT.png")
        original = os.path.join(pack, folder, "original_map.png")
        if not os.path.exists(draft) or not os.path.exists(original):
            continue
        mid, score = match(Image.open(original))
        if score > 8:
            print(f"  !! {folder}: no map of ours looks like its copy ({score:.1f})")
            continue
        rgba = co.strip(Image.open(draft).convert("RGBA"))
        if rgba is None:
            print(f"  !! {folder}: no backdrop to take off")
            continue
        kept = (rgba[:, :, 3] > 24).mean() * 100
        dst = os.path.join(OUT, f"{mid}.webp")
        Image.fromarray(rgba, "RGBA").save(dst, "WEBP", quality=90, method=6)
        print(f"  {folder:8} is our {mid:8} ({score:.2f}) — {kept:4.1f}% of it is "
              f"foreground, {os.path.getsize(dst) / 1024:.0f} kB")
    print("  now run scripts/td_props.py")


if __name__ == "__main__":
    main()
