import { useEffect, useMemo, useState } from "react";
import { canAddUnder } from "../../lib/accessCapabilities";
import { getLauncherConfig } from "../../lib/launcherRegistry";
import { isStandaloneDisplayMode, getLauncherSetupUrl } from "../../lib/launcherSetupUrl";
import { formatPauseRemaining } from "../../lib/pauseFormat";
import { DEFAULT_HOME_SCREEN_VERSIONS } from "../../storage";
import EnabledAppRow from "./EnabledAppRow";
import MoreAppsOptions from "./MoreAppsOptions";
import LauncherSetupInterstitial from "./LauncherSetupInterstitial";
import AppManagementScreen from "./AppManagementScreen";
import { AppsAccessScreen, AppSwitchAccessScreen, AppsCodeScreen } from "../access";

export default function AppsPanel({
  ...props
}) {
  return <AppsPanelClock {...props} />;
}

function AppsPanelClock({
  protectedAppStatuses,
  pendingOnboardingShortcuts = [],
  onboardingSelectedAppSetup = null,
  onSaveVersionBehavior,
  onUpdateHomeScreenIcon,
  onOpenDestinationApp,
  onProtectedLaunch,
  onManageApp,
  onBackToApps,
  onOpenPremiumOptions,
  onSwitchActiveApp,
  onPauseApp,
  onClearAppPause,
  onLogLauncherEvent,
  onClaimAccessCode,
  onOpenInstallGuide,
  onOpenLauncherSetup,
  homeScreenVersions = {},
  selectedVersionId = null,
  appPauseRevision = 0,
  isTester = false,
  isShellContext = false,
  canUseMultipleApps = false,
  maxConnectedApps = 1,
  onOpenMyBishBash,
}) {
  const [showAccessScreen, setShowAccessScreen] = useState(false);
  const [showCodeScreen, setShowCodeScreen] = useState(false);
  const [switchTargetStatus, setSwitchTargetStatus] = useState(null);
  const [setupInterstitialVersion, setSetupInterstitialVersion] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
  }, [appPauseRevision]);

  const liveProtectedAppStatuses = useMemo(
    () => protectedAppStatuses.map((status) => {
      const pauseExpiryTime = status.pauseExpiry ? new Date(status.pauseExpiry).getTime() : 0;
      const paused = pauseExpiryTime > nowMs;
      return {
        ...status,
        paused,
        pauseRemaining: paused ? formatPauseRemaining(status.pauseExpiry, nowMs) : "",
      };
    }),
    [protectedAppStatuses, nowMs],
  );

  const selectedStatus = selectedVersionId
    ? liveProtectedAppStatuses.find((status) => status.version.id === selectedVersionId) ?? null
    : null;
  const enabledStatuses = liveProtectedAppStatuses.filter((status) => status.protectedOn);
  const pendingSetupStatuses = liveProtectedAppStatuses.filter((status) => status.pendingSetup && !status.protectedOn);
  // Entitlement-driven cap: free tier allows maxConnectedApps (e.g. 2), paid is
  // unlimited (null → canAddUnder always true).
  const canAddAnotherApp = canAddUnder(enabledStatuses.length, maxConnectedApps);
  const activeAppForSwitch = enabledStatuses[0] ?? null;

  function openLauncherSetup(version) {
    if (!version?.id) return;
    if (isStandaloneDisplayMode()) {
      setSetupInterstitialVersion(version);
      return;
    }
    onOpenLauncherSetup?.(version.id);
  }

  const setupInterstitial = setupInterstitialVersion ? (
    <LauncherSetupInterstitial
      version={setupInterstitialVersion}
      onClose={() => setSetupInterstitialVersion(null)}
    />
  ) : null;

  if (showCodeScreen) {
    return (
      <section className="panel-section" data-testid="apps-panel">
        <AppsCodeScreen
          onClaimAccessCode={onClaimAccessCode}
          onBack={() => setShowCodeScreen(false)}
          onContinue={() => {
            setShowCodeScreen(false);
            setShowAccessScreen(false);
            onBackToApps?.();
          }}
          onOpenInstallGuide={onOpenInstallGuide}
        />
      </section>
    );
  }

  if (switchTargetStatus) {
    return (
      <section className="panel-section" data-testid="apps-panel">
        <AppSwitchAccessScreen
          activeStatus={activeAppForSwitch}
          targetStatus={switchTargetStatus}
          onSwitch={() => {
            onSwitchActiveApp?.(switchTargetStatus.version.id);
            setSwitchTargetStatus(null);
            onManageApp?.(switchTargetStatus.version.id);
          }}
          onUpgrade={onOpenPremiumOptions}
          onBack={() => setSwitchTargetStatus(null)}
        />
      </section>
    );
  }

  if (selectedStatus) {
    if (!selectedStatus.protectedOn && !canAddAnotherApp) {
      return (
        <section className="panel-section" data-testid="apps-panel">
          <AppSwitchAccessScreen
            activeStatus={activeAppForSwitch}
            targetStatus={selectedStatus}
            onSwitch={() => {
              onSwitchActiveApp?.(selectedStatus.version.id);
            }}
            onUpgrade={onOpenPremiumOptions}
            onBack={onBackToApps}
          />
        </section>
      );
    }
    return (
      <section className="panel-section" data-testid="apps-panel">
        <AppManagementScreen
          status={selectedStatus}
          onBack={onBackToApps}
          onSaveVersionBehavior={onSaveVersionBehavior}
          onUpdateHomeScreenIcon={onUpdateHomeScreenIcon}
          onProtectedLaunch={onProtectedLaunch}
          onOpenDestinationApp={onOpenDestinationApp}
          onPauseApp={onPauseApp}
          onClearAppPause={onClearAppPause}
          onLogLauncherEvent={onLogLauncherEvent}
          isTester={isTester}
          isShellContext={isShellContext}
          onOpenMyBishBash={onOpenMyBishBash}
          onOpenLauncherSetup={openLauncherSetup}
          nowMs={nowMs}
        />
        {setupInterstitial}
      </section>
    );
  }

  if (showAccessScreen) {
    return (
      <section className="panel-section" data-testid="apps-panel">
        <AppsAccessScreen
          onUnlock={onOpenPremiumOptions}
          onHaveCode={() => {
            setShowAccessScreen(false);
            setShowCodeScreen(true);
          }}
          onBack={() => setShowAccessScreen(false)}
        />
      </section>
    );
  }

  return (
    <section className="panel-section" data-testid="apps-panel">
      <div className="section-heading solo">
        <div>
          <h2>Apps</h2>
          <p>Choose where myBishBash appears before the apps you already open.</p>
        </div>
      </div>

      {pendingOnboardingShortcuts.length > 0 ? (
        <div className="settings-card" data-testid="apps-shortcut-setup-reminder">
          <div className="settings-version-heading">
            <p>Pending setup</p>
            <span>Open each app with myBishBash once from your Home Screen to finish setup.</span>
          </div>
          <div className="home-screen-version-list">
            {pendingOnboardingShortcuts.map((app) => (
              <article className="home-screen-version-card" key={`pending-shortcut:${app.id}`}>
                {app.iconSrc ? (
                  <img src={app.iconSrc} alt="" className="home-screen-version-icon" />
                ) : (
                  <span className="home-screen-version-icon" aria-hidden="true" />
                )}
                <div className="home-screen-version-copy">
                  <div className="home-screen-version-title">
                    <strong>{app.label} with myBishBash</strong>
                    <span>Pending setup</span>
                  </div>
                  <p>Open {app.label} with myBishBash once from your Home Screen to finish setup.</p>
                  <div className="home-screen-version-actions apps-row-actions">
                    <form
                      className="launcher-setup-form"
                      action={getLauncherSetupUrl(app.id)}
                      method="get"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (isStandaloneDisplayMode()) {
                          openLauncherSetup(homeScreenVersions[app.id] ?? DEFAULT_HOME_SCREEN_VERSIONS[app.id] ?? getLauncherConfig(app.id));
                          return;
                        }
                        window.location.href = getLauncherSetupUrl(app.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="pack-button secondary"
                        data-testid={`apps-pending-setup-${app.id}`}
                        data-launcher-setup-id={app.id}
                      >
                        Open setup page
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {onboardingSelectedAppSetup ? (
        <div className="settings-card apps-launcher-setup-card" data-testid="apps-onboarding-setup-card">
          {onboardingSelectedAppSetup.iconSrc ? (
            <img src={onboardingSelectedAppSetup.iconSrc} alt="" className="home-screen-version-icon apps-launcher-setup-icon" />
          ) : (
            <span className="home-screen-version-icon apps-launcher-setup-icon" aria-hidden="true" />
          )}
          <div className="settings-version-heading">
            <p>{onboardingSelectedAppSetup.label} with myBishBash</p>
            <span>Pending setup. Open {onboardingSelectedAppSetup.label} with myBishBash once from your Home Screen to finish setup.</span>
          </div>
          <form
            className="launcher-setup-form"
            action={getLauncherSetupUrl(onboardingSelectedAppSetup.id)}
            method="get"
            onSubmit={(event) => {
              event.preventDefault();
              if (isStandaloneDisplayMode()) {
                openLauncherSetup(onboardingSelectedAppSetup.version);
                return;
              }
              window.location.href = getLauncherSetupUrl(onboardingSelectedAppSetup.id);
            }}
          >
            <button
              type="submit"
              className="pack-button"
              data-testid={`apps-onboarding-setup-${onboardingSelectedAppSetup.id}`}
              data-launcher-setup-id={onboardingSelectedAppSetup.id}
            >
              Open setup page
            </button>
          </form>
        </div>
      ) : null}

      <div className="settings-card" data-testid="apps-list">
        <div className="settings-version-heading">
          <p>Your apps</p>
          <span>Enabled and paused apps you can manage.</span>
        </div>
        {enabledStatuses.length === 0 && pendingSetupStatuses.length === 0 ? (
          <p className="tiny-note">No apps set up yet.</p>
        ) : (
          <div className="home-screen-version-list">
            {[...enabledStatuses, ...pendingSetupStatuses].map((status) => (
              <EnabledAppRow
                key={status.version.id}
                status={status}
                onManageApp={onManageApp}
                onPauseApp={onPauseApp}
                onClearAppPause={onClearAppPause}
              />
            ))}
          </div>
        )}
      </div>

      <div className="settings-card" data-testid="apps-add-more">
        <MoreAppsOptions
          protectedAppStatuses={liveProtectedAppStatuses}
          canAddAnotherApp={canAddAnotherApp}
          excludedAppIds={onboardingSelectedAppSetup ? [onboardingSelectedAppSetup.id] : []}
          onManageApp={onManageApp}
          onShowAccess={() => setShowAccessScreen(true)}
          onHaveCode={() => setShowCodeScreen(true)}
          onAddApp={(version) => {
            const status = liveProtectedAppStatuses.find((item) => item.version.id === version.id) ?? { version };
            if (!canAddAnotherApp) {
              setSwitchTargetStatus(status);
              return;
            }
            openLauncherSetup(version);
          }}
        />
      </div>
      {setupInterstitial}
    </section>
  );
}

