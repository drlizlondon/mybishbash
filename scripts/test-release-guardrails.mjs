import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { selectWeightedLauncherCard } from "../src/lib/cardSelection.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../src/storage.js", import.meta.url), "utf8");
const syncSource = await readFile(new URL("../src/lib/mybishbashSync.js", import.meta.url), "utf8");
const launcherStateSource = await readFile(new URL("../src/lib/launcherState.js", import.meta.url), "utf8");
const launcherFlowSource = await readFile(new URL("../src/lib/launcherFlow.js", import.meta.url), "utf8");
const launcherRegistrySource = await readFile(new URL("../src/lib/launcherRegistry.js", import.meta.url), "utf8");
const cardSelectionSource = await readFile(new URL("../src/lib/cardSelection.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

const failures = [];

function normalizeSnippet(snippet) {
  return snippet.replace(/\s+/g, " ").trim();
}

function matchingSnippets(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => normalizeSnippet(match[0]));
}

function findCallWithSource(functionName, source) {
  const pattern = new RegExp(`${functionName}\\([\\s\\S]{0,400}source:\\s*"${source}"[\\s\\S]{0,240}?\\)`, "g");
  return matchingSnippets(appSource, pattern);
}

function findFunctionBody(source, functionName) {
  const startPattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
  const startMatch = startPattern.exec(source);
  if (!startMatch) return "";

  const nextFunction = source.indexOf("\n  function ", startMatch.index + 1);
  return source.slice(startMatch.index, nextFunction === -1 ? source.length : nextFunction);
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) return "";
  return source.slice(startIndex, endIndex);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message, offendingSource = null) {
  failures.push({ message, offendingSource });
  console.error(`FAIL ${message}`);
  if (offendingSource) {
    console.error(`  Offending source: ${offendingSource}`);
  }
}

function assertNoInterceptionSource(source) {
  const calls = findCallWithSource("beginInterceptionFlow", source);
  if (calls.length > 0) {
    fail(`${source} must not be wired to beginInterceptionFlow`, calls[0]);
    return;
  }
  pass(`${source} is not wired to beginInterceptionFlow`);
}

function assertAppPattern(message, pattern) {
  const matches = matchingSnippets(appSource, pattern);
  if (matches.length === 0) {
    fail(message);
    return;
  }
  pass(message);
}

function assertAppDoesNotMatch(message, pattern) {
  const matches = matchingSnippets(appSource, pattern);
  if (matches.length > 0) {
    fail(message, matches[0]);
    return;
  }
  pass(message);
}

function assertSourcePattern(label, source, message, pattern) {
  const matches = matchingSnippets(source, pattern);
  if (matches.length === 0) {
    fail(`${label}: ${message}`);
    return;
  }
  pass(`${label}: ${message}`);
}

function assertSourceDoesNotMatch(label, source, message, pattern) {
  const matches = matchingSnippets(source, pattern);
  if (matches.length > 0) {
    fail(`${label}: ${message}`, matches[0]);
    return;
  }
  pass(`${label}: ${message}`);
}

function assertLessThanOrEqual(message, actual, expected) {
  if (actual > expected) {
    fail(`${message}: ${actual.toFixed(2)}ms > ${expected}ms`);
    return;
  }
  pass(`${message}: ${actual.toFixed(2)}ms <= ${expected}ms`);
}

function assertTruthy(message, value) {
  if (!value) {
    fail(message);
    return;
  }
  pass(message);
}

