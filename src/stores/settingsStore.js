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
} from "../storage";
import { DEFAULT_WINDOW_DEFS, resolveTheme } from "../utils";

const LAUNCHER_BEHAVIOR_SETTINGS_KEY = "mybishbash.launcher-behavior-settings.v1";

export function loadExplicitLauncherBehaviorSettings() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LAUNCHER_BEHAVIOR_SETTINGS_KEY) || "{}") || {};
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

function buildActions(set) {
  return {
    setProfile: functionalSetter(set, "profile"),
    setSetupComplete: functionalSetter(set, "setupComplete"),
    setMood: functionalSetter(set, "mood"),
    setHomeScreenVersions: functionalSetter(set, "homeScreenVersions"),
    setLauncherBehaviorSettings: functionalSetter(set, "launcherBehaviorSettings"),
    setExplicitLauncherBehaviorSettings: functionalSetter(set, "explicitLauncherBehaviorSettings"),
    setGlobalInterruptionMode: functionalSetter(set, "globalInterruptionMode"),
    setNotificationSettings: functionalSetter(set, "notificationSettings"),
    setTimingWindowsPrefs: functionalSetter(set, "timingWindowsPrefs"),
  };
}

let store = null;

export function getSettingsStore() {
  if (!store) {
    store = createStore((set) => ({
      ...buildInitialSettingsState(),
      actions: buildActions(set),
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
