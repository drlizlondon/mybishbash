import { useEffect, useRef, useState } from "react";
import { PremiumCardScreen } from "./CardRevealTemplate";

export default function CustomPackOverlay({ overlay, onClose, onDashboard }) {
  const [activeIndex, setActiveIndex] = useState(overlay.activeIndex ?? 0);
  const touchStartX = useRef(null);
  const messages = overlay.messages ?? [];

  useEffect(() => {
    setActiveIndex(overlay.activeIndex ?? 0);
  }, [overlay.activeIndex, overlay.packId]);

  function move(delta) {
    if (messages.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next >= messages.length) return messages.length - 1;
      return next;
    });
  }

  return (
    <div
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
        type="pack"
        greeting={overlay.name}
        icon="heart"
        headline={messages[activeIndex] ?? "Your pack is ready."}
        subtitle="Swipe through these little interruptions."
        onDashboard={onDashboard}
      >
        {messages.length > 1 ? (
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
    </div>
  );
}

