import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  collectTestPilotDiagnostics,
  diagnosticsContainsSensitiveValues,
  shouldShowTesterTools,
} from "../src/testing/TestPilot/testPilotDiagnostics.js";
import { buildTesterReportPayload } from "../src/testing/TestPilot/testPilotApi.js";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    userAgent: "Test Browser",
    platform: "Test Platform",
    language: "en-GB",
    onLine: true,
  },
});

assert.equal(shouldShowTesterTools({ session: { user: { id: "u1" } }, testerStatus: { is_tester: true } }), true);
assert.equal(shouldShowTesterTools({ session: { user: { id: "u1" } }, testerStatus: { is_tester: false } }), false);
assert.equal(shouldShowTesterTools({ session: null, testerStatus: { is_tester: true } }), false);

const diagnostics = collectTestPilotDiagnostics({
  route: "/home",
  launcherContext: "instagram",
  displayMode: "standalone",
  setupComplete: true,
  recentEvents: [
    { event_type: "intercept_continue_to_app", card_text: "private text should not appear" },
    { event_type: "bash_done", card_text: "private text should not appear" },
  ],
});
assert.equal(diagnostics.route, "/home");
assert.deepEqual(diagnostics.recentEvents.types, ["intercept_continue_to_app", "bash_done"]);
assert.equal(JSON.stringify(diagnostics).includes("private text should not appear"), false);
assert.equal(diagnosticsContainsSensitiveValues(diagnostics), false);

const payload = buildTesterReportPayload({
  userId: "u1",
  reportType: "bug",
  description: "The modal did not open",
  expected: "It opens",
  actual: "Nothing happened",
  severity: "high",
  frequency: "often",
  diagnostics,
});
assert.equal(payload.user_id, "u1");
assert.equal(payload.description, "The modal did not open");
assert.equal(payload.route, "/home");
assert.equal(payload.launcher_context, "instagram");
assert.equal(payload.display_mode, "standalone");
assert.equal(payload.severity, "high");

const hqSource = await readFile(new URL("../src/HQPanel.jsx", import.meta.url), "utf8");
assert.match(hqSource, /tester_reports/);
assert.match(hqSource, /TesterReportsPage/);

const testPilotCss = await readFile(new URL("../src/testing/TestPilot/testPilot.css", import.meta.url), "utf8");
assert.match(testPilotCss, /\.testpilot-backdrop\s*{[^}]*z-index:\s*100200/s);
assert.match(testPilotCss, /\.testpilot-sheet,\s*\n\.testpilot-modal\s*{[^}]*z-index:\s*100201/s);

const toolsSheetSource = await readFile(new URL("../src/testing/TestPilot/TesterToolsSheet.jsx", import.meta.url), "utf8");
const reportModalSource = await readFile(new URL("../src/testing/TestPilot/ReportIssueModal.jsx", import.meta.url), "utf8");
assert.match(toolsSheetSource, /if \(activePanel !== "tools"\) return null;/);
assert.match(reportModalSource, /<div className="testpilot-backdrop"[^>]*onMouseDown=\{closePanel\}/);
assert.match(reportModalSource, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);

console.log("TestPilot checks passed");
