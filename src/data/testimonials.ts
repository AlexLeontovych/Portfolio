import type { Localized } from "./types";

export interface Testimonial {
  id: string;
  /** Display name (English, kept as a proper noun). */
  name: string;
  /** Job title · company (kept in English). */
  role: string;
  /** Who they were to me — localized. */
  relation: Localized;
  /** Public LinkedIn profile — the whole card links here. */
  linkedin: string;
  /** Short display date, e.g. "Jan 2026". */
  date: string;
  /** The recommendation, localized (the original is English). */
  text: Localized;
  /**
   * Optional avatar path, e.g. "./reviews/kontseva.jpg". Set this once the
   * photo file exists in public/reviews/. Falls back to a gradient initials
   * avatar when omitted.
   */
  avatar?: string;
}

const RELATION = {
  lead: { en: "My Team Lead", ru: "Мой тимлид", uk: "Мій тімлід" },
  senior: { en: "Senior teammate", ru: "Старшая по команде", uk: "Старша по команді" },
  teammate: { en: "Teammate", ru: "Коллега по команде", uk: "Колега по команді" },
} satisfies Record<string, Localized>;

/**
 * LinkedIn recommendations. The English text is the original; RU/UK are
 * translations shown when the site language changes. The whole card links to
 * the author's LinkedIn profile.
 */
