import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCommitmentActions } from "./useCommitmentActions";
import { logCommitmentDebug } from "../launcher";
import { CARD_EVENT_TYPES } from "../../lib/cardSelection";

vi.mock("../launcher", async (importOriginal) => ({
  ...(await importOriginal()),
  logCommitmentDebug: vi.fn(),
}));

const NOW = "2026-06-01T12:00:00.000Z";
const TODAY = "2026-06-01";

function commitmentCard(overrides = {}) {
  return {
    id: "commitment-card",
    cardKind: "commitment",
    promptText: "go for a walk",
    dashboardTitle: "Today’s Commitment",
    commitmentReason: "Fresh air helps me reset.",
    commitmentTimingMode: "anytime",
    commitmentCheckInEnabled: false,
    commitmentCheckInTime: "",
    commitmentStatusToday: null,
    commitmentLifecycleStatus: null,
    commitmentDecisionDate: null,
    commitmentDecisionAt: null,
    commitmentCheckInPendingDate: null,
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
    theme: "Minimal",
    icon: "heart",
    statusToday: "fresh",
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening", "night"],
    paused: false,
    disliked: false,
    deletedAt: null,
    doneDate: null,
    lastShownAt: null,
    notYetUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    sourcePackId: null,
    ...overrides,
  };
}

