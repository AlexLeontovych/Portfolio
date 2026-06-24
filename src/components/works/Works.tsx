import { useEffect, useMemo, useRef, useState } from "react";
import type { Work } from "../../data/types";
import { useWorks } from "../../data/worksStore";
import { useI18n } from "../../i18n/I18nContext";
import { useReveal, refreshScrollTriggers } from "../../hooks/useReveal";
import { gsap, useGSAP } from "../../lib/gsap";
import { useReducedMotion } from "../../lib/motionPref";
import WorkCard from "./WorkCard";
import WorkModal from "./WorkModal";
import AdBlockNotice from "./AdBlockNotice";
import { Search, Star, Close } from "../Icons";
import styles from "./works.module.css";

const PAGE = 12;

type SortKey = "featured" | "complex_desc" | "complex_asc" | "company" | "brand" | "title";

const uniq = (arr: string[]) => Array.from(new Set(arr));

export default function Works() {
  const { t } = useI18n();
  const section = useReveal<HTMLElement>();
  const grid = useRef<HTMLDivElement>(null);
  const allWorks = useWorks();
  const reduced = useReducedMotion();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("all");
  const [kind, setKind] = useState("all");
  const [brand, setBrand] = useState("all");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("featured");
  const [visible, setVisible] = useState(PAGE);
  const [active, setActive] = useState<Work | null>(null);

  // debounce search so the grid doesn't re-animate on every keystroke
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  // filter option lists (recompute when the works set changes, e.g. admin add)
  const companies = useMemo(() => uniq(allWorks.map((w) => w.company)), [allWorks]);
  const kinds = useMemo(() => uniq(allWorks.map((w) => w.kind)), [allWorks]);
  const brands = useMemo(
    () => uniq(allWorks.map((w) => w.brand).filter((b): b is string => Boolean(b))).sort(),
    [allWorks]
  );
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    allWorks.forEach((w) => w.tags.forEach((tg) => counts.set(tg, (counts.get(tg) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tg]) => tg);
  }, [allWorks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allWorks.filter((w) => {
      if (favOnly && !w.favourite) return false;
      if (company !== "all" && w.company !== company) return false;
      if (kind !== "all" && w.kind !== kind) return false;
      if (brand !== "all" && w.brand !== brand) return false;
      if (tags.size && !w.tags.some((tg) => tags.has(tg))) return false;
      if (q) {
        const hay = `${w.title} ${w.company} ${w.platform} ${w.kind} ${w.brand ?? ""} ${w.tags.join(
          " "
        )} ${w.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const byFeatured = (a: Work, b: Work) =>
      Number(b.favourite) - Number(a.favourite) || b.complexity - a.complexity;
    const sorters: Record<SortKey, (a: Work, b: Work) => number> = {
      featured: byFeatured,
      complex_desc: (a, b) => b.complexity - a.complexity || byFeatured(a, b),
      complex_asc: (a, b) => a.complexity - b.complexity || byFeatured(a, b),
      company: (a, b) => a.company.localeCompare(b.company) || byFeatured(a, b),
      brand: (a, b) => {
        // branded first (A–Z), unbranded last
        if (!a.brand && !b.brand) return byFeatured(a, b);
        if (!a.brand) return 1;
        if (!b.brand) return -1;
        return a.brand.localeCompare(b.brand) || byFeatured(a, b);
      },
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...list].sort(sorters[sort]);
  }, [allWorks, search, company, kind, brand, tags, favOnly, sort]);

  const shown = filtered.slice(0, visible);
  const signature = shown.map((w) => w.id).join("|");

  // reset pagination whenever the result set changes
  useEffect(() => {
    setVisible(PAGE);
  }, [search, company, kind, brand, tags, favOnly, sort]);

  // animate cards in on every result change; keep ScrollTrigger in sync
  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>(`.${styles.card}`, grid.current);
      if (reduced) {
        gsap.set(cards, { clearProps: "all" });
        refreshScrollTriggers();
        return;
      }
      gsap.fromTo(
        cards,
        { autoAlpha: 0, y: 22 },
        { autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.04, overwrite: true }
      );
      refreshScrollTriggers();
    },
    { dependencies: [signature, reduced], scope: grid }
  );

  const toggleTag = (tg: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tg)) next.delete(tg);
      else next.add(tg);
      return next;
    });

  const reset = () => {
    setSearchInput("");
    setSearch("");
    setCompany("all");
    setKind("all");
    setBrand("all");
    setTags(new Set());
    setFavOnly(false);
    setSort("featured");
  };

  const dirty =
    searchInput ||
    company !== "all" ||
    kind !== "all" ||
    brand !== "all" ||
    tags.size > 0 ||
    favOnly ||
    sort !== "featured";

  return (
    <section id="works" ref={section} className="section">
      <div className="container">
        <header data-reveal>
          <span className="kicker">{t("works.kicker")}</span>
          <h2 className="section-title">{t("works.title")}</h2>
          <p className={styles.intro}>{t("works.intro")}</p>
        </header>

        {/* ---- controls ---- */}
        <div className={styles.controls} data-reveal>
          <div className={styles.row}>
            <label className={styles.searchBox}>
              <Search width={18} height={18} />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("works.search")}
                aria-label={t("works.search")}
              />
            </label>

            <button
              type="button"
              className={`${styles.favBtn} ${favOnly ? styles.favBtnOn : ""}`}
              aria-pressed={favOnly}
              onClick={() => setFavOnly((f) => !f)}
            >
              <Star width={15} height={15} /> {t("works.favourites")}
            </button>

            <label className={styles.sortBox}>
              <span className={styles.sortLabel}>{t("works.sort")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t("works.sort")}>
                <option value="featured">{t("works.sort_options.featured")}</option>
                <option value="complex_desc">{t("works.sort_options.complex_desc")}</option>
                <option value="complex_asc">{t("works.sort_options.complex_asc")}</option>
                <option value="company">{t("works.sort_options.company")}</option>
                {brands.length > 0 && (
                  <option value="brand">{t("works.sort_options.brand")}</option>
                )}
                <option value="title">{t("works.sort_options.title")}</option>
              </select>
            </label>
          </div>

          <div className={styles.facet}>
            <span className={styles.facetLabel}>{t("works.company")}</span>
            <div className={styles.facetChips}>
              <FacetChip active={company === "all"} onClick={() => setCompany("all")}>
                {t("works.all")}
              </FacetChip>
              {companies.map((c) => (
                <FacetChip key={c} active={company === c} onClick={() => setCompany(c)}>
                  {c}
                </FacetChip>
              ))}
            </div>
          </div>

          <div className={styles.facet}>
            <span className={styles.facetLabel}>{t("works.category")}</span>
            <div className={styles.facetChips}>
              <FacetChip active={kind === "all"} onClick={() => setKind("all")}>
                {t("works.all")}
              </FacetChip>
              {kinds.map((k) => (
                <FacetChip key={k} active={kind === k} onClick={() => setKind(k)}>
                  {k}
                </FacetChip>
              ))}
            </div>
          </div>

          {brands.length > 0 && (
            <div className={styles.facet}>
              <span className={styles.facetLabel}>{t("works.brand")}</span>
              <div className={styles.facetChips}>
                <FacetChip active={brand === "all"} onClick={() => setBrand("all")}>
                  {t("works.all")}
                </FacetChip>
                {brands.map((b) => (
                  <FacetChip key={b} active={brand === b} onClick={() => setBrand(b)}>
                    {b}
                  </FacetChip>
                ))}
              </div>
            </div>
          )}

          <div className={styles.facet}>
            <span className={styles.facetLabel}>{t("works.tag")}</span>
            <div className={styles.facetChips}>
              {allTags.map((tg) => (
                <FacetChip key={tg} active={tags.has(tg)} onClick={() => toggleTag(tg)} variant="tag">
                  {tg}
                </FacetChip>
              ))}
            </div>
          </div>

          <div className={styles.resultBar}>
            <span className={styles.count}>
              {t("works.showing")} <strong>{shown.length}</strong> {t("works.of")}{" "}
              <strong>{filtered.length}</strong> {t("works.results")}
            </span>
            {dirty && (
              <button type="button" className={styles.reset} onClick={reset}>
                <Close width={14} height={14} /> {t("works.reset")}
              </button>
            )}
          </div>
        </div>

        {/* ---- grid ---- */}
        {filtered.length === 0 ? (
          <p className={styles.empty}>{t("works.none")}</p>
        ) : (
          <>
            <div ref={grid} className={styles.grid}>
              {shown.map((w) => (
                <WorkCard key={w.id} work={w} onOpen={setActive} />
              ))}
            </div>
            {visible < filtered.length && (
              <div className={styles.loadMoreWrap}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setVisible((v) => v + PAGE)}
                >
                  {t("works.load_more")} ({filtered.length - visible})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <WorkModal work={active} onClose={() => setActive(null)} />
      <AdBlockNotice />
    </section>
  );
}

function FacetChip({
  active,
  onClick,
  children,
  variant = "solid",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "solid" | "tag";
}) {
  return (
    <button
      type="button"
      className={`${styles.facetChip} ${variant === "tag" ? styles.facetChipTag : ""} ${
        active ? styles.facetChipOn : ""
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
