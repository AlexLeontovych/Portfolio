export type Lang = "en" | "ru" | "uk";

/** A string available in all three languages. */
export type Localized = Record<Lang, string>;

export interface Work {
  id: string;
  url: string;
  title: string;
  company: string;
  platform: string;
  kind: string;
  complexity: number; // 1..5
  tags: string[];
  favourite: boolean;
  /** Optional hand-picked thumbnail (overrides the auto screenshot). */
  thumb?: string;
  /** Brand the creative was built for — shown as a small badge on the card. */
  brand?: string;
  /** Optional free-text description (shown in the work modal). */
  description?: string;
  /** Marks entries created via the admin editor. */
  custom?: boolean;
}

export interface Job {
  id: string;
  company: string;
  location: Localized;
  /** ISO-ish display string, e.g. "08.2024 — 01.2026". */
  period: string;
  current: boolean;
  employment: Localized;
  role: Localized;
  summary: Localized;
  bullets: Localized[];
  tech: string[];
  /** Marketing/brand names associated with the role (language-neutral). */
  brands?: string[];
  /** Official company website — the company name links here (none → not a link). */
  website?: string;
  /** Explicit logo/avatar image URL (else derived from the website domain). */
  avatar?: string;
  /** Optional outbound link to a representative live project. */
  link?: string;
}

export interface SkillGroup {
  title: Localized;
  items: string[];
}

export interface EducationItem {
  institution: string;
  degree: Localized;
  period: string;
}

export interface LanguageSkill {
  name: Localized;
  level: Localized;
  /** 0..100 for the meter. */
  value: number;
}
