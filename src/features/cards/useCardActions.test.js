import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCardActions } from "./useCardActions";

const NOW = "2026-06-01T12:00:00.000Z";

function personalCard(overrides = {}) {
  return {
    id: "personal-card",
    cardKind: "personal",
    promptText: "take a steady breath",
    dashboardTitle: "take a steady breath",
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

function commitmentCard(overrides = {}) {
  return personalCard({
    id: "commitment-card",
    cardKind: "commitment",
    promptText: "go for a walk",
    dashboardTitle: "Today’s Commitment",
    commitmentLifecycleStatus: "active",
    commitmentCheckInPendingDate: "2026-06-01",
    commitmentCheckInShownDate: "2026-06-01",
    commitmentCheckInResponse: "on_track",
    commitmentCheckInResponseDate: "2026-06-01",
    commitmentCheckInResponseAt: NOW,
    commitmentEncouragementRequestedDate: "2026-06-01",
    commitmentEncouragementCompletedDate: "2026-06-01",
    commitmentClosedEarlyDate: null,
    commitmentReviewDueDate: "2026-06-01",
    commitmentReviewResponse: "did_it",
    commitmentReviewResponseDate: "2026-06-01",
    commitmentReviewResponseAt: NOW,
    commitmentFinalOutcome: "completed",
    ...overrides,
  });
}

/** Stubbed stores: capture every call so payloads can be asserted exactly. */
function makeDeps(overrides = {}) {
  const setCards = vi.fn();
  const updateCards = vi.fn();
  const setOverlay = vi.fn();
  const setMenuOpenId = vi.fn();
  const logEvent = vi.fn();
  const handleRevealCompletion = vi.fn();
  return {
    cards: [personalCard()],
    setCards,
    updateCards,
    overlay: { type: "reveal", cardId: "personal-card", origin: "home", launchSource: null, activationKey: "k1" },
    setOverlay,
    setMenuOpenId,
    profile: { timezone: "Europe/London" },
    logEvent,
    handleRevealCompletion,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("handleAction", () => {
  it("does nothing when there is no reveal overlay", () => {
    const deps = makeDeps({ overlay: null });
    useCardActions(deps).handleAction("done");
    expect(deps.setCards).not.toHaveBeenCalled();
    expect(deps.logEvent).not.toHaveBeenCalled();
    expect(deps.handleRevealCompletion).not.toHaveBeenCalled();
  });

  it("closes the overlay when the revealed card no longer exists", () => {
    const deps = makeDeps({ cards: [] });
    useCardActions(deps).handleAction("done");
    expect(deps.setOverlay).toHaveBeenCalledWith(null);
    expect(deps.setCards).not.toHaveBeenCalled();
  });

  it("persists the completed card and logs both events with exact payloads", () => {
    const deps = makeDeps();
    useCardActions(deps).handleAction("done");

    const persisted = deps.setCards.mock.calls[0][0];
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe("personal-card");
    expect(persisted[0].statusToday).toBe("doneToday");
    expect(persisted[0].doneDate).toBe("2026-06-01");

    expect(deps.logEvent).toHaveBeenCalledTimes(2);
    expect(deps.logEvent.mock.calls[0][0]).toEqual({
      event_type: "bash_done",
      source_type: "personal",
      card_source: "personal",
      bash_id: "personal-card",
      bash_title: "take a steady breath",
      card_id: "personal-card",
      card_title: "take a steady breath",
      card_text: "take a steady breath",
      pack_id: null,
      action_taken: "completed",
      metadata: {
        frequency: "once_daily",
        timingWindows: ["morning", "day", "evening", "night"],
      },
    });
    expect(deps.logEvent.mock.calls[1][0]).toMatchObject({
      event_type: "card_completed",
      action_taken: "completed",
      metadata: {
        legacyEventType: "bash_done",
        cardKind: "personal",
        selectedAction: "done",
        origin: "home",
        launchSource: null,
        activationKey: "k1",
      },
    });

    expect(deps.handleRevealCompletion).toHaveBeenCalledWith({
      cardsOverride: persisted,
      completedCardId: "personal-card",
    });
  });

  it("maps each action to its legacy and canonical event types", () => {
    for (const [action, legacy, canonical, taken] of [
      ["done", "bash_done", "card_completed", "completed"],
      ["now", "bash_do_now", "card_ignored", "liked"],
      ["later", "bash_not_done", "card_ignored", "dismissed"],
    ]) {
      const deps = makeDeps();
      useCardActions(deps).handleAction(action);
      expect(deps.logEvent.mock.calls[0][0].event_type).toBe(legacy);
      expect(deps.logEvent.mock.calls[0][0].action_taken).toBe(taken);
      expect(deps.logEvent.mock.calls[1][0].event_type).toBe(canonical);
    }
  });

  it("logs only the legacy event for pack cards and attributes them to the library", () => {
    const deps = makeDeps({
      cards: [personalCard({ sourcePackId: "pack-1" })],
    });
    useCardActions(deps).handleAction("done");
    expect(deps.logEvent).toHaveBeenCalledTimes(1);
    expect(deps.logEvent.mock.calls[0][0]).toMatchObject({
      source_type: "library",
      card_source: "library",
      pack_id: "pack-1",
    });
  });
});

describe("handleResetItem", () => {
  function runReset(deps, item) {
    useCardActions(deps).handleResetItem(item);
    const updater = deps.updateCards.mock.calls[0][0];
    return updater(deps.cards);
  }

  it("resets today's state for a single card and closes the row menu", () => {
    const deps = makeDeps({
      cards: [personalCard({
        statusToday: "doneToday",
        doneDate: "2026-06-01",
        notYetUntil: NOW,
        lastShownAt: NOW,
        paused: true,
      })],
    });
    const [card] = runReset(deps, { id: "personal-card", type: "card" });

    expect(card).toMatchObject({
      statusToday: "fresh",
      doneDate: null,
      notYetUntil: null,
      lastShownAt: null,
      paused: false,
      updatedAt: NOW,
    });
    expect(deps.setMenuOpenId).toHaveBeenCalledWith(null);
  });

  it("leaves non-matching cards untouched", () => {
    const other = personalCard({ id: "other-card", statusToday: "doneToday" });
    const deps = makeDeps({ cards: [personalCard(), other] });
    const result = runReset(deps, { id: "personal-card", type: "card" });
    expect(result[1]).toBe(other);
  });

  it("resets every live card in a pack, skipping deleted ones", () => {
    const deleted = personalCard({ id: "c3", sourcePackId: "pack-1", deletedAt: NOW, statusToday: "doneToday" });
    const deps = makeDeps({
      cards: [
        personalCard({ id: "c1", sourcePackId: "pack-1", statusToday: "doneToday" }),
        personalCard({ id: "c2", sourcePackId: "pack-2", statusToday: "doneToday" }),
        deleted,
      ],
    });
    const result = runReset(deps, { id: "pack-1", type: "pack" });
    expect(result[0].statusToday).toBe("fresh");
    expect(result[1].statusToday).toBe("doneToday");
    expect(result[2]).toBe(deleted);
  });

  it("clears the whole commitment lifecycle when resetting a commitment card", () => {
    const deps = makeDeps({ cards: [commitmentCard({ statusToday: "doneToday" })] });
    const [card] = runReset(deps, { id: "commitment-card", type: "card" });

    expect(card).toMatchObject({
      statusToday: "fresh",
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
    });
  });
});
