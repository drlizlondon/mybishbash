import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  E2E_TESTER_MODE_KEY,
  isE2EModeEnabled,
  loadE2EAccessProfile,
} from "../app/e2e";

// Nine fields: the seven session fields from the original composition-root
// packet plus syncStatus/syncError, reclassified as connection-lifecycle
// state (see docs/architecture/phase-02b-session-store.md §1).
function buildInitialSessionState() {
  const e2eMode = isE2EModeEnabled();
  const testerStatus = (() => {
    const e2eTesterMode = e2eMode && typeof window !== "undefined" && window.localStorage.getItem(E2E_TESTER_MODE_KEY) === "true";
    return e2eMode ? { is_tester: e2eTesterMode } : null;
  })();

  return {
    session: null,
    authReady: false,
    syncStatus: "loading",
    syncError: "",
    isAdmin: false,
    adminStatus: e2eMode ? "ready" : "idle",
    testerStatus,
    accessProfile: e2eMode ? loadE2EAccessProfile() : null,
    accessStatus: e2eMode ? "granted" : "unknown",
  };
}

// Functional-update wrapper matching useState setter semantics — the
// onAuthStateChange callback relies on setSession((current) => …).
function functionalSetter(set, key) {
  return (next) =>
    set((state) => ({
      [key]: typeof next === "function" ? next(state[key]) : next,
    }));
}

function buildActions(set) {
  return {
    setSession: functionalSetter(set, "session"),
    setAuthReady: functionalSetter(set, "authReady"),
    setSyncStatus: functionalSetter(set, "syncStatus"),
    setSyncError: functionalSetter(set, "syncError"),
    setIsAdmin: functionalSetter(set, "isAdmin"),
    setAdminStatus: functionalSetter(set, "adminStatus"),
    setTesterStatus: functionalSetter(set, "testerStatus"),
    setAccessProfile: functionalSetter(set, "accessProfile"),
    setAccessStatus: functionalSetter(set, "accessStatus"),
  };
}

// Lazy singleton: module evaluation happens before RootRouter's
// consumeSignupHandoffFromUrl / applyLocalNormalPreviewFlag (which mutate
// localStorage flags read by buildInitialSessionState). Creating the store
// at import time would read those flags too early; first use is App's first
// render, matching today's useState initializer timing.
let store = null;

export function getSessionStore() {
  if (!store) {
    store = createStore((set) => ({
      ...buildInitialSessionState(),
      actions: buildActions(set),
    }));
  }
  return store;
}

export function useSessionStore(selector) {
  return useStore(getSessionStore(), selector);
}

export function getSessionActions() {
  return getSessionStore().getState().actions;
}

export function resetSessionStoreForTests() {
  store = null;
}
