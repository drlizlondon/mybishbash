import { useRef, useState } from "react";
import { resolveLauncherIconSrc } from "../../lib/launcherRegistry";
import { formatPauseUntil } from "../../lib/pauseFormat";
import AppPauseModal from "../../components/AppPauseModal";

export default function EnabledAppRow({ status, onManageApp, onPauseApp, onClearAppPause }) {
  const { version, protectedOn, pendingSetup, paused, pauseExpiry } = status;
  const appName = version.realAppLabel ?? version.name ?? version.displayName ?? version.id;
  const [showPauseModal, setShowPauseModal] = useState(false);
  const pauseButtonRef = useRef(null);
  const pauseUntil = formatPauseUntil(pauseExpiry);

  return (
    <article className="home-screen-version-card apps-enabled-row" data-testid={`protected-app-${version.id}`}>
      <img
        src={resolveLauncherIconSrc(version)}
        alt={`${appName} icon`}
        className="home-screen-version-icon"
      />
      <div className="home-screen-version-copy">
        <div className="home-screen-version-title">
          <strong>{appName} with myBishBash</strong>
          <span data-testid={`apps-pause-status-${version.id}`}>
            {protectedOn ? (paused ? `Paused until ${pauseUntil || "soon"}` : "Enabled") : pendingSetup ? "Pending setup" : "Not set up"}
          </span>
        </div>
        {pendingSetup ? (
          <p>Open {appName} with myBishBash once from your Home Screen to finish setup.</p>
        ) : null}
        <div className="home-screen-version-actions apps-row-actions">
          <button type="button" className="pack-button apps-settings-button" onClick={() => onManageApp?.(version.id)}>
            Settings
          </button>
          {protectedOn && paused ? (
            <button
              type="button"
              className="pack-button secondary apps-pause-row-button"
              data-testid={`apps-end-pause-${version.id}`}
              onClick={() => onClearAppPause(version.id)}
            >
              Resume
            </button>
          ) : protectedOn ? (
            <button
              type="button"
              className="pack-button secondary apps-pause-row-button"
              ref={pauseButtonRef}
              onClick={() => setShowPauseModal(true)}
            >
              Pause
            </button>
          ) : null}
        </div>
      </div>
      {showPauseModal && onPauseApp ? (
        <AppPauseModal
          appName={appName}
          triggerRef={pauseButtonRef}
          openAfterPause={false}
          onClose={() => setShowPauseModal(false)}
          onPause={(mins) => {
            setShowPauseModal(false);
            onPauseApp(version.id, mins);
          }}
        />
      ) : null}
    </article>
  );
}

