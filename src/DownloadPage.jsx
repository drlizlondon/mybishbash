import "./download.css";
import { downloadContent } from "./content/downloadContent";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
import { loadProfile, saveProfile } from "./storage";
import { getSession, getSignupHandoffPayload, getSignupHandoffReference, validateAndRememberGateAccessCode } from "./lib/mybishbashSync";
import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL;
const SIGNUP_HREF = `${BASE}home?signup=1`;
const DOWNLOAD_HREF = `${BASE}download`;
const APPS_HREF = `${BASE}apps`;
const WAITLIST_HREF = `${BASE}early-access`;
const LOGO_SRC = `${BASE}icons/mybishbash-cover.png`;

function buildSignupStartUrl(handoff) {
  if (typeof window === "undefined" || !handoff?.handoffRef) return `${BASE}home?signup=1`;
  const startUrl = new URL(`${BASE}home`, window.location.origin);
  startUrl.searchParams.set("signup", "1");
  startUrl.searchParams.set("handoff", handoff.handoffRef);
  startUrl.searchParams.set("handoffExpires", handoff.expiresAt);
  return startUrl.href;
}

function useSignupInstallManifest(hasAccess, isLoggedIn) {
  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined" || !hasAccess || isLoggedIn) return undefined;
    const handoff = getSignupHandoffPayload();
    if (!handoff) return undefined;

    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return undefined;

    const previousHref = manifestLink.getAttribute("href");
    const manifest = {
      name: "MyBishBash",
      short_name: "MyBishBash",
      id: "https://drlizlondon.github.io/mybishbash/",
      description: "Private little reminders from yourself.",
      start_url: buildSignupStartUrl(handoff),
      scope: `${window.location.origin}${BASE}`,
      display: "standalone",
      background_color: "#F7F2EE",
      theme_color: "#F7F2EE",
      orientation: "portrait",
      icons: [
        { src: `${BASE}icons/mybishbash-cover.png`, sizes: "1254x1254", type: "image/png" },
        { src: `${BASE}icons/mybishbash-cover.png`, sizes: "1254x1254", type: "image/png", purpose: "any maskable" },
      ],
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    manifestLink.setAttribute("href", manifestUrl);
    manifestLink.setAttribute("data-signup-start-url", manifest.start_url);

    return () => {
      if (previousHref) {
        manifestLink.setAttribute("href", previousHref);
      } else {
        manifestLink.removeAttribute("href");
      }
      manifestLink.removeAttribute("data-signup-start-url");
      URL.revokeObjectURL(manifestUrl);
    };
  }, [hasAccess, isLoggedIn]);
}

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
  const visualLabel = variant === "safari" ? phoneVisual.iphoneAria : phoneVisual.androidAria;

  return (
    <div className={`download-phone download-phone-${variant}`} role="img" aria-label={visualLabel}>
      <div className="download-phone-speaker" />
      {variant === "safari" ? (
        <>
          <div className="download-safari-bar">{phoneVisual.domain}</div>
          <div className="download-visual-stack">
            <div className="download-route-row download-route-primary">
              <span>{phoneVisual.share}</span>
            </div>
            <div className="download-route-row download-route-fallback">
              <span>{phoneVisual.fallback}</span>
            </div>
            <div className="download-route-arrow" aria-hidden="true" />
            <strong>{phoneVisual.addToHomeScreen}</strong>
            <small>{phoneVisual.toolbarHint}</small>
          </div>
          <div className="download-safari-toolbar" aria-hidden="true">
            <i />
            <i className="is-share" />
            <i />
            <i className="is-dots" />
          </div>
        </>
      ) : null}
      {variant === "android" ? (
        <div className="download-android-visual">
          <div className="download-android-topbar">
            <span>Chrome</span>
            <i aria-hidden="true" />
          </div>
          <div className="download-android-menu">
            <span>{phoneVisual.addToHomeScreen}</span>
            <span>Install app</span>
          </div>
          <div className="download-android-action">Add</div>
        </div>
      ) : null}
    </div>
  );
}

