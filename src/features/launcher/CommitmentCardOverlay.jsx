import { useEffect, useRef } from "react";
import { getCommitmentStartWindow } from "../../utils";
import { logCommitmentDebug } from "./commitmentDebug";
import { stripCommitmentPrefix } from "./overlayBuilders";
import { PremiumCardScreen } from "./CardRevealTemplate";

export default function CommitmentCardOverlay({
  card,
  timezone,
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
  const shownRef = useRef(false);
  const commitmentText = stripCommitmentPrefix(card.promptText);

  useEffect(() => {
    if (!card || shownRef.current) return;
    shownRef.current = true;
    logCommitmentDebug("commitment card shown", {
      cardId: card.id,
      commitmentText: card.promptText,
      commitmentTimingMode: card.commitmentTimingMode ?? card.commitmentStartWindow ?? getCommitmentStartWindow(card.timingWindows),
      commitmentCustomStartTime: card.commitmentCustomStartTime ?? "",
      commitmentCustomEndTime: card.commitmentCustomEndTime ?? "",
      timingWindows: card.timingWindows,
    });
  }, [card]);

  return (
    <PremiumCardScreen
      type="personal"
      greeting="TODAY’S COMMITMENT"
      icon="heart"
      headline={`I will ${commitmentText}`}
      subtitle=""
      actions={[
        { label: "I will commit to this", variant: "primary", onClick: () => onCommitmentAction("commit") },
        {
          label: "Not this time",
          variant: "secondary",
          onClick: () => {
            logCommitmentDebug("user declined from first screen", {
              cardId: card.id,
              commitmentText: card.promptText,
            });
            onCommitmentAction("decline");
          },
        },
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

