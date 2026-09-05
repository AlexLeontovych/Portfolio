# -*- coding: utf-8 -*-
"""
Build the five level maps from a structured description, validate them, and
splice the resulting ASCII straight into level.ts.

Authoring 100-column ASCII rows by hand is how the exit ended up hanging one
tile past the ground. Here every feature is placed by column index and the
result is checked against the actual jump arc before it is written out.
"""
import io, os, re

W_GROUND_ROW = 17
H = 19
TILE = 32

# --- movement envelope, mirrored from engine.ts ---
GRAVITY, JUMP, RUN = 2800.0, 820.0, 285.0
RISE = JUMP * JUMP / (2 * GRAVITY)            # 120 units == 3.75 tiles
AIRTIME = 2 * JUMP / GRAVITY                  # 0.586 s
REACH = RUN * AIRTIME                         # 167 units == 5.2 tiles
MAX_CLIMB_ROWS = int(RISE // TILE)            # 3 tiles, safely
MAX_GAP = 4                                   # tiles of empty ground
PLAYER_H = 92                                 # the taller hero's collision box

Level = dict


def make(name, biome, width, par, ground, plats, items, enemies, checkpoints=(), boss=None):
    rows = [[" "] * width for _ in range(H)]

    def put(r, c, ch):
        if 0 <= r < H and 0 <= c < width:
            rows[r][c] = ch

    for a, b in ground:
        for c in range(a, b + 1):
            put(W_GROUND_ROW, c, "#")
            put(W_GROUND_ROW + 1, c, "#")
    for r, a, b, kind in plats:
        for c in range(a, b):
            put(r, c, "#" if kind == "solid" else "=")
    for r, c, ch in items:
        put(r, c, ch)
    for r, c, ch in enemies:
        put(r, c, ch)
    for c in checkpoints:
        put(W_GROUND_ROW - 1, c, "!")
    if boss:
        put(boss[0], boss[1], "B")

    return {"name": name, "biome": biome, "width": width, "par": par,
            "rows": ["".join(r).rstrip() for r in rows],
            "ground": ground, "plats": plats}


def surface_at(lv, col):
    """Row index of the topmost walkable surface in this column, or None."""
    for r in range(H):
        ch = lv["rows"][r][col] if col < len(lv["rows"][r]) else " "
        if ch in "#=":
            return r
    return None


def validate(lv):
    errs = []
    rows, width = lv["rows"], lv["width"]

    def at(r, c):
        line = rows[r] if r < len(rows) else ""
        return line[c] if c < len(line) else " "

    # 1. ground gaps a jump can actually clear
    solid_cols = {c for c in range(width) if at(W_GROUND_ROW, c) == "#"}
    run = 0
    for c in range(width):
        if c in solid_cols:
            if run > MAX_GAP:
                errs.append(f"pit of {run} tiles ending at col {c} (max {MAX_GAP})")
            run = 0
        else:
            run += 1

    # 2. everything that stands must stand on something
    for r in range(H):
        for c in range(width):
            ch = at(r, c)
            if ch in "PmgsEB!":
                below = at(r + 1, c)
                if below not in "#=":
                    errs.append(f"'{ch}' at r{r} c{c} has no floor under it")

    # 3. every platform must be reachable from a lower surface
    for r, a, b, _kind in lv["plats"]:
        ok = False
        for c in range(max(0, a - 5), min(width, b + 5)):
            for rr in range(r + 1, min(H, r + MAX_CLIMB_ROWS + 1)):
                if at(rr, c) in "#=":
                    # landing spot must be within a jump's horizontal reach
                    dx = 0 if a <= c < b else min(abs(c - a), abs(c - (b - 1)))
                    if dx * TILE <= REACH * 0.75:
                        ok = True
                        break
            if ok:
                break
        if not ok:
            errs.append(f"platform r{r} c{a}-{b} unreachable (climb > {MAX_CLIMB_ROWS} rows)")

    # 4. nothing solid may hang low enough to become a ceiling
    for r in range(H - 1):
        for c in range(width):
            if at(r, c) != "#":
                continue
            for rr in range(r + 1, H):
                if at(rr, c) in "#=":
                    clearance = (rr - r - 1) * TILE
                    if 0 < clearance < PLAYER_H + 12:
                        errs.append(
                            f"solid tile r{r} c{c} leaves {clearance}u of headroom "
                            f"over the surface at r{rr} (need {PLAYER_H + 12}u)")
                    break

    # 5. spikes must sit on ground, never float
    for r in range(H):
        for c in range(width):
            if at(r, c) == "^" and at(r + 1, c) not in "#=":
                errs.append(f"floating spikes at r{r} c{c}")
    return errs


# rows used by the platform ladder: ground 17, then every 3 tiles up
R1, R2, R3, R4 = 14, 11, 8, 5

LEVELS = [
    make(
        "THE OLD PATH",
        "forest", 104, 60,
        ground=[(0, 11), (16, 27), (32, 43), (48, 62), (67, 81), (86, 103)],
        plats=[
            (R1, 18, 24, "one"),
            (R1, 34, 40, "one"), (R2, 37, 43, "one"),
            (R1, 50, 56, "one"), (R2, 53, 59, "one"), (R3, 56, 62, "one"),
            (R1, 70, 76, "one"),
            (R1, 88, 94, "one"), (R2, 91, 97, "one"),
        ],
        items=[
            (16, 6, "o"), (16, 9, "o"),
            (13, 19, "o"), (13, 21, "o"), (13, 23, "o"),
            (16, 25, "o"), (16, 30, "o"),
            (13, 35, "o"), (13, 37, "o"), (10, 39, "o"), (10, 41, "o"),
            (16, 45, "o"),
            (13, 51, "o"), (13, 53, "o"), (10, 55, "o"), (7, 58, "o"), (7, 60, "o"),
            (16, 60, "+"),
            (13, 71, "o"), (13, 73, "o"), (13, 75, "o"),
            (16, 78, "o"), (16, 84, "o"),
            (13, 89, "o"), (13, 91, "o"), (10, 93, "o"), (10, 95, "o"),
            (16, 98, "o"), (16, 101, "o"),
        ],
        enemies=[(16, 22, "m"), (16, 40, "m"), (13, 73, "m"), (16, 58, "g"), (16, 94, "m")],
        checkpoints=(34, 70),
    ),

    make(
        "BRIARWOOD",
        "forest", 108, 70,
        ground=[(0, 10), (15, 30), (35, 47), (52, 66), (71, 84), (89, 107)],
        plats=[
            (R1, 17, 23, "one"), (R2, 20, 26, "one"),
            (R1, 38, 44, "one"), (R2, 41, 47, "one"), (R3, 44, 50, "one"),
            (R1, 55, 61, "one"), (R2, 58, 64, "one"),
            (R1, 74, 80, "one"),
            (R1, 90, 96, "one"), (R2, 93, 99, "one"), (R3, 96, 102, "one"),
        ],
        items=[
            (16, 5, "o"), (16, 8, "o"),
            (13, 18, "o"), (13, 20, "o"), (10, 22, "o"), (10, 24, "o"),
            (16, 33, "o"),
            (13, 39, "o"), (13, 41, "o"), (10, 43, "o"), (7, 46, "o"), (7, 48, "o"),
            (16, 50, "o"), (16, 63, "+"),
            (13, 56, "o"), (13, 58, "o"), (10, 60, "o"), (10, 62, "o"),
            (16, 69, "o"),
            (13, 75, "o"), (13, 77, "o"), (13, 79, "o"),
            (16, 87, "o"),
            (13, 91, "o"), (10, 94, "o"), (7, 97, "o"), (7, 99, "o"),
            (16, 101, "o"), (16, 106, "o"),
        ],
        enemies=[
            (16, 20, "m"), (16, 27, "g"), (13, 41, "m"), (16, 44, "m"),
            (16, 58, "g"), (13, 77, "g"), (16, 80, "m"), (16, 96, "g"),
        ],
        checkpoints=(38, 74),
    ),

    make(
        "HOLLOW DEPTHS",
        "cave", 110, 80,
        ground=[(0, 12), (17, 31), (36, 48), (53, 68), (73, 86), (91, 109)],
        plats=[
            (R1, 19, 25, "one"), (R2, 22, 28, "one"),
            (R1, 39, 45, "one"),
            (R1, 57, 63, "one"), (R2, 60, 66, "one"), (R3, 63, 69, "one"),
            (R1, 76, 82, "one"),
            (R1, 92, 98, "one"), (R2, 95, 101, "one"),
        ],
        items=[
            (16, 5, "o"), (16, 9, "o"),
            (13, 20, "o"), (13, 22, "o"), (10, 24, "o"), (10, 26, "o"),
            (16, 34, "o"),
            (13, 40, "o"), (13, 42, "o"), (13, 44, "o"),
            (16, 50, "+"),
            (13, 58, "o"), (13, 60, "o"), (10, 62, "o"), (7, 65, "o"), (7, 67, "o"),
            (16, 70, "o"),
            (13, 77, "o"), (13, 79, "o"), (13, 81, "o"),
            (16, 88, "o"),
            (13, 93, "o"), (10, 96, "o"), (10, 98, "o"),
            (16, 104, "o"), (16, 107, "o"),
        ],
        enemies=[
            (16, 22, "m"), (11, 30, "f"), (16, 42, "g"), (13, 43, "s"),
            (10, 55, "f"), (16, 62, "m"), (13, 80, "s"), (12, 88, "f"),
            (16, 97, "g"), (16, 101, "m"),
        ],
        checkpoints=(40, 76),
    ),

    make(
        "THE BONEWAY",
        "cave", 116, 95,
        ground=[(0, 10), (15, 26), (31, 42), (47, 58), (63, 76), (81, 92), (97, 115)],
        plats=[
            (R1, 17, 23, "one"), (R2, 20, 26, "one"), (R3, 23, 29, "one"),
            (R1, 33, 39, "one"), (R2, 36, 42, "one"),
            (R1, 49, 55, "one"), (R2, 52, 58, "one"),
            (R1, 66, 72, "one"), (R2, 69, 75, "one"), (R3, 72, 78, "one"),
            (R1, 83, 89, "one"),
            (R1, 99, 105, "one"), (R2, 102, 108, "one"),
        ],
        items=[
            (16, 4, "o"), (16, 8, "o"),
            (13, 18, "o"), (10, 22, "o"), (7, 25, "o"), (7, 27, "o"),
            (16, 28, "o"),
            (13, 34, "o"), (13, 36, "o"), (10, 38, "o"), (10, 40, "o"),
            (16, 44, "+"),
            (13, 50, "o"), (13, 52, "o"), (10, 54, "o"), (10, 56, "o"),
            (16, 60, "o"),
            (13, 67, "o"), (13, 69, "o"), (10, 71, "o"), (7, 74, "o"), (7, 76, "o"),
            (16, 79, "o"), (16, 94, "+"),
            (13, 84, "o"), (13, 86, "o"), (13, 88, "o"),
            (13, 100, "o"), (10, 103, "o"), (10, 105, "o"),
            (16, 110, "o"), (16, 113, "o"),
        ],
        enemies=[
            (16, 20, "g"), (11, 26, "f"), (16, 38, "s"), (13, 36, "m"),
            (10, 46, "f"), (16, 54, "g"), (13, 70, "s"), (16, 72, "m"),
            (12, 80, "f"), (16, 88, "g"), (13, 86, "m"), (16, 104, "s"),
            (16, 108, "g"),
        ],
        checkpoints=(33, 65, 98),
    ),

    make(
        "EMBER THRONE",
        "arena", 72, 130,
        ground=[(0, 71)],
        plats=[
            (R1, 8, 16, "one"), (R2, 11, 19, "one"),
            (R1, 56, 64, "one"), (R2, 53, 61, "one"),
        ],
        items=[
            (13, 9, "o"), (13, 11, "o"), (13, 13, "o"),
            (10, 13, "o"), (10, 15, "o"), (10, 17, "o"),
            (13, 58, "o"), (13, 60, "o"), (13, 62, "o"),
            (10, 55, "o"), (10, 57, "o"), (10, 59, "o"),
            (16, 5, "+"), (16, 67, "+"), (10, 16, "+"),
        ],
        enemies=[],
        boss=(16, 46),
    ),
]

# spikes: (level index, row, [columns]) — always laid on the ground surface
SPIKES = {
    # columns chosen to sit inside a ground span, never in a pit and never
    # under the player start; 3-4 wide so a running jump clears them
    1: [(16, [25, 26, 27] + [43, 44, 45] + [60, 61, 62] + [78, 79, 80])],
    2: [(16, [24, 25, 26] + [41, 42, 43] + [58, 59, 60, 61] + [79, 80, 81] +
             [99, 100, 101])],
    3: [(16, [21, 22, 23] + [36, 37, 38] + [51, 52, 53] + [67, 68, 69, 70] +
             [85, 86, 87] + [101, 102, 103])],
}

# player start and exit, placed on the ground row above solid tiles
ENDS = [(3, 100), (3, 104), (3, 106), (3, 112), (3, None)]

for i, lv in enumerate(LEVELS):
    rows = [list(r.ljust(lv["width"])) for r in lv["rows"]]
    for r, cols in SPIKES.get(i, []):
        for c in cols:
            # only lay spikes on bare ground: they used to silently overwrite
            # whatever enemy or coin was authored on that tile
            if rows[W_GROUND_ROW][c] == "#" and rows[r][c] == " ":
                rows[r][c] = "^"
    start, exit_col = ENDS[i]
    rows[16][start] = "P"
    if exit_col is not None:
        rows[16][exit_col] = "E"
    lv["rows"] = ["".join(r).rstrip() for r in rows]

bad = False
for lv in LEVELS:
    errs = validate(lv)
    flag = "OK " if not errs else "ERR"
    print(f"{flag} {lv['name']:16} {lv['width']}x{H}")
    for e in errs:
        bad = True
        print("      -", e)

print(f"\njump rise {RISE:.0f}u ({RISE / TILE:.2f} tiles), reach {REACH:.0f}u "
      f"({REACH / TILE:.2f} tiles), ladder rows {W_GROUND_ROW}/{R1}/{R2}/{R3}/{R4}")

if bad:
    raise SystemExit("validation failed — not writing level.ts")

# --- splice into level.ts ---
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "src", "components", "platformer", "level.ts")
src = io.open(P, encoding="utf-8").read()
out = ["export const LEVELS: LevelDef[] = ["]
for lv in LEVELS:
    out.append("  {")
    out.append(f'    name: "{lv["name"]}",')
    out.append(f'    par: {lv["par"]},')
    out.append(f'    biome: "{lv["biome"]}",')
    out.append("    rows: [")
    for r in lv["rows"]:
        out.append(f'      "{r}",')
    out.append("    ],")
    out.append("  },")
out.append("];")
block = "\n".join(out)

start = src.index("export const LEVELS: LevelDef[] = [")
end = src.index("\n];", start) + len("\n];")
src = src[:start] + block + src[end:]
io.open(P, "w", encoding="utf-8", newline="\n").write(src)
print("\nlevel.ts written")
