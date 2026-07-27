import { applyCardAction, createId, isCommitmentCard } from "../../utils";
import { CARD_EVENT_TYPES } from "../../lib/cardSelection";
import { getCardSelectionSurfaceForOverlay, logCommitmentDebug } from "../launcher";

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
  setupComplete,
  setSetupComplete,
  editingId,
  setEditingId,
  setComposerInitialDraft,
  setIsComposerOpen,
  setHomeSaveConfirmation,
  composerReturnPathRef,
  navigateTo,
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

  function handleSaveCard(formData) {
    const returnPath = composerReturnPathRef.current || "/home";
    if (formData.cardKind === "commitment") {
      const commitmentText = formData.promptText;
      if (!commitmentText.trim()) return;

      const now = new Date().toISOString();
      const newCard = {
        id: createId(),
        cardKind: "commitment",
        promptText: commitmentText,
        dashboardTitle: "Today’s Commitment",
        commitmentReason: formData.commitmentReason ?? "",
        commitmentTimingMode: formData.commitmentTimingMode,
        commitmentStartWindow: formData.commitmentTimingMode,
        commitmentCustomStartTime: formData.commitmentCustomStartTime ?? "",
        commitmentCustomEndTime: formData.commitmentCustomEndTime ?? "",
        commitmentCheckInEnabled: Boolean(formData.commitmentCheckInEnabled),
        commitmentCheckInTime: formData.commitmentCheckInEnabled ? formData.commitmentCheckInTime ?? "" : "",
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
        theme: formData.theme,
        icon: formData.icon,
        statusToday: "fresh",
        createdAt: now,
        updatedAt: now,
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        frequency: "once_daily",
        timingWindows: formData.timingWindows,
        paused: false,
        disliked: false,
        deletedAt: null,
      };

      const isFirstCard = !setupComplete && !editingId;

      if (editingId) {
        updateCards((current) =>
          current.map((card) =>
            card.id === editingId
              ? {
                  ...card,
                  ...newCard,
                  id: card.id,
                  createdAt: card.createdAt ?? now,
                  lastShownAt: card.lastShownAt ?? null,
                  doneDate: card.doneDate ?? null,
                  statusToday: card.statusToday ?? "fresh",
                  commitmentStatusToday: card.commitmentStatusToday ?? null,
                  commitmentDecisionDate: card.commitmentDecisionDate ?? null,
                  commitmentDecisionAt: card.commitmentDecisionAt ?? null,
                  commitmentCheckInPendingDate: card.commitmentCheckInPendingDate ?? null,
                  commitmentLifecycleStatus: card.commitmentLifecycleStatus ?? null,
                  commitmentCheckInShownDate: card.commitmentCheckInShownDate ?? null,
                  commitmentCheckInResponse: card.commitmentCheckInResponse ?? null,
                  commitmentCheckInResponseDate: card.commitmentCheckInResponseDate ?? null,
                  commitmentCheckInResponseAt: card.commitmentCheckInResponseAt ?? null,
                  commitmentEncouragementRequestedDate: card.commitmentEncouragementRequestedDate ?? null,
                  commitmentEncouragementCompletedDate: card.commitmentEncouragementCompletedDate ?? null,
                  commitmentClosedEarlyDate: card.commitmentClosedEarlyDate ?? null,
                  commitmentReviewDueDate: card.commitmentReviewDueDate ?? null,
                  commitmentReviewResponse: card.commitmentReviewResponse ?? null,
                  commitmentReviewResponseDate: card.commitmentReviewResponseDate ?? null,
                  commitmentReviewResponseAt: card.commitmentReviewResponseAt ?? null,
                  commitmentFinalOutcome: card.commitmentFinalOutcome ?? null,
                }
              : card,
          ),
        );
      } else {
        updateCards((current) => [newCard, ...current]);
      }

      logCommitmentDebug("commitment card created", {
        cardId: newCard.id,
        commitmentText: newCard.promptText,
      });
      logCommitmentDebug("selected display time/window", {
        cardId: newCard.id,
        commitmentTimingMode: newCard.commitmentTimingMode,
        commitmentStartWindow: newCard.commitmentStartWindow,
        commitmentCustomStartTime: newCard.commitmentCustomStartTime,
        commitmentCustomEndTime: newCard.commitmentCustomEndTime,
        timingWindows: newCard.timingWindows,
      });

      setEditingId(null);
      setComposerInitialDraft(null);
      setIsComposerOpen(false);
      setHomeSaveConfirmation(commitmentText);

      if (isFirstCard) {
        setSetupComplete(true);
        navigateTo("/home", { replace: true });
        return;
      }

      navigateTo(returnPath);
      return;
    }

    if (Array.isArray(formData.bulkTexts) && formData.bulkTexts.length > 0) {
      const now = new Date().toISOString();
      const newCards = formData.bulkTexts.map((text) => ({
        id: createId(),
        promptText: text,
        dashboardTitle: text,
        theme: formData.theme,
        icon: formData.icon,
        statusToday: "fresh",
        createdAt: now,
        updatedAt: now,
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        frequency: formData.frequency,
        timingWindows: formData.timingWindows,
        paused: false,
        disliked: false,
        deletedAt: null,
      }));

      const isFirstCard = !setupComplete && !editingId;

      updateCards((current) => [...newCards, ...current]);

      setEditingId(null);
      setIsComposerOpen(false);
      setHomeSaveConfirmation(newCards[0]?.promptText ?? "");

      if (isFirstCard) {
        setSetupComplete(true);
        navigateTo("/home", { replace: true });
        return;
      }

      navigateTo(returnPath);
      return;
    }

    const trimmedText = formData.promptText.trim();
    if (!trimmedText) return;

    const isFirstCard = !setupComplete && !editingId;

    if (editingId) {
      updateCards((current) =>
        current.map((card) =>
          card.id === editingId
            ? {
                ...card,
                promptText: trimmedText,
                theme: formData.theme,
                icon: formData.icon,
                frequency: formData.frequency,
                timingWindows: formData.timingWindows,
                updatedAt: new Date().toISOString(),
              }
            : card,
        ),
      );
    } else {
      updateCards((current) => [
        {
          id: createId(),
          cardKind: "personal",
          promptText: trimmedText,
          theme: formData.theme,
          icon: formData.icon,
          statusToday: "fresh",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastShownAt: null,
          notYetUntil: null,
          doneDate: null,
          frequency: formData.frequency,
          timingWindows: formData.timingWindows,
          paused: false,
          deletedAt: null,
        },
        ...current,
      ]);
    }

    setEditingId(null);
    setComposerInitialDraft(null);
    setIsComposerOpen(false);
    setHomeSaveConfirmation(trimmedText);

    if (isFirstCard) {
      setSetupComplete(true);
      navigateTo("/home", { replace: true });
      return;
    }

    navigateTo(returnPath);
  }

  function handleDuplicateCard(cardId) {
    const cardToDuplicate = cards.find((c) => c.id === cardId);
    if (!cardToDuplicate) return;

    const now = new Date().toISOString();
    updateCards((current) => [
      {
        ...cardToDuplicate,
        id: createId(),
        createdAt: now,
        updatedAt: now,
        statusToday: "fresh",
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        commitmentStatusToday: null,
        commitmentDecisionDate: null,
        commitmentDecisionAt: null,
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
        paused: false,
        deletedAt: null,
        sourcePackId: null,
      },
      ...current,
    ]);
    setMenuOpenId(null);
  }

  return { handleAction, handleSaveCard, handleDuplicateCard, handleResetItem };
}

export default useCardActions;
