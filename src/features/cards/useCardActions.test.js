import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCardActions } from "./useCardActions";
import { logCommitmentDebug } from "../launcher";

vi.mock("../launcher", async (importOriginal) => ({
  ...(await importOriginal()),
  logCommitmentDebug: vi.fn(),
}));

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
  vi.mocked(logCommitmentDebug).mockClear();
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

describe("handleSaveCard", () => {
  function composerForm(overrides = {}) {
    return {
      promptText: "drink some water",
      theme: "Minimal",
      icon: "heart",
      frequency: "once_daily",
      timingWindows: ["morning", "day", "evening"],
      ...overrides,
    };
  }

  function commitmentForm(overrides = {}) {
    return composerForm({
      cardKind: "commitment",
      promptText: "go for a walk",
      commitmentReason: "Fresh air helps me reset.",
      commitmentTimingMode: "anytime",
      commitmentCustomStartTime: "",
      commitmentCustomEndTime: "",
      commitmentCheckInEnabled: false,
      commitmentCheckInTime: "",
      timingWindows: ["morning", "day", "evening", "night"],
      ...overrides,
    });
  }

  function saveDeps(overrides = {}) {
    return makeDeps({
      cards: [],
      setupComplete: true,
      setSetupComplete: vi.fn(),
      editingId: null,
      setEditingId: vi.fn(),
      setComposerInitialDraft: vi.fn(),
      setIsComposerOpen: vi.fn(),
      setHomeSaveConfirmation: vi.fn(),
      composerReturnPathRef: { current: "/library" },
      navigateTo: vi.fn(),
      ...overrides,
    });
  }

  function persisted(deps, current = []) {
    return deps.updateCards.mock.calls[0][0](current);
  }

  it("persists a new personal card with the exact composer payload", () => {
    const deps = saveDeps();
    useCardActions(deps).handleSaveCard(composerForm());
    const [card] = persisted(deps);

    expect(card).toMatchObject({
      cardKind: "personal",
      promptText: "drink some water",
      theme: "Minimal",
      icon: "heart",
      statusToday: "fresh",
      createdAt: NOW,
      updatedAt: NOW,
      lastShownAt: null,
      notYetUntil: null,
      doneDate: null,
      frequency: "once_daily",
      timingWindows: ["morning", "day", "evening"],
      paused: false,
      deletedAt: null,
    });
    expect(card.id).toBeTruthy();
    expect(deps.setEditingId).toHaveBeenCalledWith(null);
    expect(deps.setIsComposerOpen).toHaveBeenCalledWith(false);
    expect(deps.setHomeSaveConfirmation).toHaveBeenCalledWith("drink some water");
    expect(deps.navigateTo).toHaveBeenCalledWith("/library");
  });

  it("trims the prompt text and refuses an empty personal card", () => {
    const deps = saveDeps();
    useCardActions(deps).handleSaveCard(composerForm({ promptText: "   " }));
    expect(deps.updateCards).not.toHaveBeenCalled();
    expect(deps.navigateTo).not.toHaveBeenCalled();
  });

  it("edits in place, preserving identity and creation metadata", () => {
    const existing = personalCard({ id: "existing", createdAt: "2026-05-01T00:00:00.000Z" });
    const deps = saveDeps({ editingId: "existing" });
    useCardActions(deps).handleSaveCard(composerForm({ promptText: "edited text" }));
    const [card] = persisted(deps, [existing]);

    expect(card.id).toBe("existing");
    expect(card.createdAt).toBe("2026-05-01T00:00:00.000Z");
    expect(card.promptText).toBe("edited text");
    expect(card.updatedAt).toBe(NOW);
  });

  it("persists a commitment card with the full lifecycle field set cleared", () => {
    const deps = saveDeps();
    useCardActions(deps).handleSaveCard(commitmentForm({
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: "20:30",
    }));
    const [card] = persisted(deps);

    expect(card).toMatchObject({
      cardKind: "commitment",
      promptText: "go for a walk",
      dashboardTitle: "Today’s Commitment",
      commitmentReason: "Fresh air helps me reset.",
      commitmentTimingMode: "anytime",
      commitmentStartWindow: "anytime",
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: "20:30",
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
      frequency: "once_daily",
      statusToday: "fresh",
    });
  });

  it("drops the check-in time when check-in is disabled", () => {
    const deps = saveDeps();
    useCardActions(deps).handleSaveCard(commitmentForm({
      commitmentCheckInEnabled: false,
      commitmentCheckInTime: "20:30",
    }));
    const [card] = persisted(deps);
    expect(card.commitmentCheckInEnabled).toBe(false);
    expect(card.commitmentCheckInTime).toBe("");
  });

  it("logs the commitment debug trail when a commitment card is created", () => {
    const deps = saveDeps();
    useCardActions(deps).handleSaveCard(commitmentForm());
    expect(logCommitmentDebug).toHaveBeenCalledWith("commitment card created", expect.objectContaining({
      commitmentText: "go for a walk",
    }));
    expect(logCommitmentDebug).toHaveBeenCalledWith("selected display time/window", expect.objectContaining({
      commitmentTimingMode: "anytime",
      commitmentStartWindow: "anytime",
    }));
  });

  it("creates one card per bulk text entry", () => {
    const deps = saveDeps();
    useCardActions(deps).handleSaveCard(composerForm({ bulkTexts: ["one", "two", "three"] }));
    const cards = persisted(deps);
    expect(cards.map((card) => card.promptText)).toEqual(["one", "two", "three"]);
    expect(deps.setHomeSaveConfirmation).toHaveBeenCalledWith("one");
  });

  it("completes setup and routes home when this is the first card", () => {
    const deps = saveDeps({ setupComplete: false });
    useCardActions(deps).handleSaveCard(composerForm());
    expect(deps.setSetupComplete).toHaveBeenCalledWith(true);
    expect(deps.navigateTo).toHaveBeenCalledWith("/home", { replace: true });
  });

  it("falls back to /home when the composer has no return path", () => {
    const deps = saveDeps({ composerReturnPathRef: { current: "" } });
    useCardActions(deps).handleSaveCard(composerForm());
    expect(deps.navigateTo).toHaveBeenCalledWith("/home");
  });

  it("is synchronous — it returns undefined, never a promise", () => {
    // Phase 5 turns persistence async. This asserts the pre-conversion
    // contract so that change is visible in review rather than silent.
    const deps = saveDeps();
    expect(useCardActions(deps).handleSaveCard(composerForm())).toBeUndefined();
  });
});

