import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { loadActionCards, loadCards, loadDislikedPackCardIds, loadProfile } from "../storage";
import { getPackDislikeKey } from "../lib/launcherState";
import { normalizeCards, resolveTheme } from "../utils";

export function buildInitialCardsState() {
  const profile = loadProfile();
  const hiddenPackCardIdsCompat = loadDislikedPackCardIds();
  const cards = normalizeCards(loadCards(), new Date(), profile.timezone)
    .map((card) => ({ ...card, theme: resolveTheme(card.theme) }))
    .map((card) => card.sourcePackId
      ? { ...card, disliked: hiddenPackCardIdsCompat.includes(getPackDislikeKey(card)) }
      : card);
  return { cards, actionCards: loadActionCards() };
}

function functionalSetter(set, key) {
  return (next) => set((state) => ({
    [key]: typeof next === "function" ? next(state[key]) : next,
  }));
}

function buildActions(set) {
  return {
    setCards: functionalSetter(set, "cards"),
    setActionCards: functionalSetter(set, "actionCards"),
  };
}

let store = null;

export function getCardsStore() {
  if (!store) {
    store = createStore((set) => ({
      ...buildInitialCardsState(),
      actions: buildActions(set),
    }));
  }
  return store;
}

export function useCardsStore(selector) {
  return useStore(getCardsStore(), selector);
}

export function getCardsActions() {
  return getCardsStore().getState().actions;
}

export function resetCardsStoreForTests() {
  store = null;
}
