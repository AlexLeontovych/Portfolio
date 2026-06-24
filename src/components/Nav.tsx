import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useMotionPref } from "../hooks/useMotionPref";
import { lockScroll, unlockScroll } from "../lib/scrollLock";
import LanguageSwitcher from "./LanguageSwitcher";
import { Motion, Close, Shield } from "./Icons";
import styles from "./Nav.module.css";

const SECTIONS = ["about", "experience", "skills", "works", "contact", "reference"] as const;

export default function Nav() {
  const { t } = useI18n();
  const [reduced, toggleMotion] = useMotionPref();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  // lock scroll + close on Escape while mobile menu is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    if (open) lockScroll();
    return () => {
      if (open) unlockScroll();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
      <div className={`container ${styles.bar}`}>
        <nav className={styles.desktopNav} aria-label="Primary">
          {SECTIONS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className={`${styles.link} ${active === id ? styles.linkActive : ""}`}
              aria-current={active === id ? "true" : undefined}
            >
              <span className={styles.linkIdx}>0{SECTIONS.indexOf(id) + 1}</span>
              {t(`nav.${id}`)}
            </a>
          ))}
        </nav>

        <div className={styles.tools}>
          <LanguageSwitcher />
          <button
            type="button"
            className={`${styles.iconBtn} ${reduced ? styles.iconBtnOff : ""}`}
            onClick={toggleMotion}
            aria-pressed={reduced}
            title={t("a11y.theme")}
            aria-label={t("a11y.theme")}
          >
            <Motion />
          </button>
          <a
            href="#admin"
            className={styles.adminBtn}
            title={t("admin.title")}
            aria-label={t("admin.title")}
            onClick={() => setOpen(false)}
          >
            <Shield width={18} height={18} />
          </a>
          <button
            type="button"
            className={`${styles.burger} ${open ? styles.burgerOpen : ""}`}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={t("nav.menu")}
            onClick={() => setOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        ref={panelRef}
        className={`${styles.mobile} ${open ? styles.mobileOpen : ""}`}
        hidden={!open}
      >
        <button className={styles.mobileClose} onClick={() => setOpen(false)} aria-label={t("works.close")}>
          <Close />
        </button>
        <nav aria-label="Mobile">
          {SECTIONS.map((id, i) => (
            <a key={id} href={`#${id}`} className={styles.mobileLink} onClick={() => setOpen(false)}>
              <span className={styles.mobileIdx}>0{i + 1}</span>
              {t(`nav.${id}`)}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
