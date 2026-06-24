import { useSyncExternalStore } from "react";

/**
 * Finish-line celebration: when the scrolling road car reaches the very end of
 * the page for the FIRST time ever, we fire confetti and open a "let's get in
 * touch" popup. The first-time flag is persisted in localStorage so it only
 * ever happens once per visitor.
 */
const KEY = "portfolio-finish-celebrated";

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function alreadyCelebrated(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

function markCelebrated() {
  try {
    localStorage.setItem(KEY, "true");
  } catch {
    /* ignore */
  }
}

export const finishCelebration = {
  /**
   * Called by the road when the car hits the end. Opens the popup once ever;
   * no-op if it has already fired (this session or a previous visit) or is open.
   */
  trigger() {
    if (open || alreadyCelebrated()) return;
    markCelebrated();
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
};

// Dev-only helper to preview the celebration without scrolling the road to the
// end: run `__celebrate()` in the browser console. Stripped from prod builds.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __celebrate: () => void }).__celebrate = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    finishCelebration.trigger();
  };
}

/** Reactive popup open state. */
export function useFinishOpen(): boolean {
  return useSyncExternalStore(
    finishCelebration.subscribe,
    finishCelebration.isOpen,
    finishCelebration.isOpen
  );
}
