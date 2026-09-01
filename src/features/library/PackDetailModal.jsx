import { useState } from "react";
import { getStatusMeta } from "../../utils";
import { getPackDislikeKey as getLegacyHiddenPackCardKey } from "../../lib/launcherState";

export default function PackDetailModal({
  detail,
  cards,
  libraryPacks,
  interruptionPacks,
  hiddenCardIds,
  isPackActive,
  onActivateLibraryPack,
  onDeactivateLibraryPack,
  onSetPackCardHidden,
  onSaveInterruptionCard,
  onDeleteInterruptionCard,
  onClose,
}) {
  const [editingCard, setEditingCard] = useState(null);
  const [draftText, setDraftText] = useState("");

  const libraryPack = detail.type === "library"
    ? libraryPacks.find((pack) => pack.id === detail.id)
    : null;
  const interruptionPack = detail.type === "interruption"
    ? interruptionPacks.find((pack) => pack.id === detail.id)
    : null;
  const active = libraryPack ? isPackActive(libraryPack.id) : interruptionPack?.active;

  function startNewInterruptionCard() {
    setEditingCard({ id: null });
    setDraftText("");
  }

  function startEditInterruptionCard(card) {
    setEditingCard(card);
    setDraftText(card.text);
  }

  function saveInterruptionDraft(event) {
    event.preventDefault();
    if (!interruptionPack) return;
    onSaveInterruptionCard(interruptionPack.targetApp, editingCard?.id ?? null, draftText);
    setEditingCard(null);
    setDraftText("");
  }

  if (!libraryPack && !interruptionPack) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer pack-editor" onClick={(event) => event.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">{libraryPack ? "Manage cards" : "Interruption messages"}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>

        {libraryPack ? (
          <>
            <div className="field">
              <span>{libraryPack.title}</span>
              <p className="pack-editor-copy">{libraryPack.description}</p>
              <p className="pack-meta">{libraryPack.entries.length} cards · read-only</p>
            </div>
            <button
              type="button"
              className={`pack-button ${active ? "secondary" : ""}`}
              onClick={() => {
                if (active) {
                  onDeactivateLibraryPack(libraryPack.id);
                  return;
                }
                onActivateLibraryPack(libraryPack.id);
              }}
              disabled={libraryPack.entries.length === 0}
            >
              {active ? "Remove pack" : "Install pack"}
            </button>
            <div className="custom-pack-message-grid">
              {libraryPack.entries.map((entry, index) => {
                const hidden = hiddenCardIds.includes(
                  getLegacyHiddenPackCardKey({ sourcePackId: libraryPack.id, promptText: entry.promptText }),
                );
                const activeCard = cards.find(
                  (card) => card.sourcePackId === libraryPack.id && card.promptText === entry.promptText && !card.deletedAt,
                );
                return (
                  <article key={`${libraryPack.id}-${index}`} className="home-screen-version-card pack-manager-card">
                    <div className="home-screen-version-copy pack-manager-copy">
                      <div className="home-screen-version-title">
                        <strong>{entry.promptText}</strong>
                        <span>{hidden ? "Hidden" : "Visible"}</span>
                      </div>
                      {entry.attribution ? <p>{entry.attribution}</p> : null}
                      {activeCard ? <p className="pack-meta">{getStatusMeta(activeCard).badge}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="pack-button secondary"
                      onClick={() => onSetPackCardHidden(libraryPack.id, entry.promptText, !hidden)}
                    >
                      {hidden ? "Restore card" : "Hide card"}
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        ) : null}

        {interruptionPack ? (
          <>
            <div className="field">
              <span>{interruptionPack.name}</span>
              <p className="pack-editor-copy">{interruptionPack.description}</p>
              <p className="pack-meta">{interruptionPack.cards.length} {interruptionPack.cards.length === 1 ? "message" : "messages"}</p>
            </div>
            <button type="button" className="pack-button" onClick={startNewInterruptionCard}>
              Add card
            </button>
            {editingCard ? (
              <form className="custom-pack-message-grid" onSubmit={saveInterruptionDraft}>
                <label className="field">
                  <span>{editingCard.id ? "Edit card" : "New card"}</span>
                  <textarea
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    rows={3}
                    placeholder="Do you really want to open this app right now?"
                  />
                </label>
                <button type="submit" className="save-button">
                  Save card
                </button>
              </form>
            ) : null}
            <div className="custom-pack-message-grid">
              {interruptionPack.cards.map((card) => (
                <article key={card.id} className="home-screen-version-card pack-manager-card">
                  <div className="home-screen-version-copy pack-manager-copy">
                    <div className="home-screen-version-title">
                      <strong>{card.text}</strong>
                      <span>{card.readOnly ? "Read-only" : "Editable"}{card.hidden ? " · hidden" : ""}</span>
                    </div>
                  </div>
                  <div className="home-screen-version-actions">
                    {card.readOnly ? (
                      <button
                        type="button"
                        className="pack-button secondary"
                        onClick={() => onSetPackCardHidden(interruptionPack.id, card.text, !card.hidden)}
                      >
                        {card.hidden ? "Restore card" : "Hide card"}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="pack-button secondary" onClick={() => startEditInterruptionCard(card)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="pack-button secondary danger-soft-button"
                          onClick={() => onDeleteInterruptionCard(interruptionPack.targetApp, card.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

