import { describe, expect, it, vi } from "vitest";
import {
  LAUNCH_PRIMARY_ACTIONS,
  LAUNCH_SESSION_EVENTS,
  buildLaunchSession,
  buildLaunchSessionForRoute,
  getLaunchSessionForOverlay,
  isFakeLauncherSession,
  launchSessionReducer,
  normalizeLaunchSession,
} from "./launchSession";

describe("launch session domain", () => {
  it("normalizes fake-launcher, home, and unknown sessions", () => {
    expect(normalizeLaunchSession({ entrySurface: "fake_launcher", launcherId: "safari", startedAt: "now" })).toEqual({
      entrySurface: "fake_launcher", launcherId: "safari", allowBackHome: false,
      allowedDestinationIds: ["safari"], primaryAction: LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP, startedAt: "now",
    });
    expect(normalizeLaunchSession({ entrySurface: "mybishbash_home", launcherId: "safari", startedAt: "now" })).toMatchObject({
      entrySurface: "mybishbash_home", launcherId: null, allowBackHome: true,
      primaryAction: LAUNCH_PRIMARY_ACTIONS.BACK_TO_HOME, startedAt: "now",
    });
    expect(normalizeLaunchSession({ entrySurface: "invalid", launcherId: "invalid", startedAt: "now" })).toEqual({
      entrySurface: "unknown", launcherId: null, allowBackHome: false, allowedDestinationIds: [],
      primaryAction: LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP, startedAt: "now",
    });
  });

  it("builds sessions for intercept and ordinary routes", () => {
    expect(buildLaunchSessionForRoute({ kind: "intercept", versionId: "safari" })).toMatchObject({ entrySurface: "fake_launcher", launcherId: "safari" });
    expect(buildLaunchSessionForRoute({ kind: "intercept", versionId: "invalid" })).toMatchObject({ entrySurface: "mybishbash_home" });
    expect(buildLaunchSessionForRoute({ kind: "home" })).toMatchObject({ entrySurface: "mybishbash_home" });
    expect(buildLaunchSession("unknown")).toMatchObject({ entrySurface: "unknown" });
  });

  it("derives overlay context without mutating the input", () => {
    const home = normalizeLaunchSession({ entrySurface: "mybishbash_home", startedAt: "now" });
    expect(getLaunchSessionForOverlay(home, { launchSource: "fake_launcher", versionId: "safari" })).toMatchObject({ entrySurface: "fake_launcher", launcherId: "safari" });
    expect(getLaunchSessionForOverlay(home, { launchSource: "normal" })).toMatchObject({ entrySurface: "mybishbash_home" });
    expect(isFakeLauncherSession(home)).toBe(false);
    expect(isFakeLauncherSession({ entrySurface: "fake_launcher" })).toBe(true);
  });

  it("reduces every existing launch-session mutation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
    const home = buildLaunchSession("mybishbash_home");
    const safari = launchSessionReducer(home, { type: LAUNCH_SESSION_EVENTS.ROUTE_INTERCEPT, launcherId: "safari" });
    expect(safari).toMatchObject({ entrySurface: "fake_launcher", launcherId: "safari" });
    expect(launchSessionReducer(safari, { type: LAUNCH_SESSION_EVENTS.ROUTE_INTERCEPT, launcherId: "safari" })).toBe(safari);
    expect(launchSessionReducer(safari, { type: LAUNCH_SESSION_EVENTS.APP_TAB_HOME })).toMatchObject({ entrySurface: "mybishbash_home" });
    expect(launchSessionReducer(home, { type: LAUNCH_SESSION_EVENTS.APP_TAB_HOME })).toBe(home);
    expect(launchSessionReducer(home, { type: LAUNCH_SESSION_EVENTS.SHELL_CARD, launcherId: "instagram" })).toMatchObject({ launcherId: "instagram" });
    expect(launchSessionReducer(safari, { type: LAUNCH_SESSION_EVENTS.HOME_CARD })).toMatchObject({ entrySurface: "mybishbash_home" });
    expect(launchSessionReducer(home, { type: LAUNCH_SESSION_EVENTS.INTERCEPTION_START, launcherId: "youtube" })).toMatchObject({ launcherId: "youtube" });
    expect(launchSessionReducer(safari, { type: LAUNCH_SESSION_EVENTS.RESET_HOME })).toMatchObject({ entrySurface: "mybishbash_home" });
    expect(launchSessionReducer(safari, { type: "unknown" })).toBe(safari);
    expect(launchSessionReducer(safari, null)).toBe(safari);
    vi.useRealTimers();
  });
});
