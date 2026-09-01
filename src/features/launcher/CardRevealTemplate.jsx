import React, { useEffect, useRef, useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import AppPauseModal from "../../components/AppPauseModal";
import FakeAppLauncherBar from "../../lib/FakeLauncherBar";
import { SparkGlyph } from "../../app/shell/glyphs";
import { BASE_PATH } from "../../app/router/routes";

export default function CardRevealTemplate({
  greeting,
  icon = "heart",
  message,
  subtitle,
  launchers = [],
  actions = [],
  variant = "personal",
  onLauncherLaunch,
  showDashboardShortcut = true,
  dashboardHref,
  onDashboard,
  onManageApp,
  onCreateCard,
  children,
  className = "",
  cardOverlayKey = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
}) {
  const hasLaunchers = launchers?.length > 0;
  const hasActions = actions?.length > 0;
  const hasCtaContent = hasLaunchers || hasActions;
  const [showPauseModal, setShowPauseModal] = useState(false);
  useEffect(() => {
    setShowPauseModal(false);
  }, [cardOverlayKey]);
  const pauseButtonRef = useRef(null);
  const shouldManageLauncherApp = Boolean(launcherAppId && onManageApp);
  const dashboardLabel = shouldManageLauncherApp ? "Open app settings" : "Open dashboard";
  const dashboardTitle = shouldManageLauncherApp ? "App settings" : "Dashboard";
  const handleDashboardShortcut = (event) => {
    if (shouldManageLauncherApp) {
      event?.preventDefault?.();
      onManageApp(launcherAppId);
      return;
    }
    onDashboard?.(event);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__MYBISHBASH_CARD_OVERLAY_MOUNTS = [
      ...(window.__MYBISHBASH_CARD_OVERLAY_MOUNTS ?? []),
      {
        variant,
        cardOverlayKey,
        at: new Date().toISOString(),
        route: window.location.pathname + window.location.search,
      },
    ];
    // Dev-only: measure boot → first card render so slow-load regressions are
    // visible in the console / performance timeline.
    if (import.meta.env.DEV && typeof performance !== "undefined" && !window.__MYBISHBASH_CARD_FIRST_MOUNT_LOGGED) {
      window.__MYBISHBASH_CARD_FIRST_MOUNT_LOGGED = true;
      try {
        performance.mark("mbb:card-overlay-first-mount");
        if (performance.getEntriesByName("mbb:boot").length) {
          const measure = performance.measure("mbb:boot→card", "mbb:boot", "mbb:card-overlay-first-mount");
          console.info(`[perf] boot → first card overlay: ${Math.round(measure.duration)}ms (variant=${variant})`);
        }
      } catch {
        /* performance API unavailable */
      }
    }
  }, [cardOverlayKey, variant]);

  return (
    <div className={`premium-card-screen premium-card-${variant} ${className}`.trim()} data-testid={`card-overlay-${variant}`}>
      {showDashboardShortcut ? (
        <PremiumDashboardShortcut
          href={shouldManageLauncherApp ? undefined : dashboardHref}
          onClick={handleDashboardShortcut}
          label={dashboardLabel}
          title={dashboardTitle}
        />
      ) : null}
      {onCreateCard ? <PremiumCreateShortcut onClick={onCreateCard} /> : null}
      {launcherAppId && onPauseApp ? (
        <PremiumPauseShortcut
          ref={pauseButtonRef}
          onClick={() => setShowPauseModal(true)}
        />
      ) : null}
      {showPauseModal && launcherAppId && onPauseApp ? (
        <AppPauseModal
          appName={launcherAppName ?? launcherAppId}
          triggerRef={pauseButtonRef}
          onClose={() => setShowPauseModal(false)}
          onPause={(mins) => {
            setShowPauseModal(false);
            onPauseApp(mins);
          }}
        />
      ) : null}
      <main className="premium-card-main" aria-live="polite">
        <section className="premium-card-header">
          {greeting ? <p className="premium-greeting">{greeting}</p> : null}
          <PremiumCardIcon icon={icon} />
        </section>
        <section className="premium-card-message-section">
          {message ? <CardRevealMessage message={message} /> : null}
          <span className="premium-divider" aria-hidden="true" />
          {subtitle ? <p className="premium-subtitle">{subtitle}</p> : null}
          {children}
        </section>
        <section className={`premium-card-cta ${hasLaunchers ? "has-launchers" : "no-launchers"} ${hasCtaContent ? "" : "is-empty"}`.trim()}>
            {hasLaunchers ? (
              <div className="premium-card-launchers">
                <FakeAppLauncherBar
                  versions={launchers}
                  onLaunch={onLauncherLaunch}
                  raised={false}
                />
              </div>
            ) : null}
            <PremiumActionStack actions={actions} />
        </section>
      </main>
    </div>
  );
}

function getMessageBaseSize(value) {
  const text = String(value ?? "").trim();
  const characterCount = text.length;
  const manualLines = text ? text.split(/\r\n|\r|\n/).length : 1;
  const estimatedLines = Math.max(manualLines, Math.ceil(characterCount / 20));

  // Cap the base size by quote length so longer quotes scale down and fit the
  // bounded quote area on small iPhones. The CSS clamp() then scales further by
  // viewport width: clamp(18px, 10.8vw, var(--message-font-size)).
  if (estimatedLines <= 1 && characterCount <= 14) return 52;
  if (estimatedLines <= 2 && characterCount <= 24) return 44;
  if (estimatedLines <= 3 && characterCount <= 48) return 38;
  if (characterCount <= 90) return 34;
  if (characterCount <= 140) return 30;
  return 26;
}

