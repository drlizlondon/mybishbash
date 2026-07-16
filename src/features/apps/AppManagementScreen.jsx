import { formatPauseUntil } from "../../lib/pauseFormat";
import { resolveLauncherIconSrc } from "../../lib/launcherRegistry";
import { getLauncherSetupUrl, isStandaloneDisplayMode } from "../../lib/launcherSetupUrl";
import { getDefaultAppPrompt } from "../access";

export default function AppManagementScreen({
  status,
  onBack,
  onSaveVersionBehavior,
  onUpdateHomeScreenIcon,
  onProtectedLaunch,
  onOpenDestinationApp,
  onOpenLauncherSetup,
  onPauseApp,
  onClearAppPause,
  onLogLauncherEvent,
  isTester = false,
  isShellContext = false,
  onOpenMyBishBash,
  nowMs = Date.now(),
}) {
  const { version, protectedOn, pendingSetup, promptsOn, paused, pauseRemaining } = status;
  const appName = version.realAppLabel ?? version.name ?? version.displayName ?? version.id;
  const promptPreview = getDefaultAppPrompt(version.id, appName);
  const pauseUntil = formatPauseUntil(status.pauseExpiry, nowMs);
  const enabledStatus = protectedOn
    ? "Enabled"
    : pendingSetup ? "Pending setup" : "Not set up";
  const pauseStatus = protectedOn && paused
    ? `Paused until ${pauseUntil || pauseRemaining || "soon"}`
    : enabledStatus;
  return (
    <div className="apps-manage-screen" data-testid={`protected-app-${version.id}`}>
      {!isShellContext ? (
        <button type="button" className="text-button apps-back-button" data-testid="apps-back-button" onClick={onBack}>
          ← Apps
        </button>
      ) : null}
      <div className="settings-card apps-manage-hero">
        <img src={resolveLauncherIconSrc(version)} alt={`${appName} icon`} className="home-screen-version-icon" />
        <div className="settings-version-heading">
          <p>{appName} with myBishBash</p>
          <span data-testid={`apps-pause-status-${version.id}`}>{pauseStatus}</span>
        </div>
      </div>
      {!protectedOn ? (
        <div className="settings-card apps-launcher-setup-card" data-testid={`apps-launcher-setup-${version.id}`}>
          <img src={resolveLauncherIconSrc(version)} alt="" className="home-screen-version-icon apps-launcher-setup-icon" />
          <div className="settings-version-heading">
            <p>Set up {appName} with myBishBash</p>
            <span>{pendingSetup ? `Open ${appName} with myBishBash once from your Home Screen to finish setup.` : `Open the setup page to finish setting up ${appName} with myBishBash.`}</span>
          </div>
          <form
            className="launcher-setup-form"
            action={getLauncherSetupUrl(version.id)}
            method="get"
            onSubmit={(event) => {
              event.preventDefault();
              if (isStandaloneDisplayMode()) {
                onOpenLauncherSetup?.(version);
                return;
              }
              window.location.href = getLauncherSetupUrl(version.id);
            }}
          >
            <button
              type="submit"
              className="pack-button"
              data-testid={`apps-enable-${version.id}`}
              data-launcher-setup-id={version.id}
            >
              Open setup page
            </button>
          </form>
        </div>
      ) : null}
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>App Prompts</p>
        </div>
        <label className="timing-option settings-checkbox-row" style={{ marginBottom: "8px" }}>
          <input
            type="checkbox"
            checked={promptsOn}
            data-testid={`apps-interruptions-toggle-${version.id}`}
            onChange={(event) => onSaveVersionBehavior(version.id, { useInterruptionPack: event.target.checked })}
          />
          <span>{promptsOn ? "On" : "Off"}</span>
        </label>
      </div>
      {promptsOn ? (
        <div className="settings-card" data-testid={`apps-prompt-preview-${version.id}`}>
          <div className="settings-version-heading">
            <p>Example prompt</p>
            <span>“{promptPreview}”</span>
          </div>
        </div>
      ) : null}
      {protectedOn ? (
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Pause myBishBash</p>
          <span>Pause only affects {appName}.</span>
        </div>
        {paused ? (
          <button
            type="button"
            className="pack-button"
            data-testid={`apps-end-pause-inline-${version.id}`}
            onClick={() => onClearAppPause(version.id)}
          >
            Resume
          </button>
        ) : (
          <div className="apps-pause-buttons">
            {[30, 60, 180].map((minutes) => (
              <button
                key={minutes}
                type="button"
                className="pack-button secondary"
                onClick={() => onPauseApp?.(version.id, minutes)}
              >
                Pause for {minutes === 30 ? "30 minutes" : minutes === 60 ? "1 hour" : "3 hours"}
              </button>
            ))}
          </div>
        )}
      </div>
      ) : null}
      {protectedOn ? (
        <div className="settings-card settings-compact">
          <button type="button" className="pack-button secondary" onClick={() => onOpenDestinationApp?.(version.id)}>
            Open {appName}
          </button>
        </div>
      ) : null}
      {!isShellContext ? (
      <div className="settings-card settings-compact">
        <button
          type="button"
          className="pack-button secondary"
          onClick={() => {
            onSaveVersionBehavior(version.id, { appEnabled: false, useInterruptionPack: false, setupState: "removed" });
            onClearAppPause(version.id);
            onBack?.();
          }}
        >
          Remove app
        </button>
      </div>
      ) : null}
      {isShellContext ? (
        <div className="settings-card settings-compact">
          <button type="button" className="pack-button" data-testid="apps-manage-all" onClick={onOpenMyBishBash}>
            Manage all apps
          </button>
        </div>
      ) : null}
      {isTester && !isShellContext ? (
        <div className="settings-card">
          <div className="settings-version-heading">
            <p>Test controls</p>
            <span>Only visible in tester mode.</span>
          </div>
          <div className="home-screen-version-actions">
            <button
              type="button"
              className="pack-button secondary"
              data-testid={`apps-test-shortcut-${version.id}`}
              onClick={() => onProtectedLaunch(version.id)}
            >
              Test app
            </button>
            <button
              type="button"
              className="pack-button secondary"
              data-testid={`apps-direct-open-${version.id}`}
              onClick={() => onOpenDestinationApp(version.id)}
            >
              Open {appName}
            </button>
            <label className="icon-upload-button">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      onUpdateHomeScreenIcon(version.id, reader.result);
                    }
                  };
                  reader.readAsDataURL(file);
                  event.target.value = "";
                }}
              />
              Replace icon
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

