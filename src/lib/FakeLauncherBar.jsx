import { getVersionOpenHref } from "./launcherState";

function SafariGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="safari-glyph" aria-hidden="true">
      <circle cx="16" cy="16" r="10.5" />
      <path d="M16 10l3 7-7 3 4-10z" />
      <path d="M16 16l-3 7 7-3-4-4z" />
    </svg>
  );
}

export default function FakeLauncherBar({ versions, raised = false }) {
  return (
    <div className={`fake-launcher-bar ${raised ? "raised" : ""}`} aria-label="Fake app launchers">
      {versions.map((version) => (
        <a
          key={version.id}
          className="fake-launcher-button"
          href={getVersionOpenHref(version)}
          aria-label={`Open ${version.realAppLabel}`}
        >
          {version.customIconSrc || version.iconSrc ? (
            <img src={version.customIconSrc || version.iconSrc} alt="" aria-hidden="true" />
          ) : (
            <SafariGlyph />
          )}
          <span>{version.realAppLabel}</span>
        </a>
      ))}
    </div>
  );
}
