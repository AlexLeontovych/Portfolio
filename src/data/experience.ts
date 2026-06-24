import type { Job } from "./types";

/** Work experience, newest first. */
export const experience: Job[] = [
  {
    id: "amigo",
    company: "Amigo Gaming",
    location: { en: "Spain", ru: "Испания", uk: "Іспанія" },
    period: "03.2026 — now",
    current: true,
    employment: { en: "Full-time", ru: "Полная занятость", uk: "Повна зайнятість" },
    role: {
      en: "JavaScript Game Developer",
      ru: "Разработчик игр на JavaScript",
      uk: "Розробник ігор на JavaScript",
    },
    summary: {
      en: "Configure and maintain casino / slot games from scratch using JavaScript, TypeScript, SVN, AI tools and the company's in-house game engine — UI replacement, core game configuration, structure optimization, visual & audio setup, post-release support and bug-fixing for both new and legacy games.",
      ru: "Настраиваю и поддерживаю казино/слот-игры с нуля на JavaScript, TypeScript, SVN, AI-инструментах и внутреннем движке компании — замена UI, базовая конфигурация, оптимизация структуры, настройка визуала и звука, пострелизная поддержка и фикс багов в новых и легаси-играх.",
      uk: "Налаштовую та підтримую казино/слот-ігри з нуля на JavaScript, TypeScript, SVN, AI-інструментах і внутрішньому рушії компанії — заміна UI, базова конфігурація, оптимізація структури, налаштування візуалу та звуку, пострелізна підтримка і фікс багів у нових і легасі-іграх.",
    },
    bullets: [
      {
        en: "Configured and built games from scratch on the company's in-house game engine.",
        ru: "Настраивал и собирал игры с нуля на внутреннем игровом движке компании.",
        uk: "Налаштовував і збирав ігри з нуля на внутрішньому ігровому рушії компанії.",
      },
      {
        en: "Replaced and adjusted UI elements — winner screens and other interface components.",
        ru: "Заменял и настраивал UI-элементы — экраны выигрыша и другие компоненты интерфейса.",
        uk: "Замінював і налаштовував UI-елементи — екрани виграшу та інші компоненти інтерфейсу.",
      },
      {
        en: "Set up base game configurations and core functionality.",
        ru: "Настраивал базовые конфигурации игр и ключевую функциональность.",
        uk: "Налаштовував базові конфігурації ігор і ключову функціональність.",
      },
      {
        en: "Optimized game structure and the overall configuration flow.",
        ru: "Оптимизировал структуру игр и общий процесс конфигурации.",
        uk: "Оптимізував структуру ігор і загальний процес конфігурації.",
      },
      {
        en: "Configured key gameplay elements and overall game behaviour.",
        ru: "Настраивал ключевые игровые элементы и общее поведение игры.",
        uk: "Налаштовував ключові ігрові елементи та загальну поведінку гри.",
      },
      {
        en: "Ensured the correct visual display of all in-game elements.",
        ru: "Обеспечивал корректное отображение всех внутриигровых элементов.",
        uk: "Забезпечував коректне відображення всіх внутрішньоігрових елементів.",
      },
      {
        en: "Integrated and configured music and audio support.",
        ru: "Интегрировал и настраивал музыку и звуковое сопровождение.",
        uk: "Інтегрував і налаштовував музику та звуковий супровід.",
      },
      {
        en: "Performed post-release maintenance and updates.",
        ru: "Выполнял пострелизную поддержку и обновления.",
        uk: "Виконував пострелізну підтримку та оновлення.",
      },
      {
        en: "Fixed bugs in previously released and legacy games.",
        ru: "Исправлял баги в ранее выпущенных и легаси-играх.",
        uk: "Виправляв баги в раніше випущених і легасі-іграх.",
      },
    ],
    tech: ["JavaScript", "TypeScript", "SVN", "AI Tools", "In-house Engine"],
    website: "https://amigogaming.com",
    link: "https://amigogaming.com/ru/games/football-hits#demoStart",
  },
  {
    id: "anvi",
    company: "ANVI Software Development Teams",
    location: { en: "Israel", ru: "Израиль", uk: "Ізраїль" },
    period: "01.2026 — now",
    current: true,
    employment: { en: "Part-time", ru: "Частичная занятость", uk: "Часткова зайнятість" },
    role: {
      en: "Software Engineer",
      ru: "Software Engineer",
      uk: "Software Engineer",
    },
    summary: {
      en: "Develop and maintain a video learning platform with Angular, TypeScript, SQL and C# — front-end and back-end features, payment integration, database work, AI-assisted development, encrypted DRM video streaming with Wowza, subscription & access-control logic and legacy-system migration.",
      ru: "Разрабатываю и поддерживаю платформу видеообучения на Angular, TypeScript, SQL и C# — фронтенд и бэкенд, интеграция платежей, работа с БД, разработка с AI, защищённый DRM-стриминг видео через Wowza, логика подписок и контроля доступа, миграция легаси-системы.",
      uk: "Розробляю та підтримую платформу відеонавчання на Angular, TypeScript, SQL і C# — фронтенд і бекенд, інтеграція платежів, робота з БД, розробка з AI, захищений DRM-стрімінг відео через Wowza, логіка підписок і контролю доступу, міграція легасі-системи.",
    },
    bullets: [
      {
        en: "Implemented front-end features and integrated back-end services, including payment functionality.",
        ru: "Реализовал фронтенд-функции и интегрировал бэкенд-сервисы, включая оплату.",
        uk: "Реалізував фронтенд-функції та інтегрував бекенд-сервіси, зокрема оплату.",
      },
      {
        en: "Worked with databases — query writing, optimization and schema updates.",
        ru: "Работал с базами данных — написание запросов, оптимизация и обновление схем.",
        uk: "Працював із базами даних — написання запитів, оптимізація та оновлення схем.",
      },
      {
        en: "Used AI agents to speed up website development.",
        ru: "Использовал AI-агентов для ускорения разработки сайта.",
        uk: "Використовував AI-агентів для прискорення розробки сайту.",
      },
      {
        en: "Refined and corrected AI-generated code after testing, review and feedback.",
        ru: "Дорабатывал и исправлял AI-сгенерированный код после тестов, ревью и фидбэка.",
        uk: "Доопрацьовував і виправляв AI-згенерований код після тестів, ревʼю та фідбеку.",
      },
      {
        en: "Implemented authentication and authorization features.",
        ru: "Реализовал аутентификацию и авторизацию.",
        uk: "Реалізував автентифікацію та авторизацію.",
      },
      {
        en: "Built subscription and access-control logic for different user types.",
        ru: "Построил логику подписок и контроля доступа для разных типов пользователей.",
        uk: "Побудував логіку підписок і контролю доступу для різних типів користувачів.",
      },
      {
        en: "Added full video and movie access for subscribed users.",
        ru: "Добавил полный доступ к видео и фильмам для подписчиков.",
        uk: "Додав повний доступ до відео та фільмів для підписників.",
      },
      {
        en: "Implemented limited video access for unauthorized or unsubscribed users.",
        ru: "Реализовал ограниченный доступ к видео для неавторизованных и без подписки.",
        uk: "Реалізував обмежений доступ до відео для неавторизованих і без підписки.",
      },
      {
        en: "Worked on live-streaming functionality.",
        ru: "Работал над функциональностью прямых трансляций.",
        uk: "Працював над функціональністю прямих трансляцій.",
      },
      {
        en: "Debugged and optimized encrypted (DRM) video playback with Wowza.",
        ru: "Отлаживал и оптимизировал защищённое (DRM) воспроизведение видео через Wowza.",
        uk: "Налагоджував і оптимізував захищене (DRM) відтворення відео через Wowza.",
      },
      {
        en: "Improved playback stability, reduced buffering and fixed performance issues.",
        ru: "Повысил стабильность воспроизведения, снизил буферизацию, исправил проблемы производительности.",
        uk: "Підвищив стабільність відтворення, зменшив буферизацію, виправив проблеми продуктивності.",
      },
      {
        en: "Migrated functionality from a legacy platform and adapted old code to the new system.",
        ru: "Перенёс функциональность с легаси-платформы и адаптировал старый код под новую систему.",
        uk: "Переніс функціональність зі старої платформи та адаптував старий код під нову систему.",
      },
    ],
    tech: ["Angular", "TypeScript", "C#", "SQL", "Wowza", "AI Agents", "REST APIs"],
    website: "https://uanvi.com",
    link: "https://angular.practicu.com/",
  },
  {
    id: "perion",
    company: "Perion",
    location: { en: "USA", ru: "США", uk: "США" },
    period: "08.2024 — 01.2026",
    current: false,
    employment: { en: "Full-time", ru: "Полная занятость", uk: "Повна зайнятість" },
    role: {
      en: "Junior Front-End Developer",
      ru: "Junior Front-End разработчик",
      uk: "Junior Front-End розробник",
    },
    summary: {
      en: "Nearly 1.5 years in Ad Tech: shipped 550+ premium retail banners, interactive mini-games and dynamic ad creatives of every complexity — from simple animations to 2D games, API / location integrations and AI-based projects, for global brands.",
      ru: "Почти 1.5 года в Ad Tech: выпустил 550+ премиальных ритейл-баннеров, интерактивных мини-игр и динамических креативов любой сложности — от простых анимаций до 2D-игр, API/гео-интеграций и AI-проектов, для мировых брендов.",
      uk: "Майже 1.5 року в Ad Tech: випустив 550+ преміальних ритейл-банерів, інтерактивних міні-ігор і динамічних креативів будь-якої складності — від простих анімацій до 2D-ігор, API/гео-інтеграцій і AI-проєктів, для світових брендів.",
    },
    bullets: [
      {
        en: "Created premium retail advertising banners with Vanilla JS.",
        ru: "Создавал премиальные ритейл-баннеры на Vanilla JS.",
        uk: "Створював преміальні ритейл-банери на Vanilla JS.",
      },
      {
        en: "Developed interactive mini-games and dynamic advertising solutions using Phaser.js, PixiJS and Canvas.",
        ru: "Разрабатывал интерактивные мини-игры и динамические рекламные решения на Phaser.js, PixiJS и Canvas.",
        uk: "Розробляв інтерактивні міні-ігри та динамічні рекламні рішення на Phaser.js, PixiJS і Canvas.",
      },
      {
        en: "Worked with APIs — location, products, weather and dates.",
        ru: "Работал с API — гео, товары, погода и даты.",
        uk: "Працював із API — гео, товари, погода й дати.",
      },
      {
        en: "Built advanced animation using GSAP, SVG, Canvas and CSS3.",
        ru: "Делал сложную анимацию на GSAP, SVG, Canvas и CSS3.",
        uk: "Робив складну анімацію на GSAP, SVG, Canvas і CSS3.",
      },
      {
        en: "Optimized performance and responsiveness of HTML5 banners across platforms and devices.",
        ru: "Оптимизировал производительность и адаптивность HTML5-баннеров под платформы и устройства.",
        uk: "Оптимізував продуктивність та адаптивність HTML5-банерів під платформи та пристрої.",
      },
      {
        en: "Implemented ad tracking and analytics — click tracking, impression counters and custom events.",
        ru: "Внедрял трекинг и аналитику рекламы — клики, счётчики показов и кастомные события.",
        uk: "Впроваджував трекінг та аналітику реклами — кліки, лічильники показів і кастомні події.",
      },
      {
        en: "Collaborated with designers, marketers and back-end developers to integrate content and logic.",
        ru: "Работал с дизайнерами, маркетологами и бэкенд-разработчиками над интеграцией контента и логики.",
        uk: "Працював із дизайнерами, маркетологами та бекенд-розробниками над інтеграцією контенту й логіки.",
      },
      {
        en: "Collaborated closely with QA teams to ensure ad quality and performance compliance.",
        ru: "Тесно работал с QA-командами для контроля качества и производительности рекламы.",
        uk: "Тісно працював із QA-командами для контролю якості та продуктивності реклами.",
      },
      {
        en: "Participated in code reviews and optimized existing projects.",
        ru: "Участвовал в код-ревью и оптимизировал существующие проекты.",
        uk: "Брав участь у код-рев’ю та оптимізував наявні проєкти.",
      },
    ],
    tech: ["Vanilla JS", "Phaser.js", "PixiJS", "GSAP", "SVG", "Canvas", "CSS3", "HTML5", "REST APIs"],
    brands: ["Coca-Cola", "Mercedes", "Lenovo", "IBM", "Toyota", "Paramount", "McDonald's", "Walmart", "Stop & Shop", "Honda", "Meta", "Brown-Forman", "Bloomberg", "AMC", "CAT Footwear", "Corona Extra", "Activia", "Intel"],
    website: "https://perion.com",
    link: "https://demo.perion.com/creative/133942",
  },
  {
    id: "webelefont",
    company: "WebElefont",
    location: { en: "Kyiv, Ukraine", ru: "Киев, Украина", uk: "Київ, Україна" },
    period: "11.2023 — 07.2024",
    current: false,
    employment: { en: "Self-employed", ru: "Самозанятый", uk: "Самозайнятий" },
    role: {
      en: "Trainee Front-End Developer",
      ru: "Trainee Front-End разработчик",
      uk: "Trainee Front-End розробник",
    },
    summary: {
      en: "Built front-end interfaces with React and Next.js for educational and social-impact web projects — an artist's portfolio website and Toy Therapy Room, a social-impact app for the Genofond Natsii organization supporting children affected by Russia's war against Ukraine. Responsive across desktop, tablet and mobile.",
      ru: "Создавал фронтенд-интерфейсы на React и Next.js для образовательных и социальных веб-проектов — сайт-портфолио художницы и Toy Therapy Room, социальный проект для организации «Genofond Natsii» в поддержку детей, пострадавших от войны России против Украины. Адаптив под десктоп, планшеты и мобильные.",
      uk: "Створював фронтенд-інтерфейси на React і Next.js для освітніх і соціальних вебпроєктів — сайт-портфоліо художниці та Toy Therapy Room, соціальний проєкт для організації «Genofond Natsii» на підтримку дітей, що постраждали від війни Росії проти України. Адаптив під десктоп, планшети та мобільні.",
    },
    bullets: [
      {
        en: "Developed and maintained front-end functionality using React and Next.js.",
        ru: "Разрабатывал и поддерживал фронтенд-функциональность на React и Next.js.",
        uk: "Розробляв і підтримував фронтенд-функціональність на React і Next.js.",
      },
      {
        en: "Built an artist's portfolio website — responsive layout, interactive sections and clean component structure.",
        ru: "Сделал сайт-портфолио художницы — адаптивная вёрстка, интерактивные секции и чистая структура компонентов.",
        uk: "Зробив сайт-портфоліо художниці — адаптивна верстка, інтерактивні секції та чиста структура компонентів.",
      },
      {
        en: "Toy Therapy Room — a React social-impact project for the Genofond Natsii organization, supporting children affected by Russia's war against Ukraine.",
        ru: "Toy Therapy Room — социальный проект на React для организации «Genofond Natsii» в поддержку детей, пострадавших от войны России против Украины.",
        uk: "Toy Therapy Room — соціальний проєкт на React для організації «Genofond Natsii» на підтримку дітей, що постраждали від війни Росії проти України.",
      },
      {
        en: "Built responsive, adaptive interfaces for desktop, tablet and mobile users.",
        ru: "Строил адаптивные интерфейсы для десктопа, планшетов и мобильных.",
        uk: "Будував адаптивні інтерфейси для десктопа, планшетів і мобільних.",
      },
      {
        en: "Implemented reusable UI components to improve development speed and scalability.",
        ru: "Реализовал переиспользуемые UI-компоненты для ускорения разработки и масштабируемости.",
        uk: "Реалізував перевикористовувані UI-компоненти для пришвидшення розробки та масштабованості.",
      },
      {
        en: "Improved UX by refining layout consistency, navigation and visual hierarchy, and fixed UI bugs across devices.",
        ru: "Улучшал UX — единообразие вёрстки, навигацию и визуальную иерархию; исправлял UI-баги на разных устройствах.",
        uk: "Покращував UX — єдність верстки, навігацію та візуальну ієрархію; виправляв UI-баги на різних пристроях.",
      },
      {
        en: "Used Git/GitHub for version control, code updates and team collaboration.",
        ru: "Использовал Git/GitHub для контроля версий, обновлений кода и командной работы.",
        uk: "Використовував Git/GitHub для контролю версій, оновлень коду та командної роботи.",
      },
    ],
    tech: ["React", "Next.js", "JavaScript", "CSS3", "Git", "Responsive"],
    avatar: "https://github.com/webelefont.png",
    link: "https://webelefont.github.io/toytherapy_room",
  },
];
