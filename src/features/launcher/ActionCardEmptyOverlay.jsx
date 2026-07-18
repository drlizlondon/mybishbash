import { getVersionOpenHref } from "../../lib/launcherState";
import { getBrowserSafeDestinationHref } from "../../lib/launcherSetupUrl";
import { PremiumCardScreen } from "./CardRevealTemplate";

export default function ActionCardEmptyOverlay({ overlay, version, onClose, onLogEvent, onCreateActionCard, onContinueToApp, fakeLauncherVersions, onFakeLauncherLaunch, allowBackHome = false, onDashboard, onCreateCard, cardOverlayKey = "", className = "", launcherAppId = null, launcherAppName = null, onManageApp = null }) {
  const continueHref = version ? getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true })) : "";

  function handleContinueToApp(event) {
    if (!version) return;

    void onLogEvent({
      event_type: "intercept_continue_to_app",
      source_type: "action_card_empty",
      card_source: "action_card_empty",
      app_id: version.id,
      app_name: version.name,
      launcher_context: version.id,
      action_taken: "continued_to_app",
    });
    const handled = onContinueToApp?.(version.id, {
      source: "action_card_empty",
      reason: "user_pressed_continue",
      allowDefaultNavigation: Boolean(continueHref),
      preferDirectAppDestination: true,
    });
    if (handled !== false) event?.preventDefault?.();
  }

  return (
    <div className="premium-overlay-with-launchers">
      <PremiumCardScreen
        type="empty"
        greeting="Action Cards"
        icon="spark"
        headline="No action ideas yet."
        subtitle="Make one for yourself."
        actions={[
          ...(allowBackHome ? [{ label: "Back home", variant: "secondary", onClick: onClose }] : []),
          ...(version ? [{ label: `Continue to ${version.name}`, variant: "secondary", href: continueHref, onClick: handleContinueToApp }] : []),
          { label: "Create action card", variant: "primary", onClick: onCreateActionCard },
        ]}
        launcherVersions={fakeLauncherVersions}
        onLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={className}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    </div>
  );
}

