import { useState } from "react";
import { TestPilotModal } from "./ReportIssueModal";
import { useTestPilot } from "./TestPilotProvider";
import { createTesterReport } from "./testPilotApi";

export default function FeedbackModal({ onSubmitted }) {
  const { activePanel, closePanel, collectDiagnostics, config, session } = useTestPilot();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("feedback");
  const [status, setStatus] = useState("");
  if (activePanel !== "feedback") return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!description.trim()) {
      setStatus("Add a note first.");
      return;
    }
    setStatus("Sending...");
    try {
      await createTesterReport({
        userId: session.user.id,
        reportType: category === "feedback" ? "feedback" : category,
        description,
        severity: "low",
        diagnostics: collectDiagnostics(),
      });
      setStatus("Sent. Thank you.");
      onSubmitted?.();
      window.setTimeout(closePanel, 500);
    } catch (error) {
      setStatus(error?.message ?? "Could not send feedback.");
    }
  }

  return (
    <TestPilotModal title="Send feedback" closePanel={closePanel}>
      <form className="testpilot-form" onSubmit={handleSubmit}>
        <label>What&apos;s on your mind?<textarea required rows={6} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="feedback">General feedback</option><option value="idea">Idea</option><option value="confusion">Confusion</option>
        </select></label>
        <button type="submit" className="testpilot-primary" style={{ "--testpilot-accent": config.accent }}>Submit</button>
        {status ? <p className="testpilot-status">{status}</p> : null}
      </form>
    </TestPilotModal>
  );
}
