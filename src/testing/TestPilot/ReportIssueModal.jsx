import { useState } from "react";
import { useTestPilot } from "./TestPilotProvider";
import { createTesterReport, uploadTesterScreenshot } from "./testPilotApi";

export default function ReportIssueModal({ onSubmitted }) {
  const { activePanel, closePanel, collectDiagnostics, config, session } = useTestPilot();
  const [form, setForm] = useState({ description: "", expected: "", actual: "", severity: "medium", frequency: "sometimes" });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  if (activePanel !== "issue") return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.description.trim()) {
      setStatus("Tell us what happened first.");
      return;
    }
    setStatus("Sending...");
    try {
      const diagnostics = collectDiagnostics();
      const report = await createTesterReport({
        ...form,
        userId: session.user.id,
        reportType: "bug",
        diagnostics,
        deviceSummary: diagnostics.device?.userAgent,
      });
      if (file) await uploadTesterScreenshot(file, session.user.id, report.id);
      setStatus("Sent. Thank you.");
      onSubmitted?.();
      window.setTimeout(closePanel, 500);
    } catch (error) {
      setStatus(error?.message ?? "Could not send report.");
    }
  }

  return (
    <TestPilotModal title="Report an issue" closePanel={closePanel}>
      <form className="testpilot-form" onSubmit={handleSubmit}>
        <label>What happened?<textarea required rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label>What did you expect?<textarea rows={3} value={form.expected} onChange={(event) => setForm({ ...form, expected: event.target.value })} /></label>
        <label>What happened instead?<textarea rows={3} value={form.actual} onChange={(event) => setForm({ ...form, actual: event.target.value })} /></label>
        <div className="testpilot-form-grid">
          <label>Severity<select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="blocking">Blocking</option>
          </select></label>
          <label>How often?<select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>
            <option value="once">Once</option><option value="sometimes">Sometimes</option><option value="often">Often</option><option value="always">Always</option>
          </select></label>
        </div>
        <label>Add screenshot<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <p className="testpilot-privacy">Diagnostics will be included automatically. We do not read other apps or private phone data.</p>
        <button type="submit" className="testpilot-primary" style={{ "--testpilot-accent": config.accent }}>Submit</button>
        {status ? <p className="testpilot-status">{status}</p> : null}
      </form>
    </TestPilotModal>
  );
}

export function TestPilotModal({ children, closePanel, title }) {
  return (
    <div className="testpilot-backdrop" role="presentation" onMouseDown={closePanel}>
      <section className="testpilot-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="testpilot-modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={closePanel} aria-label="Close">x</button>
        </div>
        {children}
      </section>
    </div>
  );
}
