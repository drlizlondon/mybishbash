export const LAUNCHER_DATA_WAIT_TIMEOUT_MS = 300;

export const FAKE_LAUNCHER_FLOW_STEPS = {
  SELECTED_CARD: "selected_card",
  INTERRUPTION_CARD: "interruption_card",
  CONTINUE_CARD: "continue_card",
  ACTION_CARD: "action_card",
  ACTION_SUCCESS: "action_success",
  CAUGHT_UP: "caught_up",
};

export function buildFakeLauncherFlowContext({
  launcherId,
  launcherName,
  destinationUrl,
  interruptionEnabled = false,
  activationKey = null,
} = {}) {
  return {
    launcherId,
    launcherName,
    destinationUrl,
    interruptionEnabled: Boolean(interruptionEnabled),
    activationKey,
  };
}

export function getInitialFakeLauncherStep({ selectedCard = null, interruption = null, interruptionEnabled = false } = {}) {
  if (selectedCard) return FAKE_LAUNCHER_FLOW_STEPS.SELECTED_CARD;
  if (interruption) return FAKE_LAUNCHER_FLOW_STEPS.INTERRUPTION_CARD;
  if (interruptionEnabled) return FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD;
  return FAKE_LAUNCHER_FLOW_STEPS.CAUGHT_UP;
}

export function getNextFakeLauncherStepAfterSelectedCard({ interruption = null } = {}) {
  return interruption
    ? FAKE_LAUNCHER_FLOW_STEPS.INTERRUPTION_CARD
    : FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD;
}

export function getNextFakeLauncherStepAfterInterruption(action) {
  return action === "do_something_else"
    ? FAKE_LAUNCHER_FLOW_STEPS.ACTION_CARD
    : FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD;
}

export function getNextFakeLauncherStepAfterActionCard() {
  return FAKE_LAUNCHER_FLOW_STEPS.ACTION_SUCCESS;
}

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
  if (waitExpired) return { ready: true, reason: "wait_expired" };
  if (!authReady) return { ready: false, reason: "auth_pending" };
  if (sessionPresent && syncStatus === "loading") return { ready: false, reason: "sync_pending" };
  if (sessionPresent && !testerStatusReady) return { ready: false, reason: "tester_status_pending" };
  return { ready: true, reason: "no_cards_after_ready" };
}
