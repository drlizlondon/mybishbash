import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { loadEventLog, persistEventRecord, saveEventLog } from "../eventLog";

export function buildInitialEventsState() {
  return { events: loadEventLog() };
}

function buildActions(set, get) {
  return {
    setEvents: (next) => {
      const value = typeof next === "function" ? next(get().events) : next;
      set({ events: value });
      saveEventLog(value);
    },
    appendEvent: async (event) => {
      const value = await persistEventRecord(event);
      set({ events: value });
      return value;
    },
  };
}

let store = null;

export function getEventsStore() {
  if (!store) {
    store = createStore((set, get) => ({
      ...buildInitialEventsState(),
      actions: buildActions(set, get),
    }));
  }
  return store;
}

export function useEventsStore(selector) {
  return useStore(getEventsStore(), selector);
}

export function getEventsActions() {
  return getEventsStore().getState().actions;
}

export function resetEventsStoreForTests() {
  store = null;
}