/** A synthetic check-in card, as buildCommitmentCheckInCard would produce. */
function checkInCard(parentId = "commitment-card", overrides = {}) {
  return {
    id: "check-in-card",
    cardKind: "commitment_check_in",
    parentCommitmentCardId: parentId,
    promptText: "go for a walk",
    dashboardTitle: "Check-in",
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  const cards = overrides.cards ?? [commitmentCard()];
  return {
    setCards: vi.fn(),
    overlay: { type: "reveal", cardId: "commitment-card", origin: "home", launchSource: null, activationKey: "k1" },
    setOverlay: vi.fn(),
    profile: { timezone: "Europe/London" },
    logEvent: vi.fn(),
    handleRevealCompletion: vi.fn(),
    interceptActivationRef: { current: null },
    // App's real resolveRevealCard: stored card first, else a synthetic
    // lifecycle card. Injected so the hook needs no import from App.jsx.
    resolveRevealCard: vi.fn((list, id) => list.find((card) => card.id === id) ?? null),
    ...overrides,
    cards,
  };
}

beforeEach(() => {
  vi.mocked(logCommitmentDebug).mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => vi.useRealTimers());

describe("handleCommitmentAction", () => {
  it("ignores overlays that are neither reveal nor commitment-motivation", () => {
    const deps = makeDeps({ overlay: { type: "action-card", cardId: "commitment-card" } });
    useCommitmentActions(deps).handleCommitmentAction("commit");
    expect(deps.setCards).not.toHaveBeenCalled();
    expect(deps.logEvent).not.toHaveBeenCalled();
  });

  it("closes the overlay when the card is missing or is not a commitment card", () => {
    const deps = makeDeps({ cards: [] });
    useCommitmentActions(deps).handleCommitmentAction("commit");
    expect(deps.setOverlay).toHaveBeenCalledWith(null);
    expect(deps.setCards).not.toHaveBeenCalled();
  });

  it("shows the motivation screen before a first decline when a reason was saved", () => {
    const deps = makeDeps();
    useCommitmentActions(deps).handleCommitmentAction("decline");

    expect(deps.setOverlay).toHaveBeenCalledTimes(1);
    expect(deps.setOverlay.mock.calls[0][0]).toMatchObject({ type: "commitment-motivation" });
    // The decline itself must NOT be persisted or logged yet.
    expect(deps.setCards).not.toHaveBeenCalled();
    expect(deps.logEvent).not.toHaveBeenCalled();
    expect(logCommitmentDebug).toHaveBeenCalledWith(
      "showing commitment motivation before final decline",
      expect.objectContaining({ cardId: "commitment-card" }),
    );
  });

  it("declines immediately when there is no saved motivation", () => {
    const deps = makeDeps({ cards: [commitmentCard({ commitmentReason: "" })] });
    useCommitmentActions(deps).handleCommitmentAction("decline");
    const [persisted] = deps.setCards.mock.calls;
    expect(persisted[0][0].commitmentStatusToday).toBe("declined");
  });

  it("persists the full made-commitment field set with exact values", () => {
    const deps = makeDeps({ cards: [commitmentCard({ commitmentCheckInEnabled: true })] });
    useCommitmentActions(deps).handleCommitmentAction("commit");
    const [card] = deps.setCards.mock.calls[0][0];

    expect(card).toMatchObject({
      statusToday: "doneToday",
      doneDate: TODAY,
      lastShownAt: NOW,
      notYetUntil: null,
      updatedAt: NOW,
      commitmentStatusToday: "made",
      commitmentLifecycleStatus: "active",
      commitmentDecisionDate: TODAY,
      commitmentDecisionAt: NOW,
      commitmentCheckInPendingDate: TODAY,
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
    });
  });

  it("does not arm a check-in when check-in is disabled", () => {
    const deps = makeDeps();
    useCommitmentActions(deps).handleCommitmentAction("commit");
    expect(deps.setCards.mock.calls[0][0][0].commitmentCheckInPendingDate).toBeNull();
  });

  it("persists the declined field set", () => {
    const deps = makeDeps({ cards: [commitmentCard({ commitmentReason: "" })] });
    useCommitmentActions(deps).handleCommitmentAction("decline");
    expect(deps.setCards.mock.calls[0][0][0]).toMatchObject({
      commitmentStatusToday: "declined",
      commitmentLifecycleStatus: "declined",
      commitmentDecisionDate: TODAY,
      statusToday: "doneToday",
    });
  });

  it("logs the legacy and canonical events with exact payloads on commit", () => {
    const deps = makeDeps();
    useCommitmentActions(deps).handleCommitmentAction("commit");

    expect(deps.logEvent).toHaveBeenCalledTimes(2);
    expect(deps.logEvent.mock.calls[0][0]).toEqual({
      event_type: "commitment_made",
      source_type: "personal",
      card_source: "personal",
      bash_id: "commitment-card",
      bash_title: "go for a walk",
      card_id: "commitment-card",
      card_title: "Today’s Commitment",
      card_text: "go for a walk",
      action_taken: "committed",
      metadata: {
        cardKind: "commitment",
        reason: "Fresh air helps me reset.",
        decisionSource: "commit",
        frequency: "once_daily",
        timingWindows: ["morning", "day", "evening", "night"],
      },
    });
    expect(deps.logEvent.mock.calls[1][0]).toMatchObject({
      event_type: CARD_EVENT_TYPES.COMPLETED,
      metadata: {
        legacyEventType: "commitment_made",
        decisionSource: "commit",
        origin: "home",
        activationKey: "k1",
      },
    });
  });

  it("logs commitment_declined for the decline path", () => {
    const deps = makeDeps({ cards: [commitmentCard({ commitmentReason: "" })] });
    useCommitmentActions(deps).handleCommitmentAction("decline");
    expect(deps.logEvent.mock.calls[0][0]).toMatchObject({
      event_type: "commitment_declined",
      action_taken: "declined",
    });
  });

  it("records the second-screen debug trail for commit_after_all", () => {
    const deps = makeDeps({ overlay: { type: "commitment-motivation", cardId: "commitment-card" } });
    useCommitmentActions(deps).handleCommitmentAction("commit_after_all");
    expect(logCommitmentDebug).toHaveBeenCalledWith(
      "user committed after the second screen",
      expect.objectContaining({ cardId: "commitment-card" }),
    );
    expect(deps.setCards.mock.calls[0][0][0].commitmentStatusToday).toBe("made");
  });

  it("hands off to reveal completion with an acknowledgement message", () => {
    const deps = makeDeps();
    useCommitmentActions(deps).handleCommitmentAction("commit");
    expect(deps.handleRevealCompletion).toHaveBeenCalledWith(expect.objectContaining({
      completedCardId: "commitment-card",
      confirmationActionLabel: "Continue",
    }));
  });
});

describe("handleCommitmentCheckInAction", () => {
  function checkInDeps(overrides = {}) {
    const parent = commitmentCard({
      commitmentStatusToday: "made",
      commitmentLifecycleStatus: "active",
      commitmentDecisionDate: TODAY,
      commitmentDecisionAt: NOW,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: "09:00",
      commitmentCheckInPendingDate: TODAY,
      ...(overrides.parent ?? {}),
    });
    const synthetic = checkInCard();
    return makeDeps({
      cards: [parent],
      overlay: { type: "reveal", cardId: "check-in-card", origin: "home", launchSource: null, activationKey: "k1" },
      resolveRevealCard: vi.fn(() => synthetic),
      ...overrides,
    });
  }

  it("ignores non-reveal overlays", () => {
    const deps = checkInDeps({ overlay: { type: "action-card", cardId: "check-in-card" } });
    useCommitmentActions(deps).handleCommitmentCheckInAction("on_track");
    expect(deps.setCards).not.toHaveBeenCalled();
  });

  it("closes the overlay when the parent commitment is missing", () => {
    const deps = checkInDeps({ cards: [] });
    useCommitmentActions(deps).handleCommitmentCheckInAction("on_track");
    expect(deps.setOverlay).toHaveBeenCalledWith(null);
    expect(deps.setCards).not.toHaveBeenCalled();
  });

  it("persists an on-track response and schedules the review", () => {
    const deps = checkInDeps();
    useCommitmentActions(deps).handleCommitmentCheckInAction("on_track");
    const [card] = deps.setCards.mock.calls[0][0];

    expect(card).toMatchObject({
      lastShownAt: NOW,
      updatedAt: NOW,
      commitmentCheckInResponse: "on_track",
      commitmentCheckInResponseDate: TODAY,
      commitmentCheckInResponseAt: NOW,
      commitmentCheckInShownDate: TODAY,
      commitmentCheckInPendingDate: null,
      commitmentLifecycleStatus: "active",
      commitmentEncouragementRequestedDate: null,
      commitmentClosedEarlyDate: null,
      commitmentReviewDueDate: TODAY,
    });
  });

  it("closes the commitment early and cancels the review", () => {
    const deps = checkInDeps();
    useCommitmentActions(deps).handleCommitmentCheckInAction("closed_early");
    expect(deps.setCards.mock.calls[0][0][0]).toMatchObject({
      commitmentLifecycleStatus: "closed_early",
      commitmentClosedEarlyDate: TODAY,
      commitmentReviewDueDate: null,
    });
  });

  it("requests encouragement when only somewhat on track", () => {
    const deps = checkInDeps();
    useCommitmentActions(deps).handleCommitmentCheckInAction("somewhat_on_track");
    expect(deps.setCards.mock.calls[0][0][0]).toMatchObject({
      commitmentEncouragementRequestedDate: TODAY,
      commitmentEncouragementCompletedDate: null,
      commitmentLifecycleStatus: "active",
    });
  });

  it("logs both events with the check-in metadata", () => {
    const deps = checkInDeps();
    useCommitmentActions(deps).handleCommitmentCheckInAction("on_track");
    expect(deps.logEvent).toHaveBeenCalledTimes(2);
    expect(deps.logEvent.mock.calls[0][0]).toMatchObject({
      event_type: "commitment_check_in",
      card_id: "check-in-card",
      card_title: "Check-in",
      action_taken: "on_track",
      metadata: {
        cardKind: "commitment_check_in",
        parentCommitmentCardId: "commitment-card",
        checkInTime: "09:00",
        response: "on_track",
        phase: "in_progress",
      },
    });
    expect(deps.logEvent.mock.calls[1][0]).toMatchObject({
      metadata: { legacyEventType: "commitment_check_in", origin: "home", activationKey: "k1" },
    });
  });

  it("hands off to reveal completion with the outcome message", () => {
    const deps = checkInDeps();
    useCommitmentActions(deps).handleCommitmentCheckInAction("on_track");
    expect(deps.handleRevealCompletion).toHaveBeenCalledWith(expect.objectContaining({
      completedCardId: "check-in-card",
      confirmationActionLabel: "Continue",
    }));
  });
});
