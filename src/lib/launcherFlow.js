export const LAUNCHER_DATA_WAIT_TIMEOUT_MS = 1800;

export function getLauncherDecisionReadiness({
  routeKind,
  authReady,
  sessionPresent,
  syncStatus,
  rawCardsCount,
  waitExpired,
  isDemoMode = false,
}) {
  if (routeKind !== "intercept") return { ready: true, reason: "not_launcher_route" };
  if (rawCardsCount > 0) return { ready: true, reason: "cached_cards_available" };
  if (isDemoMode) return { ready: true, reason: "demo_mode" };
  if (waitExpired) return { ready: true, reason: "wait_expired" };
  if (!authReady) return { ready: false, reason: "auth_pending" };
  if (sessionPresent && syncStatus === "loading") return { ready: false, reason: "sync_pending" };
  return { ready: true, reason: "no_cards_after_ready" };
}
