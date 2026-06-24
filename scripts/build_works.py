#!/usr/bin/env python3
"""
Parse the raw Google-Sheets export (works_raw.csv) into a clean, structured
works.json that the React app consumes.

Re-run any time the sheet changes:
    python scripts/build_works.py

Each work gets: id, url, company, platform, kind, complexity, tags,
favourite, title, year (best-effort). Company is derived from the URL domain
via COMPANY_MAP below — edit that map (or works.json directly) to re-attribute.
"""
import csv
import json
import os
import re
import base64
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_CSV = os.path.join(ROOT, "works_raw.csv")
OUT_JSON = os.path.join(ROOT, "src", "data", "works.json")

# Domain -> (company, platform). Edit to re-attribute a project to a company.
COMPANY_MAP = {
    "demo.perion.com":      ("Perion", "Perion"),
    "su-p.undertone.com":   ("Perion", "Undertone"),
    "admin.sparkflow.net":  ("Perion", "Sparkflow"),
    "amigogaming.com":      ("Amigo Gaming", "Amigo Gaming"),
    "webelefont.github.io": ("WebElefont", "WebElefont"),
    "angular.practicu.com": ("ANVI", "Practicu"),   # assumption — Angular learning platform
    "newt.co.il":           ("ANVI", "Newt"),        # assumption — Israeli retail client
}

# Pretty names for special, recognizable URLs.
KNOWN_TITLES = {
    "amigogaming.com": "Football Hits — Slot Game",
    "webelefont.github.io": "Toy Therapy Room",
    "angular.practicu.com": "Angular Learning Platform",
    "newt.co.il": "Newt — Retail Store",
}

# Override the auto-derived category for specific hosts (tags can be misleading).
KNOWN_KINDS = {
    "angular.practicu.com": "Site",  # a learning platform, not retail
}

# Tag normalization: raw sheet label -> clean tag.
TAG_RENAME = {
    "Retail(API/Products/Maps)": "Retail / API",
    "Expandable on click": "Expandable",
    "Hover animation": "Hover FX",
    "Hot Spots": "Hotspots",
    "My favourite": "__FAV__",
    "Slot Game": "Slot Game",
}

# Priority order for deriving the single "kind" badge / category filter.
KIND_PRIORITY = [
    ("Slot Game", "Game"),
    ("Game", "Game"),
    ("Retail / API", "Retail"),
    ("Site", "Site"),
    ("3D", "3D"),
    ("AI", "AI"),
    ("SVG", "SVG"),
    ("Carousel", "Carousel"),
    ("Animation", "Animation"),
]


def jwt_id(query_d):
    """Decode the creative id out of a Sparkflow JWT 'd' param."""
    try:
        token = query_d.split("&")[0]
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)  # pad base64
        data = json.loads(base64.urlsafe_b64decode(payload))
        return str(data.get("id", ""))
    except Exception:
        return ""


def extract_id(url):
    host = urlparse(url).netloc
    if "perion.com" in host or "undertone.com" in host:
        m = re.search(r"/(\d+)(?:[#?].*)?$", urlparse(url).path)
        return m.group(1) if m else ""
    if "sparkflow.net" in host:
        m = re.search(r"[?&]d=([^&]+)", url)
        return jwt_id(m.group(1)) if m else ""
    return ""


def derive_kind(tags):
    for raw, kind in KIND_PRIORITY:
        if raw in tags:
            return kind
    return "Misc"


def make_title(url, kind, tags, cid):
    host = urlparse(url).netloc
    if host in KNOWN_TITLES:
        return KNOWN_TITLES[host]
    company, platform = COMPANY_MAP.get(host, ("Project", "Web"))
    label = {
        "Game": "Interactive Game",
        "Retail": "Retail Experience",
        "Site": "Website",
        "3D": "3D Experience",
        "AI": "AI Creative",
        "SVG": "SVG Animation",
        "Carousel": "Carousel Creative",
        "Animation": "Animated Creative",
        "Misc": "Interactive Creative",
    }.get(kind, "Interactive Creative")
    return f"{label} #{cid}" if cid else label


def main():
    works = []
    seen = 0
    with open(SRC_CSV, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)  # header
        for row in reader:
            if len(row) < 2:
                continue
            url = (row[0] or "").strip()
            stars = (row[1] or "").strip()
            raw_tags = (row[2] if len(row) > 2 else "").strip()
            if not url.startswith("http"):
                continue
            complexity = stars.count("⭐")
            if complexity == 0:
                continue
            seen += 1

            tags = []
            favourite = False
            for t in [x.strip() for x in raw_tags.split(",") if x.strip()]:
                t = TAG_RENAME.get(t, t)
                if t == "__FAV__":
                    favourite = True
                elif t not in tags:
                    tags.append(t)

            host = urlparse(url).netloc
            company, platform = COMPANY_MAP.get(host, ("Other", host))
            cid = extract_id(url)
            kind = KNOWN_KINDS.get(host, derive_kind(tags))
            title = make_title(url, kind, tags, cid)

            works.append({
                "id": f"{platform.lower().replace(' ', '-')}-{cid or seen}",
                "url": url,
                "title": title,
                "company": company,
                "platform": platform,
                "kind": kind,
                "complexity": complexity,
                "tags": tags,
                "favourite": favourite,
            })

    # Preserve locally-fetched thumbnails (public/shots) across regeneration.
    try:
        prev = {w["id"]: w.get("thumb") for w in json.load(open(OUT_JSON, encoding="utf-8"))}
        for w in works:
            if prev.get(w["id"]):
                w["thumb"] = prev[w["id"]]
    except Exception:
        pass

    # Stable, useful default order: favourites first, then complexity desc.
    works.sort(key=lambda w: (not w["favourite"], -w["complexity"]))

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(works, f, ensure_ascii=False, indent=2)

    # Quick summary to stdout
    from collections import Counter
    print(f"Parsed {len(works)} works -> {OUT_JSON}")
    print("By company:", dict(Counter(w["company"] for w in works)))
    print("By kind:   ", dict(Counter(w["kind"] for w in works)))
    print("Favourites:", sum(w["favourite"] for w in works))
    all_tags = Counter(t for w in works for t in w["tags"])
    print("Tags:      ", dict(all_tags))


if __name__ == "__main__":
    main()
