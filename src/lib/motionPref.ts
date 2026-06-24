import { useSyncExternalStore } from "react";

/**
 * App-wide "reduce motion" preference, shared as an external store so GSAP hooks
 * can react to runtime toggling (not just read it once at mount). Mirrors the
 * value onto <html data-reduce-motion> for the CSS kill-switch in tokens.css.
 */
const KEY = "portfolio-reduce-motion";

function initial(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined"
    ? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    : false;
}

let reduced = initial();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-reduce-motion", String(reduced));
  }
}
apply();

export const motionPref = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  get(): boolean {
    return reduced;
  },
  set(v: boolean) {
    if (v === reduced) return;
    reduced = v;
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      /* ignore */
    }
    apply();
    listeners.forEach((l) => l());
  },
  toggle() {
    motionPref.set(!reduced);
  },
};

/** Reactive boolean — re-renders the component when the preference changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(motionPref.subscribe, motionPref.get, motionPref.get);
}
