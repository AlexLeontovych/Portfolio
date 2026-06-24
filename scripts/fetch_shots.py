#!/usr/bin/env python3
"""
Download a local screenshot for every work that doesn't have one yet, into
public/shots/, and point the work's `thumb` at the local file. Visitors then
load thumbnails from GitHub Pages (fast, cached) instead of the slow mShots
third-party service.

Covers BOTH the generated sheet (src/data/works.json) AND projects you add in
the admin (src/data/works.custom.json). Only fills gaps — works that already
have a local file or a manual thumb are left untouched.

Workflow for new projects:
    1. add a project in the admin (no photo needed)
    2. Export works.custom.json -> commit it
    3. npm run shots          # generates + saves the missing screenshot(s)
    4. commit public/shots/ + works.custom.json
"""
import io
import json
import os
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "src", "data")
WORKS_FILES = [os.path.join(DATA, "works.json"), os.path.join(DATA, "works.custom.json")]
OUT_DIR = os.path.join(ROOT, "public", "shots")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SHOT_W, SHOT_H = 800, 600
SAVE_W = 760
QUALITY = 80
MAX_TRIES = 6
DELAY = 3.5
WORKERS = 8


def shot_url(url: str) -> str:
    return f"https://s.wordpress.com/mshots/v1/{urllib.parse.quote(url, safe='')}?w={SHOT_W}&h={SHOT_H}"


def origin(url: str) -> str:
    p = urllib.parse.urlparse(url)
    return f"{p.scheme}://{p.netloc}/"


def local_path(wid: str) -> str:
    return os.path.join(OUT_DIR, f"{wid}.jpg")


def needs_shot(w) -> bool:
    """Skip works that already have a local file or a manual (non-shots) thumb."""
    thumb = w.get("thumb") or ""
    if thumb and not thumb.startswith("./shots/"):
        return False  # hand-set URL/path — leave it alone
    if thumb.startswith("./shots/") and os.path.exists(local_path(w["id"])):
        return False  # already generated
    return True


def looks_real(data: bytes) -> bool:
    if len(data) < 8000:
        return False
    try:
        im = Image.open(io.BytesIO(data)).convert("L").resize((48, 48))
    except Exception:
        return False
    return ImageStat.Stat(im).stddev[0] > 11


def download(url: str):
    req = urllib.request.Request(shot_url(url), headers={"User-Agent": UA, "Referer": origin(url)})
    with urllib.request.urlopen(req, timeout=30) as r:
        if r.status != 200 or "image" not in r.headers.get("Content-Type", ""):
            return None
        return r.read()


def fetch_one(work):
    best = None
    for _ in range(MAX_TRIES):
        try:
            data = download(work["url"])
        except Exception:
            data = None
        if data:
            best = data
            if looks_real(data):
                return work["id"], data
        time.sleep(DELAY)
    return work["id"], (best if best and len(best) > 3000 else None)


def save(wid: str, data: bytes) -> bool:
    try:
        im = Image.open(io.BytesIO(data)).convert("RGB")
        if im.width > SAVE_W:
            im = im.resize((SAVE_W, round(im.height * SAVE_W / im.width)), Image.LANCZOS)
        im.save(local_path(wid), "JPEG", quality=QUALITY, optimize=True)
        return True
    except Exception:
        return False


def process(path):
    if not os.path.exists(path):
        return
    works = json.load(open(path, encoding="utf-8"))
    todo = [w for w in works if needs_shot(w)]
    name = os.path.basename(path)
    if not todo:
        print(f"{name}: nothing to do (all {len(works)} already have thumbnails).")
        return

    print(f"{name}: fetching {len(todo)} missing screenshot(s)…")
    done = set()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for wid, data in ex.map(fetch_one, todo):
            ok = bool(data) and save(wid, data)
            print(f"  {'ok  ' if ok else 'fail'} {wid}")
            if ok:
                done.add(wid)

    for w in works:
        if w["id"] in done:
            w["thumb"] = f"./shots/{w['id']}.jpg"
    json.dump(works, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{name}: localized {len(done)}/{len(todo)}.")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for path in WORKS_FILES:
        process(path)


if __name__ == "__main__":
    main()
