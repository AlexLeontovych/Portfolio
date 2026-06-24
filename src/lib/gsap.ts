import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** True when the user prefers reduced motion (or has toggled it off). */
export function motionDisabled(): boolean {
  if (typeof window === "undefined") return false;
  const attr = document.documentElement.getAttribute("data-reduce-motion");
  if (attr === "true") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export { gsap, ScrollTrigger, useGSAP };
