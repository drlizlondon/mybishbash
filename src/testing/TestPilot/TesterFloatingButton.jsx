import { useTestPilot } from "./TestPilotProvider";

export default function TesterFloatingButton() {
  const { config, openPanel, visible } = useTestPilot();
  if (!visible) return null;

  return (
    <button
      type="button"
      className="testpilot-floating-button"
      style={{ "--testpilot-accent": config.accent }}
      aria-label={`Open ${config.uiLabel}`}
      onClick={() => openPanel("tools")}
    >
      <BugIcon />
    </button>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8.2 4.4 6.8 3 5.4 4.4l2 2A6 6 0 0 0 6.3 9H4v2h2v2H4v2h2.4a5.8 5.8 0 0 0 1 2.4l-2 2L6.8 21l1.8-1.8a6.1 6.1 0 0 0 6.8 0l1.8 1.8 1.4-1.4-2-2a5.8 5.8 0 0 0 1-2.6H20v-2h-2v-2h2V9h-2.3a6 6 0 0 0-1.1-2.6l2-2L17.2 3l-1.4 1.4A5.9 5.9 0 0 0 12 3a5.9 5.9 0 0 0-3.8 1.4ZM8.3 11a3.7 3.7 0 1 1 7.4 0v3a3.7 3.7 0 1 1-7.4 0v-3Zm2.1-1.2h1.1v6.4h-1.1V9.8Zm2.1 0h1.1v6.4h-1.1V9.8Z" />
    </svg>
  );
}
