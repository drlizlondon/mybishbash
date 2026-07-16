import { resolveLauncherIconSrc } from "../../lib/launcherRegistry";

export default function FreeCoreReconciliationScreen({ enabledAppStatuses, onKeepApp, onUpgrade }) {
  return (
    <section className="panel-section" data-testid="free-core-reconciliation">
      <div className="settings-card apps-manage-hero">
        <div className="settings-version-heading">
          <p>Your access has changed.</p>
          <span>Free Core lets you keep one connected app active. Choose the app you want to keep.</span>
        </div>
      </div>
      <div className="settings-card">
        <div className="home-screen-version-list">
          {enabledAppStatuses.map((status) => {
            const version = status.version;
            const appName = version.realAppLabel ?? version.name ?? version.displayName ?? version.id;
            return (
              <article className="home-screen-version-card apps-enabled-row" key={version.id} data-testid={`reconcile-app-${version.id}`}>
                <img src={resolveLauncherIconSrc(version)} alt={`${appName} icon`} className="home-screen-version-icon" />
                <div className="home-screen-version-copy">
                  <div className="home-screen-version-title">
                    <strong>{appName} with myBishBash</strong>
                    <span>Active now</span>
                  </div>
                  <p>Other connected apps will stay inactive while on Free Core.</p>
                  <div className="home-screen-version-actions apps-row-actions">
                    <button type="button" className="pack-button" onClick={() => onKeepApp?.(version.id)}>
                      Keep {appName}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <div className="settings-card settings-compact">
        <button type="button" className="pack-button secondary" onClick={onUpgrade}>
          Upgrade to keep all apps active
        </button>
      </div>
    </section>
  );
}

