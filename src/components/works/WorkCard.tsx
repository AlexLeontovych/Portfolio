import type { Work } from "../../data/types";
import { useI18n } from "../../i18n/I18nContext";
import { useAuth } from "../../admin/auth";
import { adblockNotice } from "../../lib/adblockNotice";
import { worksStore } from "../../data/worksStore";
import Thumbnail from "./Thumbnail";
import Stars from "./Stars";
import { ArrowUpRight, Star } from "../Icons";
import styles from "./works.module.css";

export default function WorkCard({
  work,
  onOpen,
}: {
  work: Work;
  onOpen: (w: Work) => void;
}) {
  const { t } = useI18n();
  const isAdmin = useAuth();

  return (
    <article className={styles.card}>
      {/* favourite: an admin-only toggle; visitors see just the badge.
          Lives outside the card-open button so its click stays separate. */}
      {isAdmin ? (
        <button
          type="button"
          className={`${styles.cardFav} ${styles.cardFavBtn} ${work.favourite ? styles.cardFavOn : ""}`}
          aria-pressed={work.favourite}
          title={t("works.toggle_fav")}
          aria-label={t("works.toggle_fav")}
          onClick={() => worksStore.toggleFavourite(work.id)}
        >
          <Star width={14} height={14} />
        </button>
      ) : (
        work.favourite && (
          <span className={styles.cardFav} title="Favourite">
            <Star width={14} height={14} />
          </span>
        )
      )}

      <button
        type="button"
        className={styles.cardOpen}
        onClick={() => onOpen(work)}
        aria-label={`${t("works.details")}: ${work.title}`}
      >
        <div className={styles.cardMedia}>
          <Thumbnail work={work} alt={`${t("a11y.thumb_alt")} ${work.title}`} />
          <span className={styles.cardKind} data-kind={work.kind}>
            {work.kind}
          </span>
          {work.brand && <span className={styles.cardBrand}>{work.brand}</span>}
          <span className={styles.cardOverlay}>{t("works.details")}</span>
        </div>
      </button>

      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardCompany}>{work.company}</span>
          <Stars value={work.complexity} label={t("works.complexity")} />
        </div>
        <h3 className={styles.cardTitle}>{work.title}</h3>
        <div className={styles.cardTags}>
          {work.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
          {work.tags.length > 3 && <span className={styles.more}>+{work.tags.length - 3}</span>}
        </div>
        <a
          href={work.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.cardLink}
          onClick={(e) => {
            e.stopPropagation();
            if (adblockNotice.intercept(work.url, work.company)) e.preventDefault();
          }}
        >
          {t("works.open_demo")} <ArrowUpRight width={15} height={15} />
          <span className="sr-only">{t("a11y.new_tab")}</span>
        </a>
      </div>
    </article>
  );
}
