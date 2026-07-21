import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCardsActions, getCardsStore, resetCardsStoreForTests } from "./cardsStore";

function createLocalStorageStub() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
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
});
