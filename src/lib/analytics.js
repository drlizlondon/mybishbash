// GA4 conversion events — consent-gated, no personal data.
//
// Founder ruling 2026-09-26: "converted" for myBishBash means (1) joining the
// waitlist or (2) creating an account. Each is sent as a GA4 recommended
// event so it can be marked a key event in GA4.
//
// This mirrors the consent choice written by public/mbb-consent.js (the
// banner script, which is outside the React bundle and runs before it).
// Reading the stored choice directly here — rather than assuming
// `window.gtag` only ever exists post-consent — keeps this helper correct
// even if it runs before that script, or in an environment (tests, non-
// production hosts) where the banner script never installs `gtag` at all.
//
// gtag itself must stay the canonical `function gtag(){dataLayer.push(arguments)}`
// form. An arrow function `(...args) => dataLayer.push(args)` pushes an
// array instead of an arguments-like list and gtag.js silently ignores it —
// that bug zeroed GreatInternet's analytics. This module never redefines
// gtag; it only calls whatever public/mbb-consent.js already installed.
//
// Belt-and-braces host guard (added 2026-09-26 per MC evidence): Mission
// Control found ~2,974 sessions hitting the real GA4 property from
// 127.0.0.1 between 07-29 and 09-02 — traced to an old unconditional
// `<script src=".../gtag/js?id=...">` in index.html (commit 0a97d74,
// removed by feba94e on 09-02 when GA4 became consent-gated). The
// consent-gate script's own PRODUCTION_HOSTS check already stops that
// regressing, but this module fires GA4 *events*, not just the base tag, so
// it repeats the same allowlist here rather than trusting that `window.gtag`
// only ever exists on production — a stray stub (manual testing, a future
// e2e mock, a dev tool) must never turn into a real hit. Keep this list in
// sync with PRODUCTION_HOSTS in public/mbb-consent.js; the two can't share
// code because that file is a plain static script, never bundled with src/.
const ANALYTICS_HOSTS = ["mybishbash.app", "www.mybishbash.app"];
const CONSENT_KEY = "mbb_analytics_consent_v1";

function isAnalyticsHost() {
  if (typeof window === "undefined" || !window.location) return false;
  return ANALYTICS_HOSTS.indexOf(window.location.hostname) !== -1;
}

// import.meta.env.PROD is a Vite build-time flag: false for `vite dev` and
// for the vitest run this file's own tests execute under, true only for a
// production (`vite build`) bundle. Read lazily (not hoisted to a
// module-level constant) so tests can flip it with `import.meta.env.PROD =
// true` to exercise the "fires" path. This is the second half of "test/CI/
// dev builds never send GA4 events" — the host check alone would still let
// a production-mode build served locally under a spoofed Host header slip
// through, and this alone would still let a prod build's CI smoke test
// (real PROD=true) leak if it happened to run against mybishbash.app.
function isProdBuild() {
  return Boolean(import.meta.env && import.meta.env.PROD);
}

function hasAnalyticsConsent() {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (!stored) return false;
    const choice = JSON.parse(stored);
    return Boolean(choice && choice.value === "granted");
  } catch {
    return false;
  }
}

function trackEvent(name, params = {}) {
  if (!isProdBuild()) return;
  if (!isAnalyticsHost()) return;
  if (!hasAnalyticsConsent()) return;
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

// Fired once the waitlist server call confirms the visitor was actually
// added (never on click, never on a duplicate/invalid response).
export function trackWaitlistJoined() {
  trackEvent("generate_lead", { method: "waitlist" });
}

// Fired once account creation is confirmed (never on sign-in of an existing
// user — callers must only invoke this from the signup success path).
export function trackAccountCreated(method = "email") {
  trackEvent("sign_up", { method });
}

export const __testing__ = {
  hasAnalyticsConsent,
  isAnalyticsHost,
  isProdBuild,
  trackEvent,
  CONSENT_KEY,
  ANALYTICS_HOSTS,
};
