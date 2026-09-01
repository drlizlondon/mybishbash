import { describe, expect, it, afterEach, beforeEach } from "vitest";
import {
  getUiStore,
  getUiActions,
  selectTopOverlay,
  resetUiStoreForTests,
} from "./uiStore";

beforeEach(() => {
  resetUiStoreForTests();
});

afterEach(() => {
  resetUiStoreForTests();
});

describe("uiStore — initial descriptor", () => {
  it("normal boot starts with an empty stack", () => {
    const state = getUiStore(null).getState();
    expect(state.overlayStack).toEqual([]);
    expect(selectTopOverlay(state)).toBeNull();
  });

  it("intercept boot seeds the stack with the route-derived descriptor", () => {
    const initialOverlay = { type: "launcher-preparing", versionId: "safari" };
    const state = getUiStore(initialOverlay).getState();
    expect(state.overlayStack).toEqual([initialOverlay]);
    expect(selectTopOverlay(state)).toEqual(initialOverlay);
  });

  it("only the first call parameterises the store (lazy singleton)", () => {
    getUiStore({ type: "reveal", cardId: "a" });
    const state = getUiStore({ type: "reveal", cardId: "b" }).getState();
    expect(state.overlayStack).toEqual([{ type: "reveal", cardId: "a" }]);
  });
});

describe("uiStore — setOverlay compat", () => {
  it("accepts a plain value and replaces the stack with a single slot", () => {
    getUiStore(null);
    const { setOverlay } = getUiActions();
    setOverlay({ type: "reveal", cardId: "x" });
    expect(selectTopOverlay(getUiStore().getState())).toEqual({ type: "reveal", cardId: "x" });
  });

  it("accepts null and clears the stack", () => {
    getUiStore({ type: "reveal", cardId: "x" });
    const { setOverlay } = getUiActions();
    setOverlay(null);
    expect(getUiStore().getState().overlayStack).toEqual([]);
  });

  it("accepts an updater function receiving the current top-of-stack value", () => {
    getUiStore({ type: "reveal", cardId: "x" });
    const { setOverlay } = getUiActions();
    setOverlay((current) => ({ ...current, cardId: "y" }));
    expect(selectTopOverlay(getUiStore().getState())).toEqual({ type: "reveal", cardId: "y" });
  });

  it("an updater that returns null clears the stack", () => {
    getUiStore({ type: "reveal", cardId: "x" });
    const { setOverlay } = getUiActions();
    setOverlay(() => null);
    expect(getUiStore().getState().overlayStack).toEqual([]);
  });
});

describe("uiStore — selectTopOverlay", () => {
  it("returns null for an empty stack", () => {
    getUiStore(null);
    expect(selectTopOverlay(getUiStore().getState())).toBeNull();
  });

  it("returns the last element of the stack", () => {
    getUiStore(null);
    const { pushOverlay } = getUiActions();
    pushOverlay({ type: "a" });
    pushOverlay({ type: "b" });
    expect(selectTopOverlay(getUiStore().getState())).toEqual({ type: "b" });
  });
});

describe("uiStore — push/pop/clear (unit-level only, unused this phase)", () => {
  it("pushOverlay appends to the stack", () => {
    getUiStore(null);
    const { pushOverlay } = getUiActions();
    pushOverlay({ type: "a" });
    expect(getUiStore().getState().overlayStack).toEqual([{ type: "a" }]);
  });

  it("popOverlay removes the top of the stack", () => {
    getUiStore(null);
    const { pushOverlay, popOverlay } = getUiActions();
    pushOverlay({ type: "a" });
    pushOverlay({ type: "b" });
    popOverlay();
    expect(getUiStore().getState().overlayStack).toEqual([{ type: "a" }]);
  });

  it("clearOverlays empties the stack", () => {
    getUiStore(null);
    const { pushOverlay, clearOverlays } = getUiActions();
    pushOverlay({ type: "a" });
    pushOverlay({ type: "b" });
    clearOverlays();
    expect(getUiStore().getState().overlayStack).toEqual([]);
  });
});

describe("uiStore — action stability", () => {
  it("actions are referentially stable across getUiActions calls", () => {
    getUiStore(null);
    const first = getUiActions();
    const second = getUiActions();
    expect(first.setOverlay).toBe(second.setOverlay);
  });
});
