import { describe, expect, it } from "vitest";
import {
  LAUNCHER_AUDIENCE,
  LAUNCHER_AVAILABILITY,
  LAUNCHER_AVAILABILITY_STATUSES,
  LAUNCHER_CONTEXTS,
  LAUNCHER_LIFECYCLE,
  canUserToggleLauncher,
  deriveAvailabilityFromLegacyFlags,
  getAvailableLaunchersForUser,
  getLauncherAudience,
  getLauncherAvailabilityStatus,
  getLauncherLifecycleStatus,
  isAvailabilityStatusEnabledForUsers,
  isLauncherVisibleInContext,
  isValidAvailabilityStatus,
  shouldBlockCrossAppLaunch,
} from "./launcherAvailability.js";

const TESTER = { is_tester: true };

describe("availability status resolution", () => {
  it("keeps the persisted status vocabulary stable", () => {
    expect(LAUNCHER_AVAILABILITY_STATUSES.sort()).toEqual(
      ["archived", "disabled", "draft", "experimental", "hidden", "public", "tester_only"].sort(),
    );
    expect(isValidAvailabilityStatus("public")).toBe(true);
    expect(isValidAvailabilityStatus("live")).toBe(false);
  });

  it("prefers an explicit valid status and falls back to legacy flags", () => {
    expect(getLauncherAvailabilityStatus({ availabilityStatus: "tester_only" })).toBe("tester_only");
    expect(getLauncherAvailabilityStatus({ availabilityStatus: "bogus", enabled: true })).toBe("public");
    expect(getLauncherAvailabilityStatus({})).toBe("disabled");
  });

  it("maps legacy flags: enabled wins, hqVisible=false means hidden", () => {
    expect(deriveAvailabilityFromLegacyFlags({ enabled: true })).toBe(LAUNCHER_AVAILABILITY.PUBLIC);
    expect(deriveAvailabilityFromLegacyFlags({ enabled: false, hqVisible: false })).toBe(LAUNCHER_AVAILABILITY.HIDDEN);
    expect(deriveAvailabilityFromLegacyFlags({ enabled: false })).toBe(LAUNCHER_AVAILABILITY.DISABLED);
  });

  it("only public counts as enabled for ordinary users", () => {
    for (const status of LAUNCHER_AVAILABILITY_STATUSES) {
      expect(isAvailabilityStatusEnabledForUsers(status)).toBe(status === "public");
    }
  });
});

describe("lifecycle and audience views", () => {
  it("derives lifecycle from availability", () => {
    expect(getLauncherLifecycleStatus({ availabilityStatus: "public" })).toBe(LAUNCHER_LIFECYCLE.LIVE);
    expect(getLauncherLifecycleStatus({ availabilityStatus: "tester_only" })).toBe(LAUNCHER_LIFECYCLE.TESTING);
    expect(getLauncherLifecycleStatus({ availabilityStatus: "draft" })).toBe(LAUNCHER_LIFECYCLE.DRAFT);
    expect(getLauncherLifecycleStatus({ availabilityStatus: "archived" })).toBe(LAUNCHER_LIFECYCLE.ARCHIVED);
    expect(getLauncherLifecycleStatus({})).toBe(LAUNCHER_LIFECYCLE.DISABLED);
  });

  it("derives audience from availability", () => {
    expect(getLauncherAudience({ availabilityStatus: "public" })).toBe(LAUNCHER_AUDIENCE.ALL_USERS);
    expect(getLauncherAudience({ availabilityStatus: "experimental" })).toBe(LAUNCHER_AUDIENCE.TESTERS);
    expect(getLauncherAudience({ availabilityStatus: "hidden" })).toBe(LAUNCHER_AUDIENCE.ADMIN_ONLY);
  });
});

