import { useEffect, useState } from "react";
import "../../styles/landing.css";
import {
  ContentEditProvider,
  EditableText,
  EditPanel,
  useContentEdit,
} from "../../editing/ContentEditContext";
import LandingSections from "./LandingSections";

const BASE = import.meta.env.BASE_URL;
const HOME_HREF = BASE;
const INVITE_HREF = `${BASE}invite`;
const ABOUT_HREF = `${BASE}about`;
const EARLY_ACCESS_HREF = `${BASE}early-access`;
const PRIVACY_HREF = `${BASE}privacy`;
const CONTACT_HREF = "mailto:hello@mybishbash.app?subject=myBishBash%20enquiry";
// Nav labels in landingContent.nav map 1:1 to these in-page anchors.
const LANDING_NAV_HREFS = ["#how-it-works", "#examples", "#pricing", "#faq"];
const FOOTER_LINK_HREFS = [PRIVACY_HREF, CONTACT_HREF];
const BRAND_LOGO_SRC = `${BASE}icons/mybishbash-cover.png`;

function BrandMark({ dark = false }) {
  return (
    <img className={`brand-mark${dark ? " is-dark" : ""}`} src={BRAND_LOGO_SRC} alt="" aria-hidden="true" />
  );
}

function Header() {
  const { content, editMode } = useContentEdit();
  const [menuOpen, setMenuOpen] = useState(false);
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="site-logo" href={HOME_HREF} onClick={stopEditNavigation} aria-label="myBishBash home">
          <BrandMark />
          <EditableText path="brand.name" />
        </a>
        <nav className="site-nav" aria-label="Primary">
          {content.nav.map((item, index) => (
            <a href={LANDING_NAV_HREFS[index] ?? "/"} key={item} onClick={stopEditNavigation}>
              <EditableText path={`nav.${index}`} />
            </a>
          ))}
        </nav>
        <a className="header-cta" href={INVITE_HREF} onClick={stopEditNavigation}>
          <EditableText path="ctas.primary" />
        </a>
        <button
          type="button"
          className={`nav-toggle${menuOpen ? " is-open" : ""}`}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>
      <div id="mobile-nav" className={`mobile-nav${menuOpen ? " is-open" : ""}`} hidden={!menuOpen}>
        <nav aria-label="Mobile">
          {content.nav.map((item, index) => (
            <a href={LANDING_NAV_HREFS[index] ?? "/"} key={item} onClick={closeMenu}>
              {item}
            </a>
          ))}
          <a href={ABOUT_HREF} onClick={closeMenu}>About</a>
          <a className="mobile-nav-cta" href={INVITE_HREF} onClick={closeMenu}>
            {content.ctas.primary}
          </a>
        </nav>
      </div>
    </header>
  );
}

// Real app Home screen, captured by scripts/capture-landing-screenshots.mjs into
// public/screenshots/. Shown in the existing tilted phone frame.
const HERO_SCREENSHOT_SRC = `${BASE}screenshots/hero-home.png`;

function AppPreview() {
  return (
    <div className="app-preview-wrap" aria-label="myBishBash app showing a reminder card">
      <div className="app-screen app-screen-photo">
        <img
          className="app-screenshot"
          src={HERO_SCREENSHOT_SRC}
          alt="The myBishBash app showing a reminder card asking 'Have you done your face routine today?' with Done, I'll do it now and Not done options"
          width="430"
          height="932"
          loading="eager"
          fetchpriority="high"
        />
      </div>
    </div>
  );
}

function Hero() {
  const { content, editMode } = useContentEdit();
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;

  return (
    <div className="hero-shell">
      <Header />
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-bg" aria-hidden="true" />
        <div className="container hero-grid">
          <div className="hero-copy-block">
            <EditableText className="eyebrow hero-eyebrow reveal-up" path="hero.eyebrow" />
            <h1 className="hero-title reveal-up delay-1" id="hero-title">
              {content.hero.headline.map((line, index) => (
                <EditableText className="hero-title-line" path={`hero.headline.${index}`} key={index} />
              ))}
              <span className="hero-title-line hero-gold-line">
                <span className="hero-gold-phrase">
                  <EditableText path="hero.gold" />
                </span>
              </span>
            </h1>
            <div className="hero-copy reveal-up delay-2">
              {content.hero.copy.filter(Boolean).map((line, index) => (
                <EditableText as="p" path={`hero.copy.${index}`} key={line} />
              ))}
            </div>
            <div className="hero-actions reveal-up delay-3">
              <a className="button primary" href={INVITE_HREF} onClick={stopEditNavigation}>
                <EditableText path="ctas.primary" />
                <span aria-hidden="true">→</span>
              </a>
              <a className="button secondary" href="#how-it-works" onClick={stopEditNavigation}>
                <span className="play-dot" aria-hidden="true" />
                <EditableText path="ctas.secondary" />
              </a>
            </div>
            <p className="hero-meta reveal-up delay-3">
              <EditableText path="hero.anchor" />
              <span className="hero-meta-sep" aria-hidden="true">·</span>
              <a href={CONTACT_HREF}>Questions? Get in touch</a>
            </p>
          </div>
          <AppPreview />
        </div>
        <ProofStrip />
      </section>
    </div>
  );
}

function ProofStrip() {
  const { content } = useContentEdit();

  return (
    <section className="proof-strip" aria-label="myBishBash at a glance">
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
      <div className="container site-footer-inner">
        <div className="footer-brand">
          <a className="footer-logo" href={HOME_HREF} onClick={stopEditNavigation}>
            <BrandMark dark />
            <EditableText path="brand.name" />
          </a>
          <EditableText as="p" className="footer-tagline" path="footer.tagline" />
        </div>
        <nav aria-label="Footer">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href={ABOUT_HREF} onClick={stopEditNavigation}>About</a>
          {content.footer.links.map((link, index) => (
            <a href={FOOTER_LINK_HREFS[index] ?? HOME_HREF} key={link} onClick={stopEditNavigation}>
              <EditableText path={`footer.links.${index}`} />
            </a>
          ))}
        </nav>
        <p className="footer-legal">© {new Date().getFullYear()} myBishBash. Made with care.</p>
      </div>
    </footer>
  );
}

function LandingPage() {
  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Hero />
      <main id="main-content">
        <Statement />
        <LandingSections />
      </main>
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
