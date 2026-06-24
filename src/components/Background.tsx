import { useRef } from "react";
import { gsap, useGSAP } from "../lib/gsap";
import { useReducedMotion } from "../lib/motionPref";
import styles from "./Background.module.css";

/** Fixed cyber backdrop: perspective grid, scanlines and drifting neon orbs. */
export default function Background() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      const orbs = gsap.utils.toArray<HTMLElement>(`.${styles.orb}`);
      orbs.forEach((orb, i) => {
        gsap.to(orb, {
          x: () => gsap.utils.random(-90, 90),
          y: () => gsap.utils.random(-70, 70),
          scale: () => gsap.utils.random(0.85, 1.25),
          duration: gsap.utils.random(9, 15),
          delay: i * 0.7,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });
    },
    { scope: root, dependencies: [reduced] }
  );

  return (
    <div ref={root} className={styles.bg} aria-hidden="true">
      <div className={styles.grid} />
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.orb} ${styles.orb3}`} />
      <div className={styles.scanlines} />
      <div className={styles.vignette} />
    </div>
  );
}
