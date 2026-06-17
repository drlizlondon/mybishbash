import { useMemo } from "react";
import { TestPilotModal } from "./ReportIssueModal";
import { useTestPilot } from "./TestPilotProvider";

export default function DiagnosticsModal() {
  const { activePanel, closePanel, collectDiagnostics } = useTestPilot();
  const diagnostics = useMemo(() => collectDiagnostics(), [collectDiagnostics, activePanel]);
  if (activePanel !== "diagnostics") return null;

  const rows = [
    ["Device", diagnostics.device?.platform],
    ["Browser", diagnostics.device?.userAgent],
    ["Display mode", diagnostics.displayMode],
    ["Route", diagnostics.route],
    ["App context", diagnostics.launcherContext],
    ["Viewport", `${diagnostics.viewport?.width} x ${diagnostics.viewport?.height}`],
    ["App version", diagnostics.appVersion],
    ["Setup complete", diagnostics.setupComplete ? "Yes" : "No"],
    ["Selected launcher", diagnostics.selectedLauncher],
    ["Recent events", diagnostics.recentEvents?.count],
    ["Recent event types", diagnostics.recentEvents?.types?.join(", ")],
  ];

  return (
    <TestPilotModal title="Diagnostics" closePanel={closePanel}>
      <dl className="testpilot-diagnostics">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not available"}</dd>
          </div>
        ))}
      </dl>
      <p className="testpilot-privacy">Private card text, passwords, sessions, and auth tokens are not included.</p>
    </TestPilotModal>
  );
}
