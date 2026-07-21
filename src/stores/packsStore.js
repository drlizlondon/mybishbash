import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  loadCardPacks,
  loadDislikedPackCardIds,
  loadHiddenLibraryPacks,
} from "../storage";

export function buildInitialPacksState() {
  return {
    cardPacks: loadCardPacks(),
    hiddenPackCardIdsCompat: loadDislikedPackCardIds(),
    hiddenLibraryPacks: loadHiddenLibraryPacks(),
    globalPacks: [],
  };
}

function functionalSetter(set, key) {
  return (next) => set((state) => ({
    [key]: typeof next === "function" ? next(state[key]) : next,
  }));
}

function buildActions(set) {
  return {
    setCardPacks: functionalSetter(set, "cardPacks"),
    setHiddenPackCardIdsCompat: functionalSetter(set, "hiddenPackCardIdsCompat"),
    setHiddenLibraryPacks: functionalSetter(set, "hiddenLibraryPacks"),
    setGlobalPacks: functionalSetter(set, "globalPacks"),
  };
}

let store = null;

export function getPacksStore() {
  if (!store) {
    store = createStore((set) => ({
      ...buildInitialPacksState(),
      actions: buildActions(set),
    }));
  }
  return store;
}

export function usePacksStore(selector) {
  return useStore(getPacksStore(), selector);
}

export function getPacksActions() {
  return getPacksStore().getState().actions;
}

export function resetPacksStoreForTests() {
  store = null;
}
