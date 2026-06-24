import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/I18nContext";
import { finishCelebration, useFinishOpen } from "../lib/finishCelebration";
import { fireConfetti } from "../lib/confetti";
import { motionPref } from "../lib/motionPref";
import { profile } from "../data/profile";
import { Telegram, Mail, Linkedin, Sparkles, Close } from "./Icons";
import styles from "./FinishCelebration.module.css";

/**
 * "You made it to the finish line — let's talk" popup with a confetti burst,
 * shown once when the road car reaches the end of the page. See
 * lib/finishCelebration.ts for the first-time-only gating.
 */
export default function FinishCelebration() {
  const open = useFinishOpen();
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    if (!motionPref.get()) fireConfetti();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finishCelebration.close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => e.target === e.currentTarget && finishCelebration.close()}
    >
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby="finish-title">
        <button
          type="button"
          className={styles.close}
          onClick={() => finishCelebration.close()}
          aria-label={t("finish.close")}
        >
          <Close />
        </button>

        <span className={styles.icon} aria-hidden="true">
          <Sparkles width={26} height={26} />
        </span>
        <h3 id="finish-title" className={styles.title}>
          {t("finish.title")}
        </h3>
        <p className={styles.body}>{t("finish.body")}</p>

        <div className={styles.actions}>
          <a
            className={`btn ${styles.cta}`}
            href={profile.links.telegram}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Telegram width={18} height={18} /> {t("finish.telegram")}
          </a>
          <a className={`btn btn--ghost ${styles.ghost}`} href={profile.links.email}>
            <Mail width={18} height={18} /> {t("finish.email")}
          </a>
          <a
            className={`btn btn--ghost ${styles.ghost}`}
            href={profile.links.linkedin}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Linkedin width={18} height={18} /> LinkedIn
          </a>
        </div>

        <button type="button" className={styles.dismiss} onClick={() => finishCelebration.close()}>
          {t("finish.close")}
        </button>
      </div>
    </div>,
    document.body
  );
}
