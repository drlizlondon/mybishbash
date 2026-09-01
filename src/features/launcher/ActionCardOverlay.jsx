import { useEffect, useMemo, useState } from "react";
import { PremiumCardScreen } from "./CardRevealTemplate";

function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

export default function ActionCardOverlay({
  overlay,
  actionCards,
  onAccept,
  onClose,
  onLogEvent,
  fakeLauncherVersions,
  onFakeLauncherLaunch,
  allowBackHome = false,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onManageApp = null,
}) {
  debugLog("[ACTION CARDS] Overlay rendered");

  const available = useMemo(
    () => actionCards.filter((c) => !c.hidden && !c.deletedAt),
    [actionCards]
  );

  const [recentlyShown, setRecentlyShown] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const maxCardsPerSession = Math.min(3, available.length);
  const canShowAnotherIdea = maxCardsPerSession > 1 && recentlyShown.length < maxCardsPerSession;

  useEffect(() => {
    if (currentCard || available.length === 0) return;

    const nextCard = available[Math.floor(Math.random() * available.length)];
    setCurrentCard(nextCard);
    setRecentlyShown([nextCard.id]);
    logActionCardViewed(nextCard);
  }, [available, currentCard]);

  useEffect(() => {
    if (!currentCard) return;
    if (available.some((card) => card.id === currentCard.id)) return;
    debugLog("[ACTION CARDS] Current card is no longer visible; rotating.");
    setCurrentCard(null);
  }, [available, currentCard]);

  function logActionCardViewed(card) {
    if (!card) return;
    void onLogEvent({
      event_type: "action_card_viewed",
      source_type: "action_card",
      card_source: "action_card",
      card_id: card.id,
      card_title: card.title,
      action_taken: "viewed",
    });
  }

  function pickNext() {
    if (!canShowAnotherIdea) return;

    if (currentCard) {
      void onLogEvent({
        event_type: "action_card_skipped",
        source_type: "action_card",
        card_source: "action_card",
        card_id: currentCard.id,
        card_title: currentCard.title,
        action_taken: "skipped",
      });
    }

    let pool = available.filter((c) => !recentlyShown.includes(c.id));

    if (pool.length === 0) {
      const fallbackPool = available.filter((c) =>
        currentCard ? c.id !== currentCard.id : true
      );
      pool = fallbackPool.length > 0 ? fallbackPool : available;
    }

    if (pool.length === 0) return;

    const nextCard = pool[Math.floor(Math.random() * pool.length)];

    debugLog("[ACTION CARDS] Rotating action card", {
      from: currentCard?.id,
      to: nextCard.id,
    });
    setCurrentCard(nextCard);

    setRecentlyShown((prev) => {
      const updated = [nextCard.id, ...prev.filter((id) => id !== nextCard.id)];
      return updated.slice(0, 3);
    });

    logActionCardViewed(nextCard);
  }

  function handleAccept() {
    if (currentCard) {
      void onLogEvent({
        event_type: "action_card_completed",
        source_type: "action_card",
        card_source: "action_card",
        card_id: currentCard.id,
        card_title: currentCard.title,
        action_taken: "completed",
      });
      onAccept(currentCard);
    }
  }

  if (!currentCard) return null;

  return (
    <div className="premium-overlay-with-launchers">
      <PremiumCardScreen
        type="action"
        greeting={currentCard.category || "Action"}
        icon="spark"
        headline={currentCard.title}
        subtitle={currentCard.body || "An alternative to scrolling."}
        actions={[
          ...(canShowAnotherIdea ? [{ label: "Another idea", variant: "secondary", onClick: pickNext }] : []),
          { label: "I'll do this", variant: "primary", onClick: handleAccept },
        ]}
        launcherVersions={fakeLauncherVersions}
        onLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={`${cardOverlayKey}:${currentCard.id}`}
        className={className}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    </div>
  );
}

