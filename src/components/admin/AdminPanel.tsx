import { useMemo, useRef, useState } from "react";
import type { Work } from "../../data/types";
import { useWorks, worksStore, makeWorkId } from "../../data/worksStore";
import { useI18n } from "../../i18n/I18nContext";
import { Star, Close, ArrowUpRight } from "../Icons";
import styles from "./admin.module.css";

const KIND_FALLBACK = ["Game", "Retail", "Site", "Animation", "SVG", "Carousel", "3D", "AI", "Misc"];

interface FormState {
  title: string;
  url: string;
  complexity: number;
  description: string;
  company: string;
  kind: string;
  tags: string;
  favourite: boolean;
  thumb: string;
}

const EMPTY: FormState = {
  title: "",
  url: "",
  complexity: 3,
  description: "",
  company: "Personal",
  kind: "Misc",
  tags: "",
  favourite: false,
  thumb: "",
};

export default function AdminPanel() {
  const { t } = useI18n();
  const works = useWorks(); // re-render on any store change
  const [form, setForm] = useState<FormState>(EMPTY);
  const [toast, setToast] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const local = worksStore.getLocal();

  const { companies, kinds } = useMemo(() => {
    const c = new Set<string>();
    const k = new Set<string>(KIND_FALLBACK);
    works.forEach((w) => {
      c.add(w.company);
      k.add(w.kind);
    });
    return { companies: [...c].sort(), kinds: [...k] };
  }, [works]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  };

  const valid =
    form.title.trim().length > 0 && /^https?:\/\//i.test(form.url.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const tags = form.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const work: Work = {
      id: makeWorkId(form.title),
      url: form.url.trim(),
      title: form.title.trim(),
      company: form.company.trim() || "Personal",
      platform: form.company.trim() || "Personal",
      kind: form.kind || "Misc",
      complexity: Math.min(5, Math.max(1, Math.round(form.complexity))),
      tags,
      favourite: form.favourite,
      description: form.description.trim() || undefined,
      thumb: form.thumb.trim() || undefined,
      custom: true,
    };
    worksStore.add(work);
    setForm(EMPTY);
    flash(t("admin.saved"));
  };

  const download = () => {
    const data = JSON.stringify(worksStore.getExportable(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "works.custom.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        if (Array.isArray(arr)) {
          worksStore.importLocal(arr as Work[]);
          flash(t("admin.imported"));
        }
      } catch {
        flash(t("admin.import_error"));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const clearAll = () => {
    if (window.confirm(t("admin.clear_confirm"))) {
      worksStore.clearLocal();
      flash(t("admin.cleared"));
    }
  };

  return (
    <div className={styles.panel}>
      {/* ---- add form ---- */}
      <form className={styles.form} onSubmit={submit}>
        <h3 className={styles.sectionTitle}>{t("admin.add_title")}</h3>

        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>
              {t("admin.f_title")} <em className={styles.req}>*</em>
            </span>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} required maxLength={120} />
          </label>

          <label className={styles.field}>
            <span>
              {t("admin.f_url")} <em className={styles.req}>*</em>
            </span>
            <input
              type="url"
              placeholder="https://…"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              required
            />
          </label>
        </div>

        <div className={styles.field}>
          <span>{t("admin.f_complexity")}</span>
          <div className={styles.stars} role="group" aria-label={t("admin.f_complexity")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                className={n <= form.complexity ? styles.starOn : styles.starOff}
                aria-pressed={n === form.complexity}
                aria-label={`${n}/5`}
                onClick={() => set("complexity", n)}
              >
                <Star width={22} height={22} />
              </button>
            ))}
            <span className={styles.starsVal}>{form.complexity}/5</span>
          </div>
        </div>

        <label className={styles.field}>
          <span>{t("admin.f_description")}</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={600}
          />
        </label>

        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>{t("admin.f_company")}</span>
            <input
              list="admin-companies"
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
            />
            <datalist id="admin-companies">
              {companies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className={styles.field}>
            <span>{t("admin.f_category")}</span>
            <select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={styles.field}>
          <span>{t("admin.f_tags")}</span>
          <input
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder={t("admin.f_tags_hint")}
          />
        </label>

        <label className={styles.field}>
          <span>{t("admin.f_thumb")}</span>
          <input
            type="url"
            value={form.thumb}
            onChange={(e) => set("thumb", e.target.value)}
            placeholder={t("admin.f_thumb_hint")}
          />
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.favourite}
            onChange={(e) => set("favourite", e.target.checked)}
          />
          <Star width={15} height={15} /> {t("admin.f_favourite")}
        </label>

        <button type="submit" className={`btn ${styles.add}`} disabled={!valid}>
          {t("admin.add_btn")}
        </button>
      </form>

      {/* ---- saved list + io ---- */}
      <div className={styles.side}>
        <div className={styles.ioRow}>
          <button type="button" className="btn btn--ghost" onClick={download} disabled={worksStore.getExportable().length === 0}>
            ⬇ {t("admin.export_btn")}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            ⬆ {t("admin.import_btn")}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>

        <p className={styles.note}>{t("admin.note")}</p>
        <p className={styles.note}>{t("admin.fav_note")}</p>

        <div className={styles.listHead}>
          <h3 className={styles.sectionTitle}>
            {t("admin.list_title")} <span className={styles.count}>{local.length}</span>
          </h3>
          {local.length > 0 && (
            <button type="button" className={styles.clear} onClick={clearAll}>
              {t("admin.clear_btn")}
            </button>
          )}
        </div>

        {local.length === 0 ? (
          <p className={styles.empty}>{t("admin.empty")}</p>
        ) : (
          <ul className={styles.list}>
            {local.map((w) => (
              <li key={w.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>{w.title}</span>
                  <span className={styles.itemMeta}>
                    {w.company} · {w.kind} · {"★".repeat(w.complexity)}
                  </span>
                  <a href={w.url} target="_blank" rel="noopener noreferrer" className={styles.itemLink}>
                    {w.url} <ArrowUpRight width={12} height={12} />
                  </a>
                </div>
                <button
                  type="button"
                  className={styles.del}
                  onClick={() => worksStore.remove(w.id)}
                  aria-label={`${t("admin.delete")}: ${w.title}`}
                >
                  <Close width={16} height={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
