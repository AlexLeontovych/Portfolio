# -*- coding: utf-8 -*-
"""
Build the tower-defense sprite atlas.

The game draws everything from one texture. This script cuts the frames it
needs out of the source sheets, trims the transparent margin off them, scales
each down to the size it is drawn at, and bakes the result into
public/games/td/atlas.<hash>.webp plus an index in atlas.json that names it.

Two kinds of source:

  art-src/td/         towers, projectiles and the blast — art generated for
                      this project, versioned with it. The tower sheets come
                      out of scripts/td_cutout.py.

  a local pack copy   Tiny Swords, the Zerie character packs and the
                      GandalfHardcore archer. Those are free to use in a game
                      but may NOT be redistributed, and this repository is
                      public, so the packs themselves stay off it. Pass the
                      folder they are extracted into to include them; without
                      it those sprites are skipped and the atlas simply comes
                      out smaller.

Trimming matters as much as scaling: several packs park a 17px character in
the middle of a 100x100 cell, which would otherwise cost 35x its own area in
the atlas. Each sheet is trimmed to its own frames, and sprites that belong
together (their `group`) share a SCALE rather than a box — the anchor is
measured back to the source cell, so a tower still lands on the same spot
when it upgrades to art with a different outline.

Usage:
    python scripts/td_atlas.py [path to extracted packs]
"""
import glob
import hashlib
import io
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
#: the four rows of a tower sheet, top to bottom
FACINGS = "urdl"
# Which frame a sprite STANDS in, where that is not the first one.
#
# A tower spends most of the game on frame 0 and runs the other five when it
# fires. The level-two cannon facing away is drawn resting with both barrels
# lowered, and from behind two lowered barrels read as one — the level-one
# silhouette exactly. Frame 1 is the same tower with the barrels up, which is
# what tells you it is a level two, and the shot then starts from the pose it
# was already standing in.
REST = {
    "t.cannon.2.u": 1,
}
TOWER_KINDS = ("crossbow", "cannon", "magic", "rocket")
#: height a tower's trimmed frame is drawn at on the 960x540 board
TOWER_DRAW = 68
#: the barracks and the men it puts on the road, from scripts/td_barracks.py
KEEP_CELL, KEEP_DRAW, GATE_PHASES = 352, 74, 3
UNIT_CELL, SQUAD_DRAW = 288, 32
SQUADS = {1: "recruit", 2: "knight", 3: "paladin"}
ACTIONS = ("idle", "walk", "attack", "death")

# One entry per kind, tier and facing: six firing frames each. Splitting the
# facings apart rather than keeping all twenty-four together is what keeps the
# atlas small — a muzzle flash pointing left should not pad out the frame of a
# tower firing up. All of a kind's entries share a group, so every tier and
# every facing is drawn at one scale and upgrading grows the tower in place.
SPRITES = [
    (f"t.{kind}.{tier}.{FACINGS[d]}", "ai", f"towers/{kind}/level_{tier}.webp",
     256, 256, 6, d * 6, 6, TOWER_DRAW, kind)
    for kind in TOWER_KINDS
    for tier in (1, 2, 3)
    for d in range(4)
] + [
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

] + [
    # --- the barracks: one building per tier, four sides, a door that opens --
    (f"b.keep.{tier}.{FACINGS[d]}", "ai", f"barracks/level_{tier}.webp",
     KEEP_CELL, KEEP_CELL, GATE_PHASES, d * GATE_PHASES, GATE_PHASES,
     KEEP_DRAW, f"keep.{FACINGS[d]}")
    for tier in (1, 2, 3)
    for d in range(4)
] + [
    # --- and its garrison: a recruit, then knights, then paladins -----------
    #
    # Four sides of four actions of six frames, for each of three tiers. They
    # are grouped by SIDE rather than by man, because the pack drew the front
    # view a fifth taller than the back and one scale for all four would make
    # a soldier grow every time he turned round. Grouped this way each side is
    # scaled to the same drawn height and turning changes nothing but the pose.
    (f"s.{SQUADS[tier]}.{act}.{FACINGS[d]}", "ai", f"soldiers/level_{tier}/{act}.webp",
     UNIT_CELL, UNIT_CELL, 6, d * 6, 6, SQUAD_DRAW, f"squad.{FACINGS[d]}")
    for tier in (1, 2, 3)
    for act in ACTIONS
    for d in range(4)
]

