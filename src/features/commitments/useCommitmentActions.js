import {
  buildEligibleCommitmentLifecycleCards,
  getTodayKey,
  isCommitmentCard,
  isCommitmentCheckInCard,
  isCommitmentEncouragementCard,
  isCommitmentReviewCard,
} from "../../utils";
import { CARD_EVENT_TYPES } from "../../lib/cardSelection";
import {
  buildCommitmentMotivationOverlay,
  getCardSelectionSurfaceForOverlay,
  getCommitmentAcknowledgementMessage,
  getCommitmentCheckInOutcomeMessage,
  getCommitmentReviewOutcomeMessage,
  logCommitmentDebug,
} from "../launcher";

/**
 * Phase 4b — commitment lifecycle action handlers, lifted out of App() unchanged.
 *
 * Bodies are byte-for-byte the App() originals; only the source of their state
 * changed. Every dependency is passed EXPLICITLY in `deps` — the hook never
 * closes over App scope.
 *
 * Deliberately NOT changed here: no async, no persistence-timing change, no
 * direct localStorage access (the Phase 4 D5 ratchet covers this directory).
 */
export function useCommitmentActions({
  cards,
  setCards,
  overlay,
  setOverlay,
  profile,
  logEvent,
  handleRevealCompletion,
  interceptActivationRef,
  resolveRevealCard,
}) {
  function handleCommitmentAction(action) {
    if (!overlay || !["reveal", "commitment-motivation"].includes(overlay.type)) return;

    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard || !isCommitmentCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const savedMotivation = String(activeCard.commitmentReason ?? "").trim();
    if (action === "decline" && overlay.type === "reveal" && savedMotivation) {
      const activation = interceptActivationRef.current;
      const activationKey = overlay?.activationKey || activation?.activationKey || Date.now().toString();
      const nextOverlay = buildCommitmentMotivationOverlay(
        activeCard.id,
        overlay?.launchSource === "fake_launcher" ? overlay.versionId : null,
        activationKey
      );
      logCommitmentDebug("showing commitment motivation before final decline", {
        cardId: activeCard.id,
        commitmentText: activeCard.promptText,
      });
      setOverlay(nextOverlay);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const committed = action === "commit" || action === "commit_after_all";
    const updatedCard = {
      ...activeCard,
      statusToday: "doneToday",
      doneDate: todayKey,
      lastShownAt: now.toISOString(),
      notYetUntil: null,
      updatedAt: now.toISOString(),
      commitmentStatusToday: committed ? "made" : "declined",
      commitmentLifecycleStatus: committed ? "active" : "declined",
      commitmentDecisionDate: todayKey,
      commitmentDecisionAt: now.toISOString(),
      commitmentCheckInPendingDate: committed && activeCard.commitmentCheckInEnabled ? todayKey : null,
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
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    const eventType = committed ? "commitment_made" : "commitment_declined";
    void logEvent({
      event_type: eventType,
      source_type: "personal",
      card_source: "personal",
      bash_id: activeCard.id,
      bash_title: activeCard.promptText,
      card_id: activeCard.id,
      card_title: "Today’s Commitment",
      card_text: activeCard.promptText,
      action_taken: committed ? "committed" : "declined",
      metadata: {
        cardKind: "commitment",
        reason: activeCard.commitmentReason ?? "",
        decisionSource: action,
        frequency: activeCard.frequency,
        timingWindows: activeCard.timingWindows,
      },
    });
    void logEvent({
      event_type: CARD_EVENT_TYPES.COMPLETED,
      source_type: "personal",
      card_source: "personal",
      bash_id: activeCard.id,
      bash_title: activeCard.promptText,
      card_id: activeCard.id,
      card_title: "Today’s Commitment",
      card_text: activeCard.promptText,
      action_taken: committed ? "committed" : "declined",
      metadata: {
        legacyEventType: eventType,
        cardKind: "commitment",
        surface: getCardSelectionSurfaceForOverlay(overlay),
        decisionSource: action,
        frequency: activeCard.frequency,
        timingWindows: activeCard.timingWindows,
        origin: overlay.origin ?? null,
        launchSource: overlay.launchSource ?? null,
        activationKey: overlay?.activationKey ?? null,
      },
    });

    if (action === "commit_after_all") {
      logCommitmentDebug("user committed after the second screen", {
        cardId: activeCard.id,
        commitmentText: activeCard.promptText,
      });
    } else {
      logCommitmentDebug(committed ? "user committed" : "user declined commitment", {
        cardId: activeCard.id,
        commitmentText: activeCard.promptText,
      });
    }

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: getCommitmentAcknowledgementMessage({
        committed,
        checkInEnabled: Boolean(activeCard.commitmentCheckInEnabled),
      }),
      confirmationActionLabel: "Continue",
    });
  }

  function handleCommitmentCheckInAction(response) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = resolveRevealCard(cards, overlay.cardId, profile.timezone);
    if (!activeCard || !isCommitmentCheckInCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const parentCard = cards.find((card) => card.id === activeCard.parentCommitmentCardId);
    if (!parentCard || !isCommitmentCard(parentCard)) {
      setOverlay(null);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const closesEarly = response === "closed_early";
    const needsEncouragement = response === "somewhat_on_track";
    const updatedCard = {
      ...parentCard,
      lastShownAt: now.toISOString(),
      updatedAt: now.toISOString(),
      commitmentCheckInResponse: response,
      commitmentCheckInResponseDate: todayKey,
      commitmentCheckInResponseAt: now.toISOString(),
      commitmentCheckInShownDate: todayKey,
      commitmentCheckInPendingDate: null,
      commitmentLifecycleStatus: closesEarly ? "closed_early" : "active",
      commitmentEncouragementRequestedDate: needsEncouragement ? todayKey : null,
      commitmentEncouragementCompletedDate: needsEncouragement ? null : parentCard.commitmentEncouragementCompletedDate ?? null,
      commitmentClosedEarlyDate: closesEarly ? todayKey : null,
      commitmentReviewDueDate: closesEarly ? null : todayKey,
    };
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    void logEvent({
      event_type: "commitment_check_in",
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Check-in",
      card_text: parentCard.promptText,
      action_taken: response,
      metadata: {
        cardKind: "commitment_check_in",
        parentCommitmentCardId: parentCard.id,
        checkInTime: parentCard.commitmentCheckInTime ?? "",
        response,
        phase: "in_progress",
      },
    });
    void logEvent({
      event_type: CARD_EVENT_TYPES.COMPLETED,
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Check-in",
      card_text: parentCard.promptText,
      action_taken: response,
      metadata: {
        legacyEventType: "commitment_check_in",
        cardKind: "commitment_check_in",
        surface: getCardSelectionSurfaceForOverlay(overlay),
        parentCommitmentCardId: parentCard.id,
        checkInTime: parentCard.commitmentCheckInTime ?? "",
        response,
        phase: "in_progress",
        origin: overlay.origin ?? null,
        launchSource: overlay.launchSource ?? null,
        activationKey: overlay?.activationKey ?? null,
      },
    });

    if (needsEncouragement) {
      const encouragementCard = buildEligibleCommitmentLifecycleCards(cardsAfterAction, now, profile.timezone)
        .find((candidate) => candidate.parentCommitmentCardId === parentCard.id && isCommitmentEncouragementCard(candidate));
      if (encouragementCard) {
        setOverlay({
          ...overlay,
          type: "reveal",
          cardId: encouragementCard.id,
          phase: null,
        });
        return;
      }
    }

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: getCommitmentCheckInOutcomeMessage(response),
      confirmationActionLabel: "Continue",
    });
  }

  function handleCommitmentEncouragementAction() {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = resolveRevealCard(cards, overlay.cardId, profile.timezone);
    if (!activeCard || !isCommitmentEncouragementCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const parentCard = cards.find((card) => card.id === activeCard.parentCommitmentCardId);
    if (!parentCard || !isCommitmentCard(parentCard)) {
      setOverlay(null);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const updatedCard = {
      ...parentCard,
      lastShownAt: now.toISOString(),
      updatedAt: now.toISOString(),
      commitmentEncouragementCompletedDate: todayKey,
      commitmentLifecycleStatus: "active",
      commitmentReviewDueDate: parentCard.commitmentReviewDueDate ?? todayKey,
    };
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    void logEvent({
      event_type: "commitment_encouragement_completed",
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Commitment reminder",
      card_text: activeCard.promptText,
      action_taken: "continued",
      metadata: {
        cardKind: "commitment_encouragement",
        parentCommitmentCardId: parentCard.id,
        phase: "encouragement",
      },
    });

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: "Good.\nKeep this with you.",
      confirmationActionLabel: "Continue",
    });
  }

  function handleCommitmentReviewAction(response) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = resolveRevealCard(cards, overlay.cardId, profile.timezone);
    if (!activeCard || !isCommitmentReviewCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const parentCard = cards.find((card) => card.id === activeCard.parentCommitmentCardId);
    if (!parentCard || !isCommitmentCard(parentCard)) {
      setOverlay(null);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const finalOutcome = response === "did_it"
      ? "completed"
      : response === "nearly_did_it"
        ? "partially_completed"
        : "not_completed";
    const updatedCard = {
      ...parentCard,
      lastShownAt: now.toISOString(),
      updatedAt: now.toISOString(),
      commitmentLifecycleStatus: "reviewed",
      commitmentReviewResponse: response,
      commitmentReviewResponseDate: todayKey,
      commitmentReviewResponseAt: now.toISOString(),
      commitmentFinalOutcome: finalOutcome,
    };
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    void logEvent({
      event_type: "commitment_review",
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Commitment review",
      card_text: parentCard.promptText,
      action_taken: response,
      metadata: {
        cardKind: "commitment_review",
        parentCommitmentCardId: parentCard.id,
        response,
        finalOutcome,
        phase: "review",
      },
    });

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: getCommitmentReviewOutcomeMessage(response),
      confirmationActionLabel: "Continue",
    });
  }

  return {
    handleCommitmentAction,
    handleCommitmentCheckInAction,
    handleCommitmentEncouragementAction,
    handleCommitmentReviewAction,
  };
}

export default useCommitmentActions;
