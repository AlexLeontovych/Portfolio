# Oleksandr Leontovych — Portfolio

A fast, animated, fully responsive **cyber-arcade** portfolio for a Front-End / JS
Game Developer. Built with **React + TypeScript + Vite + GSAP**.

- 🎮 **Cyber-arcade** visual design — neon grid, glitch title, magnetic buttons, scroll reveals.
- 🌍 **Three languages** — English / Українська / Русский, switchable live (default: EN).
- 🗂️ **Dynamic works gallery** — 70+ live demos with auto-generated screenshots, filtered & sorted by **company, category, tag, complexity, favourites** + free-text search.
- 🧭 **Detailed experience timeline** — every role, its company, stack and which projects belong to it.
- ♿ **Accessible** — keyboard nav, focus management, ARIA, "reduce motion" toggle + `prefers-reduced-motion`.
- 🚀 **One-click deploy to GitHub Pages.**

---

## Quick start

```bash
npm install        # install dependencies
npm run dev        # local dev server  → http://localhost:5173
npm run build      # production build   → ./dist
npm run preview    # preview the build
```

> Requires Node 18+ (Node 20 recommended).

---

## ✏️ Before you publish — edit these

| What | File |
|------|------|
| GitHub username / links, email, Telegram | [`src/data/profile.ts`](src/data/profile.ts) |
| Work experience, stacks, bullets (EN/RU/UK) | [`src/data/experience.ts`](src/data/experience.ts) |
| Skills, education, languages | [`src/data/skills.ts`](src/data/skills.ts) |
| UI text (nav, buttons, labels) | [`src/i18n/translations.ts`](src/i18n/translations.ts) |

> ⚠️ The **GitHub link** in `profile.ts` is a best-guess (`github.com/alexleontovych`). Update it.

---

## 🗂️ Updating your works (the gallery)

The gallery reads [`src/data/works.json`](src/data/works.json). Two ways to update it:

**A. Regenerate from the Google Sheet (recommended).**
Re-export the sheet as `works_raw.csv` (File → Download → CSV) into the project root, then:

```bash
npm run data        # = python scripts/build_works.py
```

The script parses each row, derives the **company** from the URL domain
(see `COMPANY_MAP` in [`scripts/build_works.py`](scripts/build_works.py)), reads the
**complexity** from the ⭐ count, splits the **tags**, and flags **favourites**.

**B. Edit `works.json` by hand.** Each entry:

```jsonc
{
  "id": "perion-133942",
  "url": "https://demo.perion.com/creative/133942",
  "title": "SVG Animation #133942",
  "company": "Perion",
  "platform": "Perion",      // sub-brand shown on the card
  "kind": "SVG",             // category badge / filter
  "complexity": 5,           // 1..5 stars
  "tags": ["SVG", "Carousel"],
  "favourite": true,
  "thumb": "..."             // OPTIONAL: custom image URL, overrides the auto screenshot
}
```

### Screenshots
Thumbnails are **pre-fetched and bundled locally** in `public/shots/`, so visitors
load them straight from GitHub Pages (fast, cached, no third-party dependency).

```bash
npm run shots      # = python scripts/fetch_shots.py
```

This downloads a screenshot for every work once (via WordPress mShots, with the
required `Referer` header), compresses it, saves it to `public/shots/<id>.jpg`,
and sets each work's `thumb` to the local path. Re-run any time you add works —
it fills only the gaps and `npm run data` preserves existing local thumbs.

**Automatic on deploy (CI).** You don't have to run this by hand: the GitHub
Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))
runs `fetch_shots.py` on every push, generates any **missing** screenshots, and
**commits the new `public/shots/*.jpg` back to the repo** before building — so a
project added without a photo gets its thumbnail auto-generated and persisted
permanently. ⚠️ CI only sees projects that are **in the repo**, so export your
admin additions to `works.custom.json` and commit them; localStorage-only
projects aren't visible to the build.

Any work *without* a local file falls back at runtime to a live mShots screenshot,
then to a generated gradient poster. To pin your own image, set a work's `"thumb"`
to a URL or drop a file in `public/shots/` and reference `"./shots/my-shot.jpg"`.

---

## 🔐 Admin — add projects in the browser

There's a built-in editor for adding projects without touching code. Open it via
the **🛡 admin icon** in the header (top-right), or by visiting `…/#admin`.

- **Login:** password only — default `admin`. **Change it** in
  [`src/data/adminConfig.ts`](src/data/adminConfig.ts): open the site, run
  `await __genHash("your-password")` in the browser console, and paste the
  printed hash into `passwordHash`.
- **Add a project:** title, link, complexity (1–5), and optional description,
  company, category, tags, favourite, custom screenshot. It appears in the
  gallery **instantly** (saved in your browser's `localStorage`).
- **Curate favourites:** while logged in, a ★ toggle appears on every work card —
  click it to feature/un-feature any project (works for the sheet-imported ones
  too). Visitors only see the resulting badge; they can't change favourites.
- **Make it permanent / shared:** click **Export `works.custom.json`** (which
  includes your additions **and** favourite changes), replace
  [`src/data/works.custom.json`](src/data/works.custom.json) in the repo with the
  downloaded file, then commit & push. The next deploy shows it to everyone.
  **Import JSON** loads an existing file back in.

> ⚠️ **Security:** this is a *static* site, so the login is **soft protection**
> only — it deters casual visitors but is not a real security boundary (the code
> is public). Don't store anything sensitive behind it. For real auth + shared
> server-side storage, add a backend (Supabase, Firebase, or a serverless
> function) and have the admin write there instead of `localStorage`.

The gallery merges three layers (deduped by `id`): your local `localStorage`
additions → committed `works.custom.json` → generated `works.json`.

---

## 🚀 Deploy to GitHub Pages

**Automatic (GitHub Actions — recommended):**

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` builds and deploys via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

The build uses a **relative base** (`base: "./"` in `vite.config.ts`), so it works at
`https://<user>.github.io/<repo>/` without any extra path config.

**Manual (gh-pages branch):**

```bash
npm run deploy      # builds and pushes ./dist to the gh-pages branch
```
Then set **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**.

---

## Tech

React 18 · TypeScript · Vite 6 · GSAP 3 (ScrollTrigger, useGSAP) · CSS Modules.
No UI framework — hand-crafted design system in [`src/styles/tokens.css`](src/styles/tokens.css).