AI_ONLY = {"t", "p", "fx", "b", "s"}   # prefixes of the painted, project-owned art
WIDTH = 1024        # atlas width; a sprite's frames wrap inside it
PAD = 2
ALPHA = 12          # anything fainter than this is margin, not art
SPECK = 4           # opaque pixels a row needs before it counts as content
#: Where in the base the anchor sits, as a fraction of the base's half-width
#: above its bottom edge.
#:
#: The towers were drawn from a lower camera than the maps, so a tower's own
#: footprint ellipse is flatter than the pad it stands on — 0.35 against the
#: pads' 0.7, measured off the twelve sheets. Put the anchor at the footprint's
#: own centre (0.35) and the tower rides high with a crescent of sand in front
#: of it; use the pad's aspect (0.7) and its base hangs over the pad's front
#: rim. Half way between is what reads as standing in the ring, and the three
#: towers were compared side by side on real pads to pick it.
FOOTPRINT = 0.5


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
    return {"name": name, "im": im, "cw": cw, "ch": ch, "boxes": boxes,
            "draw": draw, "group": group or name}


#: sprites whose frames are registered on the drawn base rather than the cell.
#: Buildings, all of them: what stands on a pad has to stand IN the ring, and
#: the ring's own aspect is not the building's — see FOOTPRINT.
ALIGN_BASE = set(TOWER_KINDS) | {f"keep.{d}" for d in FACINGS}
#: room left round a cell for the registration shifts
MARGIN = 48


def base_centre(alpha, half=None):
    """
    Where the base of a tower is in one frame: the centre of its ellipse.

    The frames were generated one at a time and the tower does not sit in
    the same place in any two of them — its base wanders by up to a fifth of
    the cell. So the cell is no guide to where the tower is; the drawing is.

    Sideways, the base is symmetric, so the midpoints of its lowest rows all
    lie on its centre line; the median of them is the centre, and nothing
    else — no flash, no smoke — ever reaches that low. Vertically, the
    centre of the disc sits half a base above its bottom edge; `half` is that
    height, measured once on the resting frame as the distance from the
    bottom up to the widest row, so a muzzle flash that happens to be wider
    than the base cannot pass itself off as the base's equator.

    Returns (x, y, half).
    """
    rows = np.nonzero((alpha > ALPHA).sum(axis=1) >= SPECK)[0]
    if not rows.size:
        return None
    top, bottom = int(rows[0]), int(rows[-1])
    foot = range(max(top, bottom - max(4, int((bottom - top) * 0.25))), bottom + 1)
    mids = []
    for y in foot:
        xs = np.nonzero(alpha[y] > ALPHA)[0]
        if xs.size:
            mids.append((int(xs[0]) + int(xs[-1])) / 2)
    if not mids:
        return None
    if half is None:
        # The footprint is the ellipse the drum stands on. Its lowest point is
        # the front of that ellipse and its widest columns are its sides, so
        # the vertical half-axis is how much lower the middle of the bottom
        # silhouette runs than its ends — measured, not assumed, because the
        # towers were drawn from a lower camera than the maps and their
        # footprints are flatter than the pads they stand on (0.35 against
        # 0.7). Assuming the pads' aspect put the anchor twice too high in the
        # sprite, which drew every tower low, sitting on its pad's front rim.
        lo = bottom - int((bottom - top) * 0.45)
        depth = (alpha[lo:bottom + 1] > ALPHA).sum(axis=0)
        solid = np.nonzero(depth >= (bottom - lo) * 0.55)[0]
        if solid.size < 8:
            solid = np.nonzero(depth >= max(1, depth.max() * 0.5))[0]
        half = FOOTPRINT * (int(solid[-1]) - int(solid[0])) / 2.0 if solid.size else (bottom - top) * 0.12
    return float(np.median(mids)), float(bottom - half), half


