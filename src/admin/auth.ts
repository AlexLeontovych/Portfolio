import { useSyncExternalStore } from "react";
import { adminConfig } from "../data/adminConfig";

const SESSION_KEY = "portfolio-admin-session";
const listeners = new Set<() => void>();

function readSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

let authed = readSession();
const notify = () => listeners.forEach((l) => l());

/** SHA-256 → lowercase hex. Requires a secure context (https / localhost). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Password-only login. */
export async function login(password: string): Promise<boolean> {
  let hash: string;
  try {
    hash = await sha256Hex(password);
  } catch {
    return false;
  }
  const ok = hash === adminConfig.passwordHash;
  if (ok) {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    authed = true;
    notify();
  }
  return ok;
}

export function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  authed = false;
  notify();
}

export function isAuthed(): boolean {
  return authed;
}

const authStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  get: () => authed,
};

/** Reactive auth state — components re-render on login/logout. */
export function useAuth(): boolean {
  return useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);
}

// Console helper to generate a new password hash for adminConfig.ts:
//   await __genHash("my-new-password")
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__genHash = async (p: string) => {
    const h = await sha256Hex(p);
    // eslint-disable-next-line no-console
    console.log("passwordHash:", h);
    return h;
  };
}
