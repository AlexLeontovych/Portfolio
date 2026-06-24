import { useSyncExternalStore } from "react";

/**
 * Small "disable your ad blocker" notice shown before opening a Perion live
 * demo (those are real ad creatives that ad blockers can break). The user can
 * tick "don't show again" to skip it from then on (persisted in localStorage).
 */
const KEY = "portfolio-adblock-dismissed";

let pending: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export const adblockNotice = {
  /**
   * For a Perion live-demo link: if the warning hasn't been dismissed, stash the
   * URL and open the notice. Returns true when it took over the click (the
   * caller should then preventDefault); false to let the link open normally.
   */
  intercept(url: string, company: string): boolean {
    if (company !== "Perion" || dismissed()) return false;
    pending = url;
    emit();
    return true;
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  pendingUrl: () => pending,
  close() {
    if (pending === null) return;
    pending = null;
    emit();
  },
  proceed(dontShowAgain: boolean) {
    if (dontShowAgain) {
      try {
        localStorage.setItem(KEY, "true");
      } catch {
        /* ignore */
      }
    }
    const url = pending;
    pending = null;
    emit();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  },
};

/** Reactive pending demo URL (null when the notice is closed). */
export function usePendingDemo(): string | null {
  return useSyncExternalStore(
    adblockNotice.subscribe,
    adblockNotice.pendingUrl,
    adblockNotice.pendingUrl
  );
}
