# -*- coding: utf-8 -*-
"""
Bake the platformer's UI skin.

Every colour here is lifted straight out of forest/tileset.png (plus the two
accents the in-world coin and heart already use), so the panels, buttons and
hearts are made of literally the same palette as the ground the player walks
on. Each piece is a tiny 9-slice or icon; CSS scales them with
image-rendering: pixelated.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "games", "platformer", "ui")
os.makedirs(OUT, exist_ok=True)

# --- palette, sampled from the tileset ---
LIME     = (198, 216, 49)
GREEN    = (119, 176, 42)
MOSS     = (66, 144, 88)
TEAL     = (44, 100, 94)
DEEP     = (21, 60, 74)
NAVY     = (5, 33, 55)
LIME_HI  = (233, 245, 160)
INK      = (2, 20, 33)
# accents already used by the pickups in-world
GOLD     = (255, 212, 94)
GOLD_HI  = (255, 243, 176)
GOLD_LO  = (201, 138, 27)
RED      = (255, 95, 134)
RED_HI   = (255, 163, 189)
RED_LO   = (140, 31, 60)


def img(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def rect(im, x0, y0, x1, y1, c):
    """Filled rectangle, inclusive bounds."""
    px = im.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < im.width and 0 <= y < im.height:
                px[x, y] = c + (255,)


def frame(im, inset, c):
    """One-pixel-thick square ring at the given inset."""
    w, h = im.width - 1, im.height - 1
    rect(im, inset, inset, w - inset, inset, c)
    rect(im, inset, h - inset, w - inset, h - inset, c)
    rect(im, inset, inset, inset, h - inset, c)
    rect(im, w - inset, inset, w - inset, h - inset, c)


def nine(name, size, rings, fill, studs=None):
    """
    A square 9-slice: concentric one-pixel rings from the outside in, then a
    flat interior. The interior colour must match the CSS background of the
    element, so the border blends into it seamlessly at any size.
    """
    im = img(size, size)
    rect(im, 0, 0, size - 1, size - 1, fill)
    for i, c in enumerate(rings):
        frame(im, i, c)
    if studs:
        s = len(rings) + 1
        for cx, cy in ((s, s), (size - 1 - s, s), (s, size - 1 - s),
                       (size - 1 - s, size - 1 - s)):
            rect(im, cx, cy, cx + 1, cy + 1, studs)
    im.save(os.path.join(OUT, name))
    return im


# ---------------------------------------------------------------- panels ----
# forest: lime rim over a deep teal body — the colours of a ground tile
nine("panel.png", 24, [INK, LIME, LIME, GREEN, TEAL], DEEP, studs=LIME)
# cave: the same construction, one step darker all the way down
nine("panel-dark.png", 24, [INK, TEAL, TEAL, DEEP, NAVY], NAVY, studs=TEAL)
# thin chip for tags and stat pills
nine("chip.png", 12, [INK, TEAL, DEEP], DEEP)


# --------------------------------------------------------------- buttons ----
def button(name, rim, body, lip, face):
    im = img(24, 24)
    rect(im, 0, 0, 23, 23, face)
    frame(im, 0, INK)
    frame(im, 1, rim)
    frame(im, 2, body)
    # a lip along the bottom two rows reads as thickness
    rect(im, 3, 20, 20, 21, lip)
    # and a highlight along the top
    rect(im, 3, 3, 20, 3, rim)
    im.save(os.path.join(OUT, name))


button("button.png", LIME, GREEN, TEAL, MOSS)
button("button-hover.png", LIME_HI, LIME, GREEN, GREEN)
button("button-down.png", GREEN, TEAL, DEEP, TEAL)


# ----------------------------------------------------------------- icons ----
HEART = [
    "  XX  XX  ",
    " XooXXooX ",
    "XooooooooX",
    "XooooooooX",
    "XooooooooX",
    " XoooooooX",
    "  XooooooX",
    "   XooooX ",
    "    XooX  ",
    "     XX   ",
]


def heart(name, body, hi, outline):
    im = img(10, 10)
    px = im.load()
    for y, row in enumerate(HEART):
        for x, ch in enumerate(row):
            if ch == "X":
                px[x, y] = outline + (255,)
            elif ch == "o":
                px[x, y] = body + (255,)
    # a two-pixel glint in the upper-left lobe
    if hi:
        px[2, 2] = hi + (255,)
        px[3, 2] = hi + (255,)
        px[2, 3] = hi + (255,)
    im.save(os.path.join(OUT, name))


heart("heart-full.png", RED, RED_HI, RED_LO)
heart("heart-empty.png", DEEP, None, NAVY)

COIN = [
    "  XXXX  ",
    " XhhhhX ",
    "XhhooooX",
    "XhoooolX",
    "XhoooolX",
    "XlooollX",
    " XllllX ",
    "  XXXX  ",
]
im = img(8, 8)
px = im.load()
for y, row in enumerate(COIN):
    for x, ch in enumerate(row):
        c = {"X": (92, 58, 6), "h": GOLD_HI, "o": GOLD, "l": GOLD_LO}.get(ch)
        if c:
            px[x, y] = c + (255,)
im.save(os.path.join(OUT, "coin.png"))


# ------------------------------------------------------------------ bars ----
# boss health: a dark socket with a lime rim, filled by a banded stripe
nine("bar.png", 12, [INK, LIME, DEEP], NAVY)

fill = img(8, 8)
for y, c in enumerate([(255, 154, 210), (255, 46, 136), (255, 46, 136),
                       (214, 36, 158), (168, 85, 247), (140, 60, 200),
                       (110, 40, 170), (90, 30, 150)]):
    rect(fill, 0, y, 7, y, c)
fill.save(os.path.join(OUT, "bar-fill.png"))

# the special-ability meter reuses the socket with a cyan fill
cool = img(8, 8)
for y, c in enumerate([(150, 245, 255), (0, 229, 255), (0, 229, 255),
                       (0, 180, 215), (0, 140, 180), (0, 110, 150),
                       (0, 90, 130), (0, 70, 110)]):
    rect(cool, 0, y, 7, y, c)
cool.save(os.path.join(OUT, "bar-fill-cyan.png"))

for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(f"{f:22} {Image.open(p).size}  {os.path.getsize(p):5} B")
