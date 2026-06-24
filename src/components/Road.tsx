import { useEffect, useRef } from "react";
import styles from "./Road.module.css";
import { finishCelebration } from "../lib/finishCelebration";

/**
 * A winding 2D "road" that runs down the page behind the content and a little
 * car that drives along it as you scroll (down on scroll-down, back up on
 * scroll-up). The road snakes left/right so it sometimes sits under the content
 * blocks and sometimes peeks out into the side margins. Desktop only.
 *
 * One sine-based polyline path spans the whole document; the car is placed with
 * getPointAtLength(progress · length) and rotated to the path tangent.
 */
export default function Road() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const carRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    const car = carRef.current;
    if (!svg || !path || !car) return;

    let docH = 0;
    let len = 0;
    let raf = 0;
    let resizeT = 0;
    let finished = false;

    const place = () => {
      raf = 0;
      const max = docH - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // Car reached the very end → fire the finish-line celebration (once).
      if (!finished && max > 0 && progress >= 0.999) {
        finished = true;
        finishCelebration.trigger();
      }
      const at = progress * len;
      const p = path.getPointAtLength(at);
      const a = path.getPointAtLength(Math.max(0, at - 3));
      const b = path.getPointAtLength(Math.min(len, at + 3));
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      car.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    };

    const build = () => {
      const w = window.innerWidth;
      if (w < 50) return; // layout not ready yet
      // Measure the real content end (bottom of <main>/<footer>) rather than
      // scrollHeight — the road is absolute and otherwise inflates scrollHeight in
      // a feedback loop, making it run on forever past the footer. This adapts to
      // the actual page height dynamically (recomputed on resize / content change).
      let contentBottom = 0;
      for (const el of [document.querySelector("main"), document.querySelector("footer")]) {
        if (el) contentBottom = Math.max(contentBottom, el.getBoundingClientRect().bottom + window.scrollY);
      }
      if (!contentBottom) contentBottom = document.documentElement.scrollHeight;
      const h = Math.max(Math.round(contentBottom), window.innerHeight);
      if (Math.abs(h - docH) < 4 && svg.getAttribute("viewBox")?.startsWith(`0 0 ${w} `)) {
        place();
        return;
      }
      docH = h;
      const cx = w * 0.5;
      // Swing the road out toward the page side borders, not just under the
      // content. Amplitude grows from the content edge (half of --maxw: 1200px)
      // most of the way into the side margin; a border gap keeps the thick stroke
      // from clipping at the page edge. Scales with viewport width (adaptive).
      const contentHalf = Math.min(600, cx); // half of the 1200px content column
      const borderGap = 52; // min distance from a road peak to the page edge
      const amp = Math.min(cx - borderGap, contentHalf + (cx - contentHalf) * 0.82);
      const waves = Math.max(2, docH / 850);
      const steps = Math.max(24, Math.round(docH / 22));
      let d = `M ${cx.toFixed(1)} 0`;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = cx + amp * Math.sin(t * waves * Math.PI * 2);
        d += ` L ${x.toFixed(1)} ${(t * docH).toFixed(1)}`;
      }
      svg.querySelectorAll("path").forEach((pp) => pp.setAttribute("d", d));
      svg.setAttribute("viewBox", `0 0 ${w} ${docH}`);
      svg.style.height = `${docH}px`;
      len = path.getTotalLength();
      place();
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = window.setTimeout(build, 160);
    };

    build();
    requestAnimationFrame(build); // rebuild once layout/width is settled
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      clearTimeout(resizeT);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg ref={svgRef} className={styles.road} preserveAspectRatio="none" aria-hidden="true">
      <path ref={pathRef} className={styles.edge} />
      <path className={styles.asphalt} />
      <path className={styles.lane} />

      <g ref={carRef} className={styles.car}>
        {/* drawn lying along +x (nose at +x); rotated to the path tangent */}
        <rect x="-13" y="-10.5" width="7" height="3" rx="1.2" className={styles.wheel} />
        <rect x="-13" y="7.5" width="7" height="3" rx="1.2" className={styles.wheel} />
        <rect x="6" y="-10.5" width="7" height="3" rx="1.2" className={styles.wheel} />
        <rect x="6" y="7.5" width="7" height="3" rx="1.2" className={styles.wheel} />
        <rect x="-15" y="-9" width="30" height="18" rx="6" className={styles.body} />
        <rect x="0" y="-6.5" width="9" height="13" rx="3" className={styles.glass} />
        <circle cx="14.5" cy="-4.5" r="1.8" className={styles.light} />
        <circle cx="14.5" cy="4.5" r="1.8" className={styles.light} />
      </g>
    </svg>
  );
}