def register(s):
    """
    Re-lay a sprite's frames so the base is in the same place in every one.

    Each frame is measured, then pasted into a fresh cell shifted so its base
    centre lands where the sprite's median base centre is. From here on the
    sprite is treated like any other, except that its anchor is that base
    centre rather than the cell's bottom middle: the engine puts the anchor
    on the pad, so the tower stands in the ring rather than hovering above
    it, and turning or firing moves nothing but the turret.
    """
    im = s["im"]
    cw, ch = s["cw"], s["ch"] if "ch" in s else s["cw"]
    a = np.asarray(im)[:, :, 3]
    centres = []
    half = None
    for (x0, y0, x1, y1) in s["boxes"]:
        # the first frame is the resting pose and sets the base's height
        c = base_centre(a[y0:y1, x0:x1], half)
        if c is None:
            centres.append((cw / 2, ch))
            continue
        half = c[2] if half is None else half
        centres.append((c[0], c[1]))
    ax = float(np.median([c[0] for c in centres]))
    ay = float(np.median([c[1] for c in centres]))
    drift = max(abs(c[0] - ax) for c in centres), max(abs(c[1] - ay) for c in centres)

    W2, H2 = cw + 2 * MARGIN, ch + 2 * MARGIN
    sheet = Image.new("RGBA", (W2 * len(s["boxes"]), H2), (0, 0, 0, 0))
    boxes = []
    for i, ((x0, y0, x1, y1), (bx, by)) in enumerate(zip(s["boxes"], centres)):
        frame = im.crop((x0, y0, x1, y1))
        ox = i * W2 + MARGIN + int(round(ax - bx))
        oy = MARGIN + int(round(ay - by))
        sheet.paste(frame, (ox, oy), frame)
        boxes.append((i * W2, 0, (i + 1) * W2, H2))
    s["im"], s["boxes"], s["cw"], s["ch"] = sheet, boxes, W2, H2
    s["base"] = (MARGIN + ax, MARGIN + ay)
    s["drift"] = drift


