import { useEffect, useState } from "react";
import { checkForAppUpdate } from "../../appUpdate";
import { processEventQueue } from "../../eventLog";

function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

// Map your exact myBishBash background hex colors here
const THEME_COLORS = {
  "Minimal": "#F6EBCF",
  "Pop Art": "#F4A261",
  "Soft Bloom": "#FAD2E1",
  "Rainbow": "#E2ECE9",
  "Starry Sky": "#1B263B",
};

// `mood` state itself stays in App(): it flows through buildSharedState /
// applySharedState (the cloud sync engine), which is explicitly out of
// scope for this phase. Persistence belongs to the settings-store action so an
// initial render cannot masquerade as a user mutation. This hook owns only the
// CSS var / theme-color side effect parameterized by App's current mood.
export function useThemePreference(mood) {
  useEffect(() => {
    const activeThemeBackground = THEME_COLORS[mood] || "#F6EBCF";

    document.documentElement.style.setProperty("--app-bg", activeThemeBackground);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", activeThemeBackground);
    }
  }, [mood]);
}

export function useAppUpdateStatus(basePath) {
  const [appUpdate, setAppUpdate] = useState({ checking: true, updateAvailable: false });

  useEffect(() => {
    let cancelled = false;

    checkForAppUpdate(basePath).then((result) => {
      if (!cancelled) setAppUpdate({ ...result, checking: false });
    });

    const interval = window.setInterval(() => {
      checkForAppUpdate(basePath).then((result) => {
        if (!cancelled && result.updateAvailable) setAppUpdate({ ...result, checking: false });
      });
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [basePath]);

  return { appUpdate };
}

export function useOfflineFlag() {
  // Start optimistically online — we only flip to true when the browser fires
  // an explicit 'offline' event. This avoids false positives from unreliable
  // navigator.onLine values in test / sandboxed environments.
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    function handleOnline() {
      debugLog("[NETWORK] App is online. Processing offline event queue...");
      setIsOffline(false);
      void processEventQueue();
    }
    function handleOffline() {
      debugLog("[NETWORK] App is offline.");
      setIsOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOffline, setIsOffline };
}

function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// enableNotifications/disableNotifications stay in App(): they depend on
// session, notificationSettings, syncNotificationPreferences, and logEvent
// — session/sync-adjacent state out of scope for this phase. This hook owns
// only the notificationStatus state itself; App() sets it via the returned
// setter, the same as it did with the local useState before.
export function useNotificationPermission() {
  const [notificationStatus, setNotificationStatus] = useState(() => getNotificationPermission());
  return { notificationStatus, setNotificationStatus };
}
