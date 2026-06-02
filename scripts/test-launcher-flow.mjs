import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_WEIGHTED_FLOW_SETTINGS,
  getWeightedLauncherFlowGate,
  isWeightedLauncherFlowEnabled,
  normalizeWeightedFlowSettings,
  selectWeightedLauncherCard,
} from "../src/lib/cardSelection.js";
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
const cardSelectionSource = await readFile(new URL("../src/lib/cardSelection.js", import.meta.url), "utf8");
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
assert.match(appSource, /source: "home_fake_launcher_bar",\s*reason: "fake_launcher_icon_clicked"/);
assert.match(appSource, /function handleOverlayFakeLauncherLaunch/);
assert.match(appSource, /onFakeLauncherLaunch=\{handleOverlayFakeLauncherLaunch\}/);
assert.match(appSource, /source: "overlay_fake_launcher",\s*reason: "fake_launcher_icon_clicked"/);
assert.match(appSource, /source: "settings_fake_launcher",\s*reason: "fake_launcher_icon_clicked"/);
assert.match(appSource, /onTryLauncher=\{\(launcherId\) => finishOnboarding\("try", launcherId\)\}/);
assert.match(appSource, /pickRandomPersonalCardForLauncher/);
assert.match(appSource, /getWeightedLauncherFlowGate/);
assert.match(appSource, /selectWeightedLauncherCard/);
assert.match(appSource, /testerStatus/);
assert.match(appSource, /\[CONTINUE_DECISION\] weighted intercept -> routing to next weighted card/);
assert.match(appSource, /const nextWeightedDisplay = selectWeightedLauncherCard\(\{/);
assert.match(appSource, /excludedCardIds,\s*\}\);/);
assert.match(appSource, /const completedCardIsPackCard = Boolean\(completedCard\?\.sourcePackId\);/);
assert.match(appSource, /\[CONTINUE_DECISION\] weighted pack reaction -> routing to ContinueToAppCard/);
assert.match(
  appSource,
  /if \(completedCardIsPackCard\) \{[\s\S]{0,360}buildFakeLauncherContinueOverlay\(versionId, activationKey\)[\s\S]{0,520}return;/,
  "Weighted launcher pack-card Like/Dislike routes to ContinueToAppCard instead of selecting another pack card",
);
assert.match(appSource, /\[WEIGHTED_GUARD\] Active pack cards remained after selector returned empty/);
assert.match(cardSelectionSource, /mybishbash\.weightedFlow\.enabled/);
assert.match(cardSelectionSource, /env\?\.DEV === true/);
assert.doesNotMatch(appSource, /function handleFakeLauncherLaunch/);
assert.doesNotMatch(appSource, /startInterceptionFlow/);
assert.doesNotMatch(appSource, /source: "home_fake_launcher_bar" \}\)\}/);
assert.doesNotMatch(appSource, /beginInterceptionFlow\(versionId, \{ source: "overlay_fake_launcher" \}\)/);
assert.doesNotMatch(appSource, /beginInterceptionFlow\(versionId, \{ source: "settings_fake_launcher" \}\)/);
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
assert.equal(isPackCardAvailable({ ...morningPackCard, hidden: true }), false);

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

const selectorNow = new Date("2026-01-01T13:00:00.000Z");
const personalCard = {
  id: "personal-ready",
  promptText: "Personal ready",
  timingWindows: ["day"],
  paused: false,
  disliked: false,
  deletedAt: null,
  sourcePackId: null,
  doneDate: null,
  notYetUntil: null,
  lastShownAt: null,
};
const packCard = (id, packId, extra = {}) => ({
  id,
  promptText: id,
  timingWindows: ["morning"],
  paused: false,
  disliked: false,
  deletedAt: null,
  sourcePackId: packId,
  ...extra,
});
const sequenceRandom = (values) => {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
};

