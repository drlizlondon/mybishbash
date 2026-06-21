import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CARD_EVENT_TYPES,
  CARD_SELECTION_SURFACES,
  DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS,
  areTesterLauncherFeaturesEnabled,
  getTesterLauncherFeatureGate,
  normalizePersonalFirstFallbackSettings,
  selectEligibleCard,
  selectPersonalFirstLauncherCard,
} from "../src/lib/cardSelection.js";
import {
  FAKE_LAUNCHER_FLOW_STEPS,
  buildFakeLauncherFlowContext,
  getInitialFakeLauncherStep,
  getLauncherDecisionReadiness,
  getNextFakeLauncherStepAfterActionCard,
  getNextFakeLauncherStepAfterInterruption,
  getNextFakeLauncherStepAfterSelectedCard,
  LAUNCHER_DATA_WAIT_TIMEOUT_MS,
} from "../src/lib/launcherFlow.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const cardSelectionSource = await readFile(new URL("../src/lib/cardSelection.js", import.meta.url), "utf8");

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

assert.equal(LAUNCHER_DATA_WAIT_TIMEOUT_MS <= 300, true, "Launcher data wait timeout stays within perceived-performance budget");
assert.match(appSource, /initialRoute\.kind === "intercept" \? buildFakeLauncherPreparingOverlay\(initialRoute\.versionId\) : null/);
assert.match(appSource, /const LAUNCHER_PREPARING_VISIBLE_DELAY_MS = 180;/);
assert.match(appSource, /window\.setTimeout\(\(\) => \{/);
assert.match(appSource, /setShowLauncherPreparingFallback\(true\);/);
assert.match(appSource, /\}, LAUNCHER_PREPARING_VISIBLE_DELAY_MS\);/);
assert.match(appSource, /data-testid="launcher-preparing-placeholder"/);
assert.doesNotMatch(appSource, /headline="Getting your card ready\.\.\."/);
assert.doesNotMatch(appSource, /subtitle="One moment\."/);
assert.match(appSource, /selectEligibleCard/);
assert.doesNotMatch(appSource, /selectWeightedLauncherCard/);
assert.doesNotMatch(cardSelectionSource, /selectWeightedLauncherCard/);
assert.doesNotMatch(cardSelectionSource, /personalWeight|packWeight|weightedFlow/);
assert.match(appSource, /headline=\{isIntercept \? "You're all caught up\." : "You're all caught up for now\."\}/);
assert.match(appSource, /subtitle=\{isIntercept \? "See you later\." : ""\}/);
assert.match(appSource, /label: `Continue to \$\{appName\}`/);
assert.match(appSource, /label: "I really like this one", variant: "secondary"/);
assert.match(appSource, /LAUNCH_PRIMARY_ACTIONS\.CONTINUE_TO_APP \? "Continue" : "Back to home"/);
assert.match(appSource, /const plannedInterruption = interruption;/);
assert.match(appSource, /getInitialFakeLauncherStep/);
assert.match(appSource, /getNextFakeLauncherStepAfterSelectedCard/);
assert.match(appSource, /buildFakeLauncherFlowContext/);
assert.match(
  appSource,
  /if \(overlay\.type === "reveal"\) \{[\s\S]{0,2200}const nextOverlay = buildFakeLauncherContinueOverlay\(versionId, activationKey\);[\s\S]{0,450}routing to ContinueToAppCard/,
);
assert.doesNotMatch(appSource, /if \(interruptionEnabled\) \{[\s\S]{0,620}buildFakeLauncherContinueOverlay\(versionId, activationKey\)/);
assert.doesNotMatch(appSource, /const plannedInterruption = useWeightedFlow && !selected \? null : interruption;/);
assert.doesNotMatch(appSource, /launcher_weighted_session_started/);

assert.deepEqual(
  buildFakeLauncherFlowContext({
    launcherId: "instagram",
    launcherName: "Instagram",
    destinationUrl: "https://www.instagram.com",
    interruptionEnabled: true,
    activationKey: "activation-1",
  }),
  {
    launcherId: "instagram",
    launcherName: "Instagram",
    destinationUrl: "https://www.instagram.com",
    interruptionEnabled: true,
    activationKey: "activation-1",
  },
);
assert.equal(getInitialFakeLauncherStep({ selectedCard: { id: "personal-a" }, interruption: { id: "interrupt" } }), FAKE_LAUNCHER_FLOW_STEPS.SELECTED_CARD);
assert.equal(getInitialFakeLauncherStep({ selectedCard: null, interruption: { id: "interrupt" } }), FAKE_LAUNCHER_FLOW_STEPS.INTERRUPTION_CARD);
assert.equal(getInitialFakeLauncherStep({ selectedCard: null, interruption: null }), FAKE_LAUNCHER_FLOW_STEPS.CAUGHT_UP);
assert.equal(getNextFakeLauncherStepAfterSelectedCard({ interruption: { id: "interrupt" } }), FAKE_LAUNCHER_FLOW_STEPS.INTERRUPTION_CARD);
assert.equal(getNextFakeLauncherStepAfterSelectedCard({ interruption: null }), FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD);
assert.equal(getNextFakeLauncherStepAfterInterruption("do_something_else"), FAKE_LAUNCHER_FLOW_STEPS.ACTION_CARD);
assert.equal(getNextFakeLauncherStepAfterInterruption("continue"), FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD);
assert.equal(getNextFakeLauncherStepAfterActionCard(), FAKE_LAUNCHER_FLOW_STEPS.ACTION_SUCCESS);

assert.deepEqual(
  normalizePersonalFirstFallbackSettings({ packCardTimeoutMs: 5.8 }),
  { packCardTimeoutMs: 5, personalCardCooldownMs: DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS.personalCardCooldownMs },
);
assert.deepEqual(
  normalizePersonalFirstFallbackSettings({ packCardTimeoutMs: -1 }),
  DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS,
);
assert.deepEqual(
  getTesterLauncherFeatureGate({
    testerStatus: { is_tester: true },
    storage: { getItem: () => null },
    env: { DEV: false },
  }),
  {
    enabled: true,
    testerIsTester: true,
    devOverride: false,
    selectedPath: "tester_features",
  },
);
assert.equal(
  areTesterLauncherFeaturesEnabled({
    testerStatus: { is_tester: false },
    storage: { getItem: () => "true" },
    env: { DEV: true },
  }),
  true,
);

const now = new Date("2026-01-01T13:00:00.000Z");
const personal = (id, overrides = {}) => ({
  id,
  promptText: id,
  dashboardTitle: id,
  sourcePackId: null,
  deletedAt: null,
  paused: false,
  disliked: false,
  doneDate: null,
  statusToday: "fresh",
  notYetUntil: null,
  lastShownAt: null,
  timingWindows: ["day"],
  ...overrides,
});
const pack = (id, overrides = {}) => ({
  id,
  promptText: id,
  dashboardTitle: id,
  sourcePackId: "starter-pack",
  deletedAt: null,
  paused: false,
  disliked: false,
  hidden: false,
  lastShownAt: null,
  timingWindows: ["day"],
  ...overrides,
});

const personalFirst = selectPersonalFirstLauncherCard({
  cards: [personal("personal-a"), pack("pack-a")],
  timezone: "Europe/London",
  now,
  random: () => 0,
});
assert.equal(personalFirst.selected?.id, "personal-a");
assert.equal(personalFirst.selectedSource, "personal");
assert.equal(personalFirst.selectedPriority, "primary");
assert.equal(personalFirst.selectionReason, "eligible_primary_cards_available");

const secondPersonal = selectPersonalFirstLauncherCard({
  cards: [personal("personal-a"), personal("personal-b"), pack("pack-a")],
  timezone: "Europe/London",
  now,
  random: () => 0.99,
});
assert.equal(secondPersonal.selected?.id, "personal-b");
assert.equal(secondPersonal.selectedSource, "personal");

const completedPersonalIsRemoved = selectEligibleCard({
  cards: [personal("personal-a"), personal("personal-b"), pack("pack-a")],
  events: [
    {
      event_type: CARD_EVENT_TYPES.COMPLETED,
      card_id: "personal-a",
      created_at: now.toISOString(),
      metadata: { surface: CARD_SELECTION_SURFACES.HOME },
    },
  ],
  timezone: "Europe/London",
  now,
  random: () => 0,
});
assert.equal(completedPersonalIsRemoved.selected?.id, "personal-b");
assert.equal(completedPersonalIsRemoved.selectedSource, "personal");

const ignoredPersonalIsReplaced = selectEligibleCard({
  cards: [personal("personal-a"), personal("personal-b"), pack("pack-a")],
  events: [
    {
      event_type: CARD_EVENT_TYPES.IGNORED,
      card_id: "personal-a",
      created_at: now.toISOString(),
      metadata: { surface: CARD_SELECTION_SURFACES.SHELL },
    },
  ],
  timezone: "Europe/London",
  now,
  random: () => 0,
});
assert.equal(ignoredPersonalIsReplaced.selected?.id, "personal-b");
assert.equal(ignoredPersonalIsReplaced.selectedSource, "personal");

const fallbackPack = selectPersonalFirstLauncherCard({
  cards: [personal("done-personal", { doneDate: "2026-01-01", statusToday: "doneToday" }), pack("pack-a")],
  timezone: "Europe/London",
  now,
  random: () => 0,
});
assert.equal(fallbackPack.selected?.id, "pack-a");
assert.equal(fallbackPack.selectedSource, "pack");
assert.equal(fallbackPack.selectedPriority, "fallback");
assert.equal(fallbackPack.selectionReason, "no_eligible_primary_cards");

const timeoutFallbackPack = selectPersonalFirstLauncherCard({
  cards: [
    pack("pack-a", { lastShownAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString() }),
    pack("pack-b", { lastShownAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString() }),
  ],
  timezone: "Europe/London",
  now,
  random: () => 0,
});
assert.equal(timeoutFallbackPack.selectedSource, "pack");
assert.equal(timeoutFallbackPack.selectionReason, "no_eligible_primary_cards");

const caughtUp = selectPersonalFirstLauncherCard({
  cards: [personal("paused-personal", { paused: true }), pack("hidden-pack", { hidden: true })],
  timezone: "Europe/London",
  now,
});
assert.equal(caughtUp.selected, null);
assert.equal(caughtUp.selectedSource, "none");
assert.equal(caughtUp.selectionReason, "no_eligible_primary_or_fallback_cards");

assert.match(appSource, /function getLaunchPersonalCardPool\(cards = \[\]\) \{[\s\S]{0,220}!isCommitmentCard\(card\)[\s\S]{0,120}cardKind/);
assert.match(appSource, /selectEligibleCard\(\{[\s\S]{0,500}cards: getLaunchPersonalCardPool\(normalizedSelectionCards\),[\s\S]{0,500}timezone: profile\.timezone/);
assert.doesNotMatch(appSource, /selectPersonalFirstLauncherCard\(\{/);
assert.doesNotMatch(appSource, /source\[Math\.floor\(Math\.random\(\) \* source\.length\)\]/);
assert.match(appSource, /event_type: CARD_EVENT_TYPES\.SHOWN/);
assert.match(appSource, /event_type: action === "done" \? CARD_EVENT_TYPES\.COMPLETED : CARD_EVENT_TYPES\.IGNORED/);
assert.match(appSource, /CARD_SELECTION_SURFACES\.SHELL/);

console.log("Launcher flow checks passed");
