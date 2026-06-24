import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "../lib/gsap";
import { useReducedMotion } from "../lib/motionPref";
import { useI18n } from "../i18n/I18nContext";

/**
 * Scroll-reveal for a section. Returns a ref to attach to the section root;
 * every descendant with [data-reveal] fades/slides in once on scroll.
 * Use [data-reveal-delay="0.2"] on an element to delay it.
 *
 * Rebuilds when the reduce-motion preference or language changes (the latter
 * remounts localized [data-reveal] nodes), so triggers never go stale and
 * freshly-mounted nodes always get revealed.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const scope = useRef<T>(null);
  const reduced = useReducedMotion();
  const { lang } = useI18n();

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", root);
      if (reduced) {
        gsap.set(items, { clearProps: "all" });
        items.forEach((el) => el.classList.add("is-in"));
        return;
      }

      items.forEach((el) => {
        const delay = parseFloat(el.dataset.revealDelay || "0");
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 34 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            delay,
            ease: "power3.out",
            onStart: () => el.classList.add("is-in"),
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              toggleActions: "play none none none",
            },
          }
        );
      });
    },
    { scope, dependencies: [reduced, lang] }
  );

  return scope;
}

/** Manually nudge ScrollTrigger to recalculate (after layout-changing updates). */
export function refreshScrollTriggers() {
  requestAnimationFrame(() => ScrollTrigger.refresh());
}
