import type { Localized } from "./types";

/**
 * Personal / contact info.
 * ⚠️ EDIT the GitHub username below if it differs — best guess from your
 * LinkedIn/Telegram handle. Phone is intentionally NOT published.
 */
export const profile = {
  name: "Oleksandr Leontovych",
  handle: "@Alex_Leontovych",
  email: "sasaleontovic@gmail.com",
  // Portrait shown in the hero. Replace public/portrait.jpg to change it.
  photo: "./portrait.jpg",
  links: {
    linkedin: "https://www.linkedin.com/in/alexleontovych/",
    telegram: "https://t.me/Alex_Leontovych",
    github: "https://github.com/alexleontovych", // ← verify / change me
    email: "mailto:sasaleontovic@gmail.com",
  },
  role: {
    en: "Front-End Developer / JS Game Developer",
    ru: "Front-End разработчик / Разработчик игр на JS",
    uk: "Front-End розробник / Розробник ігор на JS",
  } as Localized,
  location: {
    en: "Kyiv, Ukraine · office / remote",
    ru: "Киев, Украина · офис / удалённо",
    uk: "Київ, Україна · офіс / віддалено",
  } as Localized,
  available: {
    en: "Open to work",
    ru: "Открыт к предложениям",
    uk: "Відкритий до пропозицій",
  } as Localized,
};

/** Hero headline stats. `label` is localized, `value` is language-neutral. */
export const stats: { value: string; label: Localized }[] = [
  {
    value: "550+",
    label: {
      en: "Projects shipped",
      ru: "Реализованных проектов",
      uk: "Реалізованих проєктів",
    },
  },
  {
    value: "3+",
    label: {
      en: "Years in commercial dev",
      ru: "Года в коммерческой разработке",
      uk: "Роки в комерційній розробці",
    },
  },
  {
    value: "4",
    label: {
      en: "International companies",
      ru: "Международные компании",
      uk: "Міжнародні компанії",
    },
  },
  {
    value: "15+",
    label: {
      en: "Global brands",
      ru: "Мировых брендов",
      uk: "Світових брендів",
    },
  },
];

/**
 * Big brands the ad-tech creatives were built for. `logo` points at a local
 * monochrome SVG in public/brands/ (Simple Icons); brands without one fall back
 * to a styled wordmark. Drop an SVG in public/brands/ and add its path to show a logo.
 */
export const brands: { name: string; logo?: string }[] = [
  { name: "Coca-Cola", logo: "./brands/coca-cola.svg" },
  { name: "Mercedes", logo: "./brands/mercedes.svg" },
  { name: "Lenovo", logo: "./brands/lenovo.svg" },
  { name: "IBM", logo: "./brands/ibm.svg" },
  { name: "Toyota", logo: "./brands/toyota.svg" },
  { name: "Paramount", logo: "./brands/paramount.svg" },
  { name: "McDonald's", logo: "./brands/mcdonald-s.svg" },
  { name: "Walmart", logo: "./brands/walmart.svg" },
  { name: "Stop & Shop" },
  { name: "Honda", logo: "./brands/honda.svg" },
  { name: "Meta", logo: "./brands/meta.svg" },
  { name: "Brown-Forman" },
  { name: "Bloomberg" },
  { name: "AMC" },
  { name: "CAT Footwear", logo: "./brands/cat-footwear.svg" },
  { name: "Corona Extra" },
  { name: "Activia" },
  { name: "Intel", logo: "./brands/intel.svg" },
];
