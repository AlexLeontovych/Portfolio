/**
 * Ref-counted body scroll lock. Multiple overlays (mobile nav, work modal, admin)
 * can request a lock concurrently; the body only unlocks when the LAST one releases.
 * Restores the previous inline overflow value rather than blindly clearing it.
 */
let count = 0;
let prevOverflow = "";

export function lockScroll() {
  if (count === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  count += 1;
}

export function unlockScroll() {
  count = Math.max(0, count - 1);
  if (count === 0) {
    document.body.style.overflow = prevOverflow;
  }
}
