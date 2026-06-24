import { useSyncExternalStore } from "react";
import type { Work } from "./types";
import baseData from "./works.json";
import committedData from "./works.custom.json";

/**
 * Single source of truth for the works gallery.
 *
 * Three layers, merged (deduped by id, earlier wins):
 *   1. local       — projects you add in the admin, saved in localStorage on THIS device
 *   2. committed    — src/data/works.custom.json (your exported additions, in the repo)
 *   3. base         — src/data/works.json (generated from the Google Sheet)
 *
 * On top of that, the admin can flip any project's "favourite" flag; those
 * overrides live in localStorage and are folded into the exported file so the
 * curated favourites show for everyone after you commit.
 */
const LS_KEY = "portfolio-admin-works";
const LS_FAV = "portfolio-fav-overrides";
const BASE = baseData as Work[];
const COMMITTED = committedData as Work[];

function readLocal(): Work[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as Work[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(arr: Work[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota / privacy errors */
  }
}

function readFav(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_FAV);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? (obj as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeFav(map: Record<string, boolean>) {
  try {
    localStorage.setItem(LS_FAV, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function uniqueById(arr: Work[]): Work[] {
  const seen = new Set<string>();
  const out: Work[] = [];
  for (const w of arr) {
    if (w && w.id && !seen.has(w.id)) {
      seen.add(w.id);
      out.push(w);
    }
  }
  return out;
}

let local: Work[] = readLocal();
let favOverrides: Record<string, boolean> = readFav();

/** Apply favourite overrides to a merged list (returns fresh objects). */
function applyFav(list: Work[]): Work[] {
  return list.map((w) =>
    favOverrides[w.id] !== undefined && favOverrides[w.id] !== w.favourite
      ? { ...w, favourite: favOverrides[w.id] }
      : w
  );
}

function compute(): Work[] {
  return applyFav(uniqueById([...local, ...COMMITTED, ...BASE]));
}

let snapshot: Work[] = compute();
const listeners = new Set<() => void>();

function emit() {
  snapshot = compute();
  listeners.forEach((l) => l());
}

export const worksStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  getSnapshot(): Work[] {
    return snapshot;
  },
  /** Only the projects added on this device (layer 1). */
  getLocal(): Work[] {
    return local;
  },
  /** Whether `id` is currently favourited (override-aware). */
  isFavourite(id: string): boolean {
    return snapshot.find((w) => w.id === id)?.favourite ?? false;
  },
  /** How many favourite overrides differ from the original data. */
  favOverrideCount(): number {
    return Object.keys(favOverrides).length;
  },
  /**
   * Custom additions + favourite overrides, ready to commit as works.custom.json.
   * Overridden base/committed works are emitted as full copies (they win by id).
   */
  getExportable(): Work[] {
    const out: Work[] = [];
    const seen = new Set<string>();
    for (const w of local) {
      out.push({ ...w, favourite: favOverrides[w.id] ?? w.favourite });
      seen.add(w.id);
    }
    for (const w of [...COMMITTED, ...BASE]) {
      if (seen.has(w.id)) continue;
      if (favOverrides[w.id] !== undefined && favOverrides[w.id] !== w.favourite) {
        out.push({ ...w, favourite: favOverrides[w.id] });
        seen.add(w.id);
      }
    }
    return out;
  },
  add(work: Work) {
    local = [work, ...local.filter((w) => w.id !== work.id)];
    writeLocal(local);
    emit();
  },
  update(id: string, patch: Partial<Work>) {
    local = local.map((w) => (w.id === id ? { ...w, ...patch } : w));
    writeLocal(local);
    emit();
  },
  remove(id: string) {
    local = local.filter((w) => w.id !== id);
    writeLocal(local);
    emit();
  },
  /** Admin-only: flip a project's favourite flag (works for base + custom). */
  toggleFavourite(id: string) {
    const current = worksStore.isFavourite(id);
    const original =
      [...local, ...COMMITTED, ...BASE].find((w) => w.id === id)?.favourite ?? false;
    const next = !current;
    favOverrides = { ...favOverrides };
    if (next === original) delete favOverrides[id];
    else favOverrides[id] = next;
    writeFav(favOverrides);
    emit();
  },
  clearLocal() {
    local = [];
    favOverrides = {};
    writeLocal(local);
    writeFav(favOverrides);
    emit();
  },
  importLocal(arr: Work[]) {
    local = uniqueById([...arr, ...local]);
    writeLocal(local);
    emit();
  },
};

/** Stable id from a title plus a short random suffix. */
export function makeWorkId(title: string): string {
  const slug =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "work";
  const rand = Math.random().toString(36).slice(2, 7);
  return `custom-${slug}-${rand}`;
}

/** React hook: the merged, reactive works list. */
export function useWorks(): Work[] {
  return useSyncExternalStore(worksStore.subscribe, worksStore.getSnapshot, worksStore.getSnapshot);
}