export const testimonials: Testimonial[] = [
  {
    id: "kutsenko",
    name: "Nikita Kutsenko",
    role: "Team Lead, Front-End Developer · Perion Network",
    relation: RELATION.lead,
    linkedin: "https://www.linkedin.com/in/nikita-kutsenko/",
    date: "Jan 2026",
    avatar: "./reviews/kutsenko.jpg",
    text: {
      en: "I worked with Oleksandr for a year and a half at Perion Network as his Team Lead. As a Junior Creative Developer, he consistently transformed ideas and designs into clean, well-structured front-end solutions and frequently suggested innovative animation approaches. Oleksandr demonstrated strong skills in HTML, CSS, JavaScript, GSAP, Pixi.js, and Phaser.js. He contributed to over 500 creative projects, consistently delivering high-quality results and adapting quickly to new requirements. He responded well to feedback and continuously improved his work. He is a creative and capable developer who takes pride in his work. He communicates openly, welcomes feedback, and seeks continuous improvement. His supportive nature and positive attitude made him a valued team member. I am confident he will continue to grow and make positive contributions in any role.",
      ru: "Я работал с Александром полтора года в Perion Network в качестве его тимлида. Будучи Junior Creative Developer, он стабильно превращал идеи и дизайны в чистые, хорошо структурированные фронтенд-решения и часто предлагал инновационные подходы к анимации. Александр продемонстрировал сильные навыки в HTML, CSS, JavaScript, GSAP, Pixi.js и Phaser.js. Он поучаствовал в более чем 500 креативных проектах, стабильно выдавая качественный результат и быстро адаптируясь к новым требованиям. Он хорошо воспринимал обратную связь и постоянно улучшал свою работу. Это креативный и способный разработчик, который гордится своим делом. Он открыто общается, приветствует обратную связь и стремится к постоянному развитию. Его готовность помочь и позитивный настрой сделали его ценным членом команды. Уверен, что он продолжит расти и приносить пользу на любой позиции.",
      uk: "Я працював з Олександром півтора року в Perion Network як його тімлід. Будучи Junior Creative Developer, він стабільно перетворював ідеї та дизайни на чисті, добре структуровані фронтенд-рішення і часто пропонував інноваційні підходи до анімації. Олександр продемонстрував сильні навички в HTML, CSS, JavaScript, GSAP, Pixi.js та Phaser.js. Він долучився до понад 500 креативних проєктів, стабільно видаючи якісний результат і швидко адаптуючись до нових вимог. Він добре сприймав зворотний звʼязок і постійно вдосконалював свою роботу. Це креативний і здібний розробник, який пишається своєю справою. Він відкрито спілкується, вітає зворотний звʼязок і прагне постійного розвитку. Його готовність допомогти та позитивний настрій зробили його цінним членом команди. Упевнений, що він продовжить зростати і приносити користь на будь-якій посаді.",
    },
  },
  {
    id: "kontseva",
    name: "Mariia Kontseva",
    role: "Creative Developer · Perion",
    relation: RELATION.senior,
    linkedin: "https://www.linkedin.com/in/marishka95s/",
    date: "Dec 2025",
    avatar: "./reviews/kontseva.jpg",
    text: {
      en: "I had the pleasure of working with Oleksandr for about 1.5 years as part of a team focused on advertising and retail projects, and during this time, I saw tremendous growth in him as a JavaScript developer and animation specialist. Oleksandr has strong expertise in creating engaging and high-quality animations using libraries such as GSAP, PIXI.js, and Phaser. He is very detail-oriented, writes clean and well-structured code, and confidently handles complex tasks, even under tight deadlines. He consistently delivers projects on time and can always be relied on. Beyond his technical skills, Oleksandr is a great team player. He collaborates effectively, maintains a positive attitude, and contributes to a healthy team dynamic. Working with him is both productive and enjoyable. Oleksandr is a talented developer with strong potential, and I would gladly recommend him to any team looking for a skilled and motivated JavaScript and animation developer.",
      ru: "Мне посчастливилось работать с Александром около 1,5 лет в команде, сфокусированной на рекламных и ритейл-проектах, и за это время я увидела его огромный рост как JavaScript-разработчика и специалиста по анимации. У Александра сильная экспертиза в создании увлекательных и качественных анимаций с использованием библиотек GSAP, PIXI.js и Phaser. Он очень внимателен к деталям, пишет чистый и хорошо структурированный код и уверенно справляется со сложными задачами даже в сжатые сроки. Он стабильно сдаёт проекты вовремя, и на него всегда можно положиться. Помимо технических навыков, Александр — отличный командный игрок. Он эффективно взаимодействует, сохраняет позитивный настрой и поддерживает здоровую атмосферу в команде. Работать с ним и продуктивно, и приятно. Александр — талантливый разработчик с большим потенциалом, и я с радостью порекомендую его любой команде, которой нужен квалифицированный и мотивированный разработчик в области JavaScript и анимации.",
      uk: "Мені пощастило працювати з Олександром близько 1,5 року в команді, що зосереджена на рекламних і ритейл-проєктах, і за цей час я побачила його величезне зростання як JavaScript-розробника та спеціаліста з анімації. Олександр має сильну експертизу у створенні захопливих і якісних анімацій із використанням бібліотек GSAP, PIXI.js та Phaser. Він дуже уважний до деталей, пише чистий і добре структурований код і впевнено впорається зі складними задачами навіть у стислі терміни. Він стабільно здає проєкти вчасно, і на нього завжди можна покластися. Окрім технічних навичок, Олександр — чудовий командний гравець. Він ефективно взаємодіє, зберігає позитивний настрій і підтримує здорову атмосферу в команді. Працювати з ним і продуктивно, і приємно. Олександр — талановитий розробник із великим потенціалом, і я б залюбки порекомендувала його будь-якій команді, якій потрібен кваліфікований і мотивований розробник у сфері JavaScript та анімації.",
    },
  },
  {
    id: "kozoriz",
    name: "Yevhen Kozoriz",
    role: "Creative Developer · Perion",
    relation: RELATION.teammate,
    linkedin: "https://www.linkedin.com/in/yevhen-kozoriz-9587b4202/",
    date: "Dec 2025",
    avatar: "./reviews/kozoriz.jpg",
    text: {
      en: "I worked with Olexandr for over a year in the same team, during this time he showed himself as a reliable developer with solid skills and a strong work attitude. In our animation-focused JavaScript projects for advertising and retail, he handled difficult tasks with confidence and turned them into clear, well-finished solutions that worked great in practice. Olexandr writes clear and organized code, makes high-quality animations and stays focused even when deadlines are tight. He always finishes his tasks on time without lowering the quality. Oleksandr is an expert in using libraries to create animations like GSAP, PIXI.js, Phaser etc. Working with Alexander in the same team is easy and enjoyable. He is enthusiastic and always helpful. He drives things forward with his energy. I fully recommend Oleksandr — he is a skilled and motivated JavaScript developer with great talent and the potential for further growth.",
      ru: "Я работал с Александром больше года в одной команде, и за это время он проявил себя как надёжный разработчик с крепкими навыками и сильным отношением к работе. В наших анимационных JavaScript-проектах для рекламы и ритейла он уверенно брался за сложные задачи и превращал их в понятные, аккуратно завершённые решения, которые отлично работали на практике. Александр пишет понятный и организованный код, делает качественные анимации и сохраняет концентрацию даже в сжатые сроки. Он всегда завершает задачи вовремя, не снижая качества. Александр — эксперт в использовании библиотек для создания анимаций, таких как GSAP, PIXI.js, Phaser и др. Работать с Александром в одной команде легко и приятно. Он увлечён делом и всегда готов помочь. Своей энергией он двигает процессы вперёд. Полностью рекомендую Александра — это квалифицированный и мотивированный JavaScript-разработчик с большим талантом и потенциалом для дальнейшего роста.",
      uk: "Я працював з Олександром понад рік в одній команді, і за цей час він проявив себе як надійний розробник із міцними навичками та сильним ставленням до роботи. У наших анімаційних JavaScript-проєктах для реклами та ритейлу він упевнено брався за складні задачі й перетворював їх на зрозумілі, акуратно завершені рішення, що чудово працювали на практиці. Олександр пише зрозумілий і організований код, робить якісні анімації та зберігає концентрацію навіть у стислі терміни. Він завжди завершує задачі вчасно, не знижуючи якості. Олександр — експерт у використанні бібліотек для створення анімацій, таких як GSAP, PIXI.js, Phaser тощо. Працювати з Олександром в одній команді легко та приємно. Він захоплений справою і завжди готовий допомогти. Своєю енергією він рухає процеси вперед. Повністю рекомендую Олександра — це кваліфікований і мотивований JavaScript-розробник із великим талантом і потенціалом для подальшого зростання.",
    },
  },
  {
    id: "kukharchuk",
    name: "Oleksii Kukharchuk",
    role: "Creative Developer · Undertone",
    relation: RELATION.teammate,
    linkedin: "https://www.linkedin.com/in/oleksii-kukharchuk/",
    date: "Jan 2026",
    avatar: "./reviews/kukharchuk.jpg",
    text: {
      en: "I had the pleasure of working with Oleksandr on the same team. He was always professional, easy to work with, and quickly adapted to our team's workflow, delivering great results as a developer. You could always count on him for support in challenging situations or when deadlines were burning. I fully trusted his expertise. Plus, he's a great person to talk to outside of work too. Wishing you all the best and good luck going forward!",
      ru: "Мне было приятно работать с Александром в одной команде. Он всегда был профессионален, прост в общении и быстро адаптировался к рабочим процессам команды, выдавая отличные результаты как разработчик. На него всегда можно было рассчитывать в сложных ситуациях или когда горели дедлайны. Я полностью доверял его экспертизе. К тому же он отличный собеседник и вне работы. Желаю всего наилучшего и удачи в дальнейшем!",
      uk: "Мені було приємно працювати з Олександром в одній команді. Він завжди був професійним, легким у спілкуванні та швидко адаптувався до робочих процесів команди, видаючи чудові результати як розробник. На нього завжди можна було розраховувати у складних ситуаціях або коли горіли дедлайни. Я повністю довіряв його експертизі. До того ж він чудовий співрозмовник і поза роботою. Бажаю всього найкращого та удачі надалі!",
    },
  },
];
