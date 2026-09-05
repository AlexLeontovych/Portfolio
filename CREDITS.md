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

The four tower sheets, the projectiles and the blast (`art-src/td/*.webp`) were generated for this
project by its author. `scripts/td_atlas.py` cuts, trims and scales them into the single texture
the game draws from (`public/games/td/atlas.webp`); the full-size sheets stay in `art-src/` and are
never served.

The creeps are the same LuizMelo sheets the platformer uses, credited above.

## UI

The platformer's interface skin (`public/games/platformer/ui/`) is generated for this project —
every panel, button, chip, bar and icon is built from the six colours sampled out of the forest
tileset, so the chrome matches the world it frames.
