import { useState } from "react";
import { getSyncErrorMessage } from "../../lib/mybishbashSync";

export default function DeleteAccountModal({ email, onDelete, onClose }) {
  const [confirmationText, setConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const canDelete = confirmationText.trim() === "DELETE" && !isDeleting;

  async function handleDelete() {
    if (!canDelete) return;
    setIsDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (deleteError) {
      console.error("[DELETE_ACCOUNT_ERROR]", deleteError);
      setError(getSyncErrorMessage(deleteError, "We could not delete your account just now. Please try again in a moment."));
      setIsDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop delete-account-backdrop" onClick={isDeleting ? undefined : onClose}>
      <div
        className="composer delete-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="composer-heading">
          <p className="eyebrow">Delete account</p>
          <button type="button" className="text-button" onClick={onClose} disabled={isDeleting}>
            Close
          </button>
        </div>
        <h3 id="delete-account-title">Delete your myBishBash account?</h3>
        <p className="pack-editor-copy">
          This permanently deletes your myBishBash account, cards, settings and saved app data. This cannot be undone.
        </p>
        {email ? <p className="tiny-note">Signed in as {email}</p> : null}
        <label className="field">
          <span>Type DELETE to confirm</span>
          <input
            type="text"
            className="settings-input"
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            disabled={isDeleting}
            autoComplete="off"
            data-testid="delete-account-confirmation-input"
          />
        </label>
        {error ? <p className="sync-error" role="alert">{error}</p> : null}
        <div className="delete-account-actions">
          <button type="button" className="pack-button secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
          <button
            type="button"
            className="pack-button danger-button"
            onClick={handleDelete}
            disabled={!canDelete}
            data-testid="delete-account-final-button"
          >
            {isDeleting ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