const launcherCardActionsSource = sourceBetween(appSource, "function getLauncherCardActions", "function buildEmptyOverlay");
if (!launcherCardActionsSource) {
  fail("central launcher card actions are discoverable for feedback guardrails");
} else {
  pass("central launcher card actions are discoverable for feedback guardrails");
}
assertSourcePattern(
  "App",
  launcherCardActionsSource,
  "pack overlay primary action uses the normalized session action",
  /label: normalizedSession\.primaryAction === LAUNCH_PRIMARY_ACTIONS\.CONTINUE_TO_APP \? "Continue" : "Back to home"/g,
);
assertAppPattern(
  "pack overlay uses the central action helper",
  /const cardActionConfig = getLauncherCardActions\(\{ launchSession, cardType \}\);/g,
);
assertAppPattern(
  "fake launcher sessions never allow Back to home",
  /entrySurface === "fake_launcher"[\s\S]{0,280}allowBackHome: false/g,
);
const actionSuccessOverlaySource = sourceBetween(appSource, "function ActionSuccessOverlay", "function CustomPackOverlay");
assertSourcePattern(
  "App",
  actionSuccessOverlaySource,
  "action-success Back-home CTA is gated by allowBackHome",
  /\.\.\.\(allowBackHome \? \[\{ label: "Back home", variant: "secondary", onClick: onClose \}\] : \[\]\)/g,
);
assertSourceDoesNotMatch(
  "App",
  actionSuccessOverlaySource,
  "action-success must not hardcode the dashboard-era home button on",
  /showHomeButton/g,
);
assertAppPattern(
  "card screens expose the persistent dashboard shortcut",
  /function PremiumDashboardShortcut[\s\S]{0,900}aria-label="Open dashboard"[\s\S]{0,300}data-testid="dashboard-shortcut"/g,
);
assertAppPattern(
  "card reveal template renders the dashboard shortcut independently",
  /\{showDashboardShortcut \? <PremiumDashboardShortcut href=\{dashboardHref\} onClick=\{onDashboard\} \/> : null\}/g,
);
assertAppDoesNotMatch(
  "legacy top-right home icon component is not rendered",
  /<PremiumHomeButton/g,
);
assertAppDoesNotMatch(
  "legacy top-right home icon class is not rendered",
  /premium-home-button/g,
);
assertSourcePattern(
  "App",
  launcherCardActionsSource,
  "pack overlay positive action says I really like this one",
  /label: "I really like this one", variant: "secondary"/g,
);
assertSourceDoesNotMatch(
  "App",
  launcherCardActionsSource,
  "pack overlay never renders Dislike",
  /label: "Dislike"/g,
);
assertSourceDoesNotMatch(
  "App",
  launcherCardActionsSource,
  "pack overlay never renders Like",
  /label: "Like"/g,
);
assertSourceDoesNotMatch(
  "App",
  launcherCardActionsSource,
  "pack overlay does not expose old negative replacement wording",
  /label: "(Not for me|Hide this)"/g,
);

const packContinueHandlerSource = sourceBetween(appSource, "onPackContinue={() => {", "onPackLike={() => {");
assertSourcePattern(
  "App",
  packContinueHandlerSource,
  "Continue uses neutral reveal completion",
  /handleRevealCompletion\(\{ completedCardId: activeRevealCard\?\.id \}\);/g,
);
assertSourceDoesNotMatch(
  "App",
  packContinueHandlerSource,
  "Continue does not hide, dislike, pause, delete, or suppress pack cards",
  /setDislikedPackCardIds|dislikePackCard|setHiddenPackCardIdsCompat|hidePackCardCompat|pack_card_disliked|dislikedPackCardIds|hiddenPackCardIdsCompat|deletedAt|paused|disliked:/g,
);

const packPositiveHandlerSource = sourceBetween(appSource, "onPackLike={() => {", "onChooseElse={() => {");
assertSourcePattern(
  "App",
  packPositiveHandlerSource,
  "I really like this one logs the existing positive pack-card event",
  /event_type: "pack_card_liked"[\s\S]{0,700}action_taken: "liked"/g,
);
assertSourceDoesNotMatch(
  "App",
  packPositiveHandlerSource,
  "I really like this one does not hide the pack card",
  /setDislikedPackCardIds|dislikePackCard|setHiddenPackCardIdsCompat|hidePackCardCompat|pack_card_disliked|deletedAt|paused|disliked:/g,
);
assertAppPattern(
  "intentional hide/restore behaviour still exists in pack detail settings",
  /function setPackCardHidden\(packId, text, hidden\)[\s\S]*\{hidden \? "Restore card" : "Hide card"\}/g,
);
assertAppPattern(
  "non-pack personal card actions are unchanged",
  /\{ id: "not_done", label: "Not done", variant: "secondary" \},\s*\{ id: "do_now", label: "I’ll do it now", variant: "secondary" \},\s*\{ id: "done", label: "Done", variant: "primary" \}/g,
);
assertSourcePattern(
  "HQ",
  await readFile(new URL("../src/HQPanel.jsx", import.meta.url), "utf8"),
  "positive pack feedback displays as Really liked",
  /pack_card_liked: "Really liked"/g,
);

