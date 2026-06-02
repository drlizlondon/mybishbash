export const LAUNCHER_DATA_WAIT_TIMEOUT_MS = 1800;

export function getLauncherDecisionReadiness({
  routeKind,
  authReady,
  sessionPresent,
  testerStatusReady = true,
  syncStatus,
  hasUsableCachedLauncherState = false,
  waitExpired,
  isDemoMode = false,
}) {
  if (routeKind !== "intercept") return { ready: true, reason: "not_launcher_route" };
  if (isDemoMode) return { ready: true, reason: "demo_mode" };
  if (hasUsableCachedLauncherState) return { ready: true, reason: "cached_launcher_state_available" };
  if (!authReady) return { ready: false, reason: "auth_pending" };
  if (sessionPresent && syncStatus === "loading") return { ready: false, reason: "sync_pending" };
  if (sessionPresent && !testerStatusReady) return { ready: false, reason: "tester_status_pending" };
  if (waitExpired) return { ready: true, reason: "wait_expired" };
  return { ready: true, reason: "no_cards_after_ready" };
}
