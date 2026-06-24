import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import { brands, profile } from "../data/profile";
import { Pin, Globe } from "./Icons";
import styles from "./About.module.css";

/** Render a JS string array with syntax-highlighted quotes for the code card. */
function Arr({ items }: { items: string[] }) {
  return (
    <>
      {"["}
      {items.map((it, i) => (
        <span key={it}>
          <span className={styles.str}>"{it}"</span>
          {i < items.length - 1 ? ", " : ""}
        </span>
      ))}
      {"]"}
    </>
  );
}

export default function About() {
  const { t, tr } = useI18n();
  const scope = useReveal<HTMLElement>();

  return (
    <section id="about" ref={scope} className="section">
      <div className="container">
        <header data-reveal>
          <span className="kicker">{t("about.kicker")}</span>
          <h2 className="section-title">{t("about.title")}</h2>
        </header>

        <div className={styles.grid}>
          <div className={styles.main} data-reveal>
            <p className={styles.body}>{t("about.body")}</p>

            <div className={styles.meta}>
              <span className="chip">
                <Pin width={15} height={15} /> {tr(profile.location)}
              </span>
              <span className="chip">
                <Globe width={15} height={15} /> EN · UK · RU
              </span>
            </div>
          </div>

          <aside className={styles.card} data-reveal data-reveal-delay="0.15" aria-hidden="true">
            <div className={styles.cardTop}>
              <span className={styles.dotR} />
              <span className={styles.dotY} />
              <span className={styles.dotG} />
              <span className={styles.cardName}>dev.profile.ts</span>
            </div>
            <pre className={styles.code}>
              <code>
                <span className={styles.kw}>const</span> dev = {"{"}
                {"\n"}  name: <span className={styles.str}>"O. Leontovych"</span>,
                {"\n"}  role: <span className={styles.str}>"FE / Game Dev"</span>,
                {"\n"}  core: <Arr items={["JS", "TS", "React"]} />,
                {"\n"}  web: <Arr items={["HTML5", "CSS3", "SASS/SCSS"]} />,
                {"\n"}  fx: <Arr items={["GSAP", "Phaser.js", "Pixi.js", "Canvas"]} />,
                {"\n"}  shipped: <span className={styles.num}>550+</span>,
                {"\n"}
                {"}"};
              </code>
            </pre>
          </aside>
        </div>

        <div className={styles.brands} data-reveal>
          <span className={styles.brandsLabel}>{t("about.brands_title")}</span>
          <div className={styles.marquee}>
            <ul className={styles.track}>
              {[...brands, ...brands].map((b, i) => (
                <li key={i} className={styles.brand} aria-hidden={i >= brands.length}>
                  {b.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
