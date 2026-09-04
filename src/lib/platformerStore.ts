import { useSyncExternalStore } from "react";

/**
 * Open/close state of the full-screen "EMBERWOOD" platformer, plus the
 * bit of progress worth surviving a reload. Same external-store idiom as
 * arcadeStore, so any card, nav item or keyboard shortcut can open it.
 */
const PROGRESS_KEY = "portfolio-platformer-progress";
const BEST_KEY = "portfolio-platformer-best";

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(key: string): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0; // private mode, blocked storage — progress just does not persist
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export const platformer = {
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

  /** Highest level index the player has unlocked. */
  unlocked: () => read(PROGRESS_KEY),
  unlock(level: number) {
    if (level > read(PROGRESS_KEY)) write(PROGRESS_KEY, level);
  },
  best: () => read(BEST_KEY),
  recordScore(score: number) {
    if (score > read(BEST_KEY)) {
      write(BEST_KEY, score);
      return true;
    }
    return false;
  },
};

/** Reactive overlay open state. */
export function usePlatformerOpen(): boolean {
  return useSyncExternalStore(platformer.subscribe, platformer.isOpen, platformer.isOpen);
}
