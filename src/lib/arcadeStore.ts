import { useSyncExternalStore } from "react";

/**
 * Open/close state of the full-screen "NEON RUN" arcade game (a pseudo-3D
 * OutRun-style mini racer — see components/arcade/). Shared as an external
 * store, same idiom as finishCelebration, so both the floating launch button
 * and the road car can open it from anywhere.
 */
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const arcade = {
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
};

/** Reactive overlay open state. */
export function useArcadeOpen(): boolean {
  return useSyncExternalStore(arcade.subscribe, arcade.isOpen, arcade.isOpen);
}
