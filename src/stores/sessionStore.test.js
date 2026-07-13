import { describe, expect, it, afterEach, afterAll, beforeEach, vi } from "vitest";
import {
  getSessionStore,
  getSessionActions,
  resetSessionStoreForTests,
} from "./sessionStore";
import { ACCESS_TIERS } from "../lib/accessCapabilities";

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

const NINE_FIELDS = [
  "session",
  "authReady",
  "syncStatus",
  "syncError",
  "isAdmin",
  "adminStatus",
  "testerStatus",
  "accessProfile",
  "accessStatus",
];

beforeEach(() => {
  resetSessionStoreForTests();
  window.localStorage.clear();
});

afterEach(() => {
  resetSessionStoreForTests();
  window.localStorage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("sessionStore — initial state", () => {
  it("holds exactly the nine fields (plus actions)", () => {
    const state = getSessionStore().getState();
    const keys = Object.keys(state).filter((key) => key !== "actions");
    expect(keys.sort()).toEqual([...NINE_FIELDS].sort());
  });

  it("normal-mode defaults", () => {
    const state = getSessionStore().getState();
    expect(state.session).toBeNull();
    expect(state.authReady).toBe(false);
    expect(state.syncStatus).toBe("loading");
    expect(state.syncError).toBe("");
    expect(state.isAdmin).toBe(false);
    expect(state.adminStatus).toBe("idle");
    expect(state.testerStatus).toBeNull();
    expect(state.accessProfile).toBeNull();
    expect(state.accessStatus).toBe("unknown");
  });

  it("e2e-mode defaults", () => {
    window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
    resetSessionStoreForTests();
    const state = getSessionStore().getState();
    expect(state.adminStatus).toBe("ready");
    expect(state.testerStatus).toEqual({ is_tester: false });
    expect(state.accessProfile).toEqual({ access_tier: ACCESS_TIERS.FREE_CORE, has_access: true });
    expect(state.accessStatus).toBe("granted");
  });

  it("e2e tester-mode default reflects the tester localStorage flag", () => {
    window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
    window.localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "true");
    resetSessionStoreForTests();
    const state = getSessionStore().getState();
    expect(state.testerStatus).toEqual({ is_tester: true });
  });

  it("respects an e2e access tier override", () => {
    window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
    window.localStorage.setItem("MYBISHBASH_E2E_ACCESS_TIER", ACCESS_TIERS.FOUNDING_ACCESS);
    resetSessionStoreForTests();
    const state = getSessionStore().getState();
    expect(state.accessProfile).toEqual({ access_tier: ACCESS_TIERS.FOUNDING_ACCESS, has_access: true });
  });
});

describe("sessionStore — lazy singleton", () => {
  it("returns the same store instance across calls", () => {
    expect(getSessionStore()).toBe(getSessionStore());
  });

  it("does not read localStorage flags at import time (only on first getSessionStore call)", () => {
    // resetSessionStoreForTests + a fresh flag write, then verify the flag
    // is picked up on first access — proving state isn't constructed until
    // first use, not at module evaluation.
    window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
    const state = getSessionStore().getState();
    expect(state.accessStatus).toBe("granted");
  });
});

describe("sessionStore — action semantics", () => {
  it("value-style updates work like a useState setter", () => {
    const { setSyncStatus } = getSessionActions();
    setSyncStatus("ready");
    expect(getSessionStore().getState().syncStatus).toBe("ready");
  });

  it("functional updates receive current state, like a useState setter", () => {
    const { setAccessStatus } = getSessionActions();
    setAccessStatus("granted");
    setAccessStatus((current) => `${current}-confirmed`);
    expect(getSessionStore().getState().accessStatus).toBe("granted-confirmed");
  });

  it("SIGNED_OUT functional-update path: newSession null on a non-SIGNED_OUT event keeps the current session", () => {
    const { setSession } = getSessionActions();
    const existingSession = { user: { id: "u1" } };
    setSession(existingSession);

    // Mirrors the onAuthStateChange callback body:
    // setSession((currentSession) => { if (newSession) return newSession;
    //   if (event === "SIGNED_OUT") return null; return currentSession; })
    const newSession = null;
    const event = "TOKEN_REFRESHED";
    setSession((currentSession) => {
      if (newSession) return newSession;
      if (event === "SIGNED_OUT") return null;
      return currentSession;
    });

    expect(getSessionStore().getState().session).toBe(existingSession);
  });

  it("SIGNED_OUT functional-update path: a SIGNED_OUT event with no newSession clears the session", () => {
    const { setSession } = getSessionActions();
    setSession({ user: { id: "u1" } });

    const newSession = null;
    const event = "SIGNED_OUT";
    setSession((currentSession) => {
      if (newSession) return newSession;
      if (event === "SIGNED_OUT") return null;
      return currentSession;
    });

    expect(getSessionStore().getState().session).toBeNull();
  });

  it("a functional update that returns a truthy newSession replaces the session regardless of event", () => {
    const { setSession } = getSessionActions();
    setSession({ user: { id: "u1" } });

    const newSession = { user: { id: "u2" } };
    const event = "SIGNED_OUT";
    setSession((currentSession) => {
      if (newSession) return newSession;
      if (event === "SIGNED_OUT") return null;
      return currentSession;
    });

    expect(getSessionStore().getState().session).toEqual({ user: { id: "u2" } });
  });

  it("action identities are referentially stable across getSessionActions() calls", () => {
    const first = getSessionActions();
    const second = getSessionActions();
    for (const key of Object.keys(first)) {
      expect(first[key]).toBe(second[key]);
    }
  });
});
