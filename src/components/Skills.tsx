import { useRef } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import { gsap, useGSAP } from "../lib/gsap";
import { useReducedMotion } from "../lib/motionPref";
import { hardSkills, softSkillGroups, aiSkills, education, languages } from "../data/skills";
import styles from "./Skills.module.css";

export default function Skills() {
  const { t, tr, lang } = useI18n();
  const scope = useReveal<HTMLElement>();
  const bars = useRef<HTMLUListElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      const fills = gsap.utils.toArray<HTMLElement>(`.${styles.fill}`, bars.current);
      if (reduced) {
        fills.forEach((f) => (f.style.width = `${f.dataset.val}%`));
        return;
      }
      fills.forEach((f) => {
        gsap.fromTo(
          f,
          { width: "0%" },
          {
            width: `${f.dataset.val}%`,
            duration: 1.1,
            ease: "power2.out",
            scrollTrigger: { trigger: f, start: "top 92%" },
          }
        );
      });
    },
    { scope: bars, dependencies: [reduced, lang] }
  );

  return (
    <section id="skills" ref={scope} className="section">
      <div className="container">
        <header data-reveal>
          <span className="kicker">{t("skills.kicker")}</span>
          <h2 className="section-title">{t("skills.title")}</h2>
        </header>

        {/* hard skills | soft skills */}
        <div className={styles.topGrid}>
          <div className={styles.col} data-reveal>
            <h3 className={styles.colTitle}>{t("skills.hard")}</h3>
            <div className={styles.groups}>
              {hardSkills.map((g) => (
                <div key={tr(g.title)} className={styles.group}>
                  <h4 className={styles.groupTitle}>{tr(g.title)}</h4>
                  <div className={styles.tags}>
                    {g.items.map((it) => (
                      <span key={it} className={styles.skillTag}>
                        {it}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.col} data-reveal data-reveal-delay="0.12">
            <h3 className={styles.colTitle}>{t("skills.soft")}</h3>
            <div className={styles.groups}>
              {softSkillGroups.map((g) => (
                <div key={tr(g.title)} className={styles.group}>
                  <h4 className={styles.groupTitle}>{tr(g.title)}</h4>
                  <div className={styles.tags}>
                    {g.items.map((it) => (
                      <span key={it.en} className={styles.skillTag}>
                        {tr(it)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI skills */}
        <div className={styles.aiBlock} data-reveal>
          <h3 className={styles.colTitle}>
            {t("skills.ai")} <span className={styles.aiBadge}>AI</span>
          </h3>
          <div className={styles.aiGroups}>
            {aiSkills.map((g) => (
              <div key={tr(g.title)} className={styles.group}>
                <h4 className={styles.groupTitle}>{tr(g.title)}</h4>
                <div className={styles.tags}>
                  {g.items.map((it) => (
                    <span key={it} className={styles.skillTag}>
                      {it}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* languages | education */}
        <div className={styles.infoRow}>
          <div className={styles.panel} data-reveal>
            <h3 className={styles.colTitle}>{t("skills.languages")}</h3>
            <ul ref={bars} className={styles.langs}>
              {languages.map((l) => (
                <li key={tr(l.name)} className={styles.lang}>
                  <div className={styles.langRow}>
                    <span className={styles.langName}>{tr(l.name)}</span>
                    <span className={styles.langLevel}>{tr(l.level)}</span>
                  </div>
                  <div className={styles.bar}>
                    <span className={styles.fill} data-val={l.value} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.panel} data-reveal data-reveal-delay="0.12">
            <h3 className={styles.colTitle}>{t("skills.education")}</h3>
            <ul className={styles.edu}>
              {education.map((e) => (
                <li key={e.institution} className={styles.eduItem}>
                  <span className={styles.eduPeriod}>{e.period}</span>
                  <span className={styles.eduDegree}>{tr(e.degree)}</span>
                  <span className={styles.eduInst}>{e.institution}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
