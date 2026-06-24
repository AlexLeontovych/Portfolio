import { useI18n } from "./i18n/I18nContext";
import Background from "./components/Background";
import Road from "./components/Road";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import About from "./components/About";
import Experience from "./components/Experience";
import Skills from "./components/Skills";
import Works from "./components/works/Works";
import Contact from "./components/Contact";
import Testimonials from "./components/Testimonials";
import Reference from "./components/Reference";
import Footer from "./components/Footer";
import Admin from "./components/admin/Admin";
import Flashlight from "./components/Flashlight";
import FinishCelebration from "./components/FinishCelebration";

export default function App() {
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">
        {t("a11y.skip")}
      </a>
      <Background />
      <Road />
      <Nav />
      <main id="main" tabIndex={-1}>
        <Hero />
        <About />
        <Experience />
        <Skills />
        <Works />
        <Contact />
        <Testimonials />
        <Reference />
      </main>
      <Footer />
      <Admin />
      <Flashlight />
      <FinishCelebration />
    </>
  );
}
