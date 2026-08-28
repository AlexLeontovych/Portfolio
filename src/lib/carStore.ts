import { useSyncExternalStore } from "react";
import { CAR_KEY, CAR_STYLES } from "../components/arcade/cars";

/**
 * Which garage car is selected. Shared between the NEON RUN garage and the
 * little car on the page's scrolling road: the store mirrors the choice onto
 * CSS variables (--road-car-body / --road-car-stroke) that Road.module.css
 * picks up, and persists it in localStorage.
 */

function initial(): number {
  try {
    const v = parseInt(localStorage.getItem(CAR_KEY) ?? "0", 10);
    if (v >= 0 && v < CAR_STYLES.length) return v;
  } catch {
    /* ignore */
  }
  return 0;
}

let idx = initial();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document === "undefined") return;
  const page = CAR_STYLES[idx].page;
  document.documentElement.style.setProperty("--road-car-body", page.body);
  document.documentElement.style.setProperty("--road-car-stroke", page.stroke);
}
apply();

export const carStore = {
  get: () => idx,
  set(v: number) {
    if (v === idx || v < 0 || v >= CAR_STYLES.length) return;
    idx = v;
    try {
      localStorage.setItem(CAR_KEY, String(v));
    } catch {
      /* ignore */
    }
    apply();
    listeners.forEach((l) => l());
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

/** Reactive selected-car index. */
export function useSelectedCar(): number {
  return useSyncExternalStore(carStore.subscribe, carStore.get, carStore.get);
}
