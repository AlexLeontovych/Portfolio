import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import type { Localized } from "../data/types";
import { ArrowUpRight, Download, FileText } from "./Icons";
import ThanksSign from "./ThanksSign";
import styles from "./Reference.module.css";

/** The formal job-reference letter (the downloadable PDF stays the English original). */
const PDF = "./Job_Reference_Oleksandr_Leontovych.pdf";

const LETTER: {
  date: Localized;
  salutation: Localized;
  paragraphs: Localized[];
  signoff: Localized;
  signer: { name: string; title: string; email: string; linkedin: string };
} = {
  date: { en: "December 31, 2025", ru: "31 декабря 2025 г.", uk: "31 грудня 2025 р." },
  salutation: {
    en: "To Whom It May Concern,",
    ru: "Уважаемые дамы и господа,",
    uk: "Шановні пані та панове,",
  },
  paragraphs: [
    {
      en: "I am writing this letter to confidently recommend Oleksandr Leontovych for future employment opportunities. Having had the pleasure of working with him for 1.5 years as his Team Lead at Perion Networks, I have been consistently impressed with his professionalism, drive, and dedication to excellence.",
      ru: "Пишу это письмо, чтобы с уверенностью рекомендовать Александра Леонтовича для будущих карьерных возможностей. Имея удовольствие работать с ним в течение 1,5 лет в качестве его тимлида в Perion Networks, я неизменно был впечатлён его профессионализмом, целеустремлённостью и стремлением к совершенству.",
      uk: "Пишу цей лист, щоб упевнено рекомендувати Олександра Леонтовича для майбутніх карʼєрних можливостей. Маючи приємність працювати з ним упродовж 1,5 року як його тімлід у Perion Networks, я незмінно був вражений його професіоналізмом, цілеспрямованістю та прагненням до досконалості.",
    },
    {
      en: "He joined our team as a Junior Creative Developer, and from the outset, he displayed a remarkable aptitude for technical development and problem-solving. He has a proven track record for delivering exceptional results on time and to the highest standard. For instance, he effectively utilized technologies such as HTML, CSS, JavaScript, GSAP, Pixi.js, and Phaser.js to deliver over 500 creatives, demonstrating his ability to innovate and adapt in a fast-paced environment.",
      ru: "Он присоединился к нашей команде как Junior Creative Developer и с самого начала проявил замечательные способности к техническому развитию и решению задач. У него подтверждённый послужной список безупречной сдачи результатов в срок и по высшему стандарту. Например, он эффективно применял такие технологии, как HTML, CSS, JavaScript, GSAP, Pixi.js и Phaser.js, выпустив более 500 креативов, чем продемонстрировал способность внедрять новое и адаптироваться в динамичной среде.",
      uk: "Він приєднався до нашої команди як Junior Creative Developer і з самого початку проявив неабиякі здібності до технічного розвитку та розвʼязання задач. Він має підтверджений послужний список бездоганної здачі результатів вчасно та за найвищим стандартом. Наприклад, він ефективно застосовував такі технології, як HTML, CSS, JavaScript, GSAP, Pixi.js і Phaser.js, випустивши понад 500 креативів, чим продемонстрував здатність впроваджувати нове та адаптуватися в динамічному середовищі.",
    },
    {
      en: "Beyond his technical skills and professional competency, he is a remarkable team player with excellent communication skills. He consistently builds strong relationships with his colleagues, fostering a collaborative and positive environment. His strong time management and adaptability have significantly contributed to the success of our projects and team dynamics.",
      ru: "Помимо технических навыков и профессиональной компетентности, он замечательный командный игрок с отличными коммуникативными навыками. Он стабильно выстраивает прочные отношения с коллегами, формируя атмосферу сотрудничества и позитива. Его умение управлять временем и адаптивность существенно способствовали успеху наших проектов и слаженности команды.",
      uk: "Окрім технічних навичок і професійної компетентності, він чудовий командний гравець із відмінними комунікативними навичками. Він стабільно вибудовує міцні стосунки з колегами, формуючи атмосферу співпраці та позитиву. Його вміння керувати часом і адаптивність суттєво сприяли успіху наших проєктів і злагодженості команди.",
    },
    {
      en: "Without hesitation, I recommend Oleksandr for any opportunity he chooses to pursue. I am confident that he will bring the same level of dedication, skill, and positive attitude to any organization as he did in ours. He will be a valuable asset to any team.",
      ru: "Без колебаний рекомендую Александра для любой возможности, которую он решит реализовать. Уверен, что он привнесёт в любую организацию тот же уровень самоотдачи, мастерства и позитивного настроя, что и у нас. Он станет ценным приобретением для любой команды.",
      uk: "Без вагань рекомендую Олександра для будь-якої можливості, яку він вирішить реалізувати. Упевнений, що він привнесе в будь-яку організацію той самий рівень самовіддачі, майстерності та позитивного настрою, що й у нас. Він стане цінним надбанням для будь-якої команди.",
    },
    {
      en: "Please do not hesitate to contact me if you require any further information.",
      ru: "Пожалуйста, не стесняйтесь обращаться ко мне, если вам потребуется дополнительная информация.",
      uk: "Будь ласка, не вагайтеся звертатися до мене, якщо вам знадобиться додаткова інформація.",
    },
  ],
  signoff: { en: "Sincerely,", ru: "С уважением,", uk: "З повагою," },
  signer: {
    name: "Nikita Kutsenko",
    title: "Team Lead, Creative Developer · Perion Networks",
    email: "nkutsenko@perion.com",
    linkedin: "https://www.linkedin.com/in/nikita-kutsenko/",
  },
};

export default function Reference() {
  const { t, tr } = useI18n();
  const scope = useReveal<HTMLElement>();

  return (
    <section id="reference" ref={scope} className="section">
      <ThanksSign />
      <div className="container">
        <header data-reveal>
          <span className="kicker">{t("reference.kicker")}</span>
          <h2 className="section-title">{t("reference.title")}</h2>
        </header>

        <article className={styles.letter} data-reveal>
          <div className={styles.letterHead}>
            <FileText className={styles.docIcon} aria-hidden="true" />
            <span className={styles.date}>{tr(LETTER.date)}</span>
          </div>

          <p className={styles.salutation}>{tr(LETTER.salutation)}</p>
          {LETTER.paragraphs.map((para, i) => (
            <p key={i} className={styles.para}>
              {tr(para)}
            </p>
          ))}

          <p className={styles.signoff}>{tr(LETTER.signoff)}</p>

          <footer className={styles.signer}>
            <a
              href={LETTER.signer.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.signerName}
            >
              {LETTER.signer.name}
              <ArrowUpRight width={14} height={14} />
              <span className="sr-only">{t("a11y.new_tab")}</span>
            </a>
            <span className={styles.signerTitle}>{LETTER.signer.title}</span>
            <a href={`mailto:${LETTER.signer.email}`} className={styles.signerEmail}>
              {LETTER.signer.email}
            </a>
          </footer>
        </article>

        <div className={styles.actions} data-reveal>
          <a href={PDF} download className={`btn ${styles.download}`}>
            <Download width={20} height={20} /> {t("reference.download")}
          </a>
        </div>
      </div>
    </section>
  );
}
