import { isKnownLauncher, getAllLauncherIds } from "../../lib/launcherRegistry";

const LAUNCH_ENTRY_SURFACES = new Set(["fake_launcher", "mybishbash_home", "unknown"]);

export const LAUNCH_PRIMARY_ACTIONS = {
  CONTINUE_TO_APP: "continue_to_app",
  BACK_TO_HOME: "back_to_home",
};

export const LAUNCH_SESSION_EVENTS = {
  ROUTE_INTERCEPT: "route-intercept",
  APP_TAB_HOME: "app-tab-home",
  SHELL_CARD: "shell-card",
  HOME_CARD: "home-card",
  INTERCEPTION_START: "interception-start",
  RESET_HOME: "reset-home",
};

export function normalizeLaunchSession(source = {}) {
  const entrySurface = LAUNCH_ENTRY_SURFACES.has(source.entrySurface) ? source.entrySurface : "unknown";
  const launcherId = isKnownLauncher(source.launcherId) ? source.launcherId : null;

  if (entrySurface === "fake_launcher" && launcherId) {
    return {
      entrySurface,
      launcherId,
      allowBackHome: false,
      allowedDestinationIds: [launcherId],
      primaryAction: LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP,
      startedAt: source.startedAt ?? new Date().toISOString(),
    };
  }

  if (entrySurface === "mybishbash_home") {
    return {
      entrySurface,
      launcherId: null,
      allowBackHome: true,
      allowedDestinationIds: getAllLauncherIds(),
      primaryAction: LAUNCH_PRIMARY_ACTIONS.BACK_TO_HOME,
      startedAt: source.startedAt ?? new Date().toISOString(),
    };
  }

  return {
    entrySurface: "unknown",
    launcherId: null,
    allowBackHome: false,
    allowedDestinationIds: [],
    primaryAction: LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP,
    startedAt: source.startedAt ?? new Date().toISOString(),
  };
}

export function buildLaunchSession(entrySurface, launcherId = null) {
  return normalizeLaunchSession({ entrySurface, launcherId });
}

export function buildLaunchSessionForRoute(route) {
  if (route?.kind === "intercept" && isKnownLauncher(route.versionId)) {
    return buildLaunchSession("fake_launcher", route.versionId);
  }
  return buildLaunchSession("mybishbash_home");
}

export function getLaunchSessionForOverlay(launchSession, overlay) {
  if (overlay?.launchSource === "fake_launcher" && isKnownLauncher(overlay.versionId)) {
    return normalizeLaunchSession({
      ...launchSession,
      entrySurface: "fake_launcher",
      launcherId: overlay.versionId,
    });
  }
  return normalizeLaunchSession(launchSession);
}

export function isFakeLauncherSession(launchSession) {
  return launchSession?.entrySurface === "fake_launcher";
}

export function launchSessionReducer(session, event) {
  switch (event?.type) {
    case LAUNCH_SESSION_EVENTS.ROUTE_INTERCEPT:
      if (session?.entrySurface === "fake_launcher" && session?.launcherId === event.launcherId) return session;
      return buildLaunchSession("fake_launcher", event.launcherId);
    case LAUNCH_SESSION_EVENTS.APP_TAB_HOME:
      if (session?.entrySurface === "mybishbash_home") return session;
      return buildLaunchSession("mybishbash_home");
    case LAUNCH_SESSION_EVENTS.SHELL_CARD:
    case LAUNCH_SESSION_EVENTS.INTERCEPTION_START:
      return buildLaunchSession("fake_launcher", event.launcherId);
    case LAUNCH_SESSION_EVENTS.HOME_CARD:
    case LAUNCH_SESSION_EVENTS.RESET_HOME:
      return buildLaunchSession("mybishbash_home");
    default:
      return session;
  }
}
