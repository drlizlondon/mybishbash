import { useEffect, useRef, useState } from "react";

const PAUSE_DURATION_OPTIONS = [
  { label: "30 minutes",  minutes: 30 },
  { label: "1 hour",   minutes: 60 },
  { label: "3 hours",  minutes: 180 },
];

export default function AppPauseModal({ appName, onClose, onPause, triggerRef = null, openAfterPause = true }) {
  const [confirmedLabel, setConfirmedLabel] = useState(null);
  const sheetRef = useRef(null);

  // Move focus into the dialog on mount; restore to the trigger button on close.
  useEffect(() => {
    const prev = document.activeElement;
    sheetRef.current?.focus();
    return () => {
      (triggerRef?.current ?? prev)?.focus();
    };
  }, [triggerRef]);

  function handleSelect(label, minutes) {
    setConfirmedLabel(label);
    // pauseApp write is deferred to match the confirmation delay so the
    // localStorage write and the navigation happen atomically.
    setTimeout(() => onPause(minutes), 1400);
  }

  return (
    <div className="modal-backdrop app-pause-backdrop" onClick={confirmedLabel ? undefined : onClose}>
      <div
        ref={sheetRef}
        className="app-pause-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {confirmedLabel ? (
          <div className="app-pause-confirmed" aria-live="polite">
            <span className="app-pause-confirmed-icon" aria-hidden="true">✓</span>
            <p className="app-pause-sheet-title">Paused for {confirmedLabel}</p>
            <p className="app-pause-sheet-body">{openAfterPause ? `Opening ${appName}…` : `${appName} will be active again automatically.`}</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="app-pause-close-btn"
              aria-label="Close without pausing"
              data-testid="pause-modal-close"
              onClick={onClose}
            >
              ×
            </button>
            <p className="app-pause-sheet-title" id="pause-sheet-title">
              Pause myBishBash?
            </p>
            <p className="app-pause-sheet-body">
              For a short time, {appName} will open directly without showing App Prompts.
            </p>
            <div className="app-pause-options">
              {PAUSE_DURATION_OPTIONS.map(({ label, minutes }) => (
                <button
                  key={minutes}
                  type="button"
                  className="app-pause-option"
                  onClick={() => handleSelect(label, minutes)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

