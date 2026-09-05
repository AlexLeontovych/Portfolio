import { useSyncExternalStore } from "react";

/**
 * Open/close state for the tower-defense overlay, plus the best difficulty
 * cleared on each level. Same external-store idiom as the other two games, so
 * any card on the page can open it.
 */
const CLEARED_KEY = "portfolio-td-cleared";

export type TdRank = "casual" | "normal" | "veteran";
const ORDER: TdRank[] = ["casual", "normal", "veteran"];

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readCleared(): Record<number, TdRank> {
  try {
    return JSON.parse(localStorage.getItem(CLEARED_KEY) ?? "{}") as Record<number, TdRank>;
  } catch {
    return {}; // blocked storage just means progress does not persist
  }
}

export const td = {
  open() {
    if (open) return;
    open = true;
    emit();
  },
  close() {
    if (!open) return;
    open = false;
    emit();
  },
  isOpen: () => open,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },

  cleared: readCleared,
  /** Highest level index the player may start, one past the furthest cleared. */
  unlocked(): number {
    const keys = Object.keys(readCleared()).map(Number);
    return keys.length ? Math.min(4, Math.max(...keys) + 1) : 0;
  },
  recordClear(level: number, diff: TdRank) {
    const all = readCleared();
    const prev = all[level];
    if (prev && ORDER.indexOf(prev) >= ORDER.indexOf(diff)) return;
    all[level] = diff;
    try {
      localStorage.setItem(CLEARED_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  },
};

export function useTdOpen(): boolean {
  return useSyncExternalStore(td.subscribe, td.isOpen, td.isOpen);
}
