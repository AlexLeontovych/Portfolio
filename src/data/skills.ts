import type { SkillGroup, EducationItem, LanguageSkill, Localized } from "./types";

export const hardSkills: SkillGroup[] = [
  {
    title: { en: "Languages & Frameworks", ru: "Языки и фреймворки", uk: "Мови та фреймворки" },
    items: ["JavaScript", "TypeScript", "HTML5", "CSS3", "SASS/SCSS", "React"],
  },
  {
    title: { en: "Animation & Graphics", ru: "Анимация и графика", uk: "Анімація та графіка" },
    items: ["GSAP", "Canvas", "Phaser.js", "Pixi.js", "Pixel-perfect", "Photoshop", "Illustrator", "Figma"],
  },
  {
    title: { en: "Tools & Workflow", ru: "Инструменты и процессы", uk: "Інструменти та процеси" },
    items: ["Git", "SVN", "Wowza", "Trello", "Jira"],
  },
];

/** Soft skills, grouped into the same small blocks as the hard skills. */
export const softSkillGroups: { title: Localized; items: Localized[] }[] = [
  {
    title: { en: "Collaboration", ru: "Командная работа", uk: "Командна робота" },
    items: [
      {
        en: "Teamwork & collaboration",
        ru: "Командная работа и сотрудничество",
        uk: "Командна робота та співпраця",
      },
      {
        en: "Adaptability & flexibility",
        ru: "Адаптивность и гибкость",
        uk: "Адаптивність і гнучкість",
      },
      {
        en: "Responsibility & accountability",
        ru: "Ответственность и подотчётность",
        uk: "Відповідальність і підзвітність",
      },
    ],
  },
  {
    title: { en: "Productivity", ru: "Продуктивность", uk: "Продуктивність" },
    items: [
      {
        en: "Multitasking & task prioritization",
        ru: "Многозадачность и приоритизация",
        uk: "Багатозадачність і пріоритизація",
      },
      {
        en: "Self-analysis & continuous improvement",
        ru: "Самоанализ и постоянное развитие",
        uk: "Самоаналіз і постійний розвиток",
      },
      {
        en: "Information gathering & evaluation",
        ru: "Сбор и оценка информации",
        uk: "Збір та оцінка інформації",
      },
    ],
  },
  {
    title: { en: "Methodologies", ru: "Методологии", uk: "Методології" },
    items: [
      {
        en: "Agile & Scrum",
        ru: "Agile и Scrum",
        uk: "Agile та Scrum",
      },
      {
        en: "Kanban workflow",
        ru: "Работа по Kanban",
        uk: "Робота за Kanban",
      },
      {
        en: "Planning with Trello & Jira",
        ru: "Планирование в Trello и Jira",
        uk: "Планування в Trello та Jira",
      },
    ],
  },
];

/** AI / agentic-development stack. */
export const aiSkills: SkillGroup[] = [
  {
    title: { en: "AI tools & models", ru: "AI-инструменты и модели", uk: "AI-інструменти та моделі" },
    items: ["Claude", "ChatGPT", "Cursor", "Lovable", "Base44", "GitHub Copilot"],
  },
  {
    title: { en: "Agentic workflow", ru: "Агентный воркфлоу", uk: "Агентний воркфлоу" },
    items: ["AI Agents", "MCP", "Skills", "Rules", "Prompt engineering", "Automation"],
  },
];

export const education: EducationItem[] = [
  {
    institution: "National University of Life and Environmental Sciences of Ukraine",
    degree: {
      en: "Software Engineering — Bachelor's degree",
      ru: "Программная инженерия — бакалавр",
      uk: "Інженерія програмного забезпечення — бакалавр",
    },
    period: "2022 — 2026",
  },
  {
    institution: "National Defence University of Ukraine",
    degree: {
      en: "Mathematical & Software Engineering for Automated Systems, Information Protection & Cybersecurity",
      ru: "Математическое и программное обеспечение автоматизированных систем, защита информации и кибербезопасность",
      uk: "Математичне та програмне забезпечення автоматизованих систем, захист інформації та кібербезпека",
    },
    period: "2022 — 2024",
  },
  {
    // ⚠️ University is a best guess (CV named only two universities for three
    // programs). Replace if the Philology degree is at a different institution.
    institution: "National University of Life and Environmental Sciences of Ukraine",
    degree: {
      en: "Philology — English & German Languages, Bachelor's (in progress)",
      ru: "Филология — английский и немецкий языки, бакалавр (в процессе)",
      uk: "Філологія — англійська та німецька мови, бакалавр (у процесі)",
    },
    period: "2024 — 2028",
  },
];

export const languages: LanguageSkill[] = [
  {
    name: { en: "Ukrainian", ru: "Украинский", uk: "Українська" },
    level: { en: "Fluent · C1", ru: "Свободно · C1", uk: "Вільно · C1" },
    value: 100,
  },
  {
    name: { en: "Russian", ru: "Русский", uk: "Російська" },
    level: { en: "Fluent · C1", ru: "Свободно · C1", uk: "Вільно · C1" },
    value: 100,
  },
  {
    name: { en: "English", ru: "Английский", uk: "Англійська" },
    level: { en: "Intermediate · B1", ru: "Средний · B1", uk: "Середній · B1" },
    value: 60,
  },
];
