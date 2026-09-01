import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPacksActions, getPacksStore, resetPacksStoreForTests } from "./packsStore";

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

beforeEach(() => {
  resetPacksStoreForTests();
  window.localStorage.clear();
});
afterEach(() => resetPacksStoreForTests());
afterAll(() => vi.unstubAllGlobals());

describe("packsStore", () => {
  it("loads persisted pack slices and keeps global packs in memory only", () => {
    window.localStorage.setItem("mybishbash.card-packs.v1", JSON.stringify([{ id: "pack-1" }]));
    window.localStorage.setItem("mybishbash.hidden-library-packs.v1", JSON.stringify(["pack-2"]));
    window.localStorage.setItem("mybishbash.disliked-pack-card-ids.v1", JSON.stringify(["pack-1:card-1"]));
    const state = getPacksStore().getState();
    expect(state.cardPacks).toEqual([{ id: "pack-1" }]);
    expect(state.hiddenLibraryPacks).toEqual(["pack-2"]);
    expect(state.hiddenPackCardIdsCompat).toEqual(["pack-1:card-1"]);
    expect(state.globalPacks).toEqual([]);
  });

  it("supports value and functional updates with stable actions", () => {
    const first = getPacksActions();
    first.setCardPacks([{ id: "one" }]);
    first.setCardPacks((current) => [...current, { id: "two" }]);
    first.setHiddenLibraryPacks(["hidden"]);
    first.setHiddenPackCardIdsCompat(["card"]);
    first.setGlobalPacks([{ id: "global" }]);
    expect(getPacksStore().getState()).toMatchObject({
      cardPacks: [{ id: "one" }, { id: "two" }],
      hiddenLibraryPacks: ["hidden"],
      hiddenPackCardIdsCompat: ["card"],
      globalPacks: [{ id: "global" }],
    });
    expect(getPacksActions()).toBe(first);
  });

  it("persists owned slices but never persists global packs", () => {
    const actions = getPacksActions();
    window.localStorage.setItem.mockClear();
    actions.setCardPacks([{ id: "pack" }]);
    actions.setHiddenPackCardIdsCompat(["pack:card"]);
    actions.setHiddenLibraryPacks(["hidden"]);
    actions.setGlobalPacks([{ id: "remote" }]);
    expect(window.localStorage.setItem.mock.calls).toEqual([
      ["mybishbash.card-packs.v1", JSON.stringify([{ id: "pack" }])],
      ["mybishbash.disliked-pack-card-ids.v1", JSON.stringify(["pack:card"])],
      ["mybishbash.hidden-library-packs.v1", JSON.stringify(["hidden"])],
    ]);
  });
});
