import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boot = vi.hoisted(() => {
  const state = {
    events: [],
    finishHydration: null,
  };

  return {
    state,
    installGlobalErrorHandlers: vi.fn(() => state.events.push("error-handlers")),
    initDynamicLaunchersFromCache: vi.fn(() => state.events.push("dynamic-launchers")),
    registerServiceWorker: vi.fn(() => state.events.push("service-worker")),
    hydrateLocalData: vi.fn(() => {
      state.events.push("hydration-started");
      return new Promise((resolve) => {
        state.finishHydration = () => {
          state.events.push("hydration-finished");
          resolve();
        };
      });
    }),
    render: vi.fn(() => state.events.push("render")),
    createRoot: vi.fn(() => {
      state.events.push("create-root");
      return { render: boot.render };
    }),
  };
});

vi.mock("react-dom/client", () => ({
  default: { createRoot: boot.createRoot },
}));
vi.mock("./app/router/RootRouter", () => ({ default: () => null }));
vi.mock("./registerServiceWorker", () => ({ registerServiceWorker: boot.registerServiceWorker }));
vi.mock("./lib/dynamicLauncherCache", () => ({ initDynamicLaunchersFromCache: boot.initDynamicLaunchersFromCache }));
vi.mock("./services/errors/reporter", () => ({ installGlobalErrorHandlers: boot.installGlobalErrorHandlers }));
vi.mock("./services/errors/RootErrorBoundary", () => ({ RootErrorBoundary: ({ children }) => children }));
vi.mock("./storage", () => ({ hydrateLocalData: boot.hydrateLocalData }));

describe("application boot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    boot.state.events.length = 0;
    boot.state.finishHydration = null;

    vi.stubGlobal("document", {
      getElementById: vi.fn(() => {
        boot.state.events.push("root-element");
        return {};
      }),
    });
    vi.stubGlobal("performance", {
      mark: vi.fn(() => boot.state.events.push("boot-mark")),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves pre-gate work and does not create the React root until hydration resolves", async () => {
    await import("./main.jsx");

    expect(boot.state.events).toEqual([
      "error-handlers",
      "boot-mark",
      "dynamic-launchers",
      "service-worker",
      "hydration-started",
    ]);
    expect(boot.createRoot).not.toHaveBeenCalled();
    expect(boot.render).not.toHaveBeenCalled();

    boot.state.finishHydration();

    await vi.waitFor(() => expect(boot.render).toHaveBeenCalledOnce());
    expect(boot.state.events).toEqual([
      "error-handlers",
      "boot-mark",
      "dynamic-launchers",
      "service-worker",
      "hydration-started",
      "hydration-finished",
      "root-element",
      "create-root",
      "render",
    ]);
  });
});
