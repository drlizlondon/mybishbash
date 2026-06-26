import "./landing.css";
import {
  ContentEditProvider,
  EditableText,
  EditPanel,
  useContentEdit,
} from "./editing/ContentEditContext";
import AnimatedFeatureSection from "./AnimatedFeatureSection";

const BASE = import.meta.env.BASE_URL;
const HOME_HREF = BASE;
const INVITE_HREF = `${BASE}invite`;
const ABOUT_HREF = `${BASE}about`;
const EARLY_ACCESS_HREF = `${BASE}early-access`;
const LANDING_NAV_HREFS = [ABOUT_HREF, "#features"];
// Footer links, in the same order as landingContent.footer.links.
const FOOTER_LINK_HREFS = [`${BASE}privacy`, "mailto:support@mybishbash.app"];
const BRAND_LOGO_SRC = `${BASE}icons/mybishbash-cover.png`;

function BrandMark({ dark = false }) {
  return (
    <img className={`brand-mark${dark ? " is-dark" : ""}`} src={BRAND_LOGO_SRC} alt="" aria-hidden="true" />
  );
}

function Header() {
  const { content, editMode } = useContentEdit();
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="site-logo" href={HOME_HREF} onClick={stopEditNavigation} aria-label="myBishBash home">
          <BrandMark />
          <EditableText path="brand.name" />
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          {content.nav.map((item, index) => (
            <a href={LANDING_NAV_HREFS[index] ?? "/"} key={item} onClick={stopEditNavigation}>
              <EditableText path={`nav.${index}`} />
            </a>
          ))}
        </nav>
        <a className="header-cta" href={INVITE_HREF} onClick={stopEditNavigation}>
          <EditableText path="ctas.primary" />
        </a>
      </div>
    </header>
  );
}

// Real app Home screen, captured by scripts/capture-hero-screenshot.mjs into
// public/screenshots/. Shown in the existing tilted phone frame.
const HERO_SCREENSHOT_SRC = `${BASE}screenshots/hero-home.png`;

function AppPreview() {
  return (
    <div className="app-preview-wrap" aria-label="myBishBash app home screen">
      <div className="app-screen app-screen-photo">
        <img
          className="app-screenshot"
          src={HERO_SCREENSHOT_SRC}
          alt="The myBishBash app showing a gentle nudge card with Done, I'll do it now, and Not done options"
          width="430"
          height="932"
          loading="eager"
        />
      </div>
    </div>
  );
}

function Hero() {
  const { content, editMode } = useContentEdit();
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;

  return (
    <main className="hero-shell">
      <Header />
      <section className="hero-section">
        <div className="hero-bg" aria-hidden="true" />
        <div className="container hero-grid">
          <div className="hero-copy-block">
            <h1 className="hero-title reveal-up">
              <EditableText className="hero-title-line" path="hero.headline.0" />
              <EditableText className="hero-title-line" path="hero.headline.1" />
              <EditableText className="hero-title-line" path="hero.headline.2" />
              <EditableText className="hero-title-line" path="hero.headline.3" />
              <span className="hero-title-line hero-gold-line">
                <EditableText className="hero-gold-phrase" path="hero.headline.4" />
              </span>
            </h1>
            <div className="hero-copy reveal-up delay-1">
              {content.hero.copy.map((line, index) => (
                <EditableText as="p" path={`hero.copy.${index}`} key={line} />
              ))}
            </div>
            <div className="hero-actions reveal-up delay-2">
              <a className="button primary" href={INVITE_HREF} onClick={stopEditNavigation}>
                <EditableText path="ctas.primary" />
                <span aria-hidden="true">→</span>
              </a>
              <a className="button launch-list" href={EARLY_ACCESS_HREF} onClick={stopEditNavigation}>
                Join early access
                <span aria-hidden="true">→</span>
              </a>
              <a className="button secondary" href={ABOUT_HREF} onClick={stopEditNavigation}>
                <span className="play-dot" aria-hidden="true" />
                <EditableText path="ctas.secondary" />
              </a>
            </div>
          </div>
          <AppPreview />
        </div>
        <ProofStrip />
      </section>
    </main>
  );
}

function ProofStrip() {
  const { content } = useContentEdit();

  return (
    <section className="proof-strip" aria-label="myBishBash highlights">
      <div className="container proof-grid">
        {content.proof.map((item, index) => (
          <article className="proof-item" key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <EditableText as="h2" path={`proof.${index}.title`} />
            <EditableText as="p" path={`proof.${index}.copy`} />
          </article>
        ))}
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section className="statement-strip">
      <div className="container">
        <EditableText as="p" path="statement" />
      </div>
    </section>
  );
}

function Footer() {
  const { content, editMode } = useContentEdit();
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;

  return (
    <footer className="site-footer">
      <a className="footer-logo" href={HOME_HREF} onClick={stopEditNavigation}>
        <BrandMark dark />
        <EditableText path="brand.name" />
      </a>
      <nav aria-label="Footer navigation">
        {content.footer.links.map((link, index) => (
          <a href={FOOTER_LINK_HREFS[index] ?? HOME_HREF} key={link} onClick={stopEditNavigation}>
            <EditableText path={`footer.links.${index}`} />
          </a>
        ))}
      </nav>
    </footer>
  );
}

function LandingPage() {
  return (
    <div className="landing-page">
      <Hero />
      <Statement />
      <AnimatedFeatureSection />
      <Footer />
      <EditPanel />
    </div>
  );
}

export function EditableLandingPage() {
  return (
    <ContentEditProvider>
      <LandingPage />
    </ContentEditProvider>
  );
}

export default LandingPage;
