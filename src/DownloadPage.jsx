import "./download.css";
import { downloadContent } from "./content/downloadContent";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
import { loadProfile, saveProfile } from "./storage";
import { getSignupHandoffReference, validateAndRememberGateAccessCode } from "./lib/mybishbashSync";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL;
const SIGNUP_HREF = `${BASE}home?signup=1`;
const DOWNLOAD_HREF = `${BASE}download`;
const WAITLIST_HREF = `${BASE}early-access`;
const LOGO_SRC = `${BASE}icons/mybishbash-cover.png`;

function hasRolloutAccess() {
  if (typeof window === "undefined") return false;
  return Boolean(getSignupHandoffReference());
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

function readInstallSuccessState() {
  if (typeof window === "undefined") return false;
  const current = loadProfile();
  return current.hasCompletedHomeScreenInstall === true && current.hasSkippedHomeScreenInstallPrompt !== true;
}

function PhoneFrame({ variant }) {
  const { content } = useContentEdit();
  const phoneVisual = content.install.phoneVisual;

  return (
    <div className={`download-phone download-phone-${variant}`} aria-hidden="true">
      <div className="download-phone-speaker" />
      {variant === "safari" ? (
        <>
          <div className="download-safari-bar">{phoneVisual.domain}</div>
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
          <strong>{phoneVisual.addToHomeScreen}</strong>
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

function PhoneInstallSection({ titlePath, introPath, stepsPath, variant }) {
  const { content } = useContentEdit();
  const steps = stepsPath.split(".").reduce((current, key) => current?.[key], content) ?? [];

  return (
    <details className="download-install-section" open>
      <summary>
        <EditableText path={titlePath} />
      </summary>
      <div className="download-install-section-body">
        <div className="download-install-copy">
          <EditableText as="p" path={introPath} />
          <ol>
            {steps.map((step, index) => (
              <EditableText as="li" path={`${stepsPath}.${index}`} key={index}>
                {step}
              </EditableText>
            ))}
          </ol>
        </div>
        <PhoneFrame variant={variant} />
      </div>
    </details>
  );
}

function DownloadAccessGate() {
  const { content } = useContentEdit();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function submitCode(event) {
    event.preventDefault();
    setIsChecking(true);
    setError("");
    const isValid = await validateAndRememberGateAccessCode(code);
    setIsChecking(false);
    if (isValid) {
      window.location.href = DOWNLOAD_HREF;
      return;
    }
    setError(content.access.error);
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
          <EditableText as="p" className="download-access-eyebrow" path="access.eyebrow" />
          <h1 id="download-access-title"><EditableText path="access.title" /></h1>
          <EditableText as="p" path="access.body" />
        </header>

        <form className="download-access-card" onSubmit={submitCode}>
          <label htmlFor="download-access-code"><EditableText path="access.codeLabel" /></label>
          <input
            id="download-access-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError("");
            }}
            placeholder={content.access.codePlaceholder}
            autoCapitalize="characters"
            autoComplete="one-time-code"
          />
          {error ? <p className="download-access-error" role="alert">{error}</p> : null}
          <button type="submit" className="download-primary" disabled={isChecking}>
            {isChecking ? content.access.checking : <EditableText path="access.continue" />}
          </button>
        </form>

        {error ? (
          <div className="download-access-actions">
            <button type="button" className="download-try-again" onClick={tryAgain}>
              <EditableText path="access.tryAgain" />
            </button>
            <a className="download-skip-link" href={WAITLIST_HREF}><EditableText path="access.waitlist" /></a>
          </div>
        ) : (
          <a className="download-skip-link" href={WAITLIST_HREF}><EditableText path="access.waitlist" /></a>
        )}
      </section>
    </main>
  );
}

function DownloadPageContent() {
  const { content } = useContentEdit();
  const hasAccess = hasRolloutAccess();
  const [showInstallSuccess, setShowInstallSuccess] = useState(readInstallSuccessState);

  if (!hasAccess) {
    return <DownloadAccessGate />;
  }

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  const shouldOpenInSafari = isIos && !isSafari;

  function confirmInstall() {
    continueAfterInstall();
    setShowInstallSuccess(true);
  }

  if (showInstallSuccess) {
    return (
      <main className="download-page" data-testid="download-success-page">
        <section className="download-panel download-success-panel" aria-labelledby="download-success-title">
          <div className="download-success-icon" aria-hidden="true" />
          <header className="download-hero">
            <h1 id="download-success-title"><EditableText path="install.success.title" /></h1>
            {content.install.success.body.map((item, index) => (
              <EditableText as="p" path={`install.success.body.${index}`} key={index}>
                {item}
              </EditableText>
            ))}
          </header>

          <a className="download-primary" href={SIGNUP_HREF}>
            <EditableText path="install.success.primary" />
          </a>

          <section className="download-browser-fallback" aria-labelledby="download-browser-fallback-title">
            <h2 id="download-browser-fallback-title"><EditableText path="install.success.fallbackTitle" /></h2>
            <EditableText as="p" path="install.success.fallbackBody" />
            <a className="download-secondary" href={SIGNUP_HREF} onClick={skipInstallForNow}>
              <EditableText path="install.success.fallbackCta" />
            </a>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="download-page" data-testid="download-page">
      <section className="download-panel" aria-labelledby="download-title">
        <header className="download-hero">
          <img src={LOGO_SRC} alt="MyBishBash" />
          <EditableText as="p" className="download-access-eyebrow" path="install.eyebrow" />
          <h1 id="download-title"><EditableText path="install.title" /></h1>
          {content.install.body.map((item, index) => (
            <EditableText as="p" path={`install.body.${index}`} key={index}>
              {item}
            </EditableText>
          ))}
          {shouldOpenInSafari ? <EditableText as="p" className="download-required-note" path="install.safariNote" /> : null}
        </header>

        <div className="download-install-list" aria-label={content.install.stepsLabel}>
          <PhoneInstallSection
            titlePath="install.iphone.title"
            introPath="install.iphone.intro"
            variant="safari"
            stepsPath="install.iphone.steps"
          />
          <PhoneInstallSection
            titlePath="install.android.title"
            introPath="install.android.intro"
            variant="home"
            stepsPath="install.android.steps"
          />
        </div>

        <button type="button" className="download-primary" onClick={confirmInstall}>
          <EditableText path="install.primary" />
        </button>

        <section className="download-why-card" aria-labelledby="download-why-title">
          <h2 id="download-why-title"><EditableText path="install.why.title" /></h2>
          <ul>
            {content.install.why.bullets.map((item, index) => (
              <EditableText as="li" path={`install.why.bullets.${index}`} key={index}>
                {item}
              </EditableText>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

export default function DownloadPage() {
  return (
    <ContentEditProvider
      initialContent={downloadContent}
      storageKey="mybishbash.downloadContentDraft.v2"
      saveEndpoint="/__save-download-content"
      saveLabel="src/content/downloadContent.js"
      isContentCompatible={(value) => Boolean(value?.access?.title && value?.install?.title && value?.install?.success?.title)}
    >
      <DownloadPageContent />
      <EditPanel />
    </ContentEditProvider>
  );
}
