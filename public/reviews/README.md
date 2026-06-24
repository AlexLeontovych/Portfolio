# Testimonial avatars

Drop a **square** profile photo here for each recommender. The file name must
match the testimonial `id` in [`src/data/testimonials.ts`](../../src/data/testimonials.ts):

| File                | Person            | LinkedIn |
|---------------------|-------------------|----------|
| `kutsenko.jpg`      | Nikita Kutsenko   | in/nikita-kutsenko |
| `kontseva.jpg`      | Mariia Kontseva   | in/marishka95s |
| `kozoriz.jpg`       | Yevhen Kozoriz    | in/yevhen-kozoriz-9587b4202 |
| `kukharchuk.jpg`    | Oleksii Kukharchuk| in/oleksii-kukharchuk |

After adding a file, set its `avatar` path in `testimonials.ts`, e.g.
`avatar: "./reviews/kontseva.jpg"` (or just ask Claude to wire it).

- Any square JPG/PNG works; ~200×200 is plenty (it renders at 48px).
- With no `avatar` set, the card shows a gradient **initials** avatar — clean, no broken image.
- These avatars are bundled and served locally (no LinkedIn hot-linking).
