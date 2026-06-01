import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getLauncherDecisionReadiness } from "../src/lib/launcherFlow.js";
import { buildCardsFromPack, getStatusMeta, isEligible, isPackCardAvailable } from "../src/utils.js";

assert.deepEqual(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: false,
    sessionPresent: false,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: false,
  }),
  { ready: false, reason: "auth_pending" },
);

assert.deepEqual(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: true,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: false,
  }),
  { ready: false, reason: "sync_pending" },
);

assert.equal(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: true,
    syncStatus: "loading",
    hasUsableCachedLauncherState: true,
    waitExpired: false,
  }).reason,
  "cached_launcher_state_available",
);

assert.deepEqual(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: true,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: true,
  }),
  { ready: false, reason: "sync_pending" },
);

assert.equal(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: true,
    sessionPresent: false,
    syncStatus: "needs-connection",
    hasUsableCachedLauncherState: false,
    waitExpired: true,
  }).reason,
  "wait_expired",
);

assert.equal(
  getLauncherDecisionReadiness({
    routeKind: "intercept",
    authReady: false,
    sessionPresent: false,
    syncStatus: "loading",
    hasUsableCachedLauncherState: false,
    waitExpired: false,
    isDemoMode: true,
  }).reason,
  "demo_mode",
);

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const fakeLauncherBarSource = await readFile(new URL("../src/lib/FakeLauncherBar.jsx", import.meta.url), "utf8");
const launcherStateSource = await readFile(new URL("../src/lib/launcherState.js", import.meta.url), "utf8");
assert.match(appSource, /buildFakeLauncherPreparingOverlay/);
assert.match(appSource, /\[\"intercept-pack\", "continue-to-app"\]\.includes\(overlay\?\.type\)/);
assert.match(appSource, /if \(!launcherReadiness\.ready\)/);
assert.match(appSource, /finalDecision: "personal_card"/);
assert.match(appSource, /beginInterceptionFlow\(route\.versionId/);
assert.match(appSource, /function beginInterceptionFlow/);
assert.match(appSource, /function openDestinationApp/);
assert.match(appSource, /function openExternalActionUrl/);
assert.match(appSource, /buildFakeLauncherEmptyOverlay/);
assert.match(appSource, /headline=\{isIntercept \? "You're all caught up\." : "You're all caught up for now\."\}/);
assert.match(appSource, /label: "Continue to App"/);
assert.match(appSource, /const isHomeRoute = route\.kind === "home";/);
assert.match(appSource, /const isLaunchingHomeOverlay = isHomeRoute && shouldLaunchOverlay && overlay == null;/);
assert.doesNotMatch(appSource, /const isPersonalRoute = \["home", "library", "log", "packs", "settings"\]/);
assert.match(appSource, /if \(isHomeRoute && shouldLaunchOverlay\)/);
assert.doesNotMatch(appSource, /if \(isPersonalRoute && shouldLaunchOverlay\)/);
assert.match(appSource, /saveCards\(cards\);/);
assert.match(appSource, /\}, \[cards\]\);/);
assert.match(appSource, /if \(!card\.sourcePackId \|\| card\.deletedAt \|\| card\.paused \|\| card\.disliked\) return;/);
assert.doesNotMatch(appSource, /if \(!card\.sourcePackId \|\| !isEligible\(card, new Date\(\), profile\.timezone\) \|\| card\.deletedAt\) return;/);
assert.match(appSource, /if \(!isPackCardAvailable\(card\)\) return;/);
assert.match(appSource, /const eligiblePackCards = packCards\.filter\(isPackCardAvailable\);/);
assert.match(appSource, /const eligiblePackCount = normalizedDiagCards\.filter\(isPackCardAvailable\)\.length;/);
assert.match(appSource, /card\.sourcePackId \? isPackCardAvailable\(card\) : isEligible/);
assert.match(appSource, /candidate\.sourcePackId === card\.sourcePackId &&\s*isPackCardAvailable\(candidate\)/);
assert.match(appSource, /launchCompletedCardIdsRef/);
assert.match(appSource, /selectedNextOverlayType/);
assert.match(appSource, /cardsOverride/);
assert.match(appSource, /onLaunch=\{\(versionId\) => beginInterceptionFlow\(versionId, \{ source: "home_fake_launcher_bar" \}\)\}/);
assert.match(appSource, /function handleOverlayFakeLauncherLaunch/);
assert.match(appSource, /onFakeLauncherLaunch=\{handleOverlayFakeLauncherLaunch\}/);
assert.match(appSource, /beginInterceptionFlow\(versionId, \{ source: "overlay_fake_launcher" \}\)/);
assert.match(appSource, /onTryLauncher=\{\(launcherId\) => finishOnboarding\("try", launcherId\)\}/);
assert.match(appSource, /pickRandomPersonalCardForLauncher/);
assert.doesNotMatch(appSource, /function handleFakeLauncherLaunch/);
assert.doesNotMatch(appSource, /startInterceptionFlow/);
assert.doesNotMatch(fakeLauncherBarSource, /window\.location\.assign/);
assert.doesNotMatch(fakeLauncherBarSource, /getVersionOpenHref/);
assert.doesNotMatch(fakeLauncherBarSource, /opened: Boolean\(href\)/);

const continueCardSource = await readFile(new URL("../src/ContinueToAppCard.jsx", import.meta.url), "utf8");
assert.doesNotMatch(continueCardSource, /window\.location\.assign/);
assert.doesNotMatch(continueCardSource, /destinationUrl/);

const destinationOpenMatches = [...appSource.matchAll(/window\.location\.assign\(href\)/g)];
assert.equal(destinationOpenMatches.length, 1, "Only openDestinationApp may assign launcher destination hrefs");
assert.match(appSource, /window\.location\.assign\(url\)/, "Action cards use the separate external URL opener");
assert.doesNotMatch(launcherStateSource, /isPackCardAvailable/, "Interruption pack logic must stay separate from activated library pack availability");

const nightDate = new Date("2026-01-01T23:30:00.000Z");
const morningPersonalCard = {
  id: "personal-morning",
  promptText: "Morning personal",
  timingWindows: ["morning"],
  paused: false,
  disliked: false,
  deletedAt: null,
  sourcePackId: null,
};
const morningPackCard = {
  ...morningPersonalCard,
  id: "pack-morning",
  sourcePackId: "active-pack",
};
assert.equal(isEligible(morningPersonalCard, nightDate, "Europe/London"), false, "Personal morning-only card remains time-windowed at night");
assert.equal(isEligible(morningPackCard, nightDate, "Europe/London"), false, "Base isEligible remains strict for pack cards");
assert.equal(isPackCardAvailable(morningPackCard), true, "Activated pack card availability ignores timing windows");
assert.equal(getStatusMeta(morningPackCard, nightDate, "Europe/London").badge, "ready", "Pack cards do not look upcoming solely because of time windows");
assert.equal(isPackCardAvailable({ ...morningPackCard, paused: true }), false);
assert.equal(isPackCardAvailable({ ...morningPackCard, deletedAt: nightDate.toISOString() }), false);
assert.equal(isPackCardAvailable({ ...morningPackCard, disliked: true }), false);

const activatedPackCards = buildCardsFromPack({
  id: "morning-pack",
  title: "Morning Pack",
  theme: "Minimal",
  icon: "heart",
  entries: [{ promptText: "Morning pack prompt", attribution: "" }],
});
assert.equal(activatedPackCards.length, 1);
assert.equal(isEligible(activatedPackCards[0], nightDate, "Europe/London"), false, "Default activated pack card can be outside its timing window");
assert.equal(isPackCardAvailable(activatedPackCards[0]), true, "Default activated pack card is still available when active");

console.log("Launcher flow checks passed");
