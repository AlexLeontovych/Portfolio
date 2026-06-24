import { useI18n } from "../i18n/I18nContext";
import { profile } from "../data/profile";
import { ArrowDown } from "./Icons";
import styles from "./Footer.module.css";

export default function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.left}>
          <span className={styles.name}>{profile.name}</span>
          <span className={styles.built}>{t("footer.built")}</span>
        </div>

        <span className={styles.copy}>
          © {year} · {t("footer.rights")}
        </span>

        <a href="#main" className={styles.top}>
          {t("footer.top")}
          <span className={styles.topIcon}>
            <ArrowDown width={16} height={16} style={{ transform: "rotate(180deg)" }} />
          </span>
        </a>
      </div>
    </footer>
  );
}
