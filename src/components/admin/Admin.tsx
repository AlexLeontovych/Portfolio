import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth, logout } from "../../admin/auth";
import { useI18n } from "../../i18n/I18nContext";
import { lockScroll, unlockScroll } from "../../lib/scrollLock";
import AdminLogin from "./AdminLogin";
import AdminPanel from "./AdminPanel";
import { Close } from "../Icons";
import styles from "./admin.module.css";

/** Hash-routed admin overlay. Open via the footer lock icon or by visiting #admin. */
export default function Admin() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => window.location.hash === "#admin");
  const authed = useAuth();

  useEffect(() => {
    const onHash = () => setOpen(window.location.hash === "#admin");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    // remove the hash without adding a history entry
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setOpen(false);
  };

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t("admin.title")}>
      <div className={styles.shell}>
        <header className={styles.bar}>
          <div className={styles.brand}>
            <span className={styles.lock}>🔒</span>
            <div>
              <h2 className={styles.title}>{t("admin.title")}</h2>
              <p className={styles.subtitle}>{t("admin.subtitle")}</p>
            </div>
          </div>
          <div className={styles.barActions}>
            {authed && (
              <button type="button" className={styles.logout} onClick={logout}>
                {t("admin.logout")}
              </button>
            )}
            <button type="button" className={styles.close} onClick={close} aria-label={t("works.close")}>
              <Close />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {authed ? <AdminPanel /> : <AdminLogin />}
        </div>
      </div>
    </div>,
    document.body
  );
}
