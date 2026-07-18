import { useEffect, useRef, useState } from "react";
import AppPauseModal from "../../components/AppPauseModal";
import { PremiumActionStack, PremiumDashboardShortcut, PremiumPauseShortcut } from "./CardRevealTemplate";

export default function ContinueToAppCard({ appName, appIcon, href, onContinue, onBack, onDashboard, onManageApp = null, launcherAppId = null, launcherAppName = null, onPauseApp = null, className = "" }) {
  const actions = [
    { label: `Continue to ${appName}`, variant: "primary", href, onClick: onContinue },
    ...(onBack ? [{ label: "Back to myBishBash", variant: "secondary", onClick: onBack }] : []),
  ];
  const [showPauseModal, setShowPauseModal] = useState(false);
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
    window.__MYBISHBASH_CONTINUE_CARD_MOUNTS = [
      ...(window.__MYBISHBASH_CONTINUE_CARD_MOUNTS ?? []),
      {
        appName,
        href,
        at: new Date().toISOString(),
        route: window.location.pathname + window.location.search,
      },
    ];
  }, [appName, href]);

  return (
    <div className={`premium-card-screen premium-card-personal ${className}`.trim()} data-testid="continue-to-app-card">
      <PremiumDashboardShortcut onClick={handleDashboardShortcut} label={dashboardLabel} title={dashboardTitle} />
      {launcherAppId && onPauseApp ? (
        <PremiumPauseShortcut
          ref={pauseButtonRef}
          onClick={() => setShowPauseModal(true)}
        />
      ) : null}
      {showPauseModal && launcherAppId && onPauseApp ? (
        <AppPauseModal
          appName={launcherAppName ?? appName}
          triggerRef={pauseButtonRef}
          onClose={() => setShowPauseModal(false)}
          onPause={(mins) => {
            setShowPauseModal(false);
            onPauseApp(mins);
          }}
        />
      ) : null}
      <main className="premium-card-main" aria-live="polite">
        <section className="premium-card-header" />
        <section className="premium-card-message-section" style={{ alignItems: 'center', textAlign: 'center' }}>
          {appIcon ? (
            <img src={appIcon} alt={`${appName} icon`} style={{ width: 72, height: 72, borderRadius: 16, marginBottom: 32, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }} />
          ) : null}
          <h2 style={{ fontSize: '26px', fontWeight: 400, fontFamily: 'var(--font-serif, Georgia, serif)', color: 'var(--charcoal)', textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
            Continue to {appName}?
          </h2>
        </section>
        <section className="premium-card-cta no-launchers">
          <PremiumActionStack actions={actions} />
        </section>
      </main>
    </div>
  );
}

