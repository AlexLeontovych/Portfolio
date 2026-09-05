# -*- coding: utf-8 -*-
"""
Bake the card poster for the tower defense.

The card used to advertise the game with a board drawn in code — a green
field, an S of road and two blocky towers — which stopped being honest the
moment the game got painted maps and painted towers. It now shows the game.

Baked rather than drawn live, because the alternative is the landing page
pulling a 430 kB map and a 620 kB atlas before anyone has clicked anything.
This is one 16:9 still of about fifty.

Usage:
    python scripts/td_poster.py
"""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TD = os.path.join(ROOT, "public", "games", "td")
ART = os.path.join(ROOT, "art-src", "td")
OUT = os.path.join(TD, "poster.webp")

#: the board, and the window onto it the poster shows
BOARD = (960, 540)
CROP = (118, 84, 806, 471)          # 688x387, near enough 16:9
SIZE = (640, 360)

#: which tower stands on which pad, and the frame it is caught on
CAST = [
    ("t.crossbow.2.r", 2, (192, 161)),
    ("t.magic.3.d", 3, (313, 246)),
    ("t.cannon.1.l", 2, (633, 202)),
    ("t.rocket.2.d", 3, (196, 331)),
]
#: creeps on the road, as a fraction along it
CREEPS = [(0.31, "goblin"), (0.38, "mushroom"), (0.62, "goblin")]
#: a shell in flight, so the firing tower has something to have fired
SHOT = ("p.bomb", (690, 250), -0.5)
CREEP_H = 44


def sprite(atlas, index, name, frame):
    e = index[name]
    per = e.get("row") or e["n"]
    f = frame % e["n"]
    box = (e["x"] + (f % per) * e["w"], e["y"] + (f // per) * e["h"],
           e["x"] + (f % per + 1) * e["w"], e["y"] + (f // per + 1) * e["h"])
    return atlas.crop(box), (e["ax"], e["ay"])


def along(road, frac):
    """A point a fraction of the way along the road, and its heading."""
    pts = [tuple(p) for p in road]
    seg = [np.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
           for i in range(len(pts) - 1)]
    total = sum(seg)
    want = frac * total
    run = 0.0
    for i, d in enumerate(seg):
        if run + d >= want:
            t = (want - run) / (d or 1)
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            return (ax + (bx - ax) * t, ay + (by - ay) * t), (bx - ax, by - ay)
        run += d
    return pts[-1], (1, 0)


def creep(kind, height):
    """One frame of a walking creep from the platformer's sheets."""
    p = os.path.join(ROOT, "public", "games", "platformer", "enemies", kind, "run.png")
    if not os.path.exists(p):
        return None
    sheet = Image.open(p).convert("RGBA")
    n = 8
    fw = sheet.width // n
    fr = sheet.crop((fw * 2, 0, fw * 3, sheet.height))
    a = np.asarray(fr)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    if not xs.size:
        return None
    fr = fr.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    k = height / fr.height
    return fr.resize((max(1, round(fr.width * k)), height), Image.LANCZOS)


def main():
    index = json.load(open(os.path.join(TD, "atlas.json"), encoding="utf-8"))
    atlas = Image.open(os.path.join(TD, index["image"])).convert("RGBA")
    frames = index["frames"]
    maps = json.load(open(os.path.join(ART, "maps.json"), encoding="utf-8"))["oasis"]
    board = Image.open(os.path.join(TD, "maps", "oasis.webp")).convert("RGBA") \
        .resize(BOARD, Image.LANCZOS)

    # creeps first: a tower on a pad in front of one has to cover it
    for frac, kind in CREEPS:
        (x, y), _ = along(maps["road"], frac)
        c = creep(kind, CREEP_H)
        if c is None:
            continue
        shadow = Image.new("RGBA", (c.width, 8), (0, 0, 0, 0))
        Image.Image.paste(shadow, Image.new("RGBA", (c.width - 6, 6), (0, 0, 0, 70)), (3, 1))
        board.alpha_composite(shadow, (int(x - c.width / 2), int(y - 4)))
        board.alpha_composite(c, (int(x - c.width / 2), int(y - c.height)))

    for name, frame, (px, py) in CAST:
        if name not in frames:
            print(f"  !! {name} is not in the atlas")
            continue
        fr, (ax, ay) = sprite(atlas, frames, name, frame)
        board.alpha_composite(fr, (int(round(px - ax)), int(round(py - ay))))

    if SHOT[0] in frames:
        fr, (ax, ay) = sprite(atlas, frames, SHOT[0], 0)
        fr = fr.rotate(np.degrees(SHOT[2]), resample=Image.BICUBIC, expand=True)
        board.alpha_composite(fr, (int(SHOT[1][0] - fr.width / 2),
                                   int(SHOT[1][1] - fr.height / 2)))

    over = os.path.join(TD, "maps", "oasis.over.webp")
    if os.path.exists(over):
        board.alpha_composite(Image.open(over).convert("RGBA").resize(BOARD, Image.LANCZOS))

    poster = board.crop(CROP).resize(SIZE, Image.LANCZOS).convert("RGB")
    poster.save(OUT, "WEBP", quality=80, method=6)
    print(f"poster {SIZE[0]}x{SIZE[1]}, {os.path.getsize(OUT) / 1024:.0f} kB -> "
          f"{os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