assert.deepEqual(
  normalizeWeightedFlowSettings({ personalWeight: -5, packWeight: "nope" }),
  DEFAULT_WEIGHTED_FLOW_SETTINGS,
  "Invalid weighted flow settings fall back to 70/30 and 30 minute timeout",
);
assert.deepEqual(
  normalizeWeightedFlowSettings({ personalWeight: 70.9, packWeight: 30.2, packCardTimeoutMs: 5.8 }),
  { personalWeight: 70, packWeight: 30, packCardTimeoutMs: 5 },
  "Weights are normalized as whole numbers",
);
assert.deepEqual(
  getWeightedLauncherFlowGate({
    testerStatus: { is_tester: true },
    storage: { getItem: () => "false" },
    env: { DEV: false },
  }),
  {
    weightedFlowEnabled: true,
    testerIsTester: true,
    devOverride: false,
    selectedPath: "weighted",
  },
  "Tester user enters weighted flow even in production",
);
assert.deepEqual(
  getWeightedLauncherFlowGate({
    testerStatus: { is_tester: false },
    storage: { getItem: () => "true" },
    env: { DEV: false },
  }),
  {
    weightedFlowEnabled: false,
    testerIsTester: false,
    devOverride: false,
    selectedPath: "legacy",
  },
  "Production build ignores the localStorage override for non-testers",
);
assert.deepEqual(
  getWeightedLauncherFlowGate({
    testerStatus: undefined,
    storage: { getItem: () => "false" },
    env: { DEV: false },
  }),
  {
    weightedFlowEnabled: false,
    testerIsTester: false,
    devOverride: false,
    selectedPath: "legacy",
  },
  "Missing tester status defaults to legacy flow",
);
assert.deepEqual(
  getWeightedLauncherFlowGate({
    testerStatus: null,
    storage: { getItem: () => "false" },
    env: { DEV: false },
  }),
  {
    weightedFlowEnabled: false,
    testerIsTester: false,
    devOverride: false,
    selectedPath: "legacy",
  },
  "Supabase/tester-status failure defaults to legacy flow",
);
assert.deepEqual(
  getWeightedLauncherFlowGate({
    testerStatus: { is_tester: false },
    storage: { getItem: () => "true" },
    env: { DEV: true },
  }),
  {
    weightedFlowEnabled: true,
    testerIsTester: false,
    devOverride: true,
    selectedPath: "weighted",
  },
  "Development build localStorage override enables weighted flow",
);
assert.equal(
  isWeightedLauncherFlowEnabled({
    testerStatus: { is_tester: true },
    storage: { getItem: () => "false" },
    env: { DEV: false },
  }),
  true,
);
assert.equal(
  isWeightedLauncherFlowEnabled({
    testerStatus: { is_tester: false },
    storage: { getItem: () => "true" },
    env: { DEV: false },
  }),
  false,
  "Boolean helper also ignores production localStorage override",
);
assert.equal(
  isWeightedLauncherFlowEnabled({
    testerStatus: { is_tester: false },
    storage: { getItem: () => "false" },
    env: { DEV: true },
  }),
  false,
  "Non-testers stay on legacy flow without the dev override",
);

const largePack = Array.from({ length: 100 }, (_, index) => packCard(`large-pack-${index}`, "large-pack"));
const weightedPersonal = selectWeightedLauncherCard({
  cards: [personalCard, ...largePack],
  timezone: "Europe/London",
  now: selectorNow,
  random: sequenceRandom([0.69, 0]),
});
assert.equal(weightedPersonal.selectedSource, "personal", "70/30 draw is source-level, not card-count-level");
assert.equal(weightedPersonal.selected.id, "personal-ready");
assert.equal(weightedPersonal.availablePackCount, 100);

const weightedPack = selectWeightedLauncherCard({
  cards: [personalCard, ...largePack],
  timezone: "Europe/London",
  now: selectorNow,
  random: sequenceRandom([0.71, 0, 0]),
});
assert.equal(weightedPack.selectedSource, "pack", "Pack wins only when source draw lands in pack weight");
assert.equal(weightedPack.selectedPackId, "large-pack");

assert.equal(
  selectWeightedLauncherCard({
    cards: [personalCard],
    timezone: "Europe/London",
    now: selectorNow,
    random: sequenceRandom([0.99, 0]),
  }).selectedSource,
  "personal",
  "Empty pack pool falls back to personal",
);
assert.equal(
  selectWeightedLauncherCard({
    cards: [packCard("pack-only", "pack-only")],
    timezone: "Europe/London",
    now: selectorNow,
    random: sequenceRandom([0.01, 0]),
  }).selectedSource,
  "pack",
  "Empty personal pool falls back to pack",
);
assert.equal(
  selectWeightedLauncherCard({
    cards: [],
    timezone: "Europe/London",
    now: selectorNow,
  }).selectedSource,
  "none",
  "Both pools empty returns no selected source",
);

