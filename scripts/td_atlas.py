# -*- coding: utf-8 -*-
"""
Build the tower-defense sprite atlas.

The game draws everything from one texture. This script cuts the frames it
needs out of the source sheets, trims the transparent margin off them, scales
each down to the size it is drawn at, and bakes the result into
public/games/td/atlas.webp plus an index in atlas.json.

Two kinds of source:

  art-src/td/*.webp   towers, projectiles and the blast — art generated for
                      this project, versioned with it.

  a local pack copy   Tiny Swords, the Zerie character packs and the
                      GandalfHardcore archer. Those are free to use in a game
                      but may NOT be redistributed, and this repository is
                      public, so the packs themselves stay off it. Pass the
                      folder they are extracted into to include them; without
                      it those sprites are skipped and the atlas simply comes
                      out smaller.

Trimming matters as much as scaling: several packs park a 17px character in
the middle of a 100x100 cell, which would otherwise cost 35x its own area in
the atlas. Frames of one animated thing are trimmed to a SHARED box (their
`group`), so a sprite does not jump when it switches animation.

Usage:
    python scripts/td_atlas.py [path to extracted packs]
"""
import json
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "games", "td")
ART = os.path.join(ROOT, "art-src", "td")

# The restricted packs, by the folder each extracts into.
PACKS = {
    "ts": "Tiny_Swords_Free_Pack_zip/Tiny Swords (Free Pack)",
    "tsu": "Tiny_Swords_zip/Tiny Swords (Update 010)",
    "z1": ("Tiny_RPG_Character_Asset_Pack_01_v2_0_Fr/"
           "Tiny RPG Character Asset Pack 01 v2.0 -Free Soldier&Orc/Characters(100x100 split)"),
    "z2": ("Tiny_RPG_Character_Asset_Pack_02_v1_01_F/"
           "Tiny RPG Character Asset Pack 02 -Free Demon_A&Blood Monster_A/Characters(100x100 split)"),
    "ar": "GandalfHardcore_Archer_zip/GandalfHardcore Archer",
}

