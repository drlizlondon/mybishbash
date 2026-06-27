import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  comparison,
  faq,
  finalCta,
  howItWorks,
  mechanics,
  packs,
  partnerships,
  pricing,
  problem,
  trust,
} from "./content/landingContent";

const BASE = import.meta.env.BASE_URL;
const MARK_SRC = `${BASE}icons/mybishbash-logo-mark.png`;
const INVITE_HREF = `${BASE}invite`;
const EARLY_ACCESS_HREF = `${BASE}early-access`;
const CONTACT_HREF = "mailto:hello@mybishbash.app?subject=myBishBash%20enquiry";

const ease = [0.16, 1, 0.3, 1];

function useInViewVariants() {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? "visible" : "hidden",
    whileInView: "visible",
    viewport: { once: true, margin: "-80px" },
  };
}

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

function SectionHeader({ eyebrow, heading, copy, align = "center", tone = "light" }) {
  const v = useInViewVariants();
  return (
    <motion.div
      className={`section-head section-head-${align} tone-${tone}`}
      variants={stagger}
      initial={v.initial}
      whileInView={v.whileInView}
      viewport={v.viewport}
    >
      {eyebrow ? (
        <motion.span className="eyebrow" variants={fadeUp}>
          {eyebrow}
        </motion.span>
      ) : null}
      <motion.h2 className="section-title" variants={fadeUp}>
        {heading}
      </motion.h2>
      {copy ? (
        <motion.p className="section-lede" variants={fadeUp}>
          {copy}
        </motion.p>
      ) : null}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Phone mockups — CSS-rendered so each mechanic is visibly distinct, fast and
// always current. They mirror the real app's warm card aesthetic.
// ---------------------------------------------------------------------------

function PhoneFrame({ children, label, className = "" }) {
  return (
    <div className={`phone ${className}`} role="img" aria-label={label}>
      <div className="phone-notch" aria-hidden="true" />
      <div className="phone-screen">{children}</div>
    </div>
  );
}

function ScreenTopbar({ kicker }) {
  return (
    <div className="scr-top">
      <span className="scr-dot" aria-hidden="true">+</span>
      <span className="scr-kicker">{kicker}</span>
      <span className="scr-dot" aria-hidden="true">▦</span>
    </div>
  );
}

function BrandB() {
  return <img className="scr-mark" src={MARK_SRC} alt="" aria-hidden="true" width="34" height="34" />;
}

function PauseScreen() {
  return (
    <div className="scr scr-pause">
      <ScreenTopbar kicker="STILL AWAKE?" />
      <BrandB />
      <p className="scr-prompt">Do you really want to open Instagram right now?</p>
      <span className="scr-rule" aria-hidden="true" />
      <div className="scr-spacer" />
      <span className="scr-app-pill"><i className="pill-ig" aria-hidden="true" />Instagram</span>
      <div className="scr-actions">
        <button type="button" className="scr-btn scr-btn-primary" tabIndex={-1}>Not yet</button>
        <button type="button" className="scr-btn scr-btn-ghost" tabIndex={-1}>Open Instagram</button>
      </div>
    </div>
  );
}

function PersonalScreen() {
  return (
    <div className="scr scr-personal">
      <ScreenTopbar kicker="STILL AWAKE?" />
      <BrandB />
      <p className="scr-prompt">Have you done your face routine?</p>
      <span className="scr-rule" aria-hidden="true" />
      <p className="scr-sub">A gentle nudge from the version of you that cares.</p>
      <div className="scr-spacer" />
      <div className="scr-actions">
        <button type="button" className="scr-btn scr-btn-primary" tabIndex={-1}>Done</button>
        <button type="button" className="scr-btn scr-btn-ghost" tabIndex={-1}>I'll do it now</button>
        <button type="button" className="scr-btn scr-btn-ghost" tabIndex={-1}>Not yet</button>
      </div>
    </div>
  );
}

function CommitmentScreen() {
  return (
    <div className="scr scr-commit">
      <ScreenTopbar kicker="TODAY'S COMMITMENT" />
      <BrandB />
      <p className="scr-prompt scr-prompt-lg">I will go for a 20 minute walk after lunch</p>
      <span className="scr-rule" aria-hidden="true" />
      <div className="scr-spacer" />
      <div className="scr-actions">
        <button type="button" className="scr-btn scr-btn-primary" tabIndex={-1}>I will commit to this</button>
        <button type="button" className="scr-btn scr-btn-ghost" tabIndex={-1}>Not this time</button>
      </div>
    </div>
  );
}

function PacksScreen() {
  return (
    <div className="scr scr-packs">
      <div className="scr-pack-head">
        <span className="scr-pack-tag">BETTER BEDTIME · PACK</span>
        <span className="scr-pack-dots" aria-hidden="true">
          <i /><i /><i />
        </span>
      </div>
      <BrandB />
      <p className="scr-prompt">Put your phone away for bedtime?</p>
      <span className="scr-rule" aria-hidden="true" />
      <p className="scr-sub">One of a ready-made set, shown before the apps you choose.</p>
      <div className="scr-spacer" />
      <div className="scr-actions">
        <button type="button" className="scr-btn scr-btn-primary" tabIndex={-1}>Done</button>
        <button type="button" className="scr-btn scr-btn-ghost" tabIndex={-1}>Not yet</button>
      </div>
    </div>
  );
}

function HomeScreen() {
  const apps = ["Instagram", "Messages", "YouTube", "Mail", "Reddit", "Music", "Photos", "Maps", "Notes"];
  return (
    <div className="scr scr-home">
      <div className="scr-home-time">9:41</div>
      <p className="scr-home-greet">Good morning, Sam.</p>
      <div className="scr-home-grid" aria-hidden="true">
        {apps.map((a, i) => (
          <span className={`scr-app scr-app-${i % 5}`} key={a}>
            {a === "Instagram" ? <i className="pill-ig" /> : <i />}
          </span>
        ))}
      </div>
      <div className="scr-tap" aria-hidden="true">
        <span className="scr-tap-ring" />
      </div>
    </div>
  );
}

const STEP_SCREENS = [<HomeScreen key="s0" />, <PauseScreen key="s1" />, <PersonalScreen key="s2" />];

function HowItWorks() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const v = useInViewVariants();

  useEffect(() => {
    if (reduce || paused) return undefined;
    const id = setInterval(() => setActive((i) => (i + 1) % howItWorks.steps.length), 3600);
    return () => clearInterval(id);
  }, [reduce, paused]);

  return (
    <section id="how-it-works" className="section section-dark">
      <div className="container">
        <SectionHeader
          eyebrow={howItWorks.eyebrow}
          heading={howItWorks.heading}
          copy={howItWorks.copy}
          tone="dark"
        />
        <motion.div
          className="hiw-grid"
          variants={stagger}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          <motion.div
            className="hiw-steps"
            variants={fadeUp}
            role="tablist"
            aria-label="How myBishBash works"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {howItWorks.steps.map((step, i) => (
              <button
                type="button"
                key={step.key}
                role="tab"
                id={`hiw-tab-${i}`}
                aria-selected={active === i}
                aria-controls="hiw-phone"
                className={`hiw-step${active === i ? " is-active" : ""}`}
                onClick={() => setActive(i)}
              >
                <span className="hiw-step-num">{step.label}</span>
                <span className="hiw-step-body">
                  <span className="hiw-step-title">{step.title}</span>
                  <span className="hiw-step-copy">{step.copy}</span>
                </span>
                <span className="hiw-step-bar" aria-hidden="true">
                  <span className={`hiw-step-fill${active === i && !paused && !reduce ? " is-running" : ""}`} />
                </span>
              </button>
            ))}
          </motion.div>

          <motion.div className="hiw-stage" variants={fadeUp}>
            <div className="hiw-glow" aria-hidden="true" />
            <div
              className="hiw-phone-wrap"
              id="hiw-phone"
              role="tabpanel"
              aria-labelledby={`hiw-tab-${active}`}
            >
              <PhoneFrame label={howItWorks.steps[active].title} className="phone-stage">
                <motion.div
                  key={active}
                  className="hiw-screen-anim"
                  initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45, ease }}
                >
                  {STEP_SCREENS[active]}
                </motion.div>
              </PhoneFrame>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

const MECHANIC_SCREENS = {
  pause: <PauseScreen />,
  personal: <PersonalScreen />,
  commitment: <CommitmentScreen />,
  packs: <PacksScreen />,
};

function Mechanics() {
  const v = useInViewVariants();
  return (
    <section id="examples" className="section section-cream">
      <div className="container">
        <SectionHeader eyebrow={mechanics.eyebrow} heading={mechanics.heading} copy={mechanics.copy} />
        <motion.div
          className="mech-grid"
          variants={stagger}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          {mechanics.items.map((item) => (
            <motion.article className="mech-card" key={item.key} variants={fadeUp}>
              <div className="mech-phone">
                <PhoneFrame label={`${item.label}: ${item.title}`} className="phone-sm">
                  {MECHANIC_SCREENS[item.key]}
                </PhoneFrame>
              </div>
              <span className="mech-label">{item.label}</span>
              <h3 className="mech-title">{item.title}</h3>
              <p className="mech-copy">{item.copy}</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Problem() {
  const v = useInViewVariants();
  return (
    <section className="section section-dark section-problem">
      <div className="container">
        <SectionHeader eyebrow={problem.eyebrow} heading={problem.heading} copy={problem.copy} tone="dark" />
        <motion.div
          className="tri-grid"
          variants={stagger}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          {problem.points.map((p) => (
            <motion.div className="tri-item tri-item-dark" key={p.title} variants={fadeUp}>
              <h3>{p.title}</h3>
              <p>{p.copy}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Packs() {
  const v = useInViewVariants();
  return (
    <section id="packs" className="section section-cream section-packs">
      <div className="container packs-grid">
        <div className="packs-copy">
          <SectionHeader eyebrow={packs.eyebrow} heading={packs.heading} copy={packs.copy} align="start" />
          <p className="packs-note">{packs.note}</p>
          <ul className="packs-goals" aria-label="Pack categories">
            {packs.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
        <motion.ul
          className="packs-themes"
          variants={stagger}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          {packs.themes.map((t) => (
            <motion.li className="packs-theme" key={t.name} variants={fadeUp}>
              <span className="packs-theme-name">{t.name}</span>
              <span className="packs-theme-line">{t.line}</span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

function Comparison() {
  const v = useInViewVariants();
  const lastIndex = comparison.columns.length - 1;
  return (
    <section id="why" className="section section-dark">
      <div className="container">
        <SectionHeader eyebrow={comparison.eyebrow} heading={comparison.heading} copy={comparison.copy} tone="dark" />
        <motion.div
          className="compare-wrap"
          variants={fadeUp}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          <table className="compare-table">
            <caption className="sr-only">How myBishBash compares with other approaches to phone use</caption>
            <thead>
              <tr>
                <th scope="col" className="compare-rowhead">Approach</th>
                {comparison.columns.map((c, i) => (
                  <th scope="col" key={c} className={i === lastIndex ? "is-us" : ""}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="compare-rowhead">{row.label}</th>
                  {row.values.map((val, i) => (
                    <td key={`${row.label}-${i}`} className={i === lastIndex ? "is-us" : ""}>
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}

function Trust() {
  const v = useInViewVariants();
  return (
    <section className="section section-cream section-trust">
      <div className="container">
        <SectionHeader eyebrow={trust.eyebrow} heading={trust.heading} />
        <motion.div
          className="trust-grid"
          variants={stagger}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          {trust.items.map((t) => (
            <motion.div className="trust-item" key={t.title} variants={fadeUp}>
              <span className="trust-check" aria-hidden="true" />
              <h3>{t.title}</h3>
              <p>{t.copy}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function planHref(kind) {
  if (kind === "team") return CONTACT_HREF;
  if (kind === "plus") return EARLY_ACCESS_HREF;
  return INVITE_HREF;
}

function Pricing() {
  const v = useInViewVariants();
  return (
    <section id="pricing" className="section section-dark section-pricing">
      <div className="container">
        <SectionHeader eyebrow={pricing.eyebrow} heading={pricing.heading} copy={pricing.copy} tone="dark" />
        <motion.div
          className="price-grid"
          variants={stagger}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          {pricing.plans.map((plan) => (
            <motion.article
              className={`price-card${plan.featured ? " is-featured" : ""}`}
              key={plan.name}
              variants={fadeUp}
            >
              {plan.featured ? <span className="price-flag">Most popular</span> : null}
              <h3 className="price-name">{plan.name}</h3>
              <div className="price-amount">
                <strong>{plan.price}</strong>
                {plan.cadence ? <span>{plan.cadence}</span> : null}
              </div>
              <p className="price-tagline">{plan.tagline}</p>
              <ul className="price-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a
                className={`button ${plan.featured ? "primary" : "ghost-light"} price-cta`}
                href={planHref(plan.kind)}
              >
                {plan.cta}
                <span aria-hidden="true">→</span>
              </a>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Partnerships() {
  const v = useInViewVariants();
  return (
    <section className="section section-cream section-partner">
      <motion.div
        className="container partner-inner"
        variants={stagger}
        initial={v.initial}
        whileInView={v.whileInView}
        viewport={v.viewport}
      >
        <motion.span className="eyebrow" variants={fadeUp}>{partnerships.eyebrow}</motion.span>
        <motion.h2 className="section-title" variants={fadeUp}>{partnerships.heading}</motion.h2>
        <motion.p className="section-lede" variants={fadeUp}>{partnerships.copy}</motion.p>
        <motion.ul className="partner-audiences" variants={fadeUp}>
          {partnerships.audiences.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </motion.ul>
        <motion.a className="partner-link" href={CONTACT_HREF} variants={fadeUp}>
          {partnerships.cta}
          <span aria-hidden="true">→</span>
        </motion.a>
      </motion.div>
    </section>
  );
}

function FaqItem({ item, open, onToggle, id }) {
  return (
    <div className={`faq-item${open ? " is-open" : ""}`}>
      <h3 className="faq-q">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`faq-panel-${id}`}
          id={`faq-q-${id}`}
          onClick={onToggle}
        >
          <span>{item.q}</span>
          <span className="faq-icon" aria-hidden="true" />
        </button>
      </h3>
      <div
        className="faq-a"
        id={`faq-panel-${id}`}
        role="region"
        aria-labelledby={`faq-q-${id}`}
        hidden={!open}
      >
        <p>{item.a}</p>
      </div>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  const v = useInViewVariants();
  return (
    <section id="faq" className="section section-dark section-faq">
      <div className="container faq-layout">
        <div className="faq-head">
          <SectionHeader eyebrow={faq.eyebrow} heading={faq.heading} align="start" tone="dark" />
        </div>
        <motion.div
          className="faq-list"
          variants={stagger}
          initial={v.initial}
          whileInView={v.whileInView}
          viewport={v.viewport}
        >
          {faq.items.map((item, i) => (
            <motion.div variants={fadeUp} key={item.q}>
              <FaqItem
                item={item}
                id={i}
                open={open === i}
                onToggle={() => setOpen(open === i ? -1 : i)}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FinalCta() {
  const v = useInViewVariants();
  return (
    <section id="early-access" className="section section-final">
      <div className="final-bg" aria-hidden="true" />
      <motion.div
        className="container final-inner"
        variants={stagger}
        initial={v.initial}
        whileInView={v.whileInView}
        viewport={v.viewport}
      >
        <motion.span className="eyebrow" variants={fadeUp}>{finalCta.eyebrow}</motion.span>
        <motion.h2 className="final-title" variants={fadeUp}>{finalCta.heading}</motion.h2>
        <motion.p className="final-copy" variants={fadeUp}>{finalCta.copy}</motion.p>
        <motion.div className="final-actions" variants={fadeUp}>
          <a className="button primary" href={INVITE_HREF}>
            {finalCta.primary}
            <span aria-hidden="true">→</span>
          </a>
          <a className="button launch-list" href={EARLY_ACCESS_HREF}>
            {finalCta.secondary}
            <span aria-hidden="true">→</span>
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}

export default function LandingSections() {
  return (
    <>
      <Problem />
      <HowItWorks />
      <Mechanics />
      <Packs />
      <Comparison />
      <Trust />
      <Pricing />
      <Partnerships />
      <Faq />
      <FinalCta />
    </>
  );
}
