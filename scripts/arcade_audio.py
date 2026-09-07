# -*- coding: utf-8 -*-
"""
What NEON RUN sounds like: which file out of which CC0 pack, and how loud.

The machinery is in audio_sprite.py; this is only the table. The packs are
NOT committed — this names the exact file it takes from each, so the sound
can be rebuilt from the list in CREDITS.md.

Three of these cues are LOOPS and are marked as such, which means they are
laid down without the fades a one-shot gets: they are never heard starting
or stopping, only crossfaded with themselves. Two of them are the car. A
racer without an engine is a silent film, and an engine is not a noise you
play — it is a noise you hold, and bend by how fast the car is going. The
low one carries the body of it and the bright one the strain, and the game
opens the second as the speed comes up. The third is the hiss of the
shoulder, for when the car leaves the road.

Usage:
    python scripts/arcade_audio.py <folder holding the extracted packs>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_sprite as sprite                                # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "public", "games", "arcade", "audio")

#: cues laid down without fades, because they are held rather than played
LOOPS = ("engineLow", "engineHigh", "gravel")

CUES = {
    # ------------------------------------------------------------- the car ---
    "engineLow":  [("sci-fi", "spaceEngineLow_000.ogg", 0.55, 0, 0)],
    "engineHigh": [("sci-fi", "engineCircular_002.ogg", 0.4, 0, 0)],
    "gravel":     [("sci-fi", "computerNoise_002.ogg", 0.5, 0, 0)],
    # ------------------------------------------------------------ the drive ---
    "count":      [("retro-synth", "synth_beep_01.ogg", 0.5, 0, 0)],
    "go":         [("retro-synth", "power_up_03.ogg", 0.6, 0, 0)],
    "coin":       [("retro-synth", "retro_coin_01.ogg", 0.2, 0, 0)],
    "graze":      [("retro-synth", "synth_laser_05.ogg", 0.45, 0, 0.35)],
    "sign":       [("sci-fi", "laserSmall_000.ogg", 0.4, 0, 0)],
    # ---------------------------------------------------------- going wrong ---
    "alert":      [("retro-synth", "synth_beep_02.ogg", 0.5, 0, 0)],
    "rewind":     [("sci-fi", "forceField_002.ogg", 0.25, 0, 0)],
    "crash":      [("sci-fi", "explosionCrunch_001.ogg", 0.7, 0, 0)],
    # -------------------------------------------------------- getting there ---
    "fanfare":    [("retro-synth", "power_up_06.ogg", 0.5, 0, 0)],
    "click":      [("sci-fi", "laserSmall_002.ogg", 0.4, 0, 0)],
}

#: One track, and the window taken out of it. A run lasts a minute or two and
#: the reader is on a portfolio, not a playlist: one is enough.
MUSIC = {
    "drive": ("eyeless.flac", 0.0, 96.0),
}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    sprite.build_sprite(CUES, sys.argv[1], OUT, loops=LOOPS)
    sprite.build_music(MUSIC, sys.argv[1], OUT)


if __name__ == "__main__":
    main()