# name, pack, file, cell w, cell h, sheet columns, first cell, frames, drawn
# height, group.
#
# Cells are numbered left to right then down across the whole sheet, so one
# sheet can hold several sprites: the projectile row and the blast below it
# are four entries into the same grid. `draw` is the height the CONTENT is
# drawn at on the 960x540 board — the transparent margin is trimmed away, so
# it is the height you actually see. Sprites sharing a `group` are trimmed to
# one box and scaled together, and the group's FIRST entry sets that scale.
SPRITES = [
    # --- towers: six frames each, frame 0 idle, 1-5 the shot ---------------
    ("t.crossbow", "ai", "tower-crossbow.webp", 512, 512, 3, 0, 6, 88, None),
    ("t.cannon",   "ai", "tower-cannon.webp",   512, 512, 3, 0, 6, 88, None),
    ("t.gatling",  "ai", "tower-gatling.webp",  512, 512, 3, 0, 6, 88, None),
    ("t.mage",     "ai", "tower-mage.webp",     512, 512, 3, 0, 6, 92, None),

    # --- what they fire, and what it does on arrival ------------------------
    ("p.arrow",  "ai", "shots-and-blast.webp", 384, 341, 4, 0, 1, 26, None),
    ("p.bomb",   "ai", "shots-and-blast.webp", 384, 341, 4, 1, 1, 20, None),
    ("p.bolt",   "ai", "shots-and-blast.webp", 384, 341, 4, 2, 1, 28, None),
    ("p.rocket", "ai", "shots-and-blast.webp", 384, 341, 4, 3, 1, 26, None),
    ("fx.blast", "ai", "shots-and-blast.webp", 384, 341, 4, 4, 8, 76, None),

    # --- the dark side: what walks the road ---------------------------------
    ("orc.walk",   "z1", "Orc/Orc/Orc_Walk.png",     100, 100, 8, 0, 8, 30, "orc"),
    ("orc.attack", "z1", "Orc/Orc/Orc_Attack01.png", 100, 100, 6, 0, 6, 30, "orc"),
    ("orc.death",  "z1", "Orc/Orc/Orc_Death.png",    100, 100, 4, 0, 4, 30, "orc"),
    ("demon.walk",   "z2", "Demon_A/Demon_A/Demon_A_Walk.png",
                                                     100, 100, 8, 0, 8, 34, "demon"),
    ("demon.attack", "z2", "Demon_A/Demon_A/Demon_A_Attack01.png",
                                                     100, 100, 7, 0, 7, 34, "demon"),
    ("demon.death",  "z2", "Demon_A/Demon_A/Demon_A_Death.png",
                                                     100, 100, 4, 0, 4, 34, "demon"),
    ("blood.walk",   "z2", "Blood Monster_A/Blood Monster_A/Blood Monster_A_Walk.png",
                                                     100, 100, 8, 0, 8, 30, "blood"),
    ("blood.attack", "z2", "Blood Monster_A/Blood Monster_A/Blood Monster_A_Attack01.png",
                                                     100, 100, 8, 0, 8, 30, "blood"),
    ("blood.death",  "z2", "Blood Monster_A/Blood Monster_A/Blood Monster_A_Death.png",
                                                     100, 100, 4, 0, 4, 30, "blood"),

    # --- the defenders ------------------------------------------------------
    ("soldier.walk", "z1", "Soldier/Soldier/Soldier_Walk.png",
                                                     100, 100, 8, 0, 8, 28, "soldier"),
    ("soldier.atk",  "z1", "Soldier/Soldier/Soldier_Attack01.png",
                                                     100, 100, 6, 0, 6, 28, "soldier"),
    ("archer.idle",  "ts", "Units/Blue Units/Archer/Archer_Idle.png",
                                                     192, 192, 6, 0, 6, 34, "archer"),
    ("archer.shoot", "ts", "Units/Blue Units/Archer/Archer_Shoot.png",
                                                     192, 192, 8, 0, 8, 34, "archer"),
]

AI_ONLY = {"t", "p", "fx"}     # prefixes of the painted, project-owned art
PAD = 2
ALPHA = 12          # anything fainter than this is margin, not art


def load(spec, base):
    """Open a sheet and work out the pixel box of every cell the sprite uses."""
    name, pack, rel, cw, ch, sheet_cols, first, frames, draw, group = spec
    path = os.path.join(ART, rel) if pack == "ai" else (
        os.path.join(base, PACKS[pack], rel) if base else None)
    if path is None or not os.path.exists(path):
        return None

    im = Image.open(path).convert("RGBA")
    boxes = []
    for i in range(first, first + frames):
        cx, cy = i % sheet_cols, i // sheet_cols
        boxes.append((cx * cw, cy * ch, (cx + 1) * cw, (cy + 1) * ch))
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    if im.width < x1 or im.height < y1:
        print(f"  !! {name}: sheet is {im.size} but frames {first}..{first + frames - 1}"
              f" of a {sheet_cols}-wide grid of {cw}x{ch} need {x1}x{y1} — check the grid")
        return None
    return {"name": name, "im": im, "cw": cw, "boxes": boxes,
            "draw": draw, "group": group or name}