const rotatedPack = selectWeightedLauncherCard({
  cards: [
    packCard("pack-a-card", "pack-a"),
    packCard("pack-b-card", "pack-b"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  events: [
    { card_id: "pack-a-card", pack_id: "pack-a", created_at: "2026-01-01T12:59:00.000Z" },
    { card_id: "pack-b-card", pack_id: "pack-b", created_at: "2026-01-01T12:00:00.000Z" },
  ],
  random: sequenceRandom([0, 0]),
});
assert.equal(rotatedPack.selectedPackId, "pack-b", "Pack rotation chooses the least recently exposed pack");

const timeoutSelection = selectWeightedLauncherCard({
  cards: [
    packCard("recent-pack-card", "timeout-pack"),
    packCard("older-pack-card", "timeout-pack"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  events: [
    { card_id: "recent-pack-card", pack_id: "timeout-pack", created_at: "2026-01-01T12:45:00.000Z" },
    { card_id: "older-pack-card", pack_id: "timeout-pack", created_at: "2026-01-01T12:00:00.000Z" },
  ],
  random: sequenceRandom([0, 0]),
});
assert.equal(timeoutSelection.selected.id, "older-pack-card", "Pack card timeout prevents immediate repeat");

const donePersonalWithPack = selectWeightedLauncherCard({
  cards: [
    { ...personalCard, id: "done-personal-with-pack", doneDate: "2026-01-01", statusToday: "doneToday" },
    packCard("active-pack-card-after-done-personal", "active-pack-after-done"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  random: sequenceRandom([0, 0]),
});
assert.equal(donePersonalWithPack.selectedSource, "pack", "Done personal cards do not force caught-up while active pack cards exist");
assert.equal(donePersonalWithPack.selected.id, "active-pack-card-after-done-personal");
assert.equal(donePersonalWithPack.availablePersonalCount, 0);
assert.equal(donePersonalWithPack.availablePackCount, 1);

const nextPackAfterCompletionSelection = selectWeightedLauncherCard({
  cards: [
    { ...personalCard, id: "completed-personal-before-pack", doneDate: "2026-01-01", statusToday: "doneToday" },
    packCard("completed-pack-card-in-cycle", "cycle-pack"),
    packCard("next-pack-card-in-cycle", "cycle-pack"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  excludedCardIds: new Set(["completed-pack-card-in-cycle"]),
  random: sequenceRandom([0, 0]),
});
assert.equal(
  nextPackAfterCompletionSelection.selected.id,
  "next-pack-card-in-cycle",
  "Selector can still choose a remaining active pack card when initial launcher selection needs one",
);
assert.equal(nextPackAfterCompletionSelection.selectedSource, "pack");
assert.equal(nextPackAfterCompletionSelection.availablePackCount, 1);

const timeoutWithAlternativeSelection = selectWeightedLauncherCard({
  cards: [
    packCard("recent-pack-card-with-alternative", "repeat-pack"),
    packCard("available-pack-card-with-alternative", "repeat-pack"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  events: [
    { card_id: "recent-pack-card-with-alternative", pack_id: "repeat-pack", created_at: "2026-01-01T12:45:00.000Z" },
  ],
  random: sequenceRandom([0, 0]),
});
assert.equal(timeoutWithAlternativeSelection.selectedSource, "pack");
assert.equal(
  timeoutWithAlternativeSelection.selected.id,
  "available-pack-card-with-alternative",
  "Recently shown pack card respects timeout when another pack card is available",
);
assert.equal(timeoutWithAlternativeSelection.availablePackCount, 2);
assert.equal(timeoutWithAlternativeSelection.eligiblePackCount, 1);

const noRepeatWhileUnshownSelection = selectWeightedLauncherCard({
  cards: [
    packCard("shown-pack-card", "no-repeat-pack"),
    packCard("unshown-pack-card", "no-repeat-pack"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  excludedCardIds: new Set(["shown-pack-card"]),
  events: [
    { card_id: "shown-pack-card", pack_id: "no-repeat-pack", created_at: "2026-01-01T12:59:00.000Z" },
  ],
  random: sequenceRandom([0, 0]),
});
assert.equal(
  noRepeatWhileUnshownSelection.selected.id,
  "unshown-pack-card",
  "Tester weighted flow does not repeat a pack card while another active pack card remains unshown",
);

const allPackCardsInsideTimeoutSelection = selectWeightedLauncherCard({
  cards: [
    packCard("less-recent-active-pack-card", "all-timeout-pack"),
    packCard("more-recent-active-pack-card", "all-timeout-pack"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  events: [
    { card_id: "less-recent-active-pack-card", pack_id: "all-timeout-pack", created_at: "2026-01-01T12:36:00.000Z" },
    { card_id: "more-recent-active-pack-card", pack_id: "all-timeout-pack", created_at: "2026-01-01T12:50:00.000Z" },
  ],
  random: sequenceRandom([0, 0]),
});
assert.equal(
  allPackCardsInsideTimeoutSelection.selectedSource,
  "pack",
  "Active pack cards inside timeout still beat caught-up",
);
assert.equal(
  allPackCardsInsideTimeoutSelection.selected.id,
  "less-recent-active-pack-card",
  "When all active pack cards are inside timeout, choose the least recently shown card",
);
assert.equal(allPackCardsInsideTimeoutSelection.availablePackCount, 2);
assert.equal(allPackCardsInsideTimeoutSelection.eligiblePackCount, 0);

const insideTimeoutUncycledSelection = selectWeightedLauncherCard({
  cards: [
    packCard("already-cycled-inside-timeout", "uncycled-timeout-pack"),
    packCard("uncycled-inside-timeout", "uncycled-timeout-pack"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  excludedCardIds: new Set(["already-cycled-inside-timeout"]),
  events: [
    { card_id: "already-cycled-inside-timeout", pack_id: "uncycled-timeout-pack", created_at: "2026-01-01T12:59:00.000Z" },
    { card_id: "uncycled-inside-timeout", pack_id: "uncycled-timeout-pack", created_at: "2026-01-01T12:58:00.000Z" },
  ],
  random: sequenceRandom([0, 0]),
});
assert.equal(
  insideTimeoutUncycledSelection.selected.id,
  "uncycled-inside-timeout",
  "Uncycled active pack card is selected inside timeout during the same launcher session",
);
assert.equal(insideTimeoutUncycledSelection.selectedSource, "pack");
assert.equal(insideTimeoutUncycledSelection.availablePackCount, 1);
assert.equal(insideTimeoutUncycledSelection.eligiblePackCount, 0);

const completedCycleSelection = selectWeightedLauncherCard({
  cards: [
    packCard("cycled-pack-card-a", "completed-cycle-pack"),
    packCard("cycled-pack-card-b", "completed-cycle-pack"),
  ],
  timezone: "Europe/London",
  now: selectorNow,
  excludedCardIds: new Set(["cycled-pack-card-a", "cycled-pack-card-b"]),
});
assert.equal(completedCycleSelection.selectedSource, "none", "Completed launcher cycle can end after all active pack cards are excluded");
assert.equal(completedCycleSelection.availablePackCount, 0);

const outsideWindowPackSelection = selectWeightedLauncherCard({
  cards: [packCard("night-unavailable-to-personal-pack-card", "outside-window-pack")],
  timezone: "Europe/London",
  now: selectorNow,
  random: sequenceRandom([0, 0]),
});
assert.equal(isEligible(outsideWindowPackSelection.selected, selectorNow, "Europe/London"), false);
assert.equal(
  outsideWindowPackSelection.selectedSource,
  "pack",
  "Pack cards outside personal timing windows remain available in weighted launcher flow",
);

const hiddenPackSelection = selectWeightedLauncherCard({
  cards: [packCard("hidden-pack-card", "hidden-pack", { hidden: true })],
  timezone: "Europe/London",
  now: selectorNow,
});
assert.equal(hiddenPackSelection.selectedSource, "none", "Hidden pack cards are not treated as active");
assert.equal(hiddenPackSelection.availablePackCount, 0);

assert.notEqual(
  allPackCardsInsideTimeoutSelection.selectedSource,
  "none",
  "Weighted selector must not return none while the active pack pool has cards",
);

assert.equal(
  selectWeightedLauncherCard({
    cards: [{ ...personalCard, id: "done-personal", doneDate: "2026-01-01", statusToday: "doneToday" }],
    timezone: "Europe/London",
    now: selectorNow,
  }).selected,
  null,
  "Done personal cards are not shown again today",
);

assert.equal(
  getWeightedLauncherFlowGate({
    testerStatus: { is_tester: false },
    storage: { getItem: () => "false" },
    env: { DEV: false },
  }).selectedPath,
  "legacy",
  "Non-testers remain on the legacy launcher flow",
);

console.log("Launcher flow checks passed");
