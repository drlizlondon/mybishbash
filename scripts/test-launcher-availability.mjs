import assert from "node:assert/strict";
import {
  LAUNCHER_AVAILABILITY,
  LAUNCHER_AVAILABILITY_STATUSES,
  LAUNCHER_CONTEXTS,
  canUserToggleLauncher,
  deriveAvailabilityFromLegacyFlags,
  getAvailableLaunchersForUser,
  getLauncherAvailabilityStatus,
  isLauncherVisibleInContext,
  shouldBlockCrossAppLaunch,
} from "../src/lib/launcherAvailability.js";
import {
  FAKE_APP_LAUNCHERS,
  LAUNCHER_IDS,
  assertKnownLauncherId,
  mergeLauncherConfig,
  mergeLauncherConfigs,
} from "../src/lib/launcherRegistry.js";
import {
  buildOnboardingLauncherContexts,
  getDefaultOnboardingLauncherId,
  isSafariOnboardingRouteAvailable,
} from "../src/lib/onboardingLaunchers.js";

// ── Registry availability foundations ───────────────────────────────────────

assert.deepEqual(
  [...LAUNCHER_AVAILABILITY_STATUSES].sort(),
  ["archived", "disabled", "draft", "experimental", "hidden", "public", "tester_only"],
);

for (const expectedId of ["safari", "youtube", "instagram", "chrome", "reddit", "linkedin", "whatsapp", "bbc-news", "duolingo"]) {
  assert.equal(LAUNCHER_IDS.includes(expectedId), true, `${expectedId} must stay in the supported registry`);
}

for (const launcher of FAKE_APP_LAUNCHERS) {
  assert.equal(
    LAUNCHER_AVAILABILITY_STATUSES.includes(launcher.availabilityStatus),
    true,
    `${launcher.id} must declare a valid availabilityStatus`,
  );
  // No contradictory states: enabled must mean public, and vice versa.
  assert.equal(
    launcher.enabled,
    launcher.availabilityStatus === LAUNCHER_AVAILABILITY.PUBLIC,
    `${launcher.id} enabled flag must agree with its availability status`,
  );
}

for (const id of ["safari", "youtube", "instagram"]) {
  const launcher = FAKE_APP_LAUNCHERS.find((item) => item.id === id);
  assert.equal(launcher.availabilityStatus, "public", `${id} should remain public`);
}

// ── Legacy flag mapping ──────────────────────────────────────────────────────

assert.equal(deriveAvailabilityFromLegacyFlags({ enabled: true, hqVisible: true }), "public");
assert.equal(deriveAvailabilityFromLegacyFlags({ enabled: false, hqVisible: true }), "disabled");
assert.equal(deriveAvailabilityFromLegacyFlags({ enabled: false, hqVisible: false }), "hidden");
assert.equal(getLauncherAvailabilityStatus({ availabilityStatus: "tester_only" }), "tester_only");
assert.equal(getLauncherAvailabilityStatus({ availabilityStatus: "bogus", enabled: true }), "public");

// ── HQ override merge keeps availability and enabled consistent ─────────────

const safari = FAKE_APP_LAUNCHERS.find((launcher) => launcher.id === "safari");
const safariDisabledByHq = mergeLauncherConfig(safari, { enabled: false });
assert.equal(safariDisabledByHq.availabilityStatus, "disabled");
assert.equal(safariDisabledByHq.enabled, false);

const safariTesterOnly = mergeLauncherConfig(safari, { availabilityStatus: "tester_only" });
assert.equal(safariTesterOnly.availabilityStatus, "tester_only");
assert.equal(safariTesterOnly.enabled, false, "tester_only launchers must not count as enabled for normal users");

const safariExperimental = mergeLauncherConfig(safari, { availabilityStatus: "experimental", enabled: true });
assert.equal(safariExperimental.availabilityStatus, "experimental");
assert.equal(safariExperimental.enabled, false, "explicit status must win over a contradictory enabled flag");

const safariInvalidStatus = mergeLauncherConfig(safari, { availabilityStatus: "secret" });
assert.equal(safariInvalidStatus.availabilityStatus, "public", "invalid statuses fall back to static defaults");

// Unsupported launcher IDs can never be saved or merged in.
assert.throws(() => assertKnownLauncherId("tiktok"));
assert.equal(
  mergeLauncherConfigs([{ id: "tiktok", availabilityStatus: "public", enabled: true }]).some((launcher) => launcher.id === "tiktok"),
  false,
);

// ── Availability selector rules ──────────────────────────────────────────────

const fixtures = [
  { id: "pub", category: "social", availabilityStatus: "public" },
  { id: "hid", category: "social", availabilityStatus: "hidden" },
  { id: "exp", category: "social", availabilityStatus: "experimental" },
  { id: "tst", category: "social", availabilityStatus: "tester_only" },
  { id: "dis", category: "social", availabilityStatus: "disabled" },
  { id: "drf", category: "social", availabilityStatus: "draft" },
  { id: "arc", category: "social", availabilityStatus: "archived" },
];
const normalUser = { launchers: fixtures, testerStatus: { is_tester: false } };
const tester = { launchers: fixtures, testerStatus: { is_tester: true } };

const userVisible = getAvailableLaunchersForUser({ ...normalUser, context: LAUNCHER_CONTEXTS.USER_SETUP }).map((l) => l.id);
assert.deepEqual(userVisible, ["pub"], "normal users only see public launchers");

