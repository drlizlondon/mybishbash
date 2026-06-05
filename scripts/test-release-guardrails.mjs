import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { selectPersonalFirstLauncherCard } from "../src/lib/cardSelection.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const fakeLauncherBarSource = await readFile(new URL("../src/lib/FakeLauncherBar.jsx", import.meta.url), "utf8");
const launcherStateSource = await readFile(new URL("../src/lib/launcherState.js", import.meta.url), "utf8");
const cardSelectionSource = await readFile(new URL("../src/lib/cardSelection.js", import.meta.url), "utf8");

const failures = [];

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message, detail = "") {
  failures.push({ message, detail });
  console.error(`FAIL ${message}`);
  if (detail) console.error(`  ${detail}`);
}

function assertMatch(label, source, pattern) {
  if (!pattern.test(source)) {
    fail(label);
    return;
  }
  pass(label);
}

function assertNoMatch(label, source, pattern) {
  const match = source.match(pattern);
  if (match) {
    fail(label, match[0].replace(/\s+/g, " ").slice(0, 500));
    return;
  }
  pass(label);
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) return "";
  return source.slice(startIndex, endIndex);
}

assertMatch("fake launcher sessions never allow Back to home", appSource, /entrySurface === "fake_launcher"[\s\S]{0,280}allowBackHome: false/);
assertMatch("in-app fake launcher clicks open real destinations directly", appSource, /function handleFakeLauncherLaunch\(versionId, source\) \{[\s\S]{0,260}if \(!isInAppShortcutClick\(source\)\)[\s\S]{0,420}openDestinationApp\(versionId/);
assertNoMatch("home fake launcher bar is not wired to beginInterceptionFlow", appSource, /source:\s*"home_fake_launcher_bar"[\s\S]{0,240}beginInterceptionFlow/);
assertNoMatch("overlay fake launcher is not wired to beginInterceptionFlow", appSource, /source:\s*"overlay_fake_launcher"[\s\S]{0,240}beginInterceptionFlow/);
assertNoMatch("settings fake launcher is not wired to beginInterceptionFlow", appSource, /source:\s*"settings_fake_launcher"[\s\S]{0,240}beginInterceptionFlow/);
assertNoMatch("FakeLauncherBar does not navigate by itself", fakeLauncherBarSource, /window\.location\.assign|getVersionOpenHref/);
assertMatch("/intercept/:launcherId still starts the interception flow", appSource, /beginInterceptionFlow\(route\.versionId/);
assertMatch("continue-to-app still opens the real destination through openDestinationApp", appSource, /onContinueToApp=\{\(versionId, options\) => openDestinationApp\(versionId, options\)\}/);
assertMatch("openDestinationApp is the single destination href assignment", appSource, /window\.location\.assign\(href\)/);
assertMatch("fake launcher reveal completion routes terminal state to ContinueToAppCard", appSource, /if \(overlay\.type === "reveal"\) \{[\s\S]{0,2200}const nextOverlay = buildFakeLauncherContinueOverlay\(versionId, activationKey\);[\s\S]{0,450}routing to ContinueToAppCard/);
assertNoMatch("old weighted launcher selector is not used by the app", appSource, /selectWeightedLauncherCard\(\{/);
assertNoMatch("old weighted launcher selector is not exported", cardSelectionSource, /selectWeightedLauncherCard|personalWeight|packWeight|weightedFlow/);
assertMatch("App uses personal-first fallback for launcher and home decisions", appSource, /selectPersonalFirstLauncherCard\(\{[\s\S]{0,500}cards,[\s\S]{0,500}timezone: profile\.timezone/);
assertMatch("fake launcher event metadata records personal-first fallback", appSource, /selectedPath: "personal_first_fallback"/);
assertMatch("fake launcher interruption remains planned as second layer", appSource, /const plannedInterruption = interruption;/);
assertNoMatch("interruption must not be disabled by old weighted activation state", appSource, /const plannedInterruption = useWeightedFlow && !selected \? null : interruption/);
assertNoMatch("interruption on with no layer-one card uses caught-up instead of direct continue", appSource, /if \(interruptionEnabled\) \{[\s\S]{0,620}buildFakeLauncherContinueOverlay\(versionId, activationKey\)/);
assertMatch("fake launcher empty state uses caught-up headline", appSource, /headline=\{isIntercept \? "You're all caught up\." : "You're all caught up for now\."\}/);
assertMatch("fake launcher empty state has launcher-specific Continue", appSource, /label: `Continue to \$\{appName\}`/);
assertMatch("real app empty state stays softer than fake launcher empty state", appSource, /subtitle=\{isIntercept \? "See you later\." : ""\}/);
assertNoMatch("action success does not continue to the original launcher", appSource, /source: "action_card_success"[\s\S]{0,220}onContinueToApp/);
assertMatch("action success returns home after no-url alternatives", appSource, /function ActionSuccessOverlay[\s\S]{0,180}label: "Back home"/);

const launcherCardActionsSource = sourceBetween(appSource, "function getLauncherCardActions", "function buildEmptyOverlay");
assertMatch("pack card positive action says I really like this one", launcherCardActionsSource, /label: "I really like this one", variant: "secondary"/);
assertMatch("pack card primary action says Continue in launcher sessions", launcherCardActionsSource, /LAUNCH_PRIMARY_ACTIONS\.CONTINUE_TO_APP \? "Continue" : "Back to home"/);
assertNoMatch("pack overlay never renders Dislike", launcherCardActionsSource, /label: "Dislike"/);
assertNoMatch("pack overlay never renders old Like", launcherCardActionsSource, /label: "Like"/);

const packContinueHandlerSource = sourceBetween(appSource, "onPackContinue={() => {", "onPackLike={() => {");
assertMatch("pack Continue uses neutral reveal completion", packContinueHandlerSource, /handleRevealCompletion\(\{ completedCardId: activeRevealCard\?\.id \}\);/);
assertNoMatch("pack Continue does not hide/dislike/delete the card", packContinueHandlerSource, /setDislikedPackCardIds|dislikePackCard|setHiddenPackCardIdsCompat|deletedAt|paused|disliked:/);

const packPositiveHandlerSource = sourceBetween(appSource, "onPackLike={() => {", "onChooseElse={() => {");
assertMatch("I really like this one logs positive feedback", packPositiveHandlerSource, /event_type: "pack_card_liked"[\s\S]{0,700}action_taken: "liked"/);
assertMatch("I really like this one completes the reveal instead of cycling pack cards", packPositiveHandlerSource, /handleRevealCompletion\(\);/);
assertNoMatch("I really like this one does not hide/dislike/delete the card", packPositiveHandlerSource, /setDislikedPackCardIds|dislikePackCard|setHiddenPackCardIdsCompat|deletedAt|paused|disliked:/);
assertNoMatch("launcherState keeps interruption logic separate from library pack availability", launcherStateSource, /isPackCardAvailable/);

const continueCardSource = sourceBetween(appSource, "function ContinueToAppCard", "export default App;");
assertMatch("ContinueToAppCard renders the continue-to-app test id", continueCardSource, /data-testid="continue-to-app-card"/);
assertNoMatch("ContinueToAppCard does not assign window.location directly", continueCardSource, /window\.location\.assign/);

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
  sourcePackId: "pack-a",
  deletedAt: null,
  paused: false,
  disliked: false,
  hidden: false,
  lastShownAt: null,
  timingWindows: ["day"],
  ...overrides,
});

function measureSelection(label, select, thresholdMs) {
  select();
  const runs = [];
  let result = null;
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    result = select();
    runs.push(performance.now() - started);
  }
  const max = Math.max(...runs);
  if (max > thresholdMs) {
    fail(`${label}: ${max.toFixed(2)}ms > ${thresholdMs}ms`);
  } else {
    pass(`${label}: ${max.toFixed(2)}ms <= ${thresholdMs}ms`);
  }
  return result;
}

const perfCards = [
  ...Array.from({ length: 100 }, (_, index) => personal(`personal-${index}`)),
  ...Array.from({ length: 500 }, (_, index) => pack(`pack-${index}`, { sourcePackId: `pack-${Math.floor(index / 25)}` })),
];
const perfEvents = Array.from({ length: 20000 }, (_, index) => ({
  id: `event-${index}`,
  event_type: "card_seen",
  card_id: index % 3 === 0 ? `personal-${index % 100}` : `pack-${index % 500}`,
  created_at: new Date(now.getTime() - index * 1000).toISOString(),
}));

const largeSelection = measureSelection(
  "selectPersonalFirstLauncherCard handles large event history under 50ms",
  () => selectPersonalFirstLauncherCard({
    cards: perfCards,
    timezone: "Europe/London",
    events: perfEvents,
    now,
    random: () => 0.99,
  }),
  50,
);
if (largeSelection.selectedSource === "personal" && largeSelection.selectedPriority === "primary") {
  pass("large selection stays personal-first when personal cards exist");
} else {
  fail("large selection stays personal-first when personal cards exist", JSON.stringify(largeSelection));
}

const packFallback = selectPersonalFirstLauncherCard({
  cards: [personal("done", { doneDate: "2026-01-01", statusToday: "doneToday" }), pack("pack-fallback")],
  timezone: "Europe/London",
  now,
});
if (packFallback.selectedSource === "pack" && packFallback.selectionReason === "no_eligible_primary_cards") {
  pass("pack fallback is used only when no primary cards are eligible");
} else {
  fail("pack fallback is used only when no primary cards are eligible", JSON.stringify(packFallback));
}

const caughtUp = selectPersonalFirstLauncherCard({
  cards: [personal("paused", { paused: true }), pack("hidden", { hidden: true })],
  timezone: "Europe/London",
  now,
});
if (!caughtUp.selected && caughtUp.selectionReason === "no_eligible_primary_or_fallback_cards") {
  pass("caught-up only occurs when no primary or fallback cards are eligible");
} else {
  fail("caught-up only occurs when no primary or fallback cards are eligible", JSON.stringify(caughtUp));
}

if (failures.length > 0) {
  console.error(`\nRelease guardrails failed: ${failures.length}`);
  process.exit(1);
}

console.log("\nRelease guardrails passed");
