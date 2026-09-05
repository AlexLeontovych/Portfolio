# -*- coding: utf-8 -*-
"""
Cut the tower-defense interface out of the Tiny Swords UI kit.

Tiny Swords is free to use in a game but may not be redistributed, so the
pack itself stays off this public repository — the same rule the sprite
atlas follows. What ships is only the handful of pieces the interface
actually draws, trimmed of their empty margin and scaled to the size they
are drawn at, which is a game carrying its skin rather than a pack being
republished. Credit and licence are in CREDITS.md.

Most pieces arrive as a GRID of the parts they are built from — a 320x320
button sheet holds nine tiles with gaps between them — so the parts are cut
out and packed edge to edge, and the slice is where the seams then fall.

Each piece is written twice over: the PNG, and a line in ui.ts giving its
URL and its nine-slice numbers in that PNG's own pixels — a slice measured
in the source would be wrong the moment the scale changes. The component
spreads those onto the overlay as custom properties, which is also what
keeps the paths right: the site is served from a project subpath, so a URL
written into a stylesheet would not resolve.

Usage:
    python scripts/td_ui.py <path to extracted packs>
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "games", "td", "ui")
OUT_TS = os.path.join(ROOT, "src", "components", "td", "ui.ts")
PACK = "Tiny_Swords_Free_Pack_zip/Tiny Swords (Free Pack)/UI Elements/UI Elements"

#: name, file, scale, nine-slice inset as a fraction of the piece's own size
#: (one number for all four sides, or top/right/bottom/left). A fraction and
#: not a pixel count, because the pixel count changes with the scale and this
#: does not — the corner of a parchment is a sixth of it however big it is.
PIECES = [
    ("paper",       "Papers/RegularPaper.png",                   0.46, 0.16),
    ("slate",       "Papers/SpecialPaper.png",                   0.46, 0.20),
    # the same panel cut small: a HUD chip is 30px tall and a corner meant
    # for a menu would be the whole of it
    ("chip",        "Papers/SpecialPaper.png",                   0.24, 0.20),
    ("chip-lit",    "Papers/RegularPaper.png",                   0.24, 0.16),
    ("wood",        "Wood Table/WoodTable.png",                  0.40, 0.20),
    ("banner",      "Banners/Banner.png",                        0.42, (0.10, 0.30, 0.14, 0.30)),
    ("button",      "Buttons/SmallBlueSquareButton_Regular.png", 0.52, 0.28),
    ("button-down", "Buttons/SmallBlueSquareButton_Pressed.png", 0.52, 0.28),
    ("big",         "Buttons/BigBlueButton_Regular.png",         0.34, 0.24),
    ("big-down",    "Buttons/BigBlueButton_Pressed.png",         0.34, 0.24),
    ("round",       "Buttons/SmallBlueRoundButton_Regular.png",  0.42, None),
    ("round-down",  "Buttons/SmallBlueRoundButton_Pressed.png",  0.42, None),
    ("bar",         "Bars/SmallBar_Base.png",                    0.52, (0.0, 0.09, 0.0, 0.09)),
    ("bar-fill",    "Bars/SmallBar_Fill.png",                    0.52, None),
]


#: name, icon number in the kit
ICONS = [
    ("gold", 3), ("lives", 6), ("wave", 5), ("up", 7), ("sell", 9),
    ("gear", 10), ("info", 11), ("meat", 4),
]
ICON_SCALE = 0.40


def bands(mask, axis):
    """Start and end of every run of content along one axis."""
    on = mask.any(axis=axis)
    runs, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(on)))
    return [r for r in runs if r[1] - r[0] > 1]


def assemble(im):
    """
    Pack a sheet of nine-slice parts into one image, and say where to slice it.

    The parts sit on a grid with gaps. Each is cut to its own content, then
    laid edge to edge: corners at their own size, edges stretched to match
    them, the middle filling what is left. Returns the image and the slice as
    (top, right, bottom, left).
    """
    a = np.asarray(im)[:, :, 3] > 8
    rows, cols = bands(a, 1), bands(a, 0)
    if len(rows) != 3 or len(cols) != 3:
        return None

    def part(r, c):
        y0, y1 = rows[r]
        x0, x1 = cols[c]
        sub = im.crop((x0, y0, x1, y1))
        b = np.asarray(sub)[:, :, 3] > 8
        ys, xs = np.nonzero(b)
        return sub.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

    grid = [[part(r, c) for c in range(3)] for r in range(3)]
    left = max(grid[r][0].width for r in range(3))
    right = max(grid[r][2].width for r in range(3))
    top = max(grid[0][c].height for c in range(3))
    bot = max(grid[2][c].height for c in range(3))
    midw = max(8, max(grid[r][1].width for r in range(3)))
    midh = max(8, max(grid[1][c].height for c in range(3)))

    w, h = left + midw + right, top + midh + bot
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    xs = [(0, left), (left, left + midw), (left + midw, w)]
    ys = [(0, top), (top, top + midh), (top + midh, h)]
    for r in range(3):
        for c in range(3):
            x0, x1 = xs[c]
            y0, y1 = ys[r]
            out.alpha_composite(grid[r][c].resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
    return out, (top, right, bot, left)


def trim(im):
    """Drop the transparent margin; a nine-slice cannot afford one."""
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    if not xs.size:
        return im, (0, 0)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return im.crop(box), (box[0], box[1])


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    base = os.path.join(sys.argv[1], PACK)
    if not os.path.isdir(base):
        raise SystemExit(f"no UI kit at {base}")
    os.makedirs(OUT, exist_ok=True)

    lines = ['/**',
             ' * GENERATED by scripts/td_ui.py - do not edit.',
             ' *',
             ' * Every interface piece: where it is, how to slice it, and how',
             ' * thick its border has to be for the corners to be drawn at the',
             ' * size they were cut. The component spreads this onto the',
             ' * overlay, so the stylesheet can name a piece without knowing',
             ' * its size or its path.',
             ' */',
             '',
             'const B = "./games/td/ui";',
             '',
             'export const UI_VARS: Record<string, string> = {']

    for name, rel, scale, inset in PIECES:
        p = os.path.join(base, rel)
        if not os.path.exists(p):
            print(f"  !! missing {rel}")
            continue
        src = Image.open(p).convert("RGBA")
        built = assemble(src) if inset is not None else None
        if built is not None:
            cut, sl = built
            note = "assembled"
        else:
            cut, _ = trim(src)
            sl = None
            note = "whole"
        w, h = max(1, round(cut.width * scale)), max(1, round(cut.height * scale))
        cut = cut.resize((w, h), Image.LANCZOS)
        cut.save(os.path.join(OUT, f"{name}.png"), optimize=True)
        lines.append(f'  "--tdui-{name}": `url(${{B}}/{name}.png)`,')
        if sl is not None:
            px = tuple(max(1, round(v * scale)) for v in sl)
            lines.append(f'  "--tdui-{name}-slice": "{px[0]} {px[1]} {px[2]} {px[3]}",')
            lines.append(f'  "--tdui-{name}-border": '
                         f'"{px[0]}px {px[1]}px {px[2]}px {px[3]}px",')
            note += f" slice {px}"
        elif inset is not None:
            t, r, b, l = (inset,) * 4 if isinstance(inset, (int, float)) else inset
            px = (max(1, round(t * h)), max(1, round(r * w)),
                  max(1, round(b * h)), max(1, round(l * w)))
            lines.append(f'  "--tdui-{name}-slice": "{px[0]} {px[1]} {px[2]} {px[3]}",')
            note += f" slice {px}"
        print(f"  {name:12} {(w, h)} {note}")

    for name, num in ICONS:
        p = os.path.join(base, f"Icons/Icon_{num:02d}.png")
        if not os.path.exists(p):
            print(f"  !! missing icon {num}")
            continue
        cut, _ = trim(Image.open(p).convert("RGBA"))
        w, h = max(1, round(cut.width * ICON_SCALE)), max(1, round(cut.height * ICON_SCALE))
        cut.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, f"icon-{name}.png"), optimize=True)
        lines.append(f'  "--tdui-icon-{name}": `url(${{B}}/icon-{name}.png)`,')
        print(f"  icon-{name:8} {(w, h)}")

    lines.append("};")
    with open(OUT_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"\n{len(os.listdir(OUT))} files, {total / 1024:.0f} kB -> public/games/td/ui")


if __name__ == "__main__":
    main()
