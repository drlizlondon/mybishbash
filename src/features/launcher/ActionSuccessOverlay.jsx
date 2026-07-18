import { PremiumCardScreen } from "./CardRevealTemplate";

export default function ActionSuccessOverlay({ onClose, onDashboard, onCreateCard, cardOverlayKey = "", className = "" }) {
  const actions = [
    { label: "Back home", variant: "primary", onClick: onClose },
  ];

  return (
    <PremiumCardScreen
      type="action"
      greeting="Action"
      icon="heart"
      headline="Nice choice."
      subtitle="Take all the time you need."
      actions={actions}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
    />
  );
}

