import { motionPref, useReducedMotion } from "../lib/motionPref";

/**
 * User-controllable "reduce motion" preference, backed by a shared reactive
 * store (src/lib/motionPref) so GSAP hooks can respond to runtime toggles.
 */
export function useMotionPref(): [boolean, () => void] {
  const reduced = useReducedMotion();
  return [reduced, motionPref.toggle];
}
