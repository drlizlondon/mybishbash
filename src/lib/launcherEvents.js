const ANONYMOUS_DEVICE_ID_KEY = "mybishbash.anonymous-device-id.v1";
const SESSION_ID_KEY = "mybishbash.launcher-session-id.v1";

export function getAnonymousDeviceId() {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(ANONYMOUS_DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(ANONYMOUS_DEVICE_ID_KEY, id);
  }
  return id;
}

export function getLauncherSessionId() {
  if (typeof window === "undefined") return "";
  let id = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export function getAppDisplayMode() {
  if (typeof window === "undefined") return "unknown";
  if (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true) {
    return "standalone";
  }
  if (window.matchMedia?.("(display-mode: fullscreen)").matches) return "fullscreen";
  if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return "minimal-ui";
  return "browser";
}

export function getPlatformSignal() {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.userAgentData?.platform || navigator.platform || "unknown";
}

export function buildLauncherEventPayload({ eventType, launcher, route, session, metadata = {} }) {
  const appDisplayMode = getAppDisplayMode();

  return {
    event_type: eventType,
    user_id: session?.user?.id ?? null,
    anonymous_device_id: getAnonymousDeviceId(),
    session_id: getLauncherSessionId(),
    launcher_id: launcher.id,
    launcher_name: launcher.displayName ?? launcher.name,
    launcher_category: launcher.category ?? "unknown",
    route,
    source: "fake_launcher",
    is_standalone: appDisplayMode === "standalone",
    app_display_mode: appDisplayMode,
    platform: getPlatformSignal(),
    metadata,
  };
}
