import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  loadGlobalInterruptionMode,
  loadHomeScreenVersions,
  loadLauncherBehaviorSettings,
  loadMood,
  loadNotificationSettings,
  loadProfile,
  loadSetupComplete,
  loadTimingWindowsPrefs,
  saveGlobalInterruptionMode,
  saveHomeScreenVersions,
  saveLauncherBehaviorSettings,
  saveNotificationSettings,
  saveProfile,
  saveSetupComplete,
  saveTimingWindowsPrefs,
  getStorageItem,
} from "../storage";
import { DEFAULT_WINDOW_DEFS, resolveTheme, setWindowDefs } from "../utils";

const LAUNCHER_BEHAVIOR_SETTINGS_KEY = "mybishbash.launcher-behavior-settings.v1";

export function loadExplicitLauncherBehaviorSettings() {
  if (typeof window === "undefined") return {};
  try {
    // Reads the RAW stored value (no defaults merge) — unlike
    // loadLauncherBehaviorSettings — but through the same funnel, so the
    // legacy-prefix shim applies here exactly as it does everywhere else.
    return JSON.parse(getStorageItem(LAUNCHER_BEHAVIOR_SETTINGS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function buildInitialSettingsState() {
  return {
    profile: loadProfile(),
    setupComplete: loadSetupComplete(),
    mood: resolveTheme(loadMood()),
    homeScreenVersions: loadHomeScreenVersions(),
    launcherBehaviorSettings: loadLauncherBehaviorSettings(),
    explicitLauncherBehaviorSettings: loadExplicitLauncherBehaviorSettings(),
    globalInterruptionMode: loadGlobalInterruptionMode(),
    notificationSettings: loadNotificationSettings(),
    timingWindowsPrefs: loadTimingWindowsPrefs() ?? DEFAULT_WINDOW_DEFS,
  };
}

function functionalSetter(set, key) {
  return (next) =>
    set((state) => ({
      [key]: typeof next === "function" ? next(state[key]) : next,
    }));
}

function persistentSetter(set, get, key, persist, afterPersist) {
  return (next) => {
    const value = typeof next === "function" ? next(get()[key]) : next;
    set({ [key]: value });
    persist(value);
    afterPersist?.(value);
  };
}

function buildActions(set, get) {
  return {
    setProfile: persistentSetter(set, get, "profile", saveProfile),
    setSetupComplete: persistentSetter(set, get, "setupComplete", saveSetupComplete),
    setMood: functionalSetter(set, "mood"),
    setHomeScreenVersions: persistentSetter(set, get, "homeScreenVersions", saveHomeScreenVersions),
    setLauncherBehaviorSettings: persistentSetter(set, get, "launcherBehaviorSettings", saveLauncherBehaviorSettings),
    setExplicitLauncherBehaviorSettings: functionalSetter(set, "explicitLauncherBehaviorSettings"),
    setGlobalInterruptionMode: persistentSetter(set, get, "globalInterruptionMode", saveGlobalInterruptionMode),
    setNotificationSettings: persistentSetter(set, get, "notificationSettings", saveNotificationSettings),
    setTimingWindowsPrefs: persistentSetter(set, get, "timingWindowsPrefs", saveTimingWindowsPrefs, setWindowDefs),
  };
}

let store = null;

export function getSettingsStore() {
  if (!store) {
    store = createStore((set, get) => ({
      ...buildInitialSettingsState(),
      actions: buildActions(set, get),
    }));
  }
  return store;
}

export function useSettingsStore(selector) {
  return useStore(getSettingsStore(), selector);
}

export function getSettingsActions() {
  return getSettingsStore().getState().actions;
}

export function resetSettingsStoreForTests() {
  store = null;
}
