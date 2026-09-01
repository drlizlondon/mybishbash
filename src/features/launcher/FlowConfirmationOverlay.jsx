import { getVersionOpenHref } from "../../lib/launcherState";
import { getBrowserSafeDestinationHref } from "../../lib/launcherSetupUrl";
import { PremiumCardScreen } from "./CardRevealTemplate";

export default function FlowConfirmationOverlay({ overlay, version, onClose, onContinueToApp, onChooseElse, onDashboard, onCreateCard, cardOverlayKey = "", className = "", launcherAppId = null, launcherAppName = null, onManageApp = null }) {
  const continueHref = version ? getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true })) : "";
  const actionLabel = overlay.actionLabel || "Continue";
  const actions = version
    ? [
        {
          label: actionLabel,
          variant: "primary",
          href: continueHref,
          onClick: (event) => {
            const handled = onContinueToApp?.(version.id, {
              source: "flow_confirmation",
              reason: "user_pressed_continue_after_confirmation",
              allowDefaultNavigation: Boolean(continueHref),
              preferDirectAppDestination: true,
            });
            if (handled !== false) event?.preventDefault?.();
          },
        },
        { label: "Do something else", variant: "secondary", onClick: onChooseElse },
      ]
    : [{ label: actionLabel, variant: "primary", onClick: onClose }];

  return (
    <PremiumCardScreen
      type="personal"
      greeting="myBishBash"
      icon="heart"
      headline={overlay.message || "Thanks for the update."}
      subtitle=""
      actions={actions}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onManageApp={onManageApp}
    />
  );
}