assertAppPattern(
  "fake launcher handler exists",
  /function handleFakeLauncherLaunch\(versionId, source\)/g,
);

assertAppPattern(
  "in-app fake launcher sources are classified separately from installed launcher entries",
  /const IN_APP_SHORTCUT_SOURCES = new Set\(\[[\s\S]{0,180}"home_fake_launcher_bar"[\s\S]{0,180}"overlay_fake_launcher"[\s\S]{0,180}"settings_fake_launcher"[\s\S]{0,120}\]\);[\s\S]{0,260}const INSTALLED_FAKE_LAUNCHER_ENTRY_SOURCES = new Set\(\[[\s\S]{0,180}"route"[\s\S]{0,180}"home_screen_resume"[\s\S]{0,180}"standalone_home_recovery"/g,
);

assertAppPattern(
  "in-app fake launcher clicks open real destinations directly",
  /function handleFakeLauncherLaunch\(versionId, source\) \{[\s\S]{0,260}if \(!isInAppShortcutClick\(source\)\)[\s\S]{0,420}openDestinationApp\(versionId,[\s\S]{0,100}source,[\s\S]{0,120}reason: "fake_launcher_icon_clicked"/g,
);

assertNoInterceptionSource("home_fake_launcher_bar");
assertNoInterceptionSource("overlay_fake_launcher");
assertNoInterceptionSource("settings_fake_launcher");

assertAppDoesNotMatch(
  "tester in-app fake launcher clicks must not start interception",
  /if \(testerStatus\?\.is_tester === true\) \{[\s\S]{0,420}beginInterceptionFlow\(versionId/g,
);

assertAppPattern(
  "home fake launcher bar uses the shared fake launcher handler",
  /handleFakeLauncherLaunch\(versionId, "home_fake_launcher_bar"\)/g,
);

assertAppPattern(
  "overlay fake launcher uses the shared fake launcher handler",
  /handleFakeLauncherLaunch\(versionId, "overlay_fake_launcher"\)/g,
);

assertAppPattern(
  "settings fake launcher uses the shared fake launcher handler",
  /handleFakeLauncherLaunch\(versionId, "settings_fake_launcher"\)/g,
);

assertAppPattern(
  "openDestinationApp still calls window.location.assign(href)",
  /function openDestinationApp[\s\S]{0,2400}window\.location\.assign\(href\)/g,
);

const openDestinationAppBody = findFunctionBody(appSource, "openDestinationApp");
if (!openDestinationAppBody) {
  fail("openDestinationApp function still exists");
} else {
  pass("openDestinationApp function still exists");

  if (!/getVersionOpenHref\(version,\s*\{\s*preferFastDestination\s*\}\)/.test(openDestinationAppBody)) {
    fail("openDestinationApp still resolves the real destination href from launcher state with the fast-destination flag", normalizeSnippet(openDestinationAppBody));
  } else {
    pass("openDestinationApp still resolves the real destination href from launcher state with the fast-destination flag");
  }

  if (!/const preferFastDestination = reason === "fake_launcher_icon_clicked";/.test(openDestinationAppBody)) {
    fail("in-app fake launcher clicks still prefer fast app-capable destinations", normalizeSnippet(openDestinationAppBody));
  } else {
    pass("in-app fake launcher clicks still prefer fast app-capable destinations");
  }

  if (!/logLauncherEvent\("intercept_continue_to_app"/.test(openDestinationAppBody)) {
    fail("openDestinationApp still logs intercept_continue_to_app", normalizeSnippet(openDestinationAppBody));
  } else {
    pass("openDestinationApp still logs intercept_continue_to_app");
  }

  if (!/logLauncherEvent\("fake_launcher_real_app_opened"/.test(openDestinationAppBody)) {
    fail("openDestinationApp still logs fake_launcher_real_app_opened", normalizeSnippet(openDestinationAppBody));
  } else {
    pass("openDestinationApp still logs fake_launcher_real_app_opened");
  }

  if (!/if \(href\)[\s\S]{0,720}window\.location\.assign\(href\)/.test(openDestinationAppBody)) {
    fail("openDestinationApp only attempts navigation when href exists", normalizeSnippet(openDestinationAppBody));
  } else {
    pass("openDestinationApp only attempts navigation when href exists");
  }
}

assertAppPattern(
  "/intercept/:launcherId still calls beginInterceptionFlow",
  /if \(route\.kind === "intercept"\)[\s\S]{0,5000}beginInterceptionFlow\(route\.versionId,[\s\S]{0,240}source:\s*isResumeInterceptLaunch \? "home_screen_resume" : "route"/g,
);

assertAppPattern(
  "/intercept/:launcherId still waits for launcher readiness before interception",
  /if \(route\.kind === "intercept"\)[\s\S]{0,2200}if \(!launcherReadiness\.ready\)/g,
);

assertAppPattern(
  "/intercept/:launcherId still writes launcher context while waiting for readiness",
  /if \(route\.kind === "intercept"\)[\s\S]{0,2600}if \(!launcherReadiness\.ready\)[\s\S]{0,160}setLauncherContext\(route\.versionId\)/g,
);

assertAppPattern(
  "beginInterceptionFlow rejects non-installed sources before setting launcher context",
  /function beginInterceptionFlow\(versionId,[\s\S]{0,180}if \(!isInstalledFakeLauncherEntry\(source\)\)[\s\S]{0,900}setLauncherContext\(versionId\)/g,
);

assertAppPattern(
  "continue-to-app still calls openDestinationApp",
  /onContinueToApp=\{\(versionId,\s*options\)\s*=>\s*openDestinationApp\(versionId,\s*options\)\}/g,
);

assertAppPattern(
  "continue card button still delegates to onContinueToApp",
  /onContinueToApp\?\.\(version\?\.id,\s*\{[\s\S]{0,180}source:\s*"continue_card",[\s\S]{0,120}reason:\s*"user_pressed_continue",[\s\S]{0,120}allowDefaultNavigation:\s*Boolean\(continueHref\)[\s\S]{0,80}\}\)/g,
);

assertAppPattern(
  "interruption continue button still delegates to onContinueToApp",
  /onContinueToApp\?\.\(version\.id,\s*\{[\s\S]{0,180}source:\s*"interruption_card",[\s\S]{0,120}reason:\s*"user_pressed_continue",[\s\S]{0,120}allowDefaultNavigation:\s*Boolean\(continueHref\)[\s\S]{0,80}\}\)/g,
);

assertAppPattern(
  "home auto-launch suppression still prevents card loops after intentional in-app actions",
  /if \(isHomeRoute && shouldLaunchOverlay\)[\s\S]{0,240}if \(suppressNextHomeAutoLaunchRef\.current\)[\s\S]{0,260}setShouldLaunchOverlay\(false\)/g,
);

assertAppPattern(
  "resume handler suppresses home auto-launch after launcher destination",
  /if \(suppressResumeHomeAutoLaunchRef\.current\) \{[\s\S]{0,260}setShouldLaunchOverlay\(false\);[\s\S]{0,120}\} else \{[\s\S]{0,180}setShouldLaunchOverlay\(true\);/g,
);

assertAppPattern(
  "continuing to destination marks home resume for launcher suppression",
  /if \(href\) \{[\s\S]{0,120}markHomeAutoLaunchSuppressedAfterDestination\(\);[\s\S]{0,120}suppressResumeHomeAutoLaunchRef\.current = true;[\s\S]{0,120}suppressNextHomeAutoLaunchRef\.current = true;[\s\S]{0,120}setShouldLaunchOverlay\(false\);/g,
);

assertAppPattern(
  "destination suppression is consumed while building initial state",
  /const suppressInitialHomeLaunch =[\s\S]{0,260}consumeHomeAutoLaunchSuppressedAfterDestination\(\);/g,
);

assertAppPattern(
  "initial state exposes destination suppression",
  /suppressInitialHomeLaunch,/g,
);

assertAppPattern(
  "initial home launch is disabled when destination suppression is present",
  /const \[shouldLaunchOverlay, setShouldLaunchOverlay\] = useState\(initialState\.setupComplete && !initialState\.suppressInitialHomeLaunch\);/g,
);

assertAppPattern(
  "non-launcher completion still suppresses the next home auto-launch",
  /debugLaunch\("\[CONTINUE_DECISION\] home -> falling back to home"\);[\s\S]{0,160}suppressNextHomeAutoLaunchRef\.current = true;[\s\S]{0,120}setShouldLaunchOverlay\(false\)/g,
);

assertAppPattern(
  "launcher completion records completed card ids for the current activation",
  /launchCompletedCardIdsRef\.current = new Set\(\[\.\.\.launchCompletedCardIdsRef\.current, completedCardId\]\);[\s\S]{0,500}const excludedCardIds = launchCompletedCardIdsRef\.current/g,
);

assertAppPattern(
  "fake launcher reveal cards route to ContinueToAppCard after handling instead of another card",
  /if \(overlay\.type === "reveal"\) \{/g,
);

assertAppPattern(
  "overlay key includes overlay type so launcher cards remount before continue/interruption",
  /key=\{`\$\{overlay\.type\}:\$\{overlay\.versionId \?\? ""\}:\$\{overlay\.cardId \?\? ""\}:\$\{overlay\.packId \?\? ""\}:\$\{overlay\.activationKey \?\? ""\}`\}/g,
);

assertSourcePattern(
  "styles",
  stylesSource,
  "launcher interception card pieces render atomically without staggered reveal",
  /\.premium-card-screen\.launcher-interception-card \.premium-greeting,[\s\S]{0,500}animation:\s*none;/g,
);

assertAppPattern(
  "tester weighted flow keeps interruption planned as the second layer",
  /const plannedInterruption = interruption;/g,
);

assertAppDoesNotMatch(
  "tester weighted flow must not disable interruption when no weighted card is selected",
  /const plannedInterruption = useWeightedFlow && !selected \? null : interruption;/g,
);

assertAppPattern(
  "fake launcher reveal completion routes to interruption first when configured",
  /activation\?\.interruption && activation\.versionId === versionId && activation\.activationKey === activationKey[\s\S]{0,1200}buildCustomPackOverlay\(activation\.interruption\.pack, activation\.interruption\.activeIndex, "intercept-pack"\)[\s\S]{0,1200}\[CONTINUE_DECISION\] launcher handled card -> routing to interruption card[\s\S]{0,400}return;/g,
);

assertAppPattern(
  "fake launcher reveal completion still builds ContinueToAppCard overlay when no interruption is configured",
  /const nextOverlay = buildFakeLauncherContinueOverlay\(versionId, activationKey\);/g,
);

assertAppPattern(
  "fake launcher reveal completion still logs ContinueToAppCard transition",
  /\[CONTINUE_DECISION\] launcher handled card -> routing to ContinueToAppCard/g,
);

assertAppDoesNotMatch(
  "fake launcher handled-card completion must not depend on weighted activation state",
  /if \(activation\?\.weightedFlowUsed && activation\.versionId === versionId && activation\.activationKey === activationKey\)/g,
);

assertAppDoesNotMatch(
  "weighted launcher completion must not route to another weighted card",
  /\[CONTINUE_DECISION\] weighted intercept -> routing to next weighted card/g,
);

assertAppDoesNotMatch(
  "weighted launcher completion must not use active-pack fallback after a handled card",
  /\[WEIGHTED_GUARD\] Active pack cards remained after selector returned empty/g,
);

assertAppPattern(
  "local card changes still persist through saveCards(cards)",
  /saveCards\(cards\);/g,
);

assertAppPattern(
  "sync status still has a ready-gated cloud save path",
  /syncStatus !== "ready"[\s\S]{0,1600}saveSharedState\(session\.user\.id, stateToSave\)/g,
);

assertAppPattern(
  "offline event queue is still processed when sync is ready",
  /if \(syncStatus === "ready"\) \{\s*void processEventQueue\(\);/g,
);

assertAppPattern(
  "sync load still applies cloud shared state after login",
  /loadSharedState\(session\.user\.id\)[\s\S]{0,600}applySharedState\(sharedState/g,
);

assertAppPattern(
  "polling still skips cloud loads while local changes are dirty",
  /if \(localDirtyRef\.current\) \{[\s\S]{0,180}\[POLLING\] skipped: local state has unsynced changes/g,
);

assertAppPattern(
  "polling still rejects stale cloud state",
  /incomingTime < highestKnownCloudTimeRef\.current[\s\S]{0,160}\[POLLING\] skipped: stale cloud state/g,
);

assertAppPattern(
  "shared state merge still merges local and cloud cards by id",
  /setCards\(\(currentCards\) => \{[\s\S]{0,180}mergeEntitiesById\(currentCards, next\.cards\)/g,
);

assertAppPattern(
  "shared state merge still merges action cards by id",
  /setActionCards\(\(current\) => \{[\s\S]{0,160}mergeEntitiesById\(current, next\.actionCards\)/g,
);

assertAppPattern(
  "shared state merge still preserves offline events",
  /setEvents\(\(currentEvents\) => \{[\s\S]{0,160}mergeEventsById\(currentEvents, next\.events\)/g,
);

assertAppPattern(
  "entity merge still preserves newer local tombstones",
  /if \(localItem\.deletedAt\) console\.log\(`\[MERGE\] Tombstone preserved/g,
);

assertAppPattern(
  "entity merge still rejects stale cloud tombstones",
  /else if \(cloudItem\.deletedAt\) console\.log\(`\[MERGE\] Rejecting stale cloud tombstone/g,
);

assertAppPattern(
  "login handler still uses logIn and sets the returned session",
  /async function handleLogIn\(email, password\)[\s\S]{0,220}await logIn\(email, password\)[\s\S]{0,260}setSession\(nextSession\)/g,
);

assertAppPattern(
  "invalid login path still sets a safe sync error instead of throwing through the UI",
  /async function handleLogIn\(email, password\)[\s\S]{0,700}catch \(error\)[\s\S]{0,180}setSyncError\(getSyncErrorMessage\(error, "Could not log in\."\)\)/g,
);

assertAppPattern(
  "logout handler still calls logOut and clears session",
  /async function handleLogOut\(\)[\s\S]{0,280}await logOut\(\)[\s\S]{0,240}setSession\(null\)/g,
);

assertSourcePattern(
  "storage",
  storageSource,
  "offline event queue key still exists",
  /mybishbash\.offline-event-queue\.v1/g,
);

assertSourcePattern(
  "sync",
  syncSource,
  "cloud state save helper still exists",
  /export async function saveSharedState\(userId, state\)/g,
);

assertSourcePattern(
  "sync",
  syncSource,
  "login helper still exists",
  /export async function logIn\(email, password\)/g,
);

assertSourcePattern(
  "sync",
  syncSource,
  "logout helper still exists",
  /export async function logOut\(\)/g,
);

assertSourcePattern(
  "launcherState",
  launcherStateSource,
  "destination href helper still exists",
  /export function getVersionOpenHref\(version,\s*\{\s*preferFastDestination = false\s*\} = \{\}\)/g,
);

assertSourcePattern(
  "launcherState",
  launcherStateSource,
  "iOS Safari fast launcher destinations preserve x-safari before web fallback",
  /if \(preferFastDestination\) \{[\s\S]{0,180}merged\.id === "safari" && platform === "ios"[\s\S]{0,220}merged\.iosAppUrl[\s\S]{0,260}return href;/g,
);

assertSourcePattern(
  "launcherState",
  launcherStateSource,
  "fast launcher destinations use app-capable web fallbacks before slow native deep links",
  /if \(preferFastDestination\) \{[\s\S]{0,500}merged\.webFallbackUrl[\s\S]{0,500}return href;/g,
);

assertSourcePattern(
  "launcherState",
  launcherStateSource,
  "fast launcher destinations strip x-safari prefixes",
  /function normalizeWebHref\(value\)[\s\S]{0,180}x-safari-/g,
);

assertSourcePattern(
  "launcherRegistry",
  launcherRegistrySource,
  "Safari default destinations distinguish desktop web fallback from iOS x-safari launch",
  /id:\s*"safari"[\s\S]{0,900}webFallbackUrl:\s*"https:\/\/www\.google\.com"[\s\S]{0,260}iosAppUrl:\s*"x-safari-https:\/\/www\.google\.com"/g,
);

assertSourcePattern(
  "launcherRegistry",
  launcherRegistrySource,
  "Safari default block does not point at the Apple Safari marketing page",
  /id:\s*"safari"(?:(?!id:\s*"youtube")[\s\S])*manualUrl:\s*"x-safari-https:\/\/www\.google\.com"/g,
);

assertSourcePattern(
  "launcherState",
  launcherStateSource,
  "intercept launcher context guard still exists",
  /route\.kind === "intercept" && isInterruptionLauncherContext\(route\.versionId\)/g,
);

assertSourcePattern(
  "launcherFlow",
  launcherFlowSource,
  "intercept readiness still blocks auth-pending launches",
  /if \(!authReady\) return \{ ready: false, reason: "auth_pending" \};/g,
);

assertSourcePattern(
  "launcherFlow",
  launcherFlowSource,
  "intercept readiness still blocks sync-pending launches",
  /syncStatus === "loading"[\s\S]{0,120}reason: "sync_pending"/g,
);

assertSourcePattern(
  "cardSelection",
  cardSelectionSource,
  "selection builds one card exposure lookup per selection cycle",
  /export function buildCardExposureLookup\(cards = \[\], events = \[\]\)[\s\S]{0,900}return exposureByCardId;/g,
);

assertSourceDoesNotMatch(
  "cardSelection",
  cardSelectionSource,
  "selection must not scan event history inside each card exposure lookup",
  /function getLastCardExposure\(card,[\s\S]{0,260}\.reduce\(/g,
);

const weightedSelectorCalls = [...appSource.matchAll(/selectWeightedLauncherCard\(\{/g)].length;
if (weightedSelectorCalls !== 1) {
  fail(`App should call selectWeightedLauncherCard only for the initial launcher decision; found ${weightedSelectorCalls}`);
} else {
  pass("App calls selectWeightedLauncherCard only for the initial launcher decision");
}

assertAppPattern(
  "intercept route reuses active launcher overlays before rebuilding selection",
  /if \(!isResumeInterceptLaunch && \["intercept-pack", "continue-to-app"\]\.includes\(overlay\?\.type\) && overlay\?\.versionId === route\.versionId\)[\s\S]{0,420}return;[\s\S]{0,1500}beginInterceptionFlow\(route\.versionId/g,
);

assertAppPattern(
  "intercept route reuses reveal and empty overlays before rebuilding selection",
  /if \(!isResumeInterceptLaunch && \["reveal", "empty"\]\.includes\(overlay\?\.type\) && overlay\?\.versionId === route\.versionId\) \{[\s\S]{0,80}return;[\s\S]{0,1500}beginInterceptionFlow\(route\.versionId/g,
);

function createPerfCards(now) {
  const earlier = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
  const personalCards = Array.from({ length: 100 }, (_, index) => ({
    id: `perf-personal-${index}`,
    promptText: `Personal ${index}`,
    dashboardTitle: `Personal ${index}`,
    timingWindows: ["day"],
    paused: false,
    disliked: false,
    deletedAt: null,
    sourcePackId: null,
    doneDate: null,
    notYetUntil: null,
    lastShownAt: null,
    statusToday: "fresh",
  }));
  const packCards = Array.from({ length: 500 }, (_, index) => ({
    id: `perf-pack-${index}`,
    promptText: `Pack ${index}`,
    dashboardTitle: `Pack ${index}`,
    timingWindows: ["morning"],
    paused: false,
    disliked: false,
    hidden: false,
    deletedAt: null,
    sourcePackId: `perf-pack-group-${Math.floor(index / 25)}`,
    lastShownAt: index % 11 === 0 ? earlier(45 + index) : null,
  }));
  return [...personalCards, ...packCards];
}

function createPerfEvents(now, count = 20000) {
  return Array.from({ length: count }, (_, index) => {
    const isPack = index % 3 !== 0;
    const cardId = isPack ? `perf-pack-${index % 500}` : `perf-personal-${index % 100}`;
    return {
      id: `perf-event-${index}`,
      event_type: isPack ? "first_interruption_seen" : "bash_done",
      card_id: cardId,
      bash_id: cardId,
      created_at: new Date(now.getTime() - ((index % 1440) * 60 * 1000 + Math.floor(index / 1440) * 1000)).toISOString(),
    };
  });
}

function measureSelection(label, select, { thresholdMs }) {
  select();
  const runs = [];
  let result = null;
  for (let index = 0; index < 5; index += 1) {
    const startedAt = performance.now();
    result = select();
    runs.push(performance.now() - startedAt);
  }
  const max = Math.max(...runs);
  const avg = runs.reduce((total, value) => total + value, 0) / runs.length;
  console.log(`PERF ${label}: avg=${avg.toFixed(2)}ms max=${max.toFixed(2)}ms runs=${runs.map((value) => value.toFixed(2)).join(",")}`);
  assertLessThanOrEqual(label, max, thresholdMs);
  return result;
}

const perfNow = new Date("2026-01-01T13:00:00.000Z");
const perfCards = createPerfCards(perfNow);
const perfEvents = createPerfEvents(perfNow, 20000);
const excludedPerfIds = new Set(["perf-pack-0", "perf-pack-25", "perf-personal-0"]);

const largeSelection = measureSelection(
  "selectWeightedLauncherCard handles 100 personal, 500 pack, and 20k events under 50ms",
  () =>
    selectWeightedLauncherCard({
      cards: perfCards,
      timezone: "Europe/London",
      events: perfEvents,
      excludedCardIds: excludedPerfIds,
      now: perfNow,
      random: () => 0.99,
    }),
  { thresholdMs: 50 },
);
assertTruthy("large event-history selection returns a valid card", largeSelection.selected);
assertTruthy("large event-history selection respects excluded cards", !excludedPerfIds.has(largeSelection.selected?.id));

const packOnlyAfterPersonalExhausted = selectWeightedLauncherCard({
  cards: [
    ...perfCards.slice(0, 100).map((card) => ({ ...card, doneDate: "2026-01-01", statusToday: "doneToday" })),
    ...perfCards.slice(100, 110),
  ],
  timezone: "Europe/London",
  events: perfEvents,
  now: perfNow,
  random: () => 0.99,
});
assertTruthy(
  "personal exhausted plus active pack cards returns a pack card, not caught-up",
  packOnlyAfterPersonalExhausted.selectedSource === "pack" && packOnlyAfterPersonalExhausted.selected,
);

const insideTimeoutFallback = selectWeightedLauncherCard({
  cards: [
    { ...perfCards[100], id: "timeout-pack-a", sourcePackId: "timeout-pack" },
    { ...perfCards[101], id: "timeout-pack-b", sourcePackId: "timeout-pack" },
  ],
  timezone: "Europe/London",
  events: [
    { card_id: "timeout-pack-a", created_at: "2026-01-01T12:55:00.000Z" },
    { card_id: "timeout-pack-b", created_at: "2026-01-01T12:50:00.000Z" },
  ],
  now: perfNow,
  random: () => 0,
});
assertTruthy(
  "active pack cards inside timeout still use fallback pack behaviour",
  insideTimeoutFallback.selectedSource === "pack" &&
    insideTimeoutFallback.eligiblePackCount === 0 &&
    insideTimeoutFallback.selected?.id === "timeout-pack-b",
);

const completionSelection = measureSelection(
  "completion flow next-card selection stays under 50ms",
  () =>
    selectWeightedLauncherCard({
      cards: perfCards,
      timezone: "Europe/London",
      events: perfEvents,
      excludedCardIds: new Set(["perf-pack-10", "perf-pack-11", "perf-personal-3"]),
      now: perfNow,
      random: () => 0.99,
    }),
  { thresholdMs: 50 },
);
assertTruthy("completion flow quickly returns the next card", completionSelection.selected);

const fakeLauncherDecisionStartedAt = performance.now();
const fakeLauncherDecision = selectWeightedLauncherCard({
  cards: perfCards,
  timezone: "Europe/London",
  events: perfEvents,
  excludedCardIds: new Set(),
  now: perfNow,
  random: () => 0.99,
});
const fakeLauncherDecisionMs = performance.now() - fakeLauncherDecisionStartedAt;
console.log(`PERF fake launcher local decision: ${fakeLauncherDecisionMs.toFixed(2)}ms`);
assertTruthy("fake launcher decision returns reveal/pack/continue input", fakeLauncherDecision.selected || fakeLauncherDecision.selectedSource === "none");
assertLessThanOrEqual("fake launcher local decision stays within 250ms experience budget", fakeLauncherDecisionMs, 250);

if (failures.length > 0) {
  console.error(`\nRelease guardrails failed: ${failures.length}`);
  process.exit(1);
}

console.log("\nRelease guardrails passed");
