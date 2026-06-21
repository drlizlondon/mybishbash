import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveLauncherDestination } from "../src/lib/launcherDestinations.js";
import {
  LAUNCHER_AVAILABILITY,
  LAUNCHER_AUDIENCE,
  LAUNCHER_CONTEXTS,
  LAUNCHER_LIFECYCLE,
  getAvailableLaunchersForUser,
  getLauncherAudience,
  getLauncherLifecycleStatus,
} from "../src/lib/launcherAvailability.js";
import {
  FAKE_APP_LAUNCHERS,
  PLACEHOLDER_ICON_SRC,
  buildCustomLauncher,
  getAllLauncherIds,
  getLauncherConfig,
  isKnownLauncher,
  isStaticLauncher,
  mergeLauncherConfig,
  mergeLauncherConfigs,
  registerDynamicLaunchers,
  resetDynamicLaunchersForTests,
  resolveLauncherIconSrc,
  sanitizeLauncherIconSrc,
  validateLauncherDraft,
} from "../src/lib/launcherRegistry.js";

// ── Lifecycle / audience vocabulary ──────────────────────────────────────────

assert.deepEqual(Object.values(LAUNCHER_LIFECYCLE).sort(), ["archived", "disabled", "draft", "live", "testing"]);
assert.deepEqual(Object.values(LAUNCHER_AUDIENCE).sort(), ["admin_only", "all_users", "testers"]);

const lifecycleByStatus = {
  public: ["live", "all_users"],
  tester_only: ["testing", "testers"],
  experimental: ["testing", "testers"],
  hidden: ["draft", "admin_only"],
  draft: ["draft", "admin_only"],
  disabled: ["disabled", "admin_only"],
  archived: ["archived", "admin_only"],
};
for (const [status, [lifecycle, audience]] of Object.entries(lifecycleByStatus)) {
  assert.equal(getLauncherLifecycleStatus({ availabilityStatus: status }), lifecycle, `${status} lifecycle`);
  assert.equal(getLauncherAudience({ availabilityStatus: status }), audience, `${status} audience`);
}

// Archived apps never count as enabled and never reach users.
const safari = FAKE_APP_LAUNCHERS.find((launcher) => launcher.id === "safari");
const archivedSafari = mergeLauncherConfig(safari, { availabilityStatus: "archived" });
assert.equal(archivedSafari.availabilityStatus, "archived");
assert.equal(archivedSafari.enabled, false, "archived launchers must never be enabled for users");

// ── Icon resolution order ────────────────────────────────────────────────────

assert.equal(
  resolveLauncherIconSrc({ customIconSrc: "https://cdn.example.com/icon.png", iconSrc: "/mybishbash/icons/x.png" }),
  "https://cdn.example.com/icon.png",
  "HQ custom icon overrides the default icon",
);
assert.equal(
  resolveLauncherIconSrc({ customIconSrc: "", iconSrc: "/mybishbash/icons/x.png" }),
  "/mybishbash/icons/x.png",
  "default static icon is used when no custom icon exists",
);
assert.equal(resolveLauncherIconSrc({}), PLACEHOLDER_ICON_SRC, "missing icons fall back to the placeholder");
assert.equal(
  resolveLauncherIconSrc({ customIconSrc: "javascript:alert(1)", iconSrc: "not a path" }),
  PLACEHOLDER_ICON_SRC,
  "unsafe icon values fall through to the placeholder",
);