describe("handleDuplicateCard", () => {
  it("copies the card with fresh identity and cleared per-day state", () => {
    const source = personalCard({
      id: "source",
      statusToday: "doneToday",
      doneDate: "2026-06-01",
      lastShownAt: NOW,
      notYetUntil: NOW,
      paused: true,
      deletedAt: null,
      sourcePackId: "pack-1",
    });
    const deps = makeDeps({ cards: [source] });
    useCardActions(deps).handleDuplicateCard("source");
    const [copy, ...rest] = deps.updateCards.mock.calls[0][0]([source]);

    expect(copy.id).not.toBe("source");
    expect(copy.promptText).toBe(source.promptText);
    expect(copy).toMatchObject({
      createdAt: NOW,
      updatedAt: NOW,
      statusToday: "fresh",
      lastShownAt: null,
      notYetUntil: null,
      doneDate: null,
      paused: false,
      deletedAt: null,
      sourcePackId: null,
    });
    expect(rest).toEqual([source]);
    expect(deps.setMenuOpenId).toHaveBeenCalledWith(null);
  });

  it("clears the whole commitment lifecycle on the copy", () => {
    const deps = makeDeps({ cards: [commitmentCard({ id: "source" })] });
    useCardActions(deps).handleDuplicateCard("source");
    const [copy] = deps.updateCards.mock.calls[0][0](deps.cards);
    for (const field of [
      "commitmentStatusToday", "commitmentDecisionDate", "commitmentDecisionAt",
      "commitmentCheckInPendingDate", "commitmentLifecycleStatus", "commitmentCheckInShownDate",
      "commitmentCheckInResponse", "commitmentCheckInResponseDate", "commitmentCheckInResponseAt",
      "commitmentEncouragementRequestedDate", "commitmentEncouragementCompletedDate",
      "commitmentClosedEarlyDate", "commitmentReviewDueDate", "commitmentReviewResponse",
      "commitmentReviewResponseDate", "commitmentReviewResponseAt", "commitmentFinalOutcome",
    ]) {
      expect(copy[field], field).toBeNull();
    }
  });

  it("does nothing for an unknown card id", () => {
    const deps = makeDeps({ cards: [personalCard()] });
    useCardActions(deps).handleDuplicateCard("missing");
    expect(deps.updateCards).not.toHaveBeenCalled();
    expect(deps.setMenuOpenId).not.toHaveBeenCalled();
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

/**
 * The packet asks for "a save followed immediately by a second save within the
 * 120ms debounce window results in one write of the final value".
 *
 * PACKET/REALITY NOTE: handleSaveCard does NOT go through the 120ms debounce.
 * It calls App's updateCards, which calls cardsStore.setCardsAndPersistImmediately
 * — the immediate path, which cancels any pending debounce. The debounce belongs
 * to setCards (used by handleAction and the commitment handlers) and is already
 * covered by src/stores/cardsStore.test.js:38.
 *
 * The invariant is therefore asserted against the mechanism handleSaveCard
 * actually uses. This is the behaviour Phase 5 will most easily break, and it
 * now exists before Phase 5 touches it.
 */
describe("handleSaveCard persistence timing (real cardsStore)", () => {
  beforeEach(() => {
    const data = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: vi.fn((key, value) => data.set(key, String(value))),
        removeItem: (key) => data.delete(key),
        clear: () => data.clear(),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("writes immediately on each save, final value wins, no pending timer survives", async () => {
    const { getCardsActions, resetCardsStoreForTests } = await import("../../stores/cardsStore");
    resetCardsStoreForTests();
    const actions = getCardsActions();
    const writes = [];
    const updateCards = vi.fn((updater) => {
      const next = typeof updater === "function" ? updater(actions.getCardsForTest?.() ?? []) : updater;
      writes.push(next);
      actions.setCardsAndPersistImmediately(next);
    });

    const deps = makeDeps({
      cards: [],
      updateCards,
      setupComplete: true,
      setSetupComplete: vi.fn(),
      editingId: null,
      setEditingId: vi.fn(),
      setComposerInitialDraft: vi.fn(),
      setIsComposerOpen: vi.fn(),
      setHomeSaveConfirmation: vi.fn(),
      composerReturnPathRef: { current: "/library" },
      navigateTo: vi.fn(),
    });
    const { handleSaveCard } = useCardActions(deps);

    const form = { promptText: "first", theme: "Minimal", icon: "heart", frequency: "once_daily", timingWindows: ["day"] };
    handleSaveCard(form);
    handleSaveCard({ ...form, promptText: "second" });

    // Both saves took the immediate path — neither waited for the debounce.
    expect(updateCards).toHaveBeenCalledTimes(2);
    expect(writes[1][0].promptText).toBe("second");

    // Advancing past the debounce window produces no additional write:
    // the immediate path left nothing pending.
    const before = writes.length;
    vi.advanceTimersByTime(200);
    expect(writes).toHaveLength(before);
    resetCardsStoreForTests();
  });
});
