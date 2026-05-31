import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getLauncherDecisionReadiness } from "../src/lib/launcherFlow.js";

assert.deepEqual(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: false,
    sessionPresent: false,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: false,
  }),
  { ready: false, reason: "auth_pending" },
);

assert.deepEqual(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: true,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: false,
  }),
  { ready: false, reason: "sync_pending" },
);

assert.equal(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: true,
    syncStatus: "loading",
    hasUsableCachedLauncherState: true,
    waitExpired: false,
  }).reason,
  "cached_launcher_state_available",
);

assert.deepEqual(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: true,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: true,
  }),
  { ready: false, reason: "sync_pending" },
);

assert.equal(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: false,
    syncStatus: "needs-connection",
    hasUsableCachedLauncherState: false,
    waitExpired: true,
  }).reason,
  "wait_expired",
);

assert.equal(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: false,
    sessionPresent: false,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: false,
    isDemoMode: true,
  }).reason,
  "demo_mode",
);

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSource, /buildFakeLauncherPreparingOverlay/);
assert.match(appSource, /\[\"intercept-pack\", "continue-to-app"\]\.includes\(overlay\?\.type\)/);
assert.match(appSource, /if \(!launcherReadiness\.ready\)/);
assert.match(appSource, /finalDecision: "personal_card"/);
assert.match(appSource, /finalDecision: "continue_to_app"/);

console.log("Launcher flow checks passed");