def content_box(im, boxes):
    """Union alpha bounding box over `boxes`, in cell-local coordinates."""
    a = np.asarray(im)[:, :, 3]
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for (bx0, by0, bx1, by1) in boxes:
        ys, xs = np.nonzero(a[by0:by1, bx0:bx1] > ALPHA)
        if not xs.size:
            continue
        x0 = min(x0, int(xs.min())); x1 = max(x1, int(xs.max()) + 1)
        y0 = min(y0, int(ys.min())); y1 = max(y1, int(ys.max()) + 1)
    return None if x1 < 0 else (x0, y0, x1, y1)


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else None
    if base and not os.path.isdir(base):
        print(f"no such folder: {base}")
        raise SystemExit(2)

    sheets = []
    for spec in SPRITES:
        s = load(spec, base)
        if s is None:
            print(f"  -- skipped, source not present: {spec[0]}")
            continue
        s["own"] = content_box(s["im"], s["boxes"])
        if s["own"] is None:
            print(f"  !! {s['name']}: every frame is empty")
            continue
        sheets.append(s)

    # One trim box and one scale per group. `ref` is the first sheet listed:
    # an attack frame reaches further than the body, and the body is what
    # `draw` describes, so the swing must not shrink the character.
    groups = {}
    for s in sheets:
        g = groups.get(s["group"])
        if g is None:
            groups[s["group"]] = {"box": s["own"], "ref": s["own"], "draw": s["draw"]}
            continue
        b, o = g["box"], s["own"]
        g["box"] = (min(b[0], o[0]), min(b[1], o[1]), max(b[2], o[2]), max(b[3], o[3]))

    cut = []
    for s in sheets:
        g = groups[s["group"]]
        bx0, by0, bx1, by1 = g["box"]
        scale = g["draw"] / (g["ref"][3] - g["ref"][1])
        fw, fh = bx1 - bx0, by1 - by0
        nw, nh = max(1, round(fw * scale)), max(1, round(fh * scale))
        n = len(s["boxes"])

        strip = Image.new("RGBA", (fw * n, fh), (0, 0, 0, 0))
        for i, (cx0, cy0, _, _) in enumerate(s["boxes"]):
            strip.paste(s["im"].crop((cx0 + bx0, cy0 + by0, cx0 + bx1, cy0 + by1)),
                        (i * fw, 0))
        cut.append({
            "name": s["name"], "img": strip.resize((nw * n, nh), Image.LANCZOS),
            "fw": nw, "fh": nh, "n": n,
            # Where the cell's centre-bottom sits inside the trimmed frame.
            # The engine anchors on that, so a sprite stands on the road at
            # the spot its author drew it standing, and a swing that widens
            # the trim box does not shove it sideways.
            "ax": round((s["cw"] / 2 - bx0) * scale, 1),
            "ay": round((g["ref"][3] - by0) * scale, 1),
        })

    # shelf pack, tallest first — good enough for a few dozen strips and it
    # keeps the atlas close to square without a bin-packing library
    cut.sort(key=lambda c: -c["img"].height)
    width = 1024
    x = y = shelf = 0
    for c in cut:
        w, h = c["img"].size
        if x + w + PAD > width:
            x, y, shelf = 0, y + shelf + PAD, 0
        c["x"], c["y"] = x, y
        x += w + PAD
        shelf = max(shelf, h)
    height = y + shelf + PAD

    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    index = {}
    for c in cut:
        atlas.paste(c["img"], (c["x"], c["y"]), c["img"])
        index[c["name"]] = {"x": c["x"], "y": c["y"], "w": c["fw"], "h": c["fh"],
                            "n": c["n"], "ax": c["ax"], "ay": c["ay"]}

    # WebP, and lossy unless there is pixel art in here: the painted sheets
    # are three times smaller for no visible loss, but lossy ringing around a
    # hard 1px edge is exactly what pixel art is made of.
    pixel = any(c["name"].split(".")[0] not in AI_ONLY for c in cut)
    out = os.path.join(OUT_DIR, "atlas.webp")
    os.makedirs(OUT_DIR, exist_ok=True)
    atlas.save(out, "WEBP", method=6, lossless=pixel, quality=90)
    with open(os.path.join(OUT_DIR, "atlas.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, sort_keys=True)

    kb = os.path.getsize(out) / 1024
    print(f"\n{len(cut)} sprites -> atlas {width}x{height}, {kb:.0f} kB")
    for n in sorted(index):
        e = index[n]
        print(f"  {n:13} {e['n']:2} x {e['w']:3}x{e['h']:<3} "
              f"anchor {e['ax']:5.1f},{e['ay']:5.1f}")


if __name__ == "__main__":
    main()
