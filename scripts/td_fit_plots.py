# -*- coding: utf-8 -*-
"""
Pull each hand-placed build pad onto the middle of the pad that is painted
there.

Finding the pads from scratch failed on every biome, but refining a guess is a
much smaller problem: the pad under the guess is a disc of one colour walled
in by a rim of another, so growing the guess through that colour and taking
the centre of what it reaches lands on the pad exactly. If the growth escapes
— a broken rim, a guess that missed — the area gives it away and the guess is
left alone.

Run it after adding or moving a pad in art-src/td/maps.json; it rewrites the
file in place and drops an overlay per map into art-src/td/traces.
"""
import json
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art-src", "td")
OUT = os.path.join(ART, "traces")
W, H = 960, 540

TOL = 58            # colour distance, summed over r+g+b
MAX_MOVE = 26       # a refinement, not a search
AREA = (600, 5200)  # a pad's face, in board pixels


def blob(a, x, y):
    """The patch of pad-coloured pixels reachable from (x, y)."""
    x0, y0 = max(0, x - 60), max(0, y - 60)
    win = a[y0:min(H, y + 60), x0:min(W, x + 60)]
    key = np.median(win[y - y0 - 5:y - y0 + 6, x - x0 - 5:x - x0 + 6]
                    .reshape(-1, 3), axis=0)
    mask = np.abs(win - key).sum(axis=2) < TOL

    seed = np.zeros_like(mask)
    seed[y - y0, x - x0] = True
    while True:
        grown = seed.copy()
        grown[1:] |= seed[:-1]
        grown[:-1] |= seed[1:]
        grown[:, 1:] |= seed[:, :-1]
        grown[:, :-1] |= seed[:, 1:]
        grown &= mask
        if grown.sum() == seed.sum():
            break
        seed = grown
    ys, xs = np.nonzero(seed)
    if not xs.size:
        return None, 0
    return (float(xs.mean()) + x0, float(ys.mean()) + y0), int(xs.size)


def main():
    data = json.load(open(os.path.join(ART, "maps.json"), encoding="utf-8"))
    for mid, m in data.items():
        im = (Image.open(os.path.join(ART, "maps", m["source"]))
              .convert("RGB").resize((W, H), Image.LANCZOS))
        a = np.asarray(im, dtype=np.int16)
        out, moved, kept = [], 0, 0
        for (x, y) in m["plots"]:
            c, area = blob(a, int(x), int(y))
            if c is None or not (AREA[0] <= area <= AREA[1]):
                out.append([x, y])
                kept += 1
                continue
            dx, dy = c[0] - x, c[1] - y
            d = (dx * dx + dy * dy) ** 0.5
            if d > MAX_MOVE:
                dx, dy = dx / d * MAX_MOVE, dy / d * MAX_MOVE
            out.append([round(x + dx), round(y + dy)])
            moved += 1
        m["plots"] = out
        print(f"{mid}: {moved} pads fitted, {kept} left as traced")

        d = ImageDraw.Draw(im, "RGBA")
        d.line([tuple(p) for p in m["road"]], fill=(255, 40, 90, 210), width=3)
        for i, (x, y) in enumerate(out):
            d.ellipse([x - 27, y - 27, x + 27, y + 27], outline=(70, 255, 140), width=3)
            d.text((x - 4, y - 5), str(i), fill=(255, 255, 255))
        os.makedirs(OUT, exist_ok=True)
        im.save(os.path.join(OUT, f"pads_{mid}.png"))

    json.dump(data, open(os.path.join(ART, "maps.json"), "w", encoding="utf-8"), indent=1)
    print("maps.json updated")


if __name__ == "__main__":
    main()