def content_box(im, boxes):
    """
    Union alpha bounding box over `boxes`, in cell-local coordinates.

    A row counts as content only once a few pixels of it are opaque. A single
    stray pixel left over from cutting a background would otherwise stretch
    the box to the whole cell, and every frame in the atlas would carry that
    emptiness — on a 288-frame tower set that is the difference between a
    quarter-megabyte atlas and a whole one.
    """
    a = np.asarray(im)[:, :, 3]
    cols = None
    rows = None
    for (bx0, by0, bx1, by1) in boxes:
        m = a[by0:by1, bx0:bx1] > ALPHA
        cols = m.sum(axis=0) if cols is None else np.maximum(cols, m.sum(axis=0))
        rows = m.sum(axis=1) if rows is None else np.maximum(rows, m.sum(axis=1))
    xs = np.nonzero(cols >= SPECK)[0]
    ys = np.nonzero(rows >= SPECK)[0]
    if not xs.size or not ys.size:
        return None
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


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
        if s["group"] in ALIGN_BASE:
            register(s)
        s["own"] = content_box(s["im"], s["boxes"])
        if s["own"] is None:
            print(f"  !! {s['name']}: every frame is empty")
            continue
        sheets.append(s)

    # One scale per group, taken from the first sheet listed. That sheet is
    # the resting pose, so a swing or a muzzle flash in a later sheet cannot
    # shrink the thing it belongs to.
    groups = {}
    for s in sheets:
        groups.setdefault(s["group"], {"ref": s["own"], "draw": s["draw"]})

    cut = []
    for s in sheets:
        g = groups[s["group"]]
        bx0, by0, bx1, by1 = s["own"]
        scale = g["draw"] / (g["ref"][3] - g["ref"][1])
        fw, fh = bx1 - bx0, by1 - by0
        nw, nh = max(1, round(fw * scale)), max(1, round(fh * scale))
        n = len(s["boxes"])

        # Lay the frames out in a grid rather than one long strip: a tower's
        # twenty-four frames are wider than the whole atlas, and a strip that
        # does not fit is a strip with frames missing.
        per_row = max(1, min(n, WIDTH // nw))
        grid_rows = -(-n // per_row)
        strip = Image.new("RGBA", (fw * per_row, fh * grid_rows), (0, 0, 0, 0))
        for i, (cx0, cy0, _, _) in enumerate(s["boxes"]):
            strip.paste(s["im"].crop((cx0 + bx0, cy0 + by0, cx0 + bx1, cy0 + by1)),
                        ((i % per_row) * fw, (i // per_row) * fh))
        cut.append({
            "name": s["name"],
            "img": strip.resize((nw * per_row, nh * grid_rows), Image.LANCZOS),
            "fw": nw, "fh": nh, "n": n, "per_row": per_row,
            # Where the cell's centre-bottom sits inside the trimmed frame.
            # The engine anchors on that, so a sprite stands on the road at
            # the spot its author drew it standing, and a swing that widens
            # the trim box does not shove it sideways.
            "ax": round(((s["base"][0] if "base" in s else s["cw"] / 2) - bx0) * scale, 1),
            "ay": round(((s["base"][1] if "base" in s else g["ref"][3]) - by0) * scale, 1),
        })
        if "drift" in s:
            print(f"  {s['name']:15} base drift before registration "
                  f"{s['drift'][0]:5.1f} x {s['drift'][1]:5.1f} px")

    # shelf pack, tallest first — good enough for a few dozen strips and it
    # keeps the atlas close to square without a bin-packing library
    cut.sort(key=lambda c: -c["img"].height)
    width = WIDTH
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
                            "n": c["n"], "row": c["per_row"],
                            "ax": c["ax"], "ay": c["ay"]}
        if c["name"] in REST:
            index[c["name"]]["rest"] = REST[c["name"]]

    # WebP, and lossy unless there is pixel art in here: the painted sheets
    # are three times smaller for no visible loss, but lossy ringing around a
    # hard 1px edge is exactly what pixel art is made of.
    pixel = any(c["name"].split(".")[0] not in AI_ONLY for c in cut)
    os.makedirs(OUT_DIR, exist_ok=True)
    # The image is named after its own contents and the index names it. A
    # browser holding yesterday's atlas.webp against today's atlas.json would
    # otherwise cut every frame from the wrong place — and it did, once: the
    # index is small and refetched, the image is large and cached.
    buf = io.BytesIO()
    atlas.save(buf, "WEBP", method=6, lossless=pixel, quality=84)
    data = buf.getvalue()
    stamp = hashlib.sha1(data).hexdigest()[:10]
    for old_file in glob.glob(os.path.join(OUT_DIR, "atlas*.webp")):
        os.remove(old_file)
    image = f"atlas.{stamp}.webp"
    out = os.path.join(OUT_DIR, image)
    with open(out, "wb") as f:
        f.write(data)
    with open(os.path.join(OUT_DIR, "atlas.json"), "w", encoding="utf-8") as f:
        json.dump({"image": image, "frames": index}, f, indent=1, sort_keys=True)

    kb = os.path.getsize(out) / 1024
    print(f"\n{len(cut)} sprites -> atlas {width}x{height}, {kb:.0f} kB")
    for n in sorted(index):
        e = index[n]
        print(f"  {n:13} {e['n']:2} x {e['w']:3}x{e['h']:<3} "
              f"{e['n'] // e['row'] + (1 if e['n'] % e['row'] else 0)} row(s) of {e['row']:2}"
              f"   anchor {e['ax']:5.1f},{e['ay']:5.1f}")


if __name__ == "__main__":
    main()
