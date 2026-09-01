import { useState } from "react";

export default function RestoreActionCardsModal({ actionCards, onRestore, onClose }) {
  const deletedUserCards = actionCards.filter((card) => card.source === "user" && card.deletedAt);
  const [selectedIds, setSelectedIds] = useState(new Set());

  function handleToggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRestore() {
    onRestore(Array.from(selectedIds));
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer pack-editor" onClick={(e) => e.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">Restore deleted actions</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        {deletedUserCards.length === 0 ? (
          <div className="field">
            <p className="pack-editor-copy">No deleted action cards to restore.</p>
          </div>
        ) : (
          <div className="custom-pack-message-grid">
            {deletedUserCards.map((card) => (
              <label key={card.id} className="timing-option settings-checkbox-row" style={{ alignItems: "flex-start", padding: "12px", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "12px" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(card.id)}
                  onChange={() => handleToggle(card.id)}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <strong>{card.title}</strong>
                  <span style={{ fontSize: "14px", opacity: 0.7 }}>{card.body}</span>
                  {card.category ? <span className="tiny-note">{card.category}</span> : null}
                </div>
              </label>
            ))}
          </div>
        )}
        {deletedUserCards.length > 0 ? (
          <button type="button" className="save-button" style={{ marginTop: "16px" }} onClick={handleRestore} disabled={selectedIds.size === 0}>
            Restore selected
          </button>
        ) : null}
      </div>
    </div>
  );
}

