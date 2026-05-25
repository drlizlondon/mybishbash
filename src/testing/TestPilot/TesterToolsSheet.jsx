import { useTestPilot } from "./TestPilotProvider";

const ACTIONS = [
  { key: "issue", label: "Report an issue", helper: "Something broke or behaved oddly." },
  { key: "feedback", label: "Send feedback", helper: "Share an idea, confusion, or general note." },
  { key: "reports", label: "View my reports", helper: "See what you have already sent." },
  { key: "diagnostics", label: "Diagnostics", helper: "View the context included with reports." },
];

export default function TesterToolsSheet() {
  const { activePanel, closePanel, config, openPanel } = useTestPilot();
  if (activePanel !== "tools") return null;

  return (
    <div className="testpilot-backdrop" role="presentation" onMouseDown={closePanel}>
      <section className="testpilot-sheet" role="dialog" aria-modal="true" aria-label={config.uiLabel} onMouseDown={(event) => event.stopPropagation()}>
        <div className="testpilot-handle" />
        <div className="testpilot-sheet-header">
          <p>{config.productName}</p>
          <h2>{config.uiLabel}</h2>
          <button type="button" onClick={closePanel} aria-label="Close">x</button>
        </div>
        <div className="testpilot-action-list">
          {ACTIONS.map((action) => (
            <button key={action.key} type="button" className="testpilot-action" onClick={() => openPanel(action.key)}>
              <span>{action.label}</span>
              <small>{action.helper}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
