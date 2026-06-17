import "./download.css";
import { loadProfile, saveProfile } from "./storage";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL;
const SIGNUP_HREF = `${BASE}home?signup=1`;
const DOWNLOAD_HREF = `${BASE}download`;
const WAITLIST_HREF = `${BASE}early-access`;
const LOGO_SRC = `${BASE}icons/mybishbash-cover.png`;
const ROLLOUT_ACCESS_KEY = "mybishbash.rollout-download-access.v1";
const TEMPORARY_ROLLOUT_CODE = "WELCOME";

function hasRolloutAccess() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ROLLOUT_ACCESS_KEY) === "true";
}

function saveRolloutAccess() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROLLOUT_ACCESS_KEY, "true");
}

function updateInstallState(updates) {
  if (typeof window === "undefined") return;
  const current = loadProfile();
  saveProfile({
    ...current,
    plan: current.plan ?? "free",
    ...updates,
  });
}

function continueAfterInstall() {
  updateInstallState({
    hasCompletedHomeScreenInstall: true,
    hasSkippedHomeScreenInstallPrompt: false,
  });
}

function skipInstallForNow() {
  updateInstallState({
    hasSkippedHomeScreenInstallPrompt: true,
    hasCompletedHomeScreenInstall: false,
  });
}

function PhoneFrame({ variant }) {
  return (
    <div className={`download-phone download-phone-${variant}`} aria-hidden="true">
      <div className="download-phone-speaker" />
      {variant === "safari" ? (
        <>
          <div className="download-safari-bar">mybishbash.app</div>
          <div className="download-mini-page">
            <img src={LOGO_SRC} alt="" />
            <span />
            <span />
          </div>
          <div className="download-share-row">
            <i />
            <b />
            <i className="is-highlighted" />
            <i />
          </div>
        </>
      ) : null}
      {variant === "sheet" ? (
        <div className="download-sheet">
          <span />
          <span />
          <strong>Add to Home Screen</strong>
          <span />
        </div>
      ) : null}
      {variant === "home" ? (
        <div className="download-home-grid">
          <span />
          <span />
          <span />
          <img src={LOGO_SRC} alt="" />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}

function InstallCard({ number, title, caption, variant }) {
  return (
    <article className="download-install-card">
      <span className="download-step-badge">{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{caption}</p>
      </div>
      <PhoneFrame variant={variant} />
    </article>
  );
}

function DownloadAccessGate() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submitCode(event) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized === TEMPORARY_ROLLOUT_CODE) {
      saveRolloutAccess();
      window.location.href = DOWNLOAD_HREF;
      return;
    }
    setError("That code didn’t work. Please try again or join the waitlist.");
  }

  function tryAgain() {
    setCode("");
    setError("");
  }

  return (
    <main className="download-page" data-testid="download-access-gate">
      <section className="download-panel download-access-panel" aria-labelledby="download-access-title">
        <header className="download-hero">
          <img src={LOGO_SRC} alt="MyBishBash" />
          <p className="download-access-eyebrow">Invite only</p>
          <h1 id="download-access-title">Get MyBishBash</h1>
          <p>MyBishBash is currently invite-only. If you have an access code, enter it here. If not, join the waitlist.</p>
        </header>

        <form className="download-access-card" onSubmit={submitCode}>
          <label htmlFor="download-access-code">Access code</label>
          <input
            id="download-access-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError("");
            }}
            placeholder="Enter access code"
            autoCapitalize="characters"
            autoComplete="one-time-code"
          />
          {error ? <p className="download-access-error" role="alert">{error}</p> : null}
          <button type="submit" className="download-primary">Continue</button>
        </form>

        {error ? (
          <div className="download-access-actions">
            <button type="button" className="download-try-again" onClick={tryAgain}>Try again</button>
            <a className="download-skip-link" href={WAITLIST_HREF}>Join waitlist</a>
          </div>
        ) : (
          <a className="download-skip-link" href={WAITLIST_HREF}>Join waitlist</a>
        )}
      </section>
    </main>
  );
}

export default function DownloadPage() {
  const hasAccess = hasRolloutAccess();

  if (!hasAccess) {
    return <DownloadAccessGate />;
  }

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  const shouldOpenInSafari = isIos && !isSafari;

  return (
    <main className="download-page" data-testid="download-page">
      <section className="download-panel" aria-labelledby="download-title">
        <header className="download-hero">
          <img src={LOGO_SRC} alt="MyBishBash" />
          <h1 id="download-title">Add MyBishBash<br />to your Home Screen</h1>
          <p>To show your Personal Cards before the apps you choose, MyBishBash needs to be on your Home Screen.</p>
          {shouldOpenInSafari ? <p className="download-required-note">Open this page in Safari first.</p> : null}
        </header>

        <div className="download-install-list" aria-label="Home Screen installation steps">
          <InstallCard
            number="1"
            title="Tap Share"
            variant="safari"
            caption="Open this page in Safari and tap the Share button."
          />
          <InstallCard
            number="2"
            title="Add to Home Screen"
            variant="sheet"
            caption="Tap Add to Home Screen."
          />
          <InstallCard
            number="3"
            title="Open MyBishBash from your Home Screen"
            variant="home"
            caption="Return here from the saved Home Screen app."
          />
        </div>

        <a className="download-primary" href={SIGNUP_HREF} onClick={continueAfterInstall}>
          I’ve added it
        </a>
        <p className="download-required-note">This is required for reminders to appear before your apps.</p>
        <a className="download-skip-link" href={SIGNUP_HREF} onClick={skipInstallForNow}>
          I can’t do this right now
        </a>

        <section className="download-why-card" aria-labelledby="download-why-title">
          <h2 id="download-why-title">Why add MyBishBash to your Home Screen?</h2>
          <ul>
            <li>Personal Cards can appear before the apps you choose</li>
            <li>It feels like a real app, not another browser tab</li>
            <li>It is faster to open when you need it</li>
            <li>You can still set this up later from Home</li>
          </ul>
        </section>

        <p className="download-footer-note">If you can’t add it now, you can still create your account and finish setup later.</p>
      </section>
    </main>
  );
}
