import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import { useMagnetic } from "../hooks/useMagnetic";
import { profile } from "../data/profile";
import { Mail, Linkedin, Telegram, Github, ArrowUpRight, Pin } from "./Icons";
import styles from "./Contact.module.css";

const socials = [
  { key: "linkedin", label: "LinkedIn", handle: "in/alexleontovych", Icon: Linkedin, href: profile.links.linkedin },
  { key: "email", label: "Email", handle: profile.email, Icon: Mail, href: profile.links.email },
  { key: "github", label: "GitHub", handle: "@alexleontovych", Icon: Github, href: profile.links.github },
] as const;

export default function Contact() {
  const { t, tr } = useI18n();
  const scope = useReveal<HTMLElement>();
  const primaryBtn = useMagnetic<HTMLAnchorElement>(0.3);

  return (
    <section id="contact" ref={scope} className="section">
      <div className="container">
        <div className={styles.wrap} data-reveal>
          <span className="kicker">{t("contact.kicker")}</span>
          <h2 className={styles.title}>
            <span className="gradient-text">{t("contact.title")}</span>
          </h2>
          <p className={styles.body}>{t("contact.body")}</p>

          <a
            ref={primaryBtn}
            href={profile.links.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn ${styles.mail}`}
          >
            <Telegram width={20} height={20} /> {profile.handle}
            <span className="sr-only">{t("a11y.new_tab")}</span>
          </a>

          <div className={styles.socials}>
            {socials.map(({ key, label, handle, Icon, href }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.social}
                data-reveal
              >
                <span className={styles.socialIcon}>
                  <Icon width={22} height={22} />
                </span>
                <span className={styles.socialText}>
                  <span className={styles.socialLabel}>{label}</span>
                  <span className={styles.socialHandle}>{handle}</span>
                </span>
                <span className="sr-only">{t("a11y.new_tab")}</span>
                <ArrowUpRight width={16} height={16} className={styles.socialArrow} />
              </a>
            ))}
          </div>

          <p className={styles.location}>
            <Pin width={15} height={15} /> {t("contact.location")} {tr(profile.location)}
          </p>
        </div>
      </div>
    </section>
  );
}
