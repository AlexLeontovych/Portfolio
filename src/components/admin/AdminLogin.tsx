import { useState } from "react";
import { login } from "../../admin/auth";
import { useI18n } from "../../i18n/I18nContext";
import styles from "./admin.module.css";

export default function AdminLogin() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await login(password);
    setBusy(false);
    if (!ok) setError(true);
    // on success the auth store updates and <Admin> swaps to the panel
  };

  return (
    <form className={styles.login} onSubmit={submit}>
      <h3 className={styles.sectionTitle}>{t("admin.login_title")}</h3>

      <label className={styles.field}>
        <span>{t("admin.password")}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {t("admin.login_error")}
        </p>
      )}

      <button type="submit" className={`btn ${styles.submit}`} disabled={busy}>
        {busy ? "…" : t("admin.login_btn")}
      </button>
    </form>
  );
}
