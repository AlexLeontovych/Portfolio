# -*- coding: utf-8 -*-
"""
Cut the game's sound out of five CC0 packs and lay it down as one sprite.

Sound in a browser game costs two things that art does not: a request per
noise, and a decode per request. A tower defense makes a LOT of noise — five
towers firing, thirty creeps dying, a soldier swinging every second — and
thirty small files would be thirty round trips before the first shot and
thirty decoded buffers to hold.

So every cue goes into ONE file, back to back with a breath of silence
between them, and a JSON says where each one starts and how long it runs.
One request, one decode, one buffer; playing a cue is then an offset into it.
The silence between cues is deliberate: an AAC encoder shifts everything a
frame or two late, and a cue that begins after its own silence cannot be
clipped by that shift, however the browser decodes it.

Everything here is CC0 — public domain, redistributable, no attribution
required — which for a public repository is the only licence worth having.
The packs themselves are NOT committed: this script names the exact file it
takes out of each, so the whole sound of the game can be rebuilt by
downloading the five packs again. See CREDITS.md for where they live.

A cue may name several files. Which one plays is decided at the moment it
plays, so thirty mushrooms do not die in unison, and the engine detunes each
one a little on top of that.

Usage:
    python scripts/td_audio.py <folder holding the extracted packs>

Writes public/games/td/audio/sfx.m4a + sfx.json, and one music track per
biome. AAC rather than Opus or Vorbis: this has to play on the iPhone the
site is read on as much as on the desktop it was built on.
"""
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "games", "td", "audio")
#: the sprite's sample rate. The packs are 44.1k; the browser resamples to
#: whatever the output device wants anyway, so there is nothing to gain by
#: going higher and a third of the file to lose
SR = 44100
#: silence between cues, wide enough that no decoder's frame shift reaches
#: into the cue before it
GAP = 0.15
#: how loud a cue is allowed to be before its own gain is applied. Several
#: of these packs ship clipped (peaks of 1.4), so everything is brought to a
#: common ceiling first and balanced from there
CEIL = 0.9
#: anything below this fraction of a clip's peak, at either end, is silence
HUSH = 0.02


