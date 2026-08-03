import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCardsActions, getCardsStore, resetCardsStoreForTests } from "./cardsStore";

function createLocalStorageStub() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}
vi.stubGlobal("window", { localStorage: createLocalStorageStub() });
beforeEach(() => { resetCardsStoreForTests(); window.localStorage.clear(); });
afterEach(() => resetCardsStoreForTests());
afterAll(() => vi.unstubAllGlobals());

describe("cardsStore", () => {
  it("preserves boot ordering by applying stored dislikes after card normalization", () => {
    const card = { id: "card-1", sourcePackId: "pack-1", promptText: "Pack card", title: "Pack card", theme: "Paper Cut" };
    window.localStorage.setItem("mybishbash.cards.v1", JSON.stringify([card]));
    window.localStorage.setItem("mybishbash.disliked-pack-card-ids.v1", JSON.stringify(["pack-1:Pack card"]));
    const [loaded] = getCardsStore().getState().cards;
    expect(loaded).toMatchObject({ id: "card-1", theme: "Soft Bloom", disliked: true });
  });

  it("loads action cards and supports functional updates", () => {
    window.localStorage.setItem("mybishbash.action-cards.v1", JSON.stringify([{ id: "action-1" }]));
    const actions = getCardsActions();
    expect(getCardsStore().getState().actionCards).toEqual(expect.arrayContaining([{ id: "action-1" }]));
    actions.setCards([{ id: "one" }]);
    actions.setCards((current) => [...current, { id: "two" }]);
    actions.setActionCards((current) => [...current, { id: "action-2" }]);
    expect(getCardsStore().getState().cards).toEqual([{ id: "one" }, { id: "two" }]);
    expect(getCardsStore().getState().actionCards.at(-1)).toEqual({ id: "action-2" });
  });

  it("debounces cards persistence for 120ms and writes only the latest value", () => {
    vi.useFakeTimers();
    const actions = getCardsActions();
    window.localStorage.setItem.mockClear();
    actions.setCards([{ id: "one" }]);
    actions.setCards([{ id: "two" }]);
    actions.setCards([{ id: "three" }]);
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(119);
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "mybishbash.cards.v1",
      JSON.stringify([{ id: "three" }]),
    );
    vi.useRealTimers();
  });

  it("persists action cards immediately", () => {
    const actions = getCardsActions();
    window.localStorage.setItem.mockClear();
    actions.setActionCards([{ id: "action" }]);
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "mybishbash.action-cards.v1",
      JSON.stringify([{ id: "action" }]),
    );
  });

  it("does not persist a byte-identical card normalization", async () => {
    const actions = getCardsActions();
    window.localStorage.setItem.mockClear();

    actions.setCards((cards) => cards.map((card) => ({ ...card })));
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it("supports the reload-safe immediate cards write path", () => {
    vi.useFakeTimers();
    const actions = getCardsActions();
    window.localStorage.setItem.mockClear();
    actions.setCards([{ id: "pending" }]);
    actions.setCardsAndPersistImmediately([{ id: "immediate" }]);
    expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "mybishbash.cards.v1",
      JSON.stringify([{ id: "immediate" }]),
    );
    vi.advanceTimersByTime(120);
    expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
