import { resolveLauncherIconSrc } from "../../lib/launcherRegistry";

export default function ActiveProtectedAppShortcut({ version, onOpen }) {
  if (!version?.id) return null;
  const label = version.realAppLabel ?? version.displayName ?? version.name ?? "App";

  return (
    <button
      type="button"
      className="active-protected-app-shortcut"
      data-testid="active-protected-app-bypass"
      onClick={onOpen}
      aria-label={`Continue to ${label}`}
      title={`Continue to ${label}`}
    >
      <img
        src={resolveLauncherIconSrc(version)}
        alt=""
        aria-hidden="true"
      />
      <span>Continue to {label}</span>
    </button>
  );
}

// GrowthFlower, EventDetailModal, describeLogEvent, getLogEventDisplayLabel → moved to src/components/LogPanel.jsx