function PhoneInstallSection({ titlePath, introPath, stepsPath, variant }) {
  const { content } = useContentEdit();
  const steps = stepsPath.split(".").reduce((current, key) => current?.[key], content) ?? [];
  const helperNotesPath = stepsPath.replace(".steps", ".helperNotes");
  const helperNotes = helperNotesPath.split(".").reduce((current, key) => current?.[key], content) ?? [];
  const finalLinePath = stepsPath.replace(".steps", ".finalLine");
  const finalLine = finalLinePath.split(".").reduce((current, key) => current?.[key], content);

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
          {helperNotes.length ? (
            <div className="download-helper-notes">
              {helperNotes.map((note, index) => (
                <EditableText as="p" path={`${helperNotesPath}.${index}`} key={index}>
                  {note}
                </EditableText>
              ))}
            </div>
          ) : null}
          {finalLine ? (
            <EditableText as="p" className="download-final-line" path={finalLinePath}>
              {finalLine}
            </EditableText>
          ) : null}
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showInstallSuccess, setShowInstallSuccess] = useState(readInstallSuccessState);
  const hasAccess = hasRolloutAccess() || isLoggedIn;
  const loggedInInstall = isLoggedIn && content.install.loggedIn;
  useSignupInstallManifest(authChecked && hasAccess, isLoggedIn);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (!cancelled) setIsLoggedIn(Boolean(session?.user?.id));
      })
      .catch(() => {
        if (!cancelled) setIsLoggedIn(false);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authChecked) {
    return (
      <main className="download-page" data-testid="download-loading" aria-label="Loading">
        <section className="download-panel" />
      </main>
    );
  }

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
            <h1 id="download-success-title">
              <EditableText path={loggedInInstall ? "install.loggedIn.successTitle" : "install.success.title"} />
            </h1>
            {(loggedInInstall ? content.install.loggedIn.successBody : content.install.success.body).map((item, index) => (
              <EditableText as="p" path={loggedInInstall ? `install.loggedIn.successBody.${index}` : `install.success.body.${index}`} key={index}>
                {item}
              </EditableText>
            ))}
          </header>

          <section className="download-browser-fallback" aria-labelledby={loggedInInstall ? undefined : "download-browser-fallback-title"}>
            {loggedInInstall ? (
              <>
                <a className="download-primary" href={APPS_HREF}>
                  <EditableText path="install.loggedIn.primary" />
                </a>
                <a className="download-secondary" href={APPS_HREF} onClick={skipInstallForNow}>
                  <EditableText path="install.loggedIn.secondary" />
                </a>
              </>
            ) : (
              <>
                <h2 id="download-browser-fallback-title"><EditableText path="install.success.fallbackTitle" /></h2>
                <EditableText as="p" path="install.success.fallbackBody" />
                <a className="download-secondary" href={SIGNUP_HREF} onClick={skipInstallForNow}>
                  <EditableText path="install.success.fallbackCta" />
                </a>
              </>
            )}
          </section>
        </section>
      </main>
    );
  }

  const installContent = loggedInInstall ? content.install.loggedIn : content.install;

  return (
    <main className="download-page" data-testid="download-page">
      <section className="download-panel" aria-labelledby="download-title">
        <header className="download-hero">
          <img src={LOGO_SRC} alt="MyBishBash" />
          <EditableText as="p" className="download-access-eyebrow" path={loggedInInstall ? "install.loggedIn.eyebrow" : "install.eyebrow"} />
          <h1 id="download-title">
            <EditableText path={loggedInInstall ? "install.loggedIn.title" : "install.title"} />
          </h1>
          {installContent.body.map((item, index) => (
            <EditableText as="p" path={loggedInInstall ? `install.loggedIn.body.${index}` : `install.body.${index}`} key={index}>
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
            variant="android"
            stepsPath="install.android.steps"
          />
        </div>

        {loggedInInstall ? (
          <div className="download-browser-fallback">
            <a className="download-primary" href={APPS_HREF} onClick={continueAfterInstall}>
              <EditableText path="install.loggedIn.primary" />
            </a>
            <a className="download-secondary" href={APPS_HREF} onClick={skipInstallForNow}>
              <EditableText path="install.loggedIn.secondary" />
            </a>
          </div>
        ) : (
          <button type="button" className="download-primary" onClick={confirmInstall}>
            <EditableText path="install.primary" />
          </button>
        )}

        <section className="download-why-card" aria-labelledby="download-why-title">
          <h2 id="download-why-title"><EditableText path="install.why.title" /></h2>
          <ul>
            {(loggedInInstall ? content.install.loggedIn.whyBullets : content.install.why.bullets).map((item, index) => (
              <EditableText as="li" path={loggedInInstall ? `install.loggedIn.whyBullets.${index}` : `install.why.bullets.${index}`} key={index}>
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
      isContentCompatible={(value) => Boolean(value?.access?.title && value?.install?.title && value?.install?.success?.title && value?.install?.loggedIn?.title)}
    >
      <DownloadPageContent />
      <EditPanel />
    </ContentEditProvider>
  );
}
