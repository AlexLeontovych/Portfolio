import { useState } from "react";
import styles from "./CompanyLogo.module.css";

function initials(name: string): string {
  return name
    .replace(/\bteam\b/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Company avatar: logo image with a graceful letter-avatar fallback. */
export default function CompanyLogo({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;

  return (
    <span className={styles.logo} aria-hidden="true">
      {showImg ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className={styles.fallback}>{initials(name)}</span>
      )}
    </span>
  );
}
