import { PremiumCardScreen } from "./CardRevealTemplate";

export default function CommitmentReviewOverlay({
  card,
  onReviewAction,
  launcherVersions = [],
  onLauncherLaunch,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
  showDashboardShortcut = true,
}) {
  return (
    <PremiumCardScreen
      type="personal"
      greeting=""
      icon="heart"
      headline={card.promptText}
      subtitle="How did it go?"
      actions={[
        { label: "I did it", variant: "primary", onClick: () => onReviewAction("did_it") },
        { label: "I nearly did it", variant: "secondary", onClick: () => onReviewAction("nearly_did_it") },
        { label: "I didn’t do it", variant: "secondary", onClick: () => onReviewAction("didnt_do_it") },
      ]}
      launcherVersions={launcherVersions}
      onLauncherLaunch={onLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
      onManageApp={onManageApp}
      showDashboardShortcut={showDashboardShortcut}
    />
  );
}

