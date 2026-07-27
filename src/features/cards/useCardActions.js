import { applyCardAction, isCommitmentCard } from "../../utils";
import { CARD_EVENT_TYPES } from "../../lib/cardSelection";
import { getCardSelectionSurfaceForOverlay } from "../launcher";

/**
 * Phase 4b — card action handlers, lifted out of App() unchanged.
 *
 * The bodies below are byte-for-byte the App() originals; only their source of
 * state changed. Every dependency is passed EXPLICITLY in `deps` — the hook
 * never closes over App scope — so the handlers are unit-testable against
 * stubbed stores and Phase 5's async persistence conversion is reviewable in
 * isolation.
 *
 * Deliberately NOT changed here: no async, no persistence-timing change, no
 * direct localStorage access (the Phase 4 D5 ratchet covers this directory).
 */
export function useCardActions({
  cards,
  setCards,
  updateCards,
  overlay,
  setOverlay,
  setMenuOpenId,
  profile,
  logEvent,
  handleRevealCompletion,
}) {
  function handleAction(action) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard) {
      setOverlay(null);
      return;
    }

    const updatedCard = applyCardAction(activeCard, action, new Date(), profile.timezone);
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);
    const eventType =
      action === "done"
        ? "bash_done"
        : action === "now"
          ? "bash_do_now"
          : "bash_not_done";
    void logEvent({
      event_type: eventType,
      source_type: activeCard.sourcePackId ? "library" : "personal",
      card_source: activeCard.sourcePackId ? "library" : "personal",
      bash_id: activeCard.id,
      bash_title: activeCard.promptText,
      card_id: activeCard.id,
      card_title: activeCard.dashboardTitle ?? activeCard.promptText,
      card_text: activeCard.promptText,
      pack_id: activeCard.sourcePackId ?? null,
      action_taken: action === "done" ? "completed" : action === "now" ? "liked" : "dismissed",
      metadata: {
        frequency: activeCard.frequency,
        timingWindows: activeCard.timingWindows,
      },
    });
    if (!activeCard.sourcePackId) {
      void logEvent({
        event_type: action === "done" ? CARD_EVENT_TYPES.COMPLETED : CARD_EVENT_TYPES.IGNORED,
        source_type: "personal",
        card_source: "personal",
        bash_id: activeCard.id,
        bash_title: activeCard.promptText,
        card_id: activeCard.id,
        card_title: activeCard.dashboardTitle ?? activeCard.promptText,
        card_text: activeCard.promptText,
        action_taken: action === "done" ? "completed" : "ignored",
        metadata: {
          legacyEventType: eventType,
          cardKind: activeCard.cardKind ?? "personal",
          surface: getCardSelectionSurfaceForOverlay(overlay),
          selectedAction: action,
          frequency: activeCard.frequency,
          timingWindows: activeCard.timingWindows,
          origin: overlay.origin ?? null,
          launchSource: overlay.launchSource ?? null,
          activationKey: overlay?.activationKey ?? null,
        },
      });
    }

    handleRevealCompletion({ cardsOverride: cardsAfterAction, completedCardId: activeCard.id });
    return;
  }

  function handleResetItem(item) {
    updateCards((current) =>
      current.map((card) => {
        const matches =
          item.type === "pack"
            ? card.sourcePackId === item.id && !card.deletedAt
            : card.id === item.id;

        if (!matches) return card;

        const resetCard = {
          ...card,
          statusToday: "fresh",
          doneDate: null,
          notYetUntil: null,
          lastShownAt: null,
          paused: false,
          updatedAt: new Date().toISOString(),
        };

        if (!isCommitmentCard(card)) return resetCard;

        return {
          ...resetCard,
          commitmentCheckInPendingDate: null,
          commitmentLifecycleStatus: null,
          commitmentCheckInShownDate: null,
          commitmentCheckInResponse: null,
          commitmentCheckInResponseDate: null,
          commitmentCheckInResponseAt: null,
          commitmentEncouragementRequestedDate: null,
          commitmentEncouragementCompletedDate: null,
          commitmentClosedEarlyDate: null,
          commitmentReviewDueDate: null,
          commitmentReviewResponse: null,
          commitmentReviewResponseDate: null,
          commitmentReviewResponseAt: null,
          commitmentFinalOutcome: null,
        };
      }),
    );
    setMenuOpenId(null);
  }

  return { handleAction, handleResetItem };
}

export default useCardActions;
