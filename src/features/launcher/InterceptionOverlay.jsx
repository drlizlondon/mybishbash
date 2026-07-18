import { useEffect, useMemo, useRef, useState } from "react";
import { getVersionOpenHref } from "../../lib/launcherState";
import { getBrowserSafeDestinationHref } from "../../lib/launcherSetupUrl";
import { PremiumCardScreen } from "./CardRevealTemplate";

function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

export default function InterceptionOverlay({ overlay, version, onChooseElse, onLogEvent, onLogLauncherEvent, onContinueToApp, onFakeLauncherLaunch, onDashboard, onCreateCard, cardOverlayKey = "", launcherAppId = null, launcherAppName = null, onPauseApp = null, onManageApp = null }) {
  const [activeIndex, setActiveIndex] = useState(overlay.activeIndex ?? 0);
  const [showFallbackLink, setShowFallbackLink] = useState(false);
  const touchStartX = useRef(null);
  const fallbackTimerRef = useRef(null);
  const viewedCardRef = useRef("");
  const messages = useMemo(() => overlay.messages ?? [], [overlay.messages]);
  const cards = useMemo(
    () =>
      overlay.cards ?? messages.map((message, index) => ({
        id: `${overlay.packId}:${index}`,
        title: message,
        text: message,
      })),
    [messages, overlay.cards, overlay.packId],
  );

  useEffect(() => {
    setActiveIndex(overlay.activeIndex ?? 0);
    setShowFallbackLink(false);
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
    }
    return () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, [overlay.activeIndex, overlay.packId]);

  useEffect(() => {
    const activeMessage = messages[activeIndex];
    if (!activeMessage || !version) return;

    const viewKey = `${overlay.packId}:${cards[activeIndex]?.id ?? activeIndex}`;
    if (viewedCardRef.current === viewKey) return;
    viewedCardRef.current = viewKey;

    void onLogEvent({
      event_type: "first_interruption_seen",
      source_type: "interruption",
      card_source: "interruption",
      card_id: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
      card_title: activeMessage,
      card_text: activeMessage,
      app_id: version.id,
      app_name: version.name,
      launcher_context: version.id,
      target_app: overlay.targetApp ?? version.id,
      pack_id: overlay.packId,
      message_id: `${overlay.packId}:${activeIndex}`,
      action_taken: "viewed",
      metadata: {
        packTitle: overlay.name,
        message: activeMessage,
      },
    });
    debugLog("[INTERCEPT] viewed event logged", {
      versionId: version.id,
      packId: overlay.packId,
      cardId: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
      messageId: `${overlay.packId}:${activeIndex}`,
      cardIndex: activeIndex,
    });
    void onLogLauncherEvent?.("first_interruption_seen", version.id, {
      card_id: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
      card_index: activeIndex,
      pack_id: overlay.packId,
    });
  }, [activeIndex, cards, messages, onLogEvent, onLogLauncherEvent, overlay.name, overlay.packId, overlay.targetApp, version]);

  function move(delta) {
    if (messages.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next >= messages.length) return messages.length - 1;
      return next;
    });
  }

  const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true }));

  function handleContinueToApp(event) {
    if (!version) return;
    const handled = onContinueToApp?.(version.id, {
      source: "interruption_card",
      reason: "user_pressed_continue",
      allowDefaultNavigation: Boolean(continueHref),
      preferDirectAppDestination: true,
    });
    if (handled !== false) event?.preventDefault?.();
  }

  const activeMessage = messages[activeIndex] ?? "Pause for a second.";
  const hasMultipleMessages = messages.length > 1;

  return (
    <div
      className="premium-interception-frame"
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current == null) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
        const delta = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 36) return;
        move(delta < 0 ? 1 : -1);
      }}
    >
      <PremiumCardScreen
        type="interruption"
        greeting={overlay.name || version?.name || "Before you open"}
        icon="heart"
        headline={activeMessage}
        subtitle="A little pause before the app opens."
        actions={[
          {
            label: `Continue to ${version?.name ?? "App"}`,
            variant: "primary",
            href: continueHref,
            onClick: (event) => {
              event?.stopPropagation?.();
              handleContinueToApp(event);
            },
          },
          {
            label: "Do something else",
            variant: "secondary",
            onClick: (event) => {
              event?.stopPropagation?.();
              onChooseElse();
            },
          },
        ]}
        launcherVersions={[]}
        onLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={`${cardOverlayKey}:${cards[activeIndex]?.id ?? activeIndex}`}
        className="launcher-interception-card"
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseApp}
        onManageApp={onManageApp}
      >
        {hasMultipleMessages ? (
          <div className="premium-card-pagination">
            {messages.map((message, index) => (
              <button
                key={`${overlay.packId}-dot-${index}`}
                type="button"
                className={`pagination-dot ${index === activeIndex ? "active" : ""}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Show card ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </PremiumCardScreen>
      {showFallbackLink && version?.manualUrl ? (
        <p className="manual-open-copy premium-manual-open-copy">
          App didn&apos;t open?{" "}
          <a className="link-button" href={continueHref} onClick={handleContinueToApp}>
            Open {version.name} manually
          </a>
        </p>
      ) : null}
    </div>
  );
}

