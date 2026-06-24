import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import { experience } from "../data/experience";
import type { Job } from "../data/types";
import CompanyLogo from "./CompanyLogo";
import { ArrowUpRight } from "./Icons";
import styles from "./Experience.module.css";

function logoSrc(job: Job): string | undefined {
  if (job.avatar) return job.avatar;
  if (job.website) {
    try {
      // Google's favicon service is fast and reliable; falls back to a
      // letter-avatar inside <CompanyLogo> if it ever returns nothing.
      return `https://www.google.com/s2/favicons?domain=${new URL(job.website).hostname}&sz=128`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export default function Experience() {
  const { t, tr } = useI18n();
  const scope = useReveal<HTMLElement>();

  return (
    <section id="experience" ref={scope} className="section">
      <div className="container">
        <header data-reveal>
          <span className="kicker">{t("experience.kicker")}</span>
          <h2 className="section-title">{t("experience.title")}</h2>
        </header>

        <ol className={styles.timeline}>
          {experience.map((job) => (
            <li key={job.id} className={styles.item} data-reveal>
              <div className={styles.marker} aria-hidden="true">
                <span className={job.current ? styles.dotLive : styles.dot} />
              </div>

              <article className={styles.card}>
                <div className={styles.head}>
                  <div className={styles.headMain}>
                    {job.website ? (
                      <a
                        href={job.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.logoLink}
                        aria-label={job.company}
                      >
                        <CompanyLogo name={job.company} src={logoSrc(job)} />
                      </a>
                    ) : (
                      <CompanyLogo name={job.company} src={logoSrc(job)} />
                    )}

                    <div>
                      <h3 className={styles.role}>{tr(job.role)}</h3>
                      <p className={styles.company}>
                        {job.website ? (
                          <a
                            href={job.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.companyLink}
                          >
                            {job.company} <ArrowUpRight width={14} height={14} />
                            <span className="sr-only">{t("a11y.new_tab")}</span>
                          </a>
                        ) : (
                          <span className={styles.companyPlain}>{job.company}</span>
                        )}
                        <span className={styles.sep}>·</span>
                        <span className={styles.loc}>{tr(job.location)}</span>
                      </p>
                    </div>
                  </div>

                  <div className={styles.when}>
                    <span className={`${styles.period} ${job.current ? styles.periodLive : ""}`}>
                      {job.current && <span className={styles.live}>● {t("experience.now")}</span>}
                      {job.period}
                    </span>
                    <span className={styles.employment}>{tr(job.employment)}</span>
                  </div>
                </div>

                <p className={styles.summary}>{tr(job.summary)}</p>

                <details className={styles.details} open>
                  <summary className={styles.summaryToggle}>{t("experience.responsibilities")}</summary>
                  <ul className={styles.bullets}>
                    {job.bullets.map((b, i) => (
                      <li key={i}>{tr(b)}</li>
                    ))}
                  </ul>
                </details>

                {job.brands && (
                  <div className={styles.brands}>
                    {job.brands.map((b) => (
                      <span key={b} className={styles.brandTag}>
                        {b}
                      </span>
                    ))}
                  </div>
                )}

                <div className={styles.stack}>
                  <span className={styles.stackLabel}>{t("experience.stack")}</span>
                  <div className={styles.stackTags}>
                    {job.tech.map((tech) => (
                      <span key={tech} className="chip">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {job.link && (
                  <a
                    href={job.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.projectLink}
                  >
                    {t("experience.visit")} <ArrowUpRight width={15} height={15} />
                    <span className="sr-only">{t("a11y.new_tab")}</span>
                  </a>
                )}
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
