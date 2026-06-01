function SafariGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="safari-glyph" aria-hidden="true">
      <circle cx="16" cy="16" r="10.5" />
      <path d="M16 10l3 7-7 3 4-10z" />
      <path d="M16 16l-3 7 7-3-4-4z" />
    </svg>
  );
}

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
            {version.customIconSrc || version.iconSrc ? (
              <img src={version.customIconSrc || version.iconSrc} alt="" aria-hidden="true" />
            ) : (
              <SafariGlyph />
            )}
            <span>{version.realAppLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