describe("isLauncherVisibleInContext", () => {
  it("shows public launchers to everyone, tester_only to testers", () => {
    const publicApp = { id: "youtube", availabilityStatus: "public" };
    const testerApp = { id: "reddit", availabilityStatus: "tester_only" };
    expect(isLauncherVisibleInContext(publicApp, {})).toBe(true);
    expect(isLauncherVisibleInContext(testerApp, {})).toBe(false);
    expect(isLauncherVisibleInContext(testerApp, { testerStatus: TESTER })).toBe(true);
  });

  it("never shows hidden/draft/archived to users unless HQ opts in", () => {
    for (const availabilityStatus of ["hidden", "draft", "archived"]) {
      const launcher = { id: "chrome", availabilityStatus };
      expect(isLauncherVisibleInContext(launcher, { testerStatus: TESTER })).toBe(false);
      expect(isLauncherVisibleInContext(launcher, { includeHqHidden: true })).toBe(true);
    }
  });

  it("shows disabled launchers only when explicitly included", () => {
    const launcher = { id: "chrome", availabilityStatus: "disabled" };
    expect(isLauncherVisibleInContext(launcher, {})).toBe(false);
    expect(isLauncherVisibleInContext(launcher, { includeDisabled: true })).toBe(true);
  });

  it("HQ context always sees supported launchers", () => {
    const launcher = { id: "chrome", availabilityStatus: "archived" };
    expect(isLauncherVisibleInContext(launcher, { context: LAUNCHER_CONTEXTS.HQ })).toBe(true);
  });

  it("gates public whatsapp behind tester status until destination QA is confirmed", () => {
    const unconfirmed = { id: "whatsapp", availabilityStatus: "public" };
    expect(isLauncherVisibleInContext(unconfirmed, {})).toBe(false);
    expect(isLauncherVisibleInContext(unconfirmed, { testerStatus: TESTER })).toBe(true);

    const confirmed = { id: "whatsapp", availabilityStatus: "public", destinationQaConfirmed: true };
    expect(isLauncherVisibleInContext(confirmed, {})).toBe(true);
  });
});

describe("getAvailableLaunchersForUser", () => {
  const launchers = [
    { id: "youtube", availabilityStatus: "public" },
    { id: "reddit", availabilityStatus: "tester_only" },
    { id: "chrome", availabilityStatus: "hidden" },
  ];

  it("filters to what the viewer may see", () => {
    expect(getAvailableLaunchersForUser({ launchers }).map((l) => l.id)).toEqual(["youtube"]);
    expect(
      getAvailableLaunchersForUser({ launchers, testerStatus: TESTER }).map((l) => l.id),
    ).toEqual(["youtube", "reddit"]);
  });

  it("lets user preferences hide but never reveal launchers", () => {
    const hiddenByUser = getAvailableLaunchersForUser({
      launchers,
      respectUserPreference: true,
      userPreferences: { youtube: { userEnabled: false }, chrome: { userEnabled: true } },
    });
    expect(hiddenByUser.map((l) => l.id)).toEqual([]);
  });

  it("ignores malformed entries and non-array input", () => {
    expect(getAvailableLaunchersForUser({ launchers: [{}, null] })).toEqual([]);
    expect(getAvailableLaunchersForUser({ launchers: "nope" })).toEqual([]);
  });

  it("canUserToggleLauncher mirrors user-setup visibility", () => {
    expect(canUserToggleLauncher({ id: "youtube", availabilityStatus: "public" })).toBe(true);
    expect(canUserToggleLauncher({ id: "chrome", availabilityStatus: "hidden" })).toBe(false);
  });
});

describe("shouldBlockCrossAppLaunch", () => {
  it("blocks a fake-launcher session from opening a different app", () => {
    const launchSession = { entrySurface: "fake_launcher", launcherId: "youtube" };
    expect(shouldBlockCrossAppLaunch({ launchSession, requestedLauncherId: "instagram" })).toBe(true);
    expect(shouldBlockCrossAppLaunch({ launchSession, requestedLauncherId: "youtube" })).toBe(false);
  });

  it("never blocks outside a fake-launcher session", () => {
    expect(shouldBlockCrossAppLaunch({})).toBe(false);
    expect(
      shouldBlockCrossAppLaunch({
        launchSession: { entrySurface: "home", launcherId: "youtube" },
        requestedLauncherId: "instagram",
      }),
    ).toBe(false);
  });
});
