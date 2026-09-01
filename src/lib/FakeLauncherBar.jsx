import { PLACEHOLDER_ICON_SRC, resolveLauncherIconSrc } from "./launcherRegistry";

export default function FakeLauncherBar({ versions, raised = false, onLaunch }) {
  return (
    <div className={`fake-launcher-bar ${raised ? "raised" : ""}`} aria-label="Fake app launchers">
      {versions.map((version) => {
        const href = typeof version.href === "string" ? version.href : "";
        const content = (
          <>
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
          </>
        );
        if (href) {
          return (
            <a
              key={version.id}
              className="fake-launcher-button"
              data-testid={`fake-launcher-${version.id}`}
              href={href}
              onClick={(event) => {
                onLaunch?.(version.id, event);
              }}
              aria-label={`Open ${version.realAppLabel}`}
            >
              {content}
            </a>
          );
        }
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
            {content}
          </button>
        );
      })}
    </div>
  );
}
