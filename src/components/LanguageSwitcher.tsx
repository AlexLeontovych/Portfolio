import { useI18n } from "../i18n/I18nContext";
import { LANGS } from "../i18n/translations";
import styles from "./LanguageSwitcher.module.css";

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={styles.switch} role="group" aria-label={t("a11y.lang")}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`${styles.opt} ${lang === l.code ? styles.active : ""}`}
          aria-pressed={lang === l.code}
          title={l.full}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
