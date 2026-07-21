import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInitialSettingsState,
  getSettingsActions,
  getSettingsStore,
  resetSettingsStoreForTests,
} from "./settingsStore";

function createLocalStorageStub() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}

vi.stubGlobal("window", { localStorage: createLocalStorageStub() });

const SETTINGS_FIELDS = [
  "profile",
  "setupComplete",
  "mood",
  "homeScreenVersions",
  "launcherBehaviorSettings",
  "explicitLauncherBehaviorSettings",
  "globalInterruptionMode",
  "notificationSettings",
  "timingWindowsPrefs",
];

beforeEach(() => {
  resetSettingsStoreForTests();
  window.localStorage.clear();
});

afterEach(() => {
  resetSettingsStoreForTests();
  window.localStorage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("settingsStore — initial state", () => {
  it("holds exactly the nine settings fields plus actions", () => {
    const keys = Object.keys(getSettingsStore().getState()).filter((key) => key !== "actions");
    expect(keys.sort()).toEqual([...SETTINGS_FIELDS].sort());
  });

  it("matches the settings initializer for normal defaults", () => {
    expect(getSettingsStore().getState()).toMatchObject(buildInitialSettingsState());
  });

  it("loads persisted values, including explicit launcher settings and timing windows", () => {
    const timingWindows = [
      { id: "morning", start: 5, end: 11 },
      { id: "day", start: 11, end: 17 },
      { id: "evening", start: 17, end: 22 },
      { id: "night", start: 22, end: 5 },
    ];
    window.localStorage.setItem("mybishbash.profile.v1", JSON.stringify({ name: "Liz", timezone: "UTC" }));
    window.localStorage.setItem("mybishbash.setup-complete.v1", "true");
    window.localStorage.setItem("mybishbash.mood.v1", "Soft Bloom");
    window.localStorage.setItem("mybishbash.launcher-behavior-settings.v1", JSON.stringify({ instagram: { interruptionPaused: true } }));
    window.localStorage.setItem("mybishbash.global-interruption-mode.v1", "true");
    window.localStorage.setItem("mybishbash.notifications.v1", JSON.stringify({ enabled: true, notificationsPerDay: 2 }));
    window.localStorage.setItem("mybishbash.timing-windows-prefs.v1", JSON.stringify(timingWindows));

    const state = getSettingsStore().getState();
    expect(state.profile).toMatchObject({ name: "Liz", timezone: "UTC" });
    expect(state.setupComplete).toBe(true);
    expect(state.mood).toBe("Soft Bloom");
    expect(state.explicitLauncherBehaviorSettings).toEqual({ instagram: { interruptionPaused: true } });
    expect(state.globalInterruptionMode).toBe(true);
    expect(state.notificationSettings).toEqual({ enabled: true, notificationsPerDay: 2 });
    expect(state.timingWindowsPrefs).toEqual(timingWindows);
  });
});

describe("settingsStore — action semantics", () => {
  it("supports value updates", () => {
    getSettingsActions().setMood("Bold");
    expect(getSettingsStore().getState().mood).toBe("Bold");
  });

  it("supports functional updates for every action", () => {
    const actions = getSettingsActions();
    for (const field of SETTINGS_FIELDS) {
      const actionName = `set${field[0].toUpperCase()}${field.slice(1)}`;
      const before = getSettingsStore().getState()[field];
      actions[actionName]((current) => ({ before: current }));
      expect(getSettingsStore().getState()[field]).toEqual({ before });
    }
  });

  it("keeps action identities stable", () => {
    const first = getSettingsActions();
    const second = getSettingsActions();
    for (const key of Object.keys(first)) expect(first[key]).toBe(second[key]);
  });

  it("persists each owning slice synchronously with the current payload format", () => {
    const actions = getSettingsActions();
    window.localStorage.setItem.mockClear();

    actions.setProfile({ name: "Liz" });
    actions.setSetupComplete(true);
    actions.setHomeScreenVersions({ safari: { id: "safari" } });
    actions.setLauncherBehaviorSettings({ safari: { appEnabled: true } });
    actions.setGlobalInterruptionMode(false);
    actions.setNotificationSettings({ enabled: true, notificationsPerDay: 2 });
    const timingWindows = [
      { id: "morning", start: 5, end: 11 },
      { id: "day", start: 11, end: 17 },
      { id: "evening", start: 17, end: 22 },
      { id: "night", start: 22, end: 5 },
    ];
    actions.setTimingWindowsPrefs(timingWindows);

    expect(window.localStorage.setItem.mock.calls).toEqual([
      ["mybishbash.profile.v1", JSON.stringify({ name: "Liz" })],
      ["mybishbash.setup-complete.v1", "true"],
      ["mybishbash.home-screen-versions.v1", JSON.stringify({ safari: { id: "safari" } })],
      ["mybishbash.launcher-behavior-settings.v1", JSON.stringify({ safari: { appEnabled: true } })],
      ["mybishbash.global-interruption-mode.v1", "false"],
      ["mybishbash.notifications.v1", JSON.stringify({ enabled: true, notificationsPerDay: 2 })],
      ["mybishbash.timing-windows-prefs.v1", JSON.stringify(timingWindows)],
    ]);
  });

  it("does not add persistence for mood or explicit launcher settings", () => {
    const actions = getSettingsActions();
    window.localStorage.setItem.mockClear();
    actions.setMood("Rainbow");
    actions.setExplicitLauncherBehaviorSettings({ safari: { appEnabled: true } });
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });
});
