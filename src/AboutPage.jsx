import "./landing.css";
import "./about.css";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
import { aboutContent } from "./content/aboutContent";

const BASE = import.meta.env.BASE_URL;
const HOME_HREF = BASE;
const APP_HOME_HREF = `${BASE}home`;
const EARLY_ACCESS_HREF = `${BASE}early-access`;
const BRAND_LOGO_SRC = `${BASE}icons/mybishbash-cover.png`;

function BrandMark({ dark = false }) {
  return (
    <img className={`brand-mark${dark ? " is-dark" : ""}`} src={BRAND_LOGO_SRC} alt="" aria-hidden="true" />
  );
}

function AboutHeader() {
  const { content, editMode } = useContentEdit();
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;
  const navItems = [
    { href: `${BASE}about`, active: true },
    { href: `${HOME_HREF}#features` },
  ];

  return (
    <header className="site-header about-site-header">
      <div className="site-header-inner">
        <a className="site-logo" href={HOME_HREF} onClick={stopEditNavigation} aria-label="myBishBash home">
          <BrandMark />
          <EditableText path="brand" />
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          {navItems.map((item, index) => (
            <a className={item.active ? "is-active" : ""} href={item.href} key={content.nav[index]} onClick={stopEditNavigation} aria-current={item.active ? "page" : undefined}>
              <EditableText path={`nav.${index}`} />
            </a>
          ))}
        </nav>
        <a className="header-cta" href={APP_HOME_HREF} onClick={stopEditNavigation}>
          <EditableText path="cta" />
        </a>
      </div>
    </header>
  );
}

function AboutPhoneVisual() {
  const { content } = useContentEdit();
  const actions = content.phone.actions;

  return (
    <div className="about-phone-wrap" aria-label="myBishBash interruption preview">
      <div className="about-phone">
        <div className="about-phone-status">
          <span>9:41</span>
          <span>...</span>
        </div>
        <BrandMark dark />
        <div className="about-prompt-card">
          <EditableText as="p" path="phone.eyebrow" />
          <EditableText as="h2" path="phone.title" />
          <span />
          <EditableText as="h3" path="phone.prompt" />
        </div>
        <div className="about-choice-row" aria-label="Interruption choices">
          <button type="button"><EditableText path="phone.choices.0" /></button>
          <button type="button"><EditableText path="phone.choices.1" /></button>
        </div>
        <div className="about-reminder-list">
          {actions.map((item, index) => (
            <div className="about-reminder-row" key={item}>
              <i aria-hidden="true" />
              <EditableText as="span" path={`phone.actions.${index}`} />
              <em>{index < 3 ? "Action" : "Later"}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutFeatureCard({ title, children, secondary = false }) {
  return (
    <article className={`about-feature-card${secondary ? " is-secondary" : ""}`}>
      <span aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function AboutPage() {
  const { editMode, content } = useContentEdit();
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;
  return (
    <div className="landing-page about-page">
      <AboutHeader />

      <main>
        <section className="about-hero">
          <div className="about-hero-glow" aria-hidden="true" />
          <div className="container about-hero-grid">
            <div className="about-hero-copy reveal-up">
              <EditableText as="p" className="about-eyebrow" path="hero.eyebrow" />
              <EditableText as="h1" path="hero.title" />
              <div className="about-lede">
                {content.hero.lede.map((item, index) => <EditableText as="p" path={`hero.lede.${index}`} key={index} />)}
              </div>
              <div className="about-reminder-copy">
                <EditableText as="span" path="hero.reminder" />
                <EditableText as="strong" path="hero.reminderStrong" />
              </div>
              <div className="hero-actions about-actions">
                <a className="button primary" href={EARLY_ACCESS_HREF} onClick={stopEditNavigation}>
                  <EditableText path="backCta" /> <span aria-hidden="true">-&gt;</span>
                </a>
                <a className="button secondary" href="#how-it-works" onClick={stopEditNavigation}>
                  <span className="play-dot" aria-hidden="true" />
                  <EditableText path="secondaryCta" />
                </a>
              </div>
            </div>
            <AboutPhoneVisual />
          </div>
        </section>

        <section className="about-section" id="how-it-works">
          <div className="container">
            <article className="about-belief-card">
              <EditableText as="p" className="about-eyebrow" path="mechanic.eyebrow" />
              <EditableText as="h2" path="mechanic.title" />
              <div>
                {content.mechanic.copy.map((item, index) => <EditableText as="p" path={`mechanic.copy.${index}`} key={index} />)}
              </div>
            </article>
          </div>
        </section>

        <section className="about-section">
          <div className="container">
            <div className="about-feature-grid">
              <AboutFeatureCard title={<EditableText path="features.0.0" />}>
                <EditableText path="features.0.1" />
              </AboutFeatureCard>
              <AboutFeatureCard title={<EditableText path="features.1.0" />}>
                <EditableText path="features.1.1" />
              </AboutFeatureCard>
              <AboutFeatureCard title={<EditableText path="features.2.0" />}>
                <EditableText path="features.2.1" />
              </AboutFeatureCard>
              <AboutFeatureCard title={<EditableText path="features.3.0" />} secondary>
                <EditableText path="features.3.1" />
              </AboutFeatureCard>
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="container about-split">
            <div>
              <EditableText as="p" className="about-eyebrow" path="early.eyebrow" />
              <EditableText as="h2" path="early.title" />
              {content.early.copy.map((item, index) => <EditableText as="p" path={`early.copy.${index}`} key={index} />)}
            </div>
            <div className="about-badge-panel">
              {content.early.badges.map((item, index) => (
                <EditableText as="span" path={`early.badges.${index}`} key={item} />
              ))}
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="container">
            <article className="about-privacy-card">
              <div className="about-lock" aria-hidden="true">~</div>
              <div>
                <EditableText as="p" className="about-eyebrow" path="privacy.eyebrow" />
                <EditableText as="h2" path="privacy.title" />
                {content.privacy.copy.map((item, index) => <EditableText as="p" path={`privacy.copy.${index}`} key={index} />)}
                <EditableText as="strong" path="privacy.strong" />
              </div>
            </article>
          </div>
        </section>

        <section className="about-why">
          <div className="container">
            <EditableText as="h2" path="why.title" />
            {content.why.copy.map((item, index) => <EditableText as="p" path={`why.copy.${index}`} key={index} />)}
            <EditableText as="span" path="why.final" />
          </div>
        </section>

        <section className="about-final-cta">
          <div className="container">
            <article>
              <EditableText as="h2" path="final.title" />
              <EditableText as="p" path="final.copy" />
              <div className="hero-actions about-actions">
                <a className="button primary" href={APP_HOME_HREF} onClick={stopEditNavigation}>
                  <EditableText path="final.primary" /> <span aria-hidden="true">-&gt;</span>
                </a>
                <a className="button launch-list" href={EARLY_ACCESS_HREF} onClick={stopEditNavigation}>
                  <EditableText path="final.secondary" /> <span aria-hidden="true">-&gt;</span>
                </a>
              </div>
            </article>
          </div>
        </section>
      </main>
      <EditPanel />
    </div>
  );
}

export default function EditableAboutPage() {
  return (
    <ContentEditProvider
      initialContent={aboutContent}
      storageKey="mybishbash.aboutContentDraft.v1"
      saveEndpoint="/__save-about-content"
      saveLabel="src/content/aboutContent.js"
      isContentCompatible={(value) => Array.isArray(value?.hero?.lede) && Array.isArray(value?.features)}
    >
      <AboutPage />
    </ContentEditProvider>
  );
}
