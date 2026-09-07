# -*- coding: utf-8 -*-
"""
What IRONWOOD KEEP sounds like: which file out of which CC0 pack, and how loud.

The machinery that lays these out as one sprite is in audio_sprite.py; this
is only the table. The packs are NOT committed — this names the exact file it
takes from each, so the whole soundtrack can be rebuilt from the list in
CREDITS.md.

A cue may name several files. Which one plays is decided when it plays, so
thirty mushrooms do not die in unison, and the engine detunes each one a
little on top of that.

Usage:
    python scripts/td_audio.py <folder holding the extracted packs>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_sprite as sprite                                # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "public", "games", "td", "audio")

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
    # ------------------------------------------------------------ the fallen ---
    #
    # Only ours. The creeps died out loud for a while — a pack's worth of
    # grunts and squelches and wails — and every one of them was some other
    # animal than the thing on the screen. What kills a creep is already
    # heard; the creep itself goes quietly now.
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


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    sprite.build_sprite(CUES, sys.argv[1], OUT)
    sprite.build_music(MUSIC, sys.argv[1], OUT)


if __name__ == "__main__":
    main()
