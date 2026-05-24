import "./landing.css";
import "./about.css";

const BASE = import.meta.env.BASE_URL;
const HOME_HREF = BASE;
const APP_HOME_HREF = `${BASE}home`;
const EARLY_ACCESS_HREF = `${BASE}early-access`;

function BrandMark({ dark = false }) {
  return (
    <span className={`brand-mark${dark ? " is-dark" : ""}`} aria-hidden="true">
      <span />
    </span>
  );
}

function AboutHeader() {
  const navItems = [
    { label: "How it works", href: `${BASE}about`, active: true },
    { label: "Features", href: HOME_HREF },
    { label: "For you", href: HOME_HREF },
    { label: "Pricing", href: HOME_HREF },
    { label: "Blog", href: HOME_HREF },
  ];

  return (
    <header className="site-header about-site-header">
      <div className="site-header-inner">
        <a className="site-logo" href={HOME_HREF} aria-label="MyBishBash home">
          <BrandMark />
          MyBishBash
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a className={item.active ? "is-active" : ""} href={item.href} key={item.label} aria-current={item.active ? "page" : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="header-cta" href={APP_HOME_HREF}>
          Get MyBishBash
        </a>
      </div>
    </header>
  );
}

function AboutPhoneVisual() {
  const actions = ["Drink water", "Stretch", "Back to work", "Go outside", "Text someone back", "Read one page"];

  return (
    <div className="about-phone-wrap" aria-label="MyBishBash interruption preview">
      <div className="about-phone">
        <div className="about-phone-status">
          <span>9:41</span>
          <span>...</span>
        </div>
        <BrandMark dark />
        <div className="about-prompt-card">
          <p>Before Instagram</p>
          <h2>Pause for a second.</h2>
          <span />
          <h3>Do I actually want to open Instagram right now?</h3>
        </div>
        <div className="about-choice-row" aria-label="Interruption choices">
          <button type="button">Do something else</button>
          <button type="button">Continue to app</button>
        </div>
        <div className="about-reminder-list">
          {actions.map((item, index) => (
            <div className="about-reminder-row" key={item}>
              <i aria-hidden="true" />
              <span>{item}</span>
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
  return (
    <div className="landing-page about-page">
      <AboutHeader />

      <main>
        <section className="about-hero">
          <div className="about-hero-glow" aria-hidden="true" />
          <div className="container about-hero-grid">
            <div className="about-hero-copy reveal-up">
              <p className="about-eyebrow">How it works</p>
              <h1>Build a better relationship with your phone.</h1>
              <div className="about-lede">
                <p>How many times a day do you pick up your phone?</p>
                <p>MyBishBash helps you place small interruption layers in front of the apps you open without thinking.</p>
                <p>Before the app opens, you see an interrupter card. You can choose to do something else, or continue to the app.</p>
              </div>
              <div className="about-reminder-copy">
                <span>Whether that means drinking water, stretching, getting back to work, taking a breath, or simply pausing for a second,</span>
                <strong>the prompt comes from you. Not an algorithm.</strong>
              </div>
              <div className="hero-actions about-actions">
                <a className="button primary" href={EARLY_ACCESS_HREF}>
                  Join early access <span aria-hidden="true">-&gt;</span>
                </a>
                <a className="button secondary" href="#how-it-works">
                  <span className="play-dot" aria-hidden="true" />
                  See how it works
                </a>
              </div>
            </div>
            <AboutPhoneVisual />
          </div>
        </section>

        <section className="about-section" id="how-it-works">
          <div className="container">
            <article className="about-belief-card">
              <p className="about-eyebrow">The mechanic</p>
              <h2>Interrupter card. Choice. Action cards if you want them.</h2>
              <div>
                <p>Most apps are designed to pull your attention back toward them again and again.</p>
                <p>MyBishBash explores the opposite idea: what if your phone could put a small moment of choice before the automatic open?</p>
                <p>The goal is not restriction or guilt. Continue to app is always a normal option.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="about-section">
          <div className="container">
            <div className="about-feature-grid">
              <AboutFeatureCard title="Interrupter cards">
                Choose the messages you want to see before opening a launcher.
              </AboutFeatureCard>
              <AboutFeatureCard title="Do something else">
                If you decide not to open the app, MyBishBash shows quick action cards you picked.
              </AboutFeatureCard>
              <AboutFeatureCard title="Continue to app">
                When you still want to open the app, you can continue without shame or friction.
              </AboutFeatureCard>
              <AboutFeatureCard title="Launcher shortcuts" secondary>
                Add a home-screen launcher for Instagram first, then add more apps later when you are ready.
              </AboutFeatureCard>
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="container about-split">
            <div>
              <p className="about-eyebrow">Early access</p>
              <h2>Built carefully. Released intentionally.</h2>
              <p>MyBishBash is currently in a limited early-access release while we refine the experience with first users.</p>
              <p>We are focused on building something calm, trustworthy and genuinely useful, rather than optimising for endless engagement.</p>
            </div>
            <div className="about-badge-panel">
              {["Interrupter cards", "Action cards", "Instagram launcher", "Home-screen setup", "Future app launchers"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="container">
            <article className="about-privacy-card">
              <div className="about-lock" aria-hidden="true">~</div>
              <div>
                <p className="about-eyebrow">Privacy</p>
                <h2>Personal by design.</h2>
                <p>Your interrupter cards and action cards can be personal. They might involve your goals, routines, relationships, health, study or work.</p>
                <p>That trust matters. We are building MyBishBash with careful handling of personal content from the beginning.</p>
                <strong>Your prompts should feel personal, not exposed.</strong>
              </div>
            </article>
          </div>
        </section>

        <section className="about-why">
          <div className="container">
            <h2>Technology does not have to fight for your attention all the time.</h2>
            <p>Sometimes a single interruption at the right moment can change the direction of a day.</p>
            <p>MyBishBash is being built to create more of those moments.</p>
            <span>Not to remove technology from life. Just to make it feel more intentional.</span>
          </div>
        </section>

        <section className="about-final-cta">
          <div className="container">
            <article>
              <h2>Join the early-access release.</h2>
              <p>Help shape a calmer way to use technology.</p>
              <div className="hero-actions about-actions">
                <a className="button primary" href={APP_HOME_HREF}>
                  Get MyBishBash <span aria-hidden="true">-&gt;</span>
                </a>
                <a className="button launch-list" href={EARLY_ACCESS_HREF}>
                  Join the waiting list <span aria-hidden="true">-&gt;</span>
                </a>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AboutPage;