assert.equal(sanitizeLauncherIconSrc("https://cdn.example.com/a.webp"), "https://cdn.example.com/a.webp");
assert.equal(sanitizeLauncherIconSrc("/mybishbash/icons/a.png"), "/mybishbash/icons/a.png");
assert.equal(sanitizeLauncherIconSrc("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
assert.equal(sanitizeLauncherIconSrc("http://insecure.example.com/a.png"), "", "plain http icon URLs are rejected");
assert.equal(sanitizeLauncherIconSrc("data:text/html;base64,AAAA"), "", "non-image data URLs are rejected");

// Invalid icon overrides cannot clobber a safe default through the HQ merge.
const safariWithBadIcon = mergeLauncherConfig(safari, { customIconSrc: "javascript:alert(1)" });
assert.equal(safariWithBadIcon.customIconSrc, "", "unsafe custom icons are stripped during merge");
assert.equal(resolveLauncherIconSrc(safariWithBadIcon), safari.iconSrc);

// ── New protected app validation ─────────────────────────────────────────────

const validDraft = {
  id: "tiktok",
  displayName: "TikTok",
  webFallbackUrl: "https://www.tiktok.com",
};
assert.equal(validateLauncherDraft(validDraft).ok, true, "a minimal valid draft passes");

assert.equal(validateLauncherDraft({ ...validDraft, id: "safari" }).ok, false, "duplicate registry IDs are rejected");
assert.equal(
  validateLauncherDraft(validDraft, { existingIds: ["tiktok"] }).ok,
  false,
  "duplicate custom IDs are rejected",
);
for (const badId of ["", "Tik Tok", "tiktok!", "-tiktok", "tiktok-", "TIKTOK", "intercept", "mybishbash"]) {
  assert.equal(validateLauncherDraft({ ...validDraft, id: badId }).ok, false, `invalid app ID "${badId}" is rejected`);
}
assert.equal(validateLauncherDraft({ ...validDraft, displayName: " " }).ok, false, "display name is required");
assert.equal(
  validateLauncherDraft({ id: "tiktok", displayName: "TikTok" }).ok,
  false,
  "at least one destination URL is required",
);
assert.equal(
  validateLauncherDraft({ ...validDraft, manualUrl: "javascript:alert(1)" }).ok,
  false,
  "invalid destination URLs are rejected",
);

// ── Go-live validation gate ──────────────────────────────────────────────────

const schemeOnlyDraft = {
  id: "tiktok",
  displayName: "TikTok",
  androidIntentUrl: "intent://www.tiktok.com/#Intent;scheme=https;package=com.zhiliaoapp.musically;end",
};
assert.equal(validateLauncherDraft(schemeOnlyDraft).ok, true, "a draft may exist with only an intent destination");
for (const targetStatus of ["public", "tester_only", "experimental"]) {
  assert.equal(
    validateLauncherDraft(schemeOnlyDraft, { targetStatus }).ok,
    false,
    `going ${targetStatus} without an https web fallback is rejected`,
  );
  assert.equal(
    validateLauncherDraft({ ...schemeOnlyDraft, webFallbackUrl: "https://www.tiktok.com" }, { targetStatus }).ok,
    true,
    `going ${targetStatus} with an https web fallback is allowed`,
  );
}

// ── New apps start safely, then deploy through statuses ─────────────────────

const draftLauncher = buildCustomLauncher({
  id: "tiktok",
  displayName: "TikTok",
  webFallbackUrl: "https://www.tiktok.com",
  availabilityStatus: "draft",
});
assert.equal(draftLauncher.enabled, false, "draft launchers are not enabled for users");
assert.equal(draftLauncher.availabilityStatus, LAUNCHER_AVAILABILITY.DRAFT);
assert.equal(draftLauncher.isCustom, true);
assert.equal(draftLauncher.requiresRelease, true, "home-screen install still needs release promotion");
assert.equal(draftLauncher.launchPath, "/intercept/tiktok", "launch route is generated from the slug");
assert.equal(draftLauncher.installPath, "/mybishbash/install/tiktok/", "install path is generated from the slug");
assert.equal(resolveLauncherIconSrc(draftLauncher), PLACEHOLDER_ICON_SRC, "custom apps without icons resolve safely");

const bogusStatusLauncher = buildCustomLauncher({ id: "tiktok", displayName: "TikTok", availabilityStatus: "bogus" });
assert.equal(bogusStatusLauncher.availabilityStatus, LAUNCHER_AVAILABILITY.DRAFT, "invalid statuses fall back to draft");

const liveCustomLauncher = buildCustomLauncher({
  id: "tiktok",
  displayName: "TikTok",
  webFallbackUrl: "https://www.tiktok.com",
  availabilityStatus: "public",
});
assert.equal(liveCustomLauncher.availabilityStatus, "public", "HQ can deploy a custom app live");
assert.equal(liveCustomLauncher.enabled, true, "live custom apps count as enabled for users");

const testerCustomLauncher = buildCustomLauncher({
  id: "tiktok",
  displayName: "TikTok",
  webFallbackUrl: "https://www.tiktok.com",
  availabilityStatus: "tester_only",
});
assert.equal(testerCustomLauncher.enabled, false, "tester-only custom apps are not enabled for normal users");

assert.equal(buildCustomLauncher({ id: "safari" }), null, "static registry IDs cannot become custom launchers");
assert.equal(buildCustomLauncher({ id: "intercept" }), null, "reserved route names cannot become custom launchers");
assert.equal(buildCustomLauncher({ id: "Bad Slug!" }), null, "invalid slugs cannot become custom launchers");

// ── Runtime dynamic registry ─────────────────────────────────────────────────

resetDynamicLaunchersForTests();
assert.equal(isKnownLauncher("tiktok"), false, "unregistered custom IDs are unknown");

const registered = registerDynamicLaunchers([
  { id: "tiktok", isCustom: true, displayName: "TikTok", webFallbackUrl: "https://www.tiktok.com", availabilityStatus: "tester_only" },
  { id: "sneaky", displayName: "Sneaky", webFallbackUrl: "https://example.com" },
  { id: "safari", isCustom: true, displayName: "Fake Safari", webFallbackUrl: "https://evil.example.com" },
  { id: "Bad Slug!", isCustom: true, displayName: "Bad" },
]);
assert.equal(registered.length, 1, "only valid flagged custom rows are registered");
assert.equal(isKnownLauncher("tiktok"), true, "registered custom launchers are known to routes and guards");
assert.equal(isStaticLauncher("tiktok"), false, "registered custom launchers are not static");
assert.equal(isKnownLauncher("sneaky"), false, "unflagged rows never register");
assert.equal(getLauncherConfig("safari").displayName, "Safari", "static registry entries cannot be shadowed");
assert.equal(getLauncherConfig("tiktok").launchPath, "/intercept/tiktok");
assert.equal(getAllLauncherIds().includes("tiktok"), true);

// Tester-only custom apps reach testers (and only testers) once registered.
const dynamicPool = [...FAKE_APP_LAUNCHERS, getLauncherConfig("tiktok")];
for (const [contextLabel, testerStatus, expected] of [
  ["normal users", { is_tester: false }, false],
  ["testers", { is_tester: true }, true],
]) {
  const visible = getAvailableLaunchersForUser({
    launchers: dynamicPool,
    testerStatus,
    context: LAUNCHER_CONTEXTS.USER_SETUP,
  }).map((l) => l.id);
  assert.equal(visible.includes("tiktok"), expected, `tester-only custom app visibility for ${contextLabel}`);
}

// Dynamic app destination resolution: a registered custom launcher resolves
// a browser-safe destination on every platform (never silently missing).
const dynamicConfig = getLauncherConfig("tiktok");
for (const platform of ["ios", "android", "desktop"]) {
  const resolution = resolveLauncherDestination(dynamicConfig, { platform });
  assert.notEqual(resolution.strategy, "missing", `dynamic launcher resolves a destination on ${platform}`);
  assert.match(resolution.href, /^(https:|intent:)/, `dynamic launcher destination is safe on ${platform}`);
}

resetDynamicLaunchersForTests();
assert.equal(isKnownLauncher("tiktok"), false, "reset clears the dynamic registry");

// ── Source-shape guardrails (roles + install-link gating) ────────────────────

const root = resolve(import.meta.dirname, "..");
const hqSource = readFileSync(resolve(root, "src", "HQPanel.jsx"), "utf8");
const appSource = readFileSync(resolve(root, "src", "App.jsx"), "utf8");
const syncSource = readFileSync(resolve(root, "src", "lib", "mybishbashSync.js"), "utf8");

assert.match(
  hqSource,
  /launcher\.isCustom && canHardDelete \?/,
  "Hard delete must be gated to owners on custom apps only",
);
assert.match(
  hqSource,
  /\{canEdit \? \(\s*<button type="button" disabled=\{loading\} onClick=\{handleSaveClick\}/,
  "Launcher save must be gated by the canEdit role check (analysts view-only)",
);
assert.match(
  hqSource,
  /const canEditLaunchers = \["owner", "admin"\]\.includes\(adminRole\)/,
  "Only owner/admin roles may edit launcher configs",
);
assert.match(
  hqSource,
  /const canHardDeleteLaunchers = adminRole === "owner"/,
  "Only the owner role may hard-delete",
);
assert.match(
  syncSource,
  /if \(!launcherId \|\| isStaticLauncher\(launcherId\)\)[\s\S]{0,200}cannot be deleted/,
  "Static registry launchers must never be hard-deletable",
);
assert.match(
  appSource,
  /installableHomeScreenVersions = Object\.values\(homeScreenVersions\)\.filter\([\s\S]{0,300}isLauncherVisibleInContext\(version, \{ testerStatus: settingsTesterStatus, context: LAUNCHER_CONTEXTS\.SETTINGS \}\)/,
  "Settings install links must use launcher availability so unreleased apps stay hidden",
);

// ── Custom rows in the merged HQ list ────────────────────────────────────────

const merged = mergeLauncherConfigs([
  { id: "tiktok", isCustom: true, displayName: "TikTok", webFallbackUrl: "https://www.tiktok.com", availabilityStatus: "draft" },
  { id: "sneaky", displayName: "Sneaky", webFallbackUrl: "https://example.com", availabilityStatus: "public", enabled: true },
]);
const mergedTiktok = merged.find((launcher) => launcher.id === "tiktok");
assert.notEqual(mergedTiktok, undefined, "flagged custom rows appear in the merged HQ list");
assert.equal(mergedTiktok.enabled, false);
assert.equal(merged.some((launcher) => launcher.id === "sneaky"), false, "unflagged unknown IDs stay ignored");

// HQ sees custom drafts; no user-facing context ever does.
const hqList = getAvailableLaunchersForUser({ launchers: merged, context: LAUNCHER_CONTEXTS.HQ }).map((l) => l.id);
assert.equal(hqList.includes("tiktok"), true, "HQ can manage custom drafts");
for (const context of [LAUNCHER_CONTEXTS.USER_SETUP, LAUNCHER_CONTEXTS.FAKE_LAUNCHER_BAR, LAUNCHER_CONTEXTS.SETTINGS, LAUNCHER_CONTEXTS.ONBOARDING, LAUNCHER_CONTEXTS.TESTER]) {
  const visible = getAvailableLaunchersForUser({
    launchers: merged,
    testerStatus: { is_tester: true },
    context,
  }).map((l) => l.id);
  assert.equal(visible.includes("tiktok"), false, `custom drafts must not appear in ${context}`);
}

console.log("HQ launcher admin checks passed");
