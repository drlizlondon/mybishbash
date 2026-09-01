import { resolveLauncherIconSrc, getLauncherConfig, APPS_OPTION_IDS } from "../../lib/launcherRegistry";
import { DEFAULT_HOME_SCREEN_VERSIONS } from "../../storage";

export default function MoreAppsOptions({ protectedAppStatuses, canAddAnotherApp, excludedAppIds = [], onBack, onManageApp, onShowAccess, onHaveCode, onAddApp }) {
  const statusById = new Map(protectedAppStatuses.map((status) => [status.version.id, status]));
  const excludedIds = new Set(excludedAppIds);
  const availableOptionIds = APPS_OPTION_IDS.filter((id) => {
    const status = statusById.get(id);
    return !excludedIds.has(id) && !status?.protectedOn && !status?.pendingSetup;
  });
  return (
    <div className="apps-more-options" data-testid="apps-more-options">
      <div className="settings-version-heading">
        <p>Add another app</p>
        <span>Upgrade to keep myBishBash connected to more apps.</span>
      </div>
      <div className="home-screen-version-list">
        {availableOptionIds.length === 0 ? (
          <p className="tiny-note">All available apps are enabled.</p>
        ) : null}
        {availableOptionIds.map((id) => {
          const status = statusById.get(id);
          const version = status?.version ?? DEFAULT_HOME_SCREEN_VERSIONS[id] ?? getLauncherConfig(id);
          if (!version) return null;
          const appName = version.realAppLabel ?? version.name ?? version.displayName ?? id;
          const locked = !canAddAnotherApp;
          return (
            <article className={`home-screen-version-card apps-enabled-row ${locked ? "apps-locked-row" : ""}`} key={id} data-testid={`apps-option-${id}`}>
              <img src={resolveLauncherIconSrc(version)} alt={`${appName} icon`} className="home-screen-version-icon" />
              <div className="home-screen-version-copy">
                <div className="home-screen-version-title">
                  <strong>Set up {appName} with myBishBash</strong>
                  <span>{locked ? "Upgrade" : "Not set up"}</span>
                </div>
                {locked ? (
                  <p className="tiny-note">Free Core includes myBishBash and one connected app shortcut.</p>
                ) : null}
                <div className="home-screen-version-actions apps-row-actions">
                  <button
                    type="button"
                    className="pack-button secondary"
                    data-testid={`apps-option-action-${id}`}
                    onClick={() => {
                      onAddApp?.(version);
                    }}
                  >
                    {locked ? "Choose" : "Open setup page"}
                  </button>
                  {locked ? (
                    <button type="button" className="text-button apps-code-link" onClick={onHaveCode}>
                      Have a code?
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="apps-more-actions">
        <button type="button" className="text-button apps-code-link" onClick={onHaveCode}>
          Have a code?
        </button>
        {onBack ? <button type="button" className="text-button apps-code-link" onClick={onBack}>
          Back
        </button> : null}
      </div>
    </div>
  );
}

