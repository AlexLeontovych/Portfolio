import { useRef } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useMagnetic } from "../hooks/useMagnetic";
import { gsap, useGSAP, motionDisabled } from "../lib/gsap";
import { profile, stats } from "../data/profile";
import { ArrowRight, ArrowDown, Sparkles } from "./Icons";
import Billboard from "./Billboard";
import styles from "./Hero.module.css";

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const worksBtn = useMagnetic<HTMLAnchorElement>(0.4);
  const contactBtn = useMagnetic<HTMLAnchorElement>(0.4);
  const { t, tr } = useI18n();

  useGSAP(
    () => {
      if (motionDisabled()) return;
      const q = gsap.utils.selector(root);
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(q(`.${styles.badge}`), { autoAlpha: 0, y: 16, duration: 0.6 })
        .from(q(`.${styles.titleLine}`), { yPercent: 115, duration: 0.9, stagger: 0.12 }, "-=0.2")
        .from(
          q(`.${styles.portrait}`),
          { autoAlpha: 0, scale: 0.92, x: 40, duration: 0.9 },
          "-=0.8"
        )
        .from(q(`.${styles.role}`), { autoAlpha: 0, y: 20, duration: 0.6 }, "-=0.6")
        .from(q(`.${styles.lead}`), { autoAlpha: 0, y: 20, duration: 0.6 }, "-=0.4")
        .from(q(`.${styles.ctas} > *`), { autoAlpha: 0, y: 20, duration: 0.5, stagger: 0.1 }, "-=0.4")
        .add("stats", "-=0.3")
        .from(q(`.${styles.stat}`), { autoAlpha: 0, y: 24, duration: 0.5, stagger: 0.08 }, "stats")
        .from(q(`.${styles.scroll}`), { autoAlpha: 0, duration: 0.6 }, "-=0.2");

      // Count each stat number up from 0 to its target, in sync with the
      // stats fade-in. Keeps any non-digit prefix/suffix (e.g. the trailing "+").
      q(`.${styles.statValue}`).forEach((el) => {
        const m = (el.dataset.value ?? "").match(/^(\D*)(\d+)(\D*)$/);
        if (!m) return;
        const [, pre, digits, suf] = m;
        const end = parseInt(digits, 10);
        const counter = { v: 0 };
        el.textContent = `${pre}0${suf}`;
        tl.to(
          counter,
          {
            v: end,
            duration: 1.1,
            ease: "power2.out",
            snap: { v: 1 },
            onUpdate: () => {
              el.textContent = `${pre}${Math.round(counter.v)}${suf}`;
            },
          },
          "stats"
        );
      });
    },
    { scope: root }
  );

  const titleLines = ["Oleksandr", "Leontovych"];

  return (
    <section ref={root} className={styles.hero} aria-label={profile.name}>
      <Billboard />
      <div className={`container ${styles.grid}`}>
        <div className={styles.content}>
          <p className={styles.badge}>
            <Sparkles width={15} height={15} />
            <span className={styles.dot} aria-hidden="true" />
            {tr(profile.available)} · {profile.handle}
          </p>

          <h1 className={styles.title}>
            {titleLines.map((line) => (
              <span key={line} className={styles.titleMask}>
                <span className={styles.titleLine} data-text={line}>
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <p className={styles.role}>{t("hero.tagline")}</p>
          <p className={styles.lead}>{t("hero.lead")}</p>

          <div className={styles.ctas}>
            <a ref={worksBtn} href="#works" className={`btn ${styles.cta}`}>
              {t("hero.cta_works")} <ArrowRight width={18} height={18} />
            </a>
            <a ref={contactBtn} href="#contact" className="btn btn--ghost">
              {t("hero.cta_contact")}
            </a>
          </div>

          <dl className={styles.stats}>
            {stats.map((s) => (
              <div key={s.value} className={styles.stat}>
                <dt className={styles.statValue} data-value={s.value}>
                  {s.value}
                </dt>
                <dd className={styles.statLabel}>{tr(s.label)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure className={styles.portrait}>
          <img src={profile.photo} alt={profile.name} width={680} height={850} />
        </figure>
      </div>

      <a href="#about" className={styles.scroll} aria-label={t("hero.scroll")}>
        <span>{t("hero.scroll")}</span>
        <ArrowDown width={18} height={18} className={styles.scrollIcon} />
      </a>
    </section>
  );
}
