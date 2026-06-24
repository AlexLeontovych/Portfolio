import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Work } from "../../data/types";
import { useI18n } from "../../i18n/I18nContext";
import { gsap, useGSAP, motionDisabled } from "../../lib/gsap";
import { lockScroll, unlockScroll } from "../../lib/scrollLock";
import { adblockNotice } from "../../lib/adblockNotice";
import Thumbnail from "./Thumbnail";
import Stars from "./Stars";
import { ArrowUpRight, Close, Star } from "../Icons";
import styles from "./works.module.css";

export default function WorkModal({ work, onClose }: { work: Work | null; onClose: () => void }) {
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  useGSAP(
    () => {
      if (!work || motionDisabled()) return;
      // Animate opacity (not autoAlpha) so the panel never becomes
      // visibility:hidden — otherwise focusing the close button on open fails.
      gsap.fromTo(overlay.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      gsap.fromTo(
        panel.current,
        { opacity: 0, y: 40, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }
      );
    },
    { dependencies: [work?.id], scope: overlay }
  );

  useEffect(() => {
    if (!work) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    lockScroll();
    closeBtn.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'
        );
        if (!f || f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
  }, [work, onClose]);

  if (!work) return null;

  return createPortal(
    <div
      ref={overlay}
      className={styles.overlay}
      onMouseDown={(e) => e.target === overlay.current && onClose()}
    >
      <div
        ref={panel}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button ref={closeBtn} className={styles.modalClose} onClick={onClose} aria-label={t("works.close")}>
          <Close />
        </button>

        <div className={styles.modalMedia}>
          <Thumbnail work={work} width={900} alt={`${t("a11y.thumb_alt")} ${work.title}`} eager />
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalMeta}>
            <span className={styles.cardKind} data-kind={work.kind}>
              {work.kind}
            </span>
            {work.favourite && (
              <span className={styles.modalFav}>
                <Star width={13} height={13} /> Favourite
              </span>
            )}
          </div>

          <h2 id="modal-title" className={styles.modalTitle}>
            {work.title}
          </h2>

          <dl className={styles.modalFacts}>
            <div>
              <dt>{t("works.company")}</dt>
              <dd>{work.company}</dd>
            </div>
            <div>
              <dt>{t("works.complexity")}</dt>
              <dd className={styles.modalStars}>
                <Stars value={work.complexity} label={t("works.complexity")} /> {work.complexity}/5
              </dd>
            </div>
          </dl>

          {work.description && (
            <div className={styles.modalAbout}>
              <h3 className={styles.modalAboutTitle}>{t("works.about")}</h3>
              <p>{work.description}</p>
            </div>
          )}

          <div className={styles.modalTags}>
            {work.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>

          <a
            href={work.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn ${styles.modalCta}`}
            onClick={(e) => {
              if (adblockNotice.intercept(work.url, work.company)) e.preventDefault();
            }}
          >
            {t("works.open_demo")} <ArrowUpRight width={18} height={18} />
            <span className="sr-only">{t("a11y.new_tab")}</span>
          </a>
          <p className={styles.modalNote}>{t("works.intro")}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
