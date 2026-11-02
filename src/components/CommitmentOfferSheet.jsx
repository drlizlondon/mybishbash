import { useEffect, useRef } from "react";
import { getCommitmentOfferLine } from "../lib/commitmentOffer";

/**
 * Bottom sheet offered at the skip that makes 3 in a row on your own card.
 * Reuses the app pause sheet's look. Escape and the corner × both mean "Not now".
 */
export default function CommitmentOfferSheet({ skipCount, onAccept, onPause, onClose }) {
  const sheetRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const buttons = [...sheetRef.current.querySelectorAll("button")];
    const step = event.shiftKey ? -1 : 1;
    buttons[(buttons.indexOf(document.activeElement) + step + buttons.length) % buttons.length].focus();
  }

  return (
    <div className="modal-backdrop app-pause-backdrop" data-testid="commitment-offer">
      <div
        ref={sheetRef}
        className="app-pause-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commitment-offer-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <button type="button" className="app-pause-close-btn commitment-offer-close" aria-label="Not now" onClick={onClose}>
          ×
        </button>
        <p className="app-pause-sheet-title commitment-offer-title" id="commitment-offer-title">{getCommitmentOfferLine(skipCount)}</p>
        <p className="app-pause-sheet-body">Pause it for now, or make it a commitment to help you follow through.</p>
        <div className="app-pause-options">
          <button type="button" className="app-pause-option" onClick={onAccept}>Make it a commitment</button>
          <button type="button" className="app-pause-option" onClick={onPause}>Pause it</button>
        </div>
      </div>
    </div>
  );
}
