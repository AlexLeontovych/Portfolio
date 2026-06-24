import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Lang, Localized } from "../data/types";
import { dict } from "./translations";

const STORAGE_KEY = "portfolio-lang";
const DEFAULT_LANG: Lang = "en";

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a dot-path key from the UI dictionary, e.g. t("nav.about"). */
  t: (path: string) => string;
  /** Pick the current language out of a Localized data object. */
  tr: (obj?: Localized) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "ru" || v === "uk") return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (path: string): string => {
      const parts = path.split(".");
      const resolve = (root: unknown): string | undefined => {
        let cur: unknown = root;
        for (const p of parts) {
          if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[p];
          } else {
            return undefined;
          }
        }
        return typeof cur === "string" ? cur : undefined;
      };
      return resolve(dict[lang]) ?? resolve(dict.en) ?? path;
    },
    [lang]
  );

  const tr = useCallback(
    (obj?: Localized): string => (obj ? obj[lang] ?? obj.en ?? "" : ""),
    [lang]
  );

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t, tr }), [lang, setLang, t, tr]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
