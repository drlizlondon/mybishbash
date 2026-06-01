import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getLauncherDecisionReadiness } from "../src/lib/launcherFlow.js";

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

console.log("Launcher flow checks passed");
