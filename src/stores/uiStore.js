import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

// Descriptor stack with single-slot semantics preserved (Phase 3 Ruling R2,
// docs/architecture/phase-03-feature-modules.md). Depth is never > 1 this
// phase — push/pop/clear are exported but unused; the stack shape is
// architecture for Phase 4+, not new behaviour.
function buildActions(set) {
  return {
    setOverlay: (next) =>
      set((state) => {
        const current = state.overlayStack[state.overlayStack.length - 1] ?? null;
        const value = typeof next === "function" ? next(current) : next;
        return { overlayStack: value ? [value] : [] };
      }),
    pushOverlay: (descriptor) =>
      set((state) => ({ overlayStack: [...state.overlayStack, descriptor] })),
    popOverlay: () =>
      set((state) => ({ overlayStack: state.overlayStack.slice(0, -1) })),
    clearOverlays: () => set({ overlayStack: [] }),
  };
}

// Lazy singleton, parameterised: created on first call from App's render
// with the route-derived initial descriptor, so the intercept boot chain
// (Phase 2 invariant 3) stays synchronous and unchanged.
let store = null;

export function getUiStore(initialOverlay = null) {
  if (!store) {
    store = createStore((set) => ({
      overlayStack: initialOverlay ? [initialOverlay] : [],
      actions: buildActions(set),
    }));
  }
  return store;
}

export function useUiStore(selector) {
  return useStore(getUiStore(), selector);
}

export function getUiActions() {
  return getUiStore().getState().actions;
}

export function selectTopOverlay(state) {
  return state.overlayStack[state.overlayStack.length - 1] ?? null;
}

export function resetUiStoreForTests() {
  store = null;
}
