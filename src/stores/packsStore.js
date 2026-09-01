import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  loadCardPacks,
  loadDislikedPackCardIds,
  loadHiddenLibraryPacks,
  saveCardPacks,
  saveDislikedPackCardIds,
  saveHiddenLibraryPacks,
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

function persistentSetter(set, get, key, persist) {
  return (next) => {
    const value = typeof next === "function" ? next(get()[key]) : next;
    set({ [key]: value });
    persist(value);
  };
}

function buildActions(set, get) {
  return {
    setCardPacks: persistentSetter(set, get, "cardPacks", saveCardPacks),
    setHiddenPackCardIdsCompat: persistentSetter(set, get, "hiddenPackCardIdsCompat", saveDislikedPackCardIds),
    setHiddenLibraryPacks: persistentSetter(set, get, "hiddenLibraryPacks", saveHiddenLibraryPacks),
    setGlobalPacks: functionalSetter(set, "globalPacks"),
  };
}

let store = null;

export function getPacksStore() {
  if (!store) {
    store = createStore((set, get) => ({
      ...buildInitialPacksState(),
      actions: buildActions(set, get),
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
