import { stripCommitmentPrefix } from "./overlayBuilders";
import { PremiumCardScreen } from "./CardRevealTemplate";

export default function CommitmentEncouragementOverlay({
  card,
  onContinue,
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
  const commitmentText = stripCommitmentPrefix(card.commitmentText ?? card.promptText ?? "");
  return (
    <PremiumCardScreen
      type="personal"
      greeting="Reminder"
      icon="heart"
      headline={commitmentText ? `I will ${commitmentText}` : card.promptText}
      subtitle={commitmentText ? card.promptText : "Keep going with what you said mattered."}
      actions={[
        { label: "Continue", variant: "primary", onClick: onContinue },
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

