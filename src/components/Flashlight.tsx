import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useReducedMotion } from "../lib/motionPref";
import styles from "./Flashlight.module.css";

/**
 * A swinging pendant flashlight. Click it to "turn the lights off": the page
 * dims and a spotlight (radial-gradient hole) follows the cursor, so you can
 * explore the dark page with the beam. Pure overlay — no theme change.
 */
export default function Flashlight() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!on || !root) return;

    // moving the beam is a single transform update (compositor-cheap), so set
    // it straight from the pointer — no rAF needed.
    const setPos = (x: number, y: number) => {
      root.style.setProperty("--fx", `${x}px`);
      root.style.setProperty("--fy", `${y}px`);
    };
    setPos(window.innerWidth / 2, window.innerHeight * 0.4);

    const onMouse = (e: MouseEvent) => setPos(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const tt = e.touches[0];
      if (tt) setPos(tt.clientX, tt.clientY);
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
    };
  }, [on]);

  return (
    <div ref={rootRef} className={styles.root} data-on={on}>
      <div className={styles.beam} aria-hidden="true" />
      <div className={styles.warm} aria-hidden="true" />

      <button
        type="button"
        className={`${styles.lamp} ${on ? styles.lampOn : ""} ${reduced ? styles.still : ""}`}
        onClick={() => setOn((v) => !v)}
        aria-pressed={on}
        aria-label={t("a11y.flashlight")}
        title={t("a11y.flashlight")}
      >
        <span className={styles.swing}>
          <svg viewBox="0 0 64 134" width="42" className={styles.svg} aria-hidden="true">
            <line x1="32" y1="0" x2="32" y2="42" className={styles.cord} />
            <circle cx="32" cy="46" r="6" className={styles.ring} />
            <rect x="22" y="52" width="20" height="40" rx="6" className={styles.body} />
            <rect x="22" y="63" width="20" height="4" className={styles.stripe} />
            <path d="M16 92 H48 L53 112 H11 Z" className={styles.head} />
            <ellipse cx="32" cy="112" rx="21" ry="6" className={styles.lens} />
          </svg>
        </span>
      </button>
    </div>
  );
}
