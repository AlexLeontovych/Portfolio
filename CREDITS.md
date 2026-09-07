# Credits

Third-party assets used in this portfolio, with their licences.

## 3D models

**Car Kit** — [Kenney](https://kenney.nl/assets/car-kit)
Licence: [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/) (public domain, attribution
not required — credited here anyway, as Kenney asks).
Used in: the NEON RUN garage (`public/models/*.glb`, shared texture atlas in
`public/models/Textures/colormap.png`). The models are recoloured at runtime to the game palette;
the original licence text ships alongside them in `public/models/LICENSE.txt`.

## Pixel art — EMBERWOOD platformer

**Huntress**, **Hero Knight**, **Evil Wizard 2**, **Monsters Creatures Fantasy** — [LuizMelo](https://luizmelo.itch.io/)
Licence: [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/) (public domain).
Used in: the player characters, the four enemy types and the final boss
(`public/games/platformer/heroes/`, `enemies/`, `boss/`). Frames are re-sliced and re-timed at
runtime; the sheets themselves are unmodified.

**Tiny Platformer — Forest Asset Pack** — [SecretHideout](https://secrethideout.itch.io/)
Licence: free for commercial and non-commercial use.
Used in: the tileset, props and parallax backdrops (`public/games/platformer/forest/`). The cave
and arena biomes reuse the same sheets, recoloured at runtime.

## Painted art — IRONWOOD KEEP tower defense

The tower sheets, the projectiles and the blast were generated for this project by its author.
Four kinds of tower, three tiers each, four facings of six firing frames — 288 frames in all.

The sheets arrived with the transparency checker drawn into them as real pixels, so
`scripts/td_cutout.py` removes it (`art-src/td/towers/<kind>/level_<n>.webp`) and
`scripts/td_atlas.py` then cuts, trims and scales every frame into the single texture the game
draws from (`public/games/td/atlas.webp`). The full-size sheets stay in `art-src/` and are never
served.

The five maps (`art-src/td/maps/`) were generated for this project too. Each was painted with its
own road and its own build pads, so both were traced off the picture into `art-src/td/maps.json`
and `scripts/td_maps.py` bakes them into the level data — the game follows the painting rather
than drawing a board of its own.

The barracks and its garrison were generated for this project as well — three buildings of four
sides, and a recruit, a knight and a paladin with four sides of idle, walk, attack and death.
`scripts/td_barracks.py` cuts them: the same backdrop comes off the walk, attack and death
sheets, every drawing is re-laid onto a true grid with its feet on a common line, and the
building's door is composited out of the pack's gate phases so that the door moves and the
thatched roof does not.

The creeps are the same LuizMelo sheets the platformer uses, credited above.

## Sound — IRONWOOD KEEP tower defense

Every effect in the game is cut from five public-domain packs and laid end to end into one
sprite (`public/games/td/audio/sfx.m4a`, 263 kB for thirty cues) by `scripts/td_audio.py`,
which names the exact file it takes out of each. The packs themselves are not in this
repository; the script plus this list is enough to rebuild the whole soundtrack.

**Kenney** — [kenney.nl](https://kenney.nl/assets/category:Audio) · Licence: CC0
Interface Sounds (the menu), Impact Sounds (arrow strikes, the wave bell), RPG Audio (coins,
the barracks door) and Music Jingles (the two endings).

**artisticdude** — [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack) and
[Battle Sound Effects](https://opengameart.org/content/battle-sound-effects) · Licence: CC0
The bow, the sword swings, and what a mushroom, a wraith and a soldier each sound like on the
way down.

**rubberduck** — [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx) and
[25 CC0 bang / firework SFX](https://opengameart.org/content/25-cc0-bang-sfx) · Licence: CC0
Blades, the creatures' voices, the spells, and the cannon and its burst — the last recorded
from actual fireworks.

The music is one track per biome, cut to a loop and re-encoded to about a megabyte each. They
are fetched when a level on that biome is started, and not before:

* forest — *The Field Of Dreams* by **pauliuw** ·
  [CC0](https://opengameart.org/content/the-field-of-dreams)
* cave — *Cave Theme* by **Brandon Morris** ·
  [CC0](https://opengameart.org/content/cave-theme)
* ember — *Determined Pursuit* by **Emma_MA** ·
  [CC0](https://opengameart.org/content/determined-pursuit-epic-orchestra-loop)

CC0 asks for nothing, which is exactly why it is used here: a public repository redistributes
whatever it contains, and these are the assets that may be redistributed.

## Spells — IRONWOOD KEEP tower defense

The three area spells (`public/games/td/spells/`) are generated for this project: sixteen frames
each of a fireball, a rain of arrows and a healing aura, drawn in the maps' own perspective.
`scripts/td_spells.py` re-lays them on a true grid and puts every frame's ground ring in the same
place in its cell, so a spell is aimed at one point rather than at wherever that frame drifted to.

## UI — IRONWOOD KEEP tower defense

**Tiny Swords** — [Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords)
Licence: free to use in commercial and non-commercial games; the assets may not be redistributed
or resold, modified or not.

Used for the game's interface: the parchment panels, the chips, the buttons and the icons. The
pack itself is therefore not in this repository. `scripts/td_ui.py` reads a local copy, takes only
the pieces the interface draws, assembles each one's nine parts into a nine-slice image and scales
it to the size it is drawn at — `public/games/td/ui/`, 78 kB for the lot. That is a game carrying
its skin rather than a pack being republished.

## UI — EMBERWOOD platformer

The platformer's interface skin (`public/games/platformer/ui/`) is generated for this project —
every panel, button, chip, bar and icon is built from the six colours sampled out of the forest
tileset, so the chrome matches the world it frames.
