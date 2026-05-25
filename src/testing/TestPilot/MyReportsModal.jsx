import { useEffect, useState } from "react";
import { TestPilotModal } from "./ReportIssueModal";
import { useTestPilot } from "./TestPilotProvider";
import { fetchMyTesterReports } from "./testPilotApi";

export default function MyReportsModal({ refreshKey = 0 }) {
  const { activePanel, closePanel, session } = useTestPilot();
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (activePanel !== "reports" || !session?.user?.id) return;
    setStatus("Loading...");
    fetchMyTesterReports(session.user.id)
      .then((rows) => {
        setReports(rows);
        setStatus("");
      })
      .catch((error) => setStatus(error?.message ?? "Could not load reports."));
  }, [activePanel, refreshKey, session?.user?.id]);

  if (activePanel !== "reports") return null;

  return (
    <TestPilotModal title="My reports" closePanel={closePanel}>
      {status ? <p className="testpilot-status">{status}</p> : null}
      <div className="testpilot-report-list">
        {reports.length === 0 && !status ? <p className="testpilot-empty">No reports yet.</p> : null}
        {reports.map((report) => {
          const thumb = report.screenshot_urls?.[0] || report.tester_report_attachments?.[0]?.public_url;
          return (
            <article key={report.id} className="testpilot-report-card">
              {thumb ? <img src={thumb} alt="" /> : null}
              <div>
                <strong>{report.title || report.description}</strong>
                <p>{report.launcher_context || "MyBishBash"} - {report.status} - {report.severity}</p>
                <small>{new Date(report.created_at).toLocaleString()}</small>
              </div>
            </article>
          );
        })}
      </div>
    </TestPilotModal>
  );
}
