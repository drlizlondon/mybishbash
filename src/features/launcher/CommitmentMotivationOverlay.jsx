import CardRevealTemplate, { CardRevealMessage } from "./CardRevealTemplate";
import { stripCommitmentPrefix } from "./overlayBuilders";

export default function CommitmentMotivationOverlay({
  card,
  onCommitmentAction,
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
    <CardRevealTemplate
      variant="personal"
      greeting="MESSAGE FROM YOURSELF"
      icon="heart"
      message=""
      subtitle=""
      launchers={launcherVersions}
      actions={[
        { label: "I’ll commit after all", variant: "primary", onClick: () => onCommitmentAction("commit_after_all") },
        { label: "Not this time", variant: "secondary", onClick: () => onCommitmentAction("decline_after_motivation") },
      ]}
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
    >
      <div className="commitment-motivation-copy">
        <p className="commitment-motivation-intro">Before you decide...</p>
        {commitmentText ? <CardRevealMessage className="commitment-motivation-commitment" message={`I will ${commitmentText}`} /> : null}
        <p className="commitment-motivation-subline">You wrote this to yourself:</p>
        <CardRevealMessage className="commitment-motivation-reason" message={card.commitmentReason} />
      </div>
    </CardRevealTemplate>
  );
}