export function CardRevealMessage({ message, className = "" }) {
  const baseSize = getMessageBaseSize(message);
  const commitmentMatch = String(message ?? "").match(/^I will\r?\n([\s\S]+)$/);

  return (
    <div className={`premium-title-box ${className}`.trim()}>
      <h2
        className={`premium-headline ${commitmentMatch ? "commitment-headline" : ""}`.trim()}
        style={{ "--message-font-size": `${baseSize}px` }}
      >
        {commitmentMatch ? (
          <>
            <span className="commitment-headline-prefix">I will</span>
            <span className="commitment-headline-text">{commitmentMatch[1]}</span>
          </>
        ) : message}
      </h2>
    </div>
  );
}

export function PremiumCardIcon({ icon }) {
  if (!icon || icon === "none") return null;

  if (typeof icon !== "string") {
    return <span className="premium-card-icon premium-card-icon-custom" aria-hidden="true">{icon}</span>;
  }

  return (
    <span className={`premium-card-icon premium-card-icon-${icon}`} aria-hidden="true">
      {icon === "spark" ? <SparkGlyph /> : <BrandMark />}
    </span>
  );
}

export function PremiumDashboardShortcut({ href, onClick, label = "Open dashboard", title = "Dashboard" }) {
  const content = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.75" y="4.75" width="5.75" height="5.75" rx="1.25" />
        <rect x="13.5" y="4.75" width="5.75" height="5.75" rx="1.25" />
        <rect x="4.75" y="13.5" width="5.75" height="5.75" rx="1.25" />
        <rect x="13.5" y="13.5" width="5.75" height="5.75" rx="1.25" />
      </svg>
      <span className="sr-only">{label}</span>
    </>
  );

  const dashboardHref = href ?? `${BASE_PATH}/home`;

  if (href || !onClick) {
    return (
      <a className="premium-dashboard-shortcut" href={dashboardHref} onClick={(event) => onClick?.(event)} aria-label={label} title={title} data-testid="dashboard-shortcut">
        {content}
      </a>
    );
  }

  return (
    <button type="button" className="premium-dashboard-shortcut" onClick={(event) => onClick?.(event)} aria-label={label} title={title} data-testid="dashboard-shortcut">
      {content}
    </button>
  );
}

export function PremiumCreateShortcut({ onClick }) {
  return (
    <button
      type="button"
      className="premium-dashboard-shortcut premium-create-shortcut"
      onClick={(event) => onClick?.(event)}
      aria-label="Create a myBishBash"
      title="Create"
      data-testid="overlay-create-card-button"
    >
      <span aria-hidden="true">+</span>
      <span className="sr-only">Create a myBishBash</span>
    </button>
  );
}

// ─── PremiumPauseShortcut ────────────────────────────────────────────────────
// White circular button with a two-bar pause icon.
// Appears only during fake-launcher / protected-app flows (when launcherAppId is set).
// Positioned below the dashboard (grid) shortcut on the top-right.

export const PremiumPauseShortcut = React.forwardRef(function PremiumPauseShortcut({ onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className="premium-dashboard-shortcut premium-pause-shortcut"
      onClick={onClick}
      aria-label="Pause myBishBash for this app"
      title="Pause myBishBash"
      data-testid="pause-app-button"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <rect x="6" y="5" width="4" height="14" rx="1.5" />
        <rect x="14" y="5" width="4" height="14" rx="1.5" />
      </svg>
    </button>
  );
});

export function PremiumActionStack({ actions = [] }) {
  if (!actions.length) return null;

  return (
    <div className="premium-action-stack">
      {actions.map((action) => (
        <PremiumActionButton
            key={action.key || action.testId || action.label}
          label={action.label}
          variant={action.variant}
          onClick={action.onClick}
          href={action.href}
            testId={action.testId}
        />
      ))}
    </div>
  );
}

export function PremiumActionButton({ label, variant = "secondary", onClick, href, testId }) {
  const className = `premium-action-button premium-action-button-${variant === "primary" ? "primary" : "secondary"}`;
  const derivedTestId = `card-action-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  const resolvedTestId = testId || derivedTestId;

  if (href) {
    return (
      <a className={className} href={href} data-testid={resolvedTestId} onClick={(event) => onClick?.(event)}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" className={className} data-testid={resolvedTestId} onClick={(event) => onClick?.(event)}>
      {label}
    </button>
  );
}

export function PremiumCardScreen({
  type = "personal",
  greeting,
  icon = "heart",
  headline,
  subtitle,
  actions = [],
  launcherVersions = [],
  onLauncherLaunch,
  showDashboardShortcut = true,
  dashboardHref,
  onDashboard,
  onCreateCard,
  children,
  className = "",
  cardOverlayKey = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
}) {
  return (
    <CardRevealTemplate
      cardOverlayKey={cardOverlayKey}
      variant={type}
      greeting={greeting}
      icon={icon}
      message={headline}
      subtitle={subtitle}
      launchers={launcherVersions}
      actions={actions}
      onLauncherLaunch={onLauncherLaunch}
      showDashboardShortcut={showDashboardShortcut}
      dashboardHref={dashboardHref}
      onDashboard={onDashboard}
      onManageApp={onManageApp}
      onCreateCard={onCreateCard}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
    >
      {children}
    </CardRevealTemplate>
  );
}

