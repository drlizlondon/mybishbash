import { useTestPilot } from "../../testing/TestPilot";
import { AuthDiagnostics } from "../auth";
import MorningSummaryDebugLog from "./MorningSummaryDebugLog";

export default function TesterToolsSettingsCard({
  session,
  onRefreshSession,
  onResetSharedState,
  morningSummaryDebug,
  onShowMorningSummaryNow,
  onGenerateMorningSummaryForToday,
  onGenerateMorningSummaryForYesterday,
}) {
  const { openPanel } = useTestPilot();

  return (
    <section className="settings-section tester-tools-section" aria-labelledby="settings-tester-tools-heading" data-testid="tester-tools-settings-section">
      <div className="settings-version-heading">
        <h3 id="settings-tester-tools-heading">Tester Tools</h3>
        <span>Tools for checking, reporting and resetting this test device.</span>
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Reports and diagnostics</p>
          <span>Send feedback, review submitted reports, or inspect the context included with tester reports.</span>
        </div>
        <div className="settings-action-row">
          <button type="button" className="pack-button secondary" onClick={() => openPanel("issue")}>
            Report an issue
          </button>
          <button type="button" className="pack-button secondary" onClick={() => openPanel("feedback")}>
            Send feedback
          </button>
          <button type="button" className="pack-button secondary" onClick={() => openPanel("reports")}>
            Tester reports
          </button>
          <button type="button" className="pack-button secondary" onClick={() => openPanel("diagnostics")}>
            Diagnostics
          </button>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Morning Summary diagnostics</p>
          <span>Force summary states and inspect the events used by the summary.</span>
        </div>
        <div className="sync-profile-row morning-summary-debug-actions">
          <button type="button" className="pack-button secondary" onClick={onShowMorningSummaryNow}>
            Show Morning Summary Now
          </button>
          <button type="button" className="pack-button secondary" onClick={onGenerateMorningSummaryForToday}>
            Generate Summary for Today
          </button>
          <button type="button" className="pack-button secondary" onClick={onGenerateMorningSummaryForYesterday}>
            Generate Summary for Yesterday
          </button>
        </div>
        <MorningSummaryDebugLog summary={morningSummaryDebug} />
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Account diagnostics</p>
          <span>Refresh the current auth session and inspect tester-only account state.</span>
        </div>
        <button type="button" className="pack-button secondary" onClick={onRefreshSession}>
          Refresh login session
        </button>
        <AuthDiagnostics session={session} />
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Clear device data</p>
          <span>Removes all cards, packs, settings and history from this device. Your cloud account is not deleted.</span>
        </div>
        <button type="button" className="pack-button secondary danger-soft-button" onClick={onResetSharedState}>
          Clear all data from this device
        </button>
      </div>
    </section>
  );
}
