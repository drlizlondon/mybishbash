import { PLACEHOLDER_ICON_SRC, resolveLauncherIconSrc } from "./launcherRegistry";

export default function FakeLauncherBar({ versions, raised = false, onLaunch }) {
  return (
    <div className={`fake-launcher-bar ${raised ? "raised" : ""}`} aria-label="Fake app launchers">
      {versions.map((version) => {
        return (
          <button
            key={version.id}
            type="button"
            className="fake-launcher-button"
            data-testid={`fake-launcher-${version.id}`}
            onClick={() => {
              onLaunch?.(version.id);
            }}
            aria-label={`Launch ${version.realAppLabel}`}
          >
            <img
              src={resolveLauncherIconSrc(version)}
              alt=""
              aria-hidden="true"
              onError={(event) => {
                if (event.currentTarget.src.endsWith(PLACEHOLDER_ICON_SRC)) return;
                event.currentTarget.src = PLACEHOLDER_ICON_SRC;
              }}
            />
            <span>{version.realAppLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
