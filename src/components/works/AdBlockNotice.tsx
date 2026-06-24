import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";
import { adblockNotice, usePendingDemo } from "../../lib/adblockNotice";
import { ArrowUpRight, Close, Shield } from "../Icons";
import styles from "./works.module.css";

/** "Disable your ad blocker" notice, shown before opening a Perion live demo. */
export default function AdBlockNotice() {
  const url = usePendingDemo();
  const { t } = useI18n();
  const [dontShow, setDontShow] = useState(false);

  // reset the checkbox each time the notice opens
  useEffect(() => {
    if (url) setDontShow(false);
  }, [url]);

  // Esc closes the notice (capture so it doesn't also close the work modal)
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        adblockNotice.close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [url]);

  if (!url) return null;

  return createPortal(
    <div
      className={styles.noticeOverlay}
      onMouseDown={(e) => e.target === e.currentTarget && adblockNotice.close()}
    >
      <div className={styles.notice} role="dialog" aria-modal="true" aria-labelledby="adblock-title">
        <button
          type="button"
          className={styles.noticeClose}
          onClick={() => adblockNotice.close()}
          aria-label={t("works.close")}
        >
          <Close />
        </button>

        <span className={styles.noticeIcon} aria-hidden="true">
          <Shield width={26} height={26} />
        </span>
        <h3 id="adblock-title" className={styles.noticeTitle}>
          {t("works.adblock_title")}
        </h3>
        <p className={styles.noticeBody}>{t("works.adblock_body")}</p>

        <label className={styles.noticeCheck}>
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
          />
          {t("works.adblock_dont_show")}
        </label>

        <div className={styles.noticeActions}>
          <button type="button" className="btn btn--ghost" onClick={() => adblockNotice.close()}>
            {t("works.adblock_cancel")}
          </button>
          <button
            type="button"
            className={`btn ${styles.noticeProceed}`}
            onClick={() => adblockNotice.proceed(dontShow)}
            autoFocus
          >
            {t("works.adblock_proceed")} <ArrowUpRight width={16} height={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