def load(path):
    """A clip as mono float, whatever it arrived as."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def trim(x, head=0.0, tail=0.0):
    """Cut the silence off both ends, then any head or tail the cue asked for."""
    if not x.size:
        return x
    live = np.nonzero(np.abs(x) > np.abs(x).max() * HUSH)[0]
    if live.size:
        x = x[max(0, live[0] - int(SR * 0.004)):live[-1] + int(SR * 0.01)]
    if head:
        x = x[int(SR * head):]
    if tail:
        x = x[:int(SR * tail)]
    return x


def shape(x, gain):
    """One cue, levelled and topped and tailed so it cannot click."""
    if not x.size:
        return x
    x = x * (CEIL / max(np.abs(x).max(), 1e-6)) * gain
    n_in, n_out = int(SR * 0.004), int(SR * 0.012)
    if x.size > n_in + n_out:
        x[:n_in] *= np.linspace(0, 1, n_in)
        x[-n_out:] *= np.linspace(1, 0, n_out)
    return x


# Every cue the game can make, and what it is made of.
#
#   (pack, file, gain, head, tail)
#
# The gains are the mix: a bow fires ten times a second and lives at 0.35, a
# wave bell tolls once a minute and lives at 0.9. Heads and tails take the
# useful part out of a longer recording — the crack of a cannon without the
# field it was recorded in.
CUES = {
    # ------------------------------------------------------------- the menu ---
    "select":     [("interface-sounds", "select_003.ogg", 0.5, 0, 0)],
    "click":      [("interface-sounds", "toggle_001.ogg", 0.5, 0, 0)],
    "build":      [("interface-sounds", "confirmation_001.ogg", 0.4, 0, 0)],
    "upgrade":    [("interface-sounds", "confirmation_003.ogg", 0.45, 0, 0)],
    "sell":       [("rpg-sfx-80", "item_coins_02.ogg", 0.55, 0, 0)],
    "deny":       [("interface-sounds", "error_006.ogg", 0.6, 0, 0)],
    "arm":        [("rpg-sfx-80", "spell_01.ogg", 0.6, 0, 0.9)],
    # ----------------------------------------------------------- the towers ---
    "bow":        [("battle", "Bow.wav", 0.5, 0, 0.45)],
    "bolt":       [("rpg-sfx-80", "spell_02.ogg", 0.5, 0, 0.7)],
    "cannon":     [("bang-25", "cannon_03.ogg", 0.6, 0, 0.75)],
    "gun":        [("bang-25", "shot_02.ogg", 0.45, 0, 0.45)],
    "boom":       [("bang-25", "bang_04.ogg", 0.7, 0, 1.1)],
    "hit": [
        ("impact-sounds", "impactGeneric_light_000.ogg", 0.4, 0, 0),
        ("impact-sounds", "impactGeneric_light_002.ogg", 0.4, 0, 0),
        ("impact-sounds", "impactGeneric_light_004.ogg", 0.4, 0, 0),
    ],
    # ------------------------------------------------------------ the melee ---
    "swing": [
        ("rpg-sound-pack", "swing.wav", 0.35, 0, 0),
        ("rpg-sound-pack", "swing2.wav", 0.35, 0, 0),
        ("rpg-sound-pack", "swing3.wav", 0.35, 0, 0),
    ],
    "clash": [
        ("rpg-sfx-80", "blade_01.ogg", 0.35, 0, 0),
        ("rpg-sfx-80", "blade_02.ogg", 0.35, 0, 0),
        ("rpg-sfx-80", "blade_03.ogg", 0.35, 0, 0),
    ],
    # --------------------------------------------------------- the dying ---
    "dieSoft": [                                        # mushrooms
        ("rpg-sound-pack", "slime1.wav", 0.5, 0, 0),
        ("rpg-sound-pack", "slime6.wav", 0.5, 0, 0),
    ],
    "dieYelp": [                                        # goblins
        ("rpg-sfx-80", "creature_hurt_01.ogg", 0.5, 0, 0),
        ("rpg-sfx-80", "creature_hurt_02.ogg", 0.5, 0, 0),
    ],
    "dieBony": [                                        # skeletons
        ("rpg-sfx-80", "item_stone_02.ogg", 0.5, 0, 0),
        ("rpg-sfx-80", "item_stone_04.ogg", 0.5, 0, 0),
    ],
    "dieShade": [                                       # eyes and wraiths
        ("rpg-sound-pack", "shade3.wav", 0.45, 0, 0),
        ("rpg-sound-pack", "shade8.wav", 0.45, 0, 0),
    ],
    "soldierDie": [("rpg-sound-pack", "chainmail1.wav", 0.6, 0, 0)],
    "boss":       [("rpg-sfx-80", "creature_roar_01.ogg", 0.8, 0, 0)],
    # ------------------------------------------------------------ the board ---
    "wave":       [("impact-sounds", "impactBell_heavy_000.ogg", 0.75, 0, 0)],
    "leak":       [("rpg-sound-pack", "giant2.wav", 0.8, 0, 0)],
    "coins":      [("rpg-audio", "handleCoins.ogg", 0.6, 0, 0)],
    "gate":       [("rpg-audio", "doorOpen_1.ogg", 0.35, 0, 0)],
    # ----------------------------------------------------------- the spells ---
    "fireball":   [("rpg-sfx-80", "spell_fire_03.ogg", 0.9, 0, 1.2)],
    "rain":       [("battle", "swish_3.wav", 0.6, 0, 0)],
    "heal":       [("rpg-sfx-80", "item_gem_04.ogg", 0.8, 0, 0)],
    # ------------------------------------------------------- won and lost ---
    "win":        [("jingles", "jingles_PIZZI02.ogg", 0.55, 0, 0)],
    "lose":       [("jingles", "jingles_PIZZI01.ogg", 0.55, 0, 0)],
}

# One track per biome, and the window taken out of it.
#
# A tower defense is heard for an hour, so what plays has to be able to come
# round again without announcing itself. Each of these is cut at a bar line
# by ear and crossfaded in the engine rather than looped dead, and the window
# is chosen to leave out any intro that only works once.
MUSIC = {
    "forest": ("field_of_dreams.mp3", 0.0, 84.0),
    "cave":   ("cave_theme.ogg", 8.0, 128.0),
    "ember":  ("determined_pursuit.wav", 0.0, 108.0),
}


def build_sfx(packs):
    board = []
    index = {}
    at = 0.0
    for cue, takes in CUES.items():
        slots = []
        for pack, name, gain, head, tail in takes:
            p = os.path.join(packs, pack, name)
            if not os.path.exists(p):
                raise SystemExit(f"{cue}: no {pack}/{name} under {packs}")
            x = shape(trim(load(p), head, tail), gain)
            if not x.size:
                raise SystemExit(f"{cue}: {name} is silent")
            board.append(x)
            board.append(np.zeros(int(SR * GAP)))
            slots.append([round(at, 4), round(x.size / SR, 4)])
            at += (x.size / SR) + GAP
        index[cue] = slots
        print(f"  {cue:11} {len(slots)} take(s), "
              f"{sum(s[1] for s in slots):5.2f}s")
    sprite = np.concatenate(board)
    raw = os.path.join(OUT, "sfx.wav")
    os.makedirs(OUT, exist_ok=True)
    write_wav(raw, sprite)
    dst = os.path.join(OUT, "sfx.m4a")
    encode(raw, dst, ["-c:a", "aac", "-b:a", "96k", "-ac", "1"])
    os.remove(raw)
    json.dump({"rate": SR, "cues": index},
              open(os.path.join(OUT, "sfx.json"), "w", encoding="utf-8"),
              separators=(",", ":"))
    print(f"  sprite: {len(CUES)} cues, {sprite.size / SR:.1f}s, "
          f"{os.path.getsize(dst) / 1024:.0f} kB")


def build_music(packs):
    for biome, (name, start, end) in MUSIC.items():
        src = os.path.join(packs, "music", name)
        if not os.path.exists(src):
            print(f"  {biome}: no {name}, skipped")
            continue
        dst = os.path.join(OUT, f"{biome}.m4a")
        encode(src, dst, [
            "-ss", str(start), "-to", str(end),
            "-af", "afade=t=in:st=%g:d=1.5,afade=t=out:st=%g:d=2.5"
                   % (start, end - 2.5),
            "-c:a", "aac", "-b:a", "80k", "-ac", "2",
        ])
        print(f"  {biome:7} {end - start:5.1f}s  {os.path.getsize(dst) / 1024:.0f} kB")


def write_wav(path, x):
    """A plain 16-bit file for ffmpeg to swallow — no library needed for that."""
    import struct
    pcm = np.clip(x, -1, 1)
    data = (pcm * 32767).astype("<i2").tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, SR, SR * 2, 2, 16))
        f.write(b"data" + struct.pack("<I", len(data)) + data)


def encode(src, dst, args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, *args, dst],
                   check=True)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    packs = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    build_sfx(packs)
    build_music(packs)


if __name__ == "__main__":
    main()
