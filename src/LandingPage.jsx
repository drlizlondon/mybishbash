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
const LANDING_NAV_HREFS = [ABOUT_HREF, HOME_HREF, HOME_HREF, HOME_HREF, HOME_HREF];
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
        <a className="site-logo" href={HOME_HREF} onClick={stopEditNavigation} aria-label="MyBishBash home">
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

function AppPreview() {
  const { content } = useContentEdit();

  return (
    <div className="app-preview-wrap" aria-label="MyBishBash app homepage preview">
      <div className="app-screen">
        <div className="app-status">
          <span>9:41</span>
          <span>●●●</span>
        </div>
        <BrandMark dark />
        <div className="app-heading">
          <EditableText as="h2" path="app.greeting" />
          <EditableText as="p" path="app.subtitle" />
        </div>
        <section className="intentions-card">
          <EditableText as="p" className="app-card-label" path="app.intentionsLabel" />
          <div className="intentions-list">
            {content.app.intentions.map((item, index) => (
              <div className="intention-row" key={item}>
                <span />
                <EditableText path={`app.intentions.${index}`} />
                <i />
              </div>
            ))}
          </div>
        </section>
        <section className="pause-card">
          <div>
            <EditableText as="h3" path="app.pauseTitle" />
            <EditableText as="p" path="app.pauseCopy" />
          </div>
          <button type="button" aria-label="Continue">→</button>
        </section>
        <section className="moments-card">
          <EditableText as="p" className="app-card-label" path="app.momentsLabel" />
          <div className="moments-grid">
            {content.app.moments.map((moment, index) => (
              <div key={moment[0]}>
                <EditableText as="span" path={`app.moments.${index}.0`} />
                <EditableText as="strong" path={`app.moments.${index}.1`} />
              </div>
            ))}
          </div>
        </section>
        <nav className="app-bottom-nav" aria-label="App preview navigation">
          {content.app.nav.map((item, index) => (
            <span key={item}>
              <i />
              <EditableText path={`app.nav.${index}`} />
            </span>
          ))}
        </nav>
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
    <section className="proof-strip" aria-label="MyBishBash highlights">
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
          <a href={HOME_HREF} key={link} onClick={stopEditNavigation}>
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
