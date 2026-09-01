import { useCardsStore } from "../../stores/cardsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import OverlayHost from "./OverlayHost";

/**
 * Store container for the overlay host (Phase 4 D4, packet step 12).
 *
 * D4's strict rule: only callbacks and values whose bodies touch nothing but
 * store state/actions move out of App. Applied to OverlayHost's prop surface,
 * that is exactly two props — `actionCards` and `timezone` — which are plain
 * store reads that App was drilling through its JSX.
 *
 * Everything else stays App-owned and arrives through `props`, because it
 * closes over launch-flow, route or overlay state:
 *   onClose / onDashboard      — suppression refs, screen, navigateTo, overlay
 *   onAcceptActionCard         — fake-launcher flow step + overlay descriptor
 *   onPackContinue / onPackLike— handleRevealCompletion (launcher engine)
 *   onChooseElse               — overlay descriptor + visibleActionCards
 *   onLogEvent / onLogLauncherEvent — close over launcherContext / session
 *   onContinueToApp / onFakeLauncherLaunch / onPauseApp / onManageApp
 *                              — launcher engine and route state
 *   onRetryConnection          — provider-owned offline flag, not a store
 *   fakeLauncherVersions       — derived from effectiveLaunchSession
 *
 * OverlayHost's body is unchanged.
 */
export default function OverlayScreen(props) {
  const actionCards = useCardsStore((state) => state.actionCards);
  const timezone = useSettingsStore((state) => state.profile.timezone);

  return <OverlayHost {...props} actionCards={actionCards} timezone={timezone} />;
}
