import { PremiumCardScreen } from "./CardRevealTemplate";

export default function CommitmentCheckInOverlay({
  card,
  onCheckInAction,
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
      greeting="How’s it going?"
      icon="heart"
      headline={card.promptText}
      subtitle=""
      actions={[
        { label: "I’m on track", variant: "primary", onClick: () => onCheckInAction("on_track") },
        { label: "I’m somewhat on track", variant: "secondary", onClick: () => onCheckInAction("somewhat_on_track") },
        { label: "Let’s leave this for another day", variant: "secondary", onClick: () => onCheckInAction("closed_early") },
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