for (const context of [LAUNCHER_CONTEXTS.FAKE_LAUNCHER_BAR, LAUNCHER_CONTEXTS.SETTINGS, LAUNCHER_CONTEXTS.ONBOARDING]) {
  assert.deepEqual(
    getAvailableLaunchersForUser({ ...normalUser, context }).map((l) => l.id),
    ["pub"],
    `disabled/hidden/experimental/tester_only launchers must not appear in ${context}`,
  );
}

const testerVisible = getAvailableLaunchersForUser({ ...tester, context: LAUNCHER_CONTEXTS.USER_SETUP }).map((l) => l.id);
assert.deepEqual(testerVisible, ["pub", "exp", "tst"], "testers also see experimental and tester_only launchers");

const experimentalContext = getAvailableLaunchersForUser({ ...normalUser, context: LAUNCHER_CONTEXTS.TESTER }).map((l) => l.id);
assert.deepEqual(experimentalContext, ["pub", "exp"], "experimental launchers appear in tester/experimental contexts");

const hqVisibleIds = getAvailableLaunchersForUser({ ...normalUser, context: LAUNCHER_CONTEXTS.HQ }).map((l) => l.id);
assert.deepEqual(hqVisibleIds, ["pub", "hid", "exp", "tst", "dis", "drf", "arc"], "HQ can always see supported launchers");

// Draft and archived launchers stay HQ-only, even for testers.
for (const context of [LAUNCHER_CONTEXTS.USER_SETUP, LAUNCHER_CONTEXTS.FAKE_LAUNCHER_BAR, LAUNCHER_CONTEXTS.SETTINGS, LAUNCHER_CONTEXTS.ONBOARDING, LAUNCHER_CONTEXTS.TESTER]) {
  const visible = getAvailableLaunchersForUser({ ...tester, context }).map((l) => l.id);
  assert.equal(visible.includes("drf"), false, `draft launchers must not appear in ${context}`);
  assert.equal(visible.includes("arc"), false, `archived launchers must not appear in ${context}`);
}

assert.equal(isLauncherVisibleInContext(fixtures[1], { context: LAUNCHER_CONTEXTS.HQ }), true, "hidden apps stay visible in HQ");
assert.equal(isLauncherVisibleInContext(fixtures[4], { context: LAUNCHER_CONTEXTS.HQ }), true, "disabled apps stay visible in HQ");

// Users can only enable/disable apps that are available to them, and a local
// preference can never resurface an unavailable app.
assert.equal(canUserToggleLauncher(fixtures[0], { testerStatus: { is_tester: false } }), true);
assert.equal(canUserToggleLauncher(fixtures[4], { testerStatus: { is_tester: false } }), false);
assert.equal(canUserToggleLauncher(fixtures[3], { testerStatus: { is_tester: true } }), true);

const withPreferences = getAvailableLaunchersForUser({
  ...normalUser,
  context: LAUNCHER_CONTEXTS.USER_SETUP,
  respectUserPreference: true,
  userPreferences: { pub: { userEnabled: false }, dis: { userEnabled: true } },
}).map((l) => l.id);
assert.deepEqual(withPreferences, [], "a user preference can hide an available app but never enable an unavailable one");

// ── Shell matching guard ─────────────────────────────────────────────────────

for (const shellId of ["safari", "instagram", "youtube", "chrome", "whatsapp"]) {
  const session = { entrySurface: "fake_launcher", launcherId: shellId };
  assert.equal(
    shouldBlockCrossAppLaunch({ launchSession: session, requestedLauncherId: shellId }),
    false,
    `${shellId} shell may continue to ${shellId}`,
  );
  for (const otherId of ["safari", "instagram", "youtube", "chrome", "whatsapp"]) {
    if (otherId === shellId) continue;
    assert.equal(
      shouldBlockCrossAppLaunch({ launchSession: session, requestedLauncherId: otherId }),
      true,
      `${shellId} shell must never launch ${otherId}`,
    );
  }
}
assert.equal(
  shouldBlockCrossAppLaunch({ launchSession: { entrySurface: "mybishbash_home", launcherId: null }, requestedLauncherId: "safari" }),
  false,
  "home sessions are not restricted by the shell guard",
);

// ── Onboarding choices come from the availability selector ──────────────────

const onboardingPool = getAvailableLaunchersForUser({
  launchers: FAKE_APP_LAUNCHERS,
  testerStatus: { is_tester: false },
  context: LAUNCHER_CONTEXTS.ONBOARDING,
});
const contexts = buildOnboardingLauncherContexts(onboardingPool);
const allOptions = Object.values(contexts).flatMap((context) => context.launchers);

assert.equal(allOptions.some((option) => option.id === "instagram" && option.available), true, "Instagram stays the pause recommendation when available");
assert.equal(allOptions.some((option) => option.id === "youtube" && option.available), true, "YouTube remains a visible option when available");
assert.equal(allOptions.some((option) => option.id === "tiktok" && option.available), false, "TikTok must never be offered as available");
for (const launcher of FAKE_APP_LAUNCHERS.filter((item) => item.availabilityStatus !== "public")) {
  assert.equal(
    allOptions.some((option) => option.id === launcher.id && option.available),
    false,
    `${launcher.id} (${launcher.availabilityStatus}) must not be offered during onboarding`,
  );
}
assert.equal(getDefaultOnboardingLauncherId(contexts), "instagram");
assert.equal(isSafariOnboardingRouteAvailable(onboardingPool), true, "Safari stays the everyday-use route while public");
assert.equal(isSafariOnboardingRouteAvailable(onboardingPool.filter((l) => l.id !== "safari")), false);

const emptyContexts = buildOnboardingLauncherContexts([]);
assert.deepEqual(Object.keys(emptyContexts), [], "contexts with no available launchers are dropped");

console.log("Launcher availability checks passed");
