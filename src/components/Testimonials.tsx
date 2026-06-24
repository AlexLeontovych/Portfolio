import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import { useReducedMotion } from "../lib/motionPref";
import { testimonials, type Testimonial } from "../data/testimonials";
import { ArrowLeft, ArrowRight, ArrowUpRight, Linkedin, Quote } from "./Icons";
import styles from "./Testimonials.module.css";

/** Accent gradient per card, for the initials-avatar fallback. */
const GRADIENTS: [string, string][] = [
  ["var(--magenta)", "var(--violet)"],
  ["var(--cyan)", "var(--violet)"],
  ["var(--lime)", "var(--cyan)"],
  ["var(--amber)", "var(--magenta)"],
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Photo if one is dropped in public/reviews/, otherwise initials. */
function Avatar({ tm, a, b }: { tm: Testimonial; a: string; b: string }) {
  const [failed, setFailed] = useState(false);
  if (tm.avatar && !failed) {
    return (
      <img
        className={styles.avatar}
        src={tm.avatar}
        alt=""
        loading="lazy"
        onLoad={(e) => {
          // dev server may answer a missing file with 200 HTML — that "loads"
          // but decodes to nothing, so treat zero natural width as a miss.
          if (e.currentTarget.naturalWidth === 0) setFailed(true);
        }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={styles.avatar}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden="true"
    >
      {initials(tm.name)}
    </span>
  );
}

export default function Testimonials() {
  const { t, tr } = useI18n();
  const scope = useReveal<HTMLElement>();
  const reduced = useReducedMotion();
  const count = testimonials.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = (i: number) => setIndex((i + count) % count);

  // Auto-advance; respects "reduce motion" and pauses on hover/focus.
  useEffect(() => {
    if (reduced || paused) return;
    const id = window.setInterval(() => setIndex((p) => (p + 1) % count), 8000);
    return () => window.clearInterval(id);
  }, [reduced, paused, count]);

  // Pointer swipe — and suppress the click that follows a real drag so a swipe
  // never accidentally opens a LinkedIn profile.
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragged.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current !== null && Math.abs(e.clientX - startX.current) > 8) dragged.current = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
    startX.current = null;
  };
  const onCardClick = (e: React.MouseEvent) => {
    if (dragged.current) {
      e.preventDefault();
      dragged.current = false;
    }
  };

  return (
    <section id="testimonials" ref={scope} className="section">
      <div className="container">
        <header data-reveal>
          <span className="kicker">{t("testimonials.kicker")}</span>
          <h2 className="section-title">{t("testimonials.title")}</h2>
        </header>

        <div
          className={styles.carousel}
          data-reveal
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          aria-roledescription="carousel"
          aria-label={t("testimonials.title")}
        >
          <div
            className={styles.viewport}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <ul className={styles.track} style={{ transform: `translateX(-${index * 100}%)` }}>
              {testimonials.map((tm, i) => {
                const [a, b] = GRADIENTS[i % GRADIENTS.length];
                return (
                  <li
                    key={tm.id}
                    className={styles.slide}
                    aria-hidden={i !== index}
                    aria-roledescription="slide"
                  >
                    <a
                      className={styles.card}
                      href={tm.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={i === index ? 0 : -1}
                      onClick={onCardClick}
                      aria-label={`${t("testimonials.profile")}: ${tm.name}`}
                    >
                      <div className={styles.cardTop}>
                        <Quote className={styles.quoteMark} aria-hidden="true" />
                        <span className={styles.relation}>{tr(tm.relation)}</span>
                      </div>

                      <blockquote className={styles.quote}>{tr(tm.text)}</blockquote>

                      <div className={styles.person}>
                        <Avatar tm={tm} a={a} b={b} />
                        <span className={styles.personText}>
                          <span className={styles.name}>{tm.name}</span>
                          <span className={styles.role}>{tm.role}</span>
                        </span>
                        <span className={styles.meta}>
                          <Linkedin width={15} height={15} />
                          <span className={styles.date}>{tm.date}</span>
                          <ArrowUpRight className={styles.extLink} width={15} height={15} />
                          <span className="sr-only">{t("a11y.new_tab")}</span>
                        </span>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.arrow}
              onClick={() => go(index - 1)}
              aria-label={t("testimonials.prev")}
            >
              <ArrowLeft width={20} height={20} />
            </button>

            <div className={styles.dots}>
              {testimonials.map((tm, i) => (
                <button
                  key={tm.id}
                  type="button"
                  className={`${styles.dot} ${i === index ? styles.dotOn : ""}`}
                  aria-label={`${t("testimonials.goto")} ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => go(i)}
                />
              ))}
            </div>

            <button
              type="button"
              className={styles.arrow}
              onClick={() => go(index + 1)}
              aria-label={t("testimonials.next")}
            >
              <ArrowRight width={20} height={20} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
