import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  loadActionCards,
  loadCards,
  loadDislikedPackCardIds,
  loadProfile,
  saveActionCards,
  saveCards,
} from "../storage";
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

let cardsSaveTimer = null;

function buildActions(set, get) {
  const cancelPendingCardsPersist = () => {
    if (cardsSaveTimer) globalThis.clearTimeout(cardsSaveTimer);
    cardsSaveTimer = null;
  };
  return {
    setCards: (next) => {
      const current = get().cards;
      const value = typeof next === "function" ? next(current) : next;
      if (JSON.stringify(value) === JSON.stringify(current)) return;
      set({ cards: value });
      if (cardsSaveTimer) globalThis.clearTimeout(cardsSaveTimer);
      cardsSaveTimer = globalThis.setTimeout(() => {
        saveCards(value);
        cardsSaveTimer = null;
      }, 120);
    },
    setActionCards: (next) => {
      const value = typeof next === "function" ? next(get().actionCards) : next;
      set({ actionCards: value });
      saveActionCards(value);
    },
    setCardsAndPersistImmediately: (next) => {
      const value = typeof next === "function" ? next(get().cards) : next;
      set({ cards: value });
      cancelPendingCardsPersist();
      saveCards(value);
    },
  };
}

let store = null;

export function getCardsStore() {
  if (!store) {
    store = createStore((set, get) => ({
      ...buildInitialCardsState(),
      actions: buildActions(set, get),
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
  if (cardsSaveTimer) globalThis.clearTimeout(cardsSaveTimer);
  cardsSaveTimer = null;
  store = null;
}
