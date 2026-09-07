import { useSyncExternalStore } from "react";

/**
 * One switch for the sound of all three games.
 *
 * They are three separate canvases that never run at once, but they are one
 * page and, to whoever is reading it at work, one decision: sound, or no
 * sound. Turning it off in the platformer and finding the tower defense
 * loud is the kind of small betrayal a portfolio cannot afford, so the
 * setting lives here and survives the tab being closed.
 */
const KEY = "portfolio-muted";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // blocked storage just means the choice does not persist
  }
}

let muted = read();
const listeners = new Set<() => void>();

export const sound = {
  muted: () => muted,
  set(m: boolean) {
    if (m === muted) return;
    muted = m;
    try {
      localStorage.setItem(KEY, m ? "1" : "0");
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  toggle() {
    sound.set(!muted);
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

export function useMuted(): boolean {
  return useSyncExternalStore(sound.subscribe, sound.muted, sound.muted);
}
