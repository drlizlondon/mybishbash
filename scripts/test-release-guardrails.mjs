import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { selectEligibleCard } from "../src/lib/cardSelection.js";
import { buildLibrarySections } from "../src/lib/librarySections.js";
import { getCoverModel } from "../src/lib/generatedCover.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const onboardingSource = await readFile(new URL("../src/features/onboarding/Onboarding.jsx", import.meta.url), "utf8");
const logPanelSource = await readFile(new URL("../src/components/LogPanel.jsx", import.meta.url), "utf8");
const logScreenSource = await readFile(new URL("../src/features/log/LogScreen.jsx", import.meta.url), "utf8");
const downloadSource = await readFile(new URL("../src/features/marketing/DownloadPage.jsx", import.meta.url), "utf8");
const exploreSource = await readFile(new URL("../src/features/explore/ExplorePanel.jsx", import.meta.url), "utf8");
const generatedCoverSource = await readFile(new URL("../src/GeneratedPackCover.jsx", import.meta.url), "utf8");
const hqSource = await readFile(new URL("../src/features/hq/HQPanel.jsx", import.meta.url), "utf8");
const fakeLauncherBarSource = await readFile(new URL("../src/lib/FakeLauncherBar.jsx", import.meta.url), "utf8");
const launcherStateSource = await readFile(new URL("../src/lib/launcherState.js", import.meta.url), "utf8");
const launcherDestinationsSource = await readFile(new URL("../src/lib/launcherDestinations.js", import.meta.url), "utf8");
const cardSelectionSource = await readFile(new URL("../src/lib/cardSelection.js", import.meta.url), "utf8");
const registerServiceWorkerSource = await readFile(new URL("../src/registerServiceWorker.js", import.meta.url), "utf8");
const serviceWorkerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const eventLogSource = await readFile(new URL("../src/eventLog.js", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../src/storage.js", import.meta.url), "utf8");
const syncSource = await readFile(new URL("../src/lib/mybishbashSync.js", import.meta.url), "utf8");
const generatedCoverModelSource = await readFile(new URL("../src/lib/generatedCover.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const launcherEventsMigrationSource = await readFile(new URL("../supabase/migrations/202606130001_allow_authenticated_anonymous_launcher_events.sql", import.meta.url), "utf8");
const hqPackAdoptionMigrationSource = await readFile(new URL("../supabase/migrations/202606250001_hq_pack_adoption_summary.sql", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../src/app/router/routes.js", import.meta.url), "utf8");
const rootRouterFileSource = await readFile(new URL("../src/app/router/RootRouter.jsx", import.meta.url), "utf8");
const standardLibraryPanelSource = await readFile(new URL("../src/features/library/StandardLibraryPanel.jsx", import.meta.url), "utf8");
const cardActionsSource = await readFile(new URL("../src/features/cards/useCardActions.js", import.meta.url), "utf8");
const libraryListRowSource = await readFile(new URL("../src/features/library/LibraryListRow.jsx", import.meta.url), "utf8");
const expandableCollectionSource = await readFile(new URL("../src/features/library/ExpandableCollection.jsx", import.meta.url), "utf8");
const composerSource = await readFile(new URL("../src/features/composer/Composer.jsx", import.meta.url), "utf8");
const appsPanelSource = await readFile(new URL("../src/features/apps/AppsPanel.jsx", import.meta.url), "utf8");
const appManagementScreenSource = await readFile(new URL("../src/features/apps/AppManagementScreen.jsx", import.meta.url), "utf8");
const homeSpotlightTourSource = await readFile(new URL("../src/features/home/HomeSpotlightTour.jsx", import.meta.url), "utf8");
const mastheadSource = await readFile(new URL("../src/app/shell/Masthead.jsx", import.meta.url), "utf8");
const launchSessionDomainSource = await readFile(new URL("../src/domain/launcher/launchSession.js", import.meta.url), "utf8");
const overlayBuildersSource = await readFile(new URL("../src/features/launcher/overlayBuilders.js", import.meta.url), "utf8");
const overlayHostSource = await readFile(new URL("../src/features/launcher/OverlayHost.jsx", import.meta.url), "utf8");
const actionSuccessOverlaySource = await readFile(new URL("../src/features/launcher/ActionSuccessOverlay.jsx", import.meta.url), "utf8");
const continueToAppCardSource = await readFile(new URL("../src/features/launcher/ContinueToAppCard.jsx", import.meta.url), "utf8");

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

// Return the complete brace-balanced block introduced by `marker`. An empty
// result is deliberate: every assertion using the result then fails instead
// of silently passing against the wrong or a missing branch.
function sourceBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";
  const blockStart = source.indexOf("{", markerIndex + marker.length);
  if (blockStart === -1) return "";

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = blockStart; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && nextCharacter === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(markerIndex, index + 1);
    }
  }

  return "";
}

function assertMatchCount(label, source, pattern, expectedCount) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const count = [...source.matchAll(new RegExp(pattern.source, flags))].length;
  if (count !== expectedCount) {
    fail(label, `expected ${expectedCount}, found ${count}`);
    return;
  }
  pass(label);
}

const rootRouterSource = sourceBetween(rootRouterFileSource, "function RootRouter()", "export default RootRouter;");
const appBeforeHooksSource = sourceBetween(appSource, "function App()", "const initialState = useMemo");
const appDebugLogSource = sourceBetween(appSource, "function debugLog(...args)", "const TESTPILOT_CONFIG");
const registerServiceWorkerDebugLogSource = sourceBetween(registerServiceWorkerSource, "function debugLog(...args)", "export function registerServiceWorker()");
const launcherDestinationsDebugLogSource = sourceBetween(launcherDestinationsSource, "function debugLog(...args)", "export function getLauncherPlatform()");

// Phase 5 commit 6: IndexedDB is authoritative after the transition release.
// Inspect the active branches themselves so the check cannot pass merely
// because a mirror/IDB call exists elsewhere in storage.js. Routine IDB-mode
// writes must update the synchronous mirror and enqueue the matching IDB
// mutation, without also mutating the now-stale localStorage rollback copy.
const setStorageItemSource = sourceBlock(storageSource, "export function setStorageItem(key, value)");
const activeIdbSetSource = sourceBlock(setStorageItemSource, "if (isMirrorActive())");
const removeStorageItemSource = sourceBlock(storageSource, "export function removeStorageItem(key)");
const activeIdbRemoveSource = sourceBlock(removeStorageItemSource, "if (isMirrorActive())");
const getLocalStorageItemSource = sourceBlock(storageSource, "function getLocalStorageItem(key)");
const markMigrationRetrySource = sourceBlock(storageSource, "function markMigrationRetry()");
const markLegacyMutationSource = sourceBlock(storageSource, "function markLegacyMutationForReconciliation()");
const acknowledgeMigrationRetrySource = sourceBlock(storageSource, "function acknowledgeMigrationRetry(token)");
const queueIdbWriteSource = sourceBlock(storageSource, "function queueIdbWrite(run)");
const runHydrationSource = sourceBlock(storageSource, "async function runHydration()");
const settlePendingStorageWritesSource = sourceBlock(storageSource, "async function settlePendingStorageWrites(observedWrites = [])");
const reconcileSuccessfulSharedStateClearSource = sourceBlock(
  storageSource,
  "async function reconcileSuccessfulSharedStateClear({ clearRecovery, clearToken, clearedMirror })",
);
const finishSharedStateClearSource = sourceBlock(
  storageSource,
  "async function finishSharedStateClear({ clearRecovery, clearToken, clearedMirror, idbClearWrites, mirrorWasActive })",
);
const clearSharedStateSource = sourceBlock(storageSource, "export function clearSharedMyBishBashState()");

assertMatch(
  "active IDB set branch keeps synchronous mirror and queued IDB put",
  activeIdbSetSource,
  /if \(isMirrorActive\(\)\)[\s\S]*mirror\.set\(key, stringValue\)[\s\S]*queueIdbWrite\(\(\) => kvPut\(key, stringValue\)\)[\s\S]*return;/,
);
assertNoMatch(
  "active IDB set branch does not mutate localStorage",
  activeIdbSetSource,
  /\blocalStorage\.(?:setItem|removeItem)\(/,
);
assertMatch(
  "active IDB remove branch keeps synchronous mirror and queued IDB delete",
  activeIdbRemoveSource,
  /if \(isMirrorActive\(\)\)[\s\S]*mirror\.delete\(key\)[\s\S]*queueIdbWrite\(\(\) => kvDelete\(key\)\)[\s\S]*return;/,
);
assertNoMatch(
  "active IDB remove branch does not mutate localStorage",
  activeIdbRemoveSource,
  /\blocalStorage\.(?:setItem|removeItem)\(/,
);
assertNoMatch(
  "active IDB branches never request stale localStorage replay",
  activeIdbSetSource + activeIdbRemoveSource,
  /markMigrationRetry|markIdbMutationDuringReconciliation/,
);

// Once dual-write is gone, an IDB write/flush failure cannot make the old
// localStorage snapshot authoritative. A retry marker in either failure path
// would replay stale bytes over newer mirror/IDB state on the next boot.
assertMatch(
  "queued IDB writes still execute through the observable write promise",
  queueIdbWriteSource,
  /function queueIdbWrite\(run\)[\s\S]*Promise\.resolve\(run\(\)\)/,
);
assertNoMatch(
  "queued IDB write failure never requests stale localStorage replay",
  queueIdbWriteSource,
  /markMigrationRetry|markIdbMutationDuringReconciliation/,
);
assertMatch(
  "pending IDB flush still uses the bounded flush path",
  settlePendingStorageWritesSource,
  /withTimeout\([\s\S]*await flushWrites\(\)[\s\S]*Promise\.all\(observedWrites\)[\s\S]*WRITE_FLUSH_TIMEOUT_MS[\s\S]*catch/,
);
assertNoMatch(
  "IDB flush failure never requests stale localStorage replay",
  settlePendingStorageWritesSource,
  /markMigrationRetry|markIdbMutationDuringReconciliation/,
);
assertNoMatch(
  "retired IDB dual-write reconciliation hook is absent",
  storageSource,
  /markIdbMutationDuringReconciliation/,
);
assertMatchCount(
  "legacy authority mutation requests one reconciliation generation",
  markLegacyMutationSource,
  /markMigrationRetry\(\)/,
  1,
);
assertMatchCount(
  "read-only legacy selection and hydration fallback do not publish authority",
  runHydrationSource,
  /markMigrationRetry\(\)/,
  0,
);
assertMatchCount(
  "all-sink clear requests one durable reconciliation generation",
  clearSharedStateSource,
  /markMigrationRetry\(\)/,
  1,
);
assertMatch(
  "all-sink clear demotes while IDB deletes are unsettled",
  clearSharedStateSource,
  /if \(mirrorWasActive\)[\s\S]*mirror = null;[\s\S]*activeEngine = "localstorage";/,
);
assertMatch(
  "all-sink clear restores IDB only after durable deletes and safe reconciliation",
  finishSharedStateClearSource,
  /!idbClearSucceeded \|\| activeAllSinkClearRecovery !== clearRecovery[\s\S]*reconcileSuccessfulSharedStateClear\(\{ clearRecovery, clearToken, clearedMirror \}\)[\s\S]*if \(reconciledMirror === null\) return;[\s\S]*mirror = reconciledMirror;[\s\S]*activeEngine = "idb";/,
);
assertMatch(
  "all-sink clear reconciles only its own same-session legacy generation",
  reconcileSuccessfulSharedStateClearSource,
  /retry\.token === clearToken[\s\S]*acknowledgeMigrationRetry\(clearToken\)[\s\S]*retry\.token !== clearRecovery\.latestLegacyMutationToken[\s\S]*migrateLocalStorageIfNeeded\(\{ force: true \}\)[\s\S]*readMigrationRetry\(\)\.token !== retry\.token[\s\S]*acknowledgeMigrationRetry\(retry\.token\)/,
);
assertNoMatch(
  "all-sink clear failure does not publish a failure-driven replay generation",
  finishSharedStateClearSource + reconcileSuccessfulSharedStateClearSource,
  /markMigrationRetry\(\)/,
);
assertMatchCount(
  "migration retry marker is defined once and called only by mutation and all-sink clear",
  storageSource,
  /markMigrationRetry\(\)/,
  3,
);

// Exhaustive mutation allowlist. Each permitted call is pinned to its owning
// function and category, then the global count proves there is no seventh,
// unclassified localStorage writer hidden elsewhere in storage.js.
const allowedStorageMutations = [
  {
    label: "legacy engine set is the only routine localStorage set",
    source: setStorageItemSource,
    pattern: /window\.localStorage\.setItem\(key, value\)/,
  },
  {
    label: "legacy engine remove is the only routine localStorage remove",
    source: removeStorageItemSource,
    pattern: /window\.localStorage\.removeItem\(key\)/,
  },
  {
    label: "legacy-prefix migration may promote canonical localStorage bytes",
    source: getLocalStorageItemSource,
    pattern: /window\.localStorage\.setItem\(key, legacyValue\)/,
  },
  {
    label: "migration retry request remains a localStorage control write",
    source: markMigrationRetrySource,
    pattern: /window\.localStorage\.setItem\(MIGRATION_RETRY_REQUEST_KEY, token\)/,
  },
  {
    label: "migration retry acknowledgement remains a localStorage control write",
    source: acknowledgeMigrationRetrySource,
    pattern: /window\.localStorage\.setItem\(MIGRATION_RETRY_ACK_KEY, token\)/,
  },
  {
    label: "all-sink clear explicitly removes each canonical and legacy localStorage key",
    source: clearSharedStateSource,
    pattern: /window\.localStorage\.removeItem\(key\)/,
  },
];

for (const mutation of allowedStorageMutations) {
  assertMatchCount(mutation.label, mutation.source, mutation.pattern, 1);
}
assertMatch(
  "all-sink clear enumerates canonical and legacy owned keys",
  clearSharedStateSource,
  /const keys = \[\.\.\.SHARED_STORAGE_KEYS, \.\.\.LEGACY_SHARED_STORAGE_KEYS\]/,
);
assertMatchCount(
  "storage.js localStorage mutations are exactly the six classified exceptions",
  storageSource,
  /\blocalStorage\.(?:setItem|removeItem)\(/,
  allowedStorageMutations.length,
);

assertMatch("demo onboarding URL entrypoint is dev-only", appSource, /function shouldStartDemoOnboarding\(\) \{[\s\S]{0,140}!import\.meta\.env\.DEV/);
assertMatch("demo signup URL entrypoint is dev-only", appSource, /function shouldStartDemoSignup\(\) \{[\s\S]{0,140}!import\.meta\.env\.DEV/);
assertMatch("public marketing route selection lives above App hooks", rootRouterSource, /normalizedPath === "\/early-access"[\s\S]{0,900}normalizedPath === "\/terms"[\s\S]{0,700}EditableLandingPage/);
assertNoMatch("App does not return marketing routes before hooks", appBeforeHooksSource, /EditableLandingPage|EarlyAccessPage|DownloadPage|AboutPage|LegalPage/);
assertMatch("App debug logging is dev-only", appDebugLogSource, /import\.meta\.env\.DEV[\s\S]{0,80}console\.log/);
assertMatch("service worker registration debug logging is dev-only", registerServiceWorkerDebugLogSource, /import\.meta\.env\.DEV[\s\S]{0,80}console\.log/);
assertNoMatch("launcher destination debug logging is disabled outside app dev runtime", launcherDestinationsDebugLogSource, /console\.log/);
assertNoMatch("public service worker has no production console.log", serviceWorkerSource, /console\.log/);
assertNoMatch("LogPanel does not import recharts on the app critical path", logPanelSource, /from ["']recharts["']|BarChart|ResponsiveContainer|XAxis|YAxis|Tooltip/);
assertMatch("main app screens have memo boundaries", appSource, /const MemoHomePanel = memo\(HomePanel\);[\s\S]{0,260}const MemoAppsPanel = memo\(AppsPanel\);[\s\S]{0,260}const MemoStandardLibraryPanel = memo\(StandardLibraryPanel\);[\s\S]{0,260}const MemoLogPanel = memo\(LogPanel\);[\s\S]{0,260}const MemoExplorePanel = memo\(ExplorePanel\);[\s\S]{0,260}const MemoOverlay = memo\(Overlay\);/);
assertNoMatch("App render uses memoized main screens", appSource, /<HomePanel(?:\s|\/?>)|<AppsPanel(?:\s|\/?>)|<StandardLibraryPanel(?:\s|\/?>)|<LogPanel(?:\s|\/?>)|<ExplorePanel(?:\s|\/?>)|<Overlay(?:\s|\/?>)/);
// Re-pointed (Phase 3 R7): the log screen's store container owns this
// derivation now that App no longer drills the event log into LogPanel. Same
// assertion, same strength, new home — features/log/LogScreen.jsx.
assertMatch("Log weekly shift count is memoized", logScreenSource, /const weeklyShiftCount = useMemo\(\(\) => getWeeklyShiftCount\(events\), \[events\]\);/);
assertMatch("Apps panel clock is isolated below its memo boundary", appsPanelSource, /function AppsPanel\(\{[\s\S]{0,120}return <AppsPanelClock \{\.\.\.props\} \/>;[\s\S]{0,120}\}([\s\S]*?)function AppsPanelClock\(/);
assertMatch("Apps panel clock owns its live pause interval", appsPanelSource, /function AppsPanelClock\([\s\S]{0,1800}window\.setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/);

assertMatch("fake launcher sessions never allow Back to home", launchSessionDomainSource, /entrySurface === "fake_launcher"[\s\S]{0,280}allowBackHome: false/);
assertMatch("event log retries are idempotent by event id", eventLogSource, /upsert\(\[event\], \{\s*onConflict: "id",\s*ignoreDuplicates: true,\s*\}\)/);
assertMatch("shared state saves retry transient fetch failures", syncSource, /isTransientFetchError\(error\)[\s\S]{0,160}wait\(250 \* \(attempt \+ 1\)\)/);
assertMatch("launcher event transient fetch failures are non-fatal", syncSource, /saveLauncherEvent[\s\S]{0,900}isTransientFetchError\(error\) \? console\.warn : console\.error/);
assertMatch("authenticated launcher event policy permits anonymous pre-session writes", launcherEventsMigrationSource, /user_id is null and anonymous_device_id is not null/);
assertMatch("in-app fake launcher clicks open real destinations directly", appSource, /function handleFakeLauncherLaunch\(versionId, source\) \{[\s\S]{0,260}if \(!isInAppShortcutClick\(source\)\)[\s\S]{0,420}openDestinationApp\(versionId/);
assertNoMatch("home fake launcher bar is not wired to beginInterceptionFlow", appSource, /source:\s*"home_fake_launcher_bar"[\s\S]{0,240}beginInterceptionFlow/);
assertNoMatch("overlay fake launcher is not wired to beginInterceptionFlow", appSource, /source:\s*"overlay_fake_launcher"[\s\S]{0,240}beginInterceptionFlow/);
assertNoMatch("settings fake launcher is not wired to beginInterceptionFlow", appSource, /source:\s*"settings_fake_launcher"[\s\S]{0,240}beginInterceptionFlow/);
assertNoMatch("FakeLauncherBar does not navigate by itself", fakeLauncherBarSource, /window\.location\.assign|getVersionOpenHref/);
assertMatch("/intercept/:launcherId still starts the interception flow", appSource, /beginInterceptionFlow\(route\.versionId/);
assertMatch("continue-to-app still opens the real destination through openDestinationApp", appSource, /onContinueToApp=\{\(versionId, options\) => openDestinationApp\(versionId, options\)\}/);
// Security-shaped invariant (Phase 4c): openDestinationApp is the ONE place a
// resolved launcher destination reaches the browser. The previous form of this
// check used assertMatch, which is existence-only — it passed unchanged when a
// second `window.location.assign(href)` was added to App.jsx (proven by
// mutation 2026-07-27). Uniqueness must be counted, and every navigation sink
// in App.jsx must be enumerated, or a duplicate sink can be introduced under a
// different variable name and go unasserted.
assertMatch("openDestinationApp still performs the destination href assignment", appSource, /window\.location\.assign\(href\)/);
{
  const label = "openDestinationApp is the single destination href assignment";
  const hrefSinks = [...appSource.matchAll(/window\.location\.assign\(href\)/g)].length;
  if (hrefSinks !== 1) {
    fail(label, `expected exactly 1 window.location.assign(href) in App.jsx, found ${hrefSinks}`);
  } else {
    pass(label);
  }
}
{
  // Enumerated navigation sinks in App.jsx. Adding, removing or renaming one is
  // a deliberate act and must update this list in the same commit.
  //   href         — openDestinationApp, the single launcher destination sink
  //   fallbackHref — scheduleNativeSchemeFallback, fed only by openDestinationApp
  //   url          — openExternalActionUrl, https-validated action-card links
  const label = "App.jsx navigation sinks are exactly the three enumerated ones";
  const EXPECTED_SINKS = ["href", "fallbackHref", "url"];
  const sinks = [...appSource.matchAll(/window\.location\.assign\(([^)]*)\)/g)].map((match) => match[1].trim());
  if (sinks.length !== EXPECTED_SINKS.length || sinks.some((sink, index) => sink !== EXPECTED_SINKS[index])) {
    fail(label, `expected [${EXPECTED_SINKS.join(", ")}], found [${sinks.join(", ")}]`);
  } else {
    pass(label);
  }
}
assertMatch(
  "custom-scheme launches compute the timed-fallback decision",
  appSource,
  /const needsTimedFallback = shouldUseTimedWebFallback\(href\) && fallbackHref && fallbackHref !== href/,
);
assertMatch(
  "anchor-default continue links also arm the timed fallback",
  appSource,
  /if \(allowDefaultNavigation\) \{[\s\S]{0,500}scheduleNativeSchemeFallback\([\s\S]{0,200}return false;/,
);
assertMatch(
  "scheme fallback cancels on pagehide/blur/hidden so it never double-navigates",
  appSource,
  /function scheduleNativeSchemeFallback\(\{[\s\S]{0,900}visibilitychange[\s\S]{0,400}pagehide[\s\S]{0,400}blur[\s\S]{0,900}window\.location\.assign\(fallbackHref\)/,
);
assertMatch("fake launcher reveal completion routes terminal state to ContinueToAppCard", appSource, /if \(overlay\.type === "reveal"\) \{[\s\S]{0,2200}const nextOverlay = buildFakeLauncherContinueOverlay\(versionId, activationKey\);[\s\S]{0,450}routing to ContinueToAppCard/);
assertNoMatch("old weighted launcher selector is not used by the app", appSource, /selectWeightedLauncherCard\(\{/);
assertNoMatch("old weighted launcher selector is not exported", cardSelectionSource, /selectWeightedLauncherCard|personalWeight|packWeight|weightedFlow/);
assertMatch("App filters launch selection to non-commitment cards", appSource, /function getLaunchPersonalCardPool\(cards = \[\]\) \{[\s\S]{0,220}!isCommitmentCard\(card\)[\s\S]{0,120}cardKind/);
assertMatch("App uses Personal Card launch pool for launcher decisions", appSource, /selectEligibleCard\(\{[\s\S]{0,500}cards: getLaunchPersonalCardPool\(normalizedSelectionCards\),[\s\S]{0,500}timezone: profile\.timezone/);
// Re-pointed (Phase 3 R7): the home decision reads the event log non-reactively
// (getEventsStore().getState().events) so the launch-decision effect cannot
// re-trigger itself by logging launcher events. The assertion keeps both
// load-bearing halves — the Personal Card launch pool AND an events argument.
assertMatch("App uses Personal Card launch pool for home decisions", appSource, /selectEligibleCard\(\{[\s\S]{0,500}cards: getLaunchPersonalCardPool\(normalizedHomeCards\),[\s\S]{0,500}events: getEventsStore\(\)\.getState\(\)\.events,/);
assertNoMatch("home launch decision does not depend reactively on the event log", appSource, /globalInterruptionMode, events, authReady/);
assertNoMatch("App has no legacy selector call sites", appSource, /selectPersonalFirstLauncherCard\(\{/);
assertNoMatch("App has no manual pack card randomisation path", appSource, /source\[Math\.floor\(Math\.random\(\) \* source\.length\)\]/);
assertMatch("fake launcher event metadata records personal-first fallback", appSource, /selectedPath: "personal_first_fallback"/);
assertMatch("canonical card shown events are logged", appSource, /event_type: CARD_EVENT_TYPES\.SHOWN/);
// Phase 3 R7 re-point: this assertion's subject moved from App() into
// features/cards/useCardActions.js in Phase 4b. Re-pointed at the new home,
// with an assertNoMatch proving it was MOVED and not duplicated.
assertMatch("canonical card completed and ignored events are logged", cardActionsSource, /event_type: action === "done" \? CARD_EVENT_TYPES\.COMPLETED : CARD_EVENT_TYPES\.IGNORED/);
assertNoMatch("card completed/ignored logging does not remain in App", appSource, /event_type: action === "done" \? CARD_EVENT_TYPES\.COMPLETED : CARD_EVENT_TYPES\.IGNORED/);
assertMatch("Library renders Personal Cards section", standardLibraryPanelSource, /title="Personal Cards"[\s\S]{0,160}Cards you have written for yourself\./);
assertMatch("Library renders Commitment Cards section", standardLibraryPanelSource, /title="Commitment Cards"[\s\S]{0,160}Promises you've made to yourself\./);
assertMatch("Library renders Active Packs section", standardLibraryPanelSource, /title="Active Packs"[\s\S]{0,160}Packs you've added to your library\./);
assertMatch("Library renders Do Instead Cards section", standardLibraryPanelSource, /title="Do Instead Cards"[\s\S]{0,160}Things to do instead of opening an app\./);
assertMatch("Library default open states match product shape", standardLibraryPanelSource, /useState\(\{\s*personal: false,\s*commitments: false,\s*activePacks: false,\s*doInstead: false,\s*\}\)/);
assertMatch("Library uses compact list rows", libraryListRowSource, /function LibraryListRow[\s\S]{0,1500}className=\{`library-list-row/);
// "View all" footer is intentional — part of ExpandableCollection (shows when items > maxPreview)
assertMatch("Library View all footer is gated on hasMore", expandableCollectionSource, /hasMore[\s\S]{0,160}collection-view-all/);
assertMatch("Personal Library plus opens personal composer", appSource, /onCreatePersonal=\{\(\) => openCardComposerFromCurrentRoute\("personal"\)\}/);
assertMatch("Commitment Library plus opens commitment composer", appSource, /onCreateCommitment=\{\(\) => openCardComposerFromCurrentRoute\("commitment"\)\}/);
assertMatch("Active Packs Library plus opens Explore", appSource, /onAddPack=\{\(\) => navigateTo\("\/explore"\)\}/);
assertMatch("Composer can open in section-specific creation modes", composerSource, /function Composer\(\{ initialCard, initialKind = "personal"/);
assertMatch("Library section plus has its own click target", expandableCollectionSource, /className="library-section-add"[\s\S]{0,220}data-testid=\{`\$\{testId\}-add`\}[\s\S]{0,80}>\s*\+/);
assertMatch("Library section toggle remains separate from plus", expandableCollectionSource, /className="library-section-toggle"[\s\S]{0,220}aria-expanded=\{isOpen\}[\s\S]{0,120}data-testid=\{`\$\{testId\}-toggle`\}/);
// Explore replaced the Packs tab (docs/explore-architecture.md): discovery in
// ExplorePanel, app behaviour in Apps, action cards in Library →
// Do Instead Cards.
assertNoMatch("old PacksPanel is gone", appSource, /function PacksPanel\(/);
assertMatch("Explore tab renders memoized ExplorePanel", appSource, /activeTab === "explore" \? \(\s*<MemoExplorePanel/);
assertMatch("/packs redirects to Explore", routesSource, /normalized === "\/packs"\) return \{ kind: "explore", path: "\/explore", tab: "explore" \}/);
assertMatch("bottom nav exposes Explore", homeSpotlightTourSource, /data-testid="bottom-nav-explore"/);
assertMatch("bottom nav order is Home, Library, Log, Explore, Apps", appSource, /const BOTTOM_NAV_ITEMS = \[[\s\S]*testId: "bottom-nav-home"[\s\S]*testId: "bottom-nav-library"[\s\S]*testId: "bottom-nav-log"[\s\S]*testId: "bottom-nav-explore"[\s\S]*testId: "bottom-nav-apps"[\s\S]*\];/);
assertNoMatch("bottom nav no longer exposes Packs", appSource, /data-testid="bottom-nav-packs"/);
assertNoMatch("bottom nav no longer exposes Settings", appSource, /data-testid="bottom-nav-settings"/);
assertMatch("Settings is reachable from the masthead affordance", mastheadSource, /data-testid="settings-gear"/);
assertMatch("Explore commitment templates open the normal commitment composer", appSource, /function takeCommitmentTemplate\(template\)[\s\S]{0,360}setComposerInitialKind\("commitment"\)/);
assertMatch("Explore commitment templates return to Library after save", appSource, /function takeCommitmentTemplate\(template\)[\s\S]{0,900}composerReturnPathRef\.current = "\/library"/);
assertNoMatch("PR3 does not introduce installed commitments", appSource + exploreSource, /installedCommitment|commitmentInstall|activateCommitment|installed commitment/i);
assertNoMatch("Settings no longer owns app behaviour management", appSource, /data-testid=\{`settings-interruption-messages-\$\{version\.id\}`\}/);
assertMatch("Apps owns app behaviour management", appsPanelSource, /data-testid="apps-list"/);
assertMatch("Apps exposes app interruption toggles", appManagementScreenSource, /data-testid=\{`apps-interruptions-toggle-\$\{version\.id\}`\}/);
assertNoMatch("Activation copy avoids legacy fake-launcher language", onboardingSource + downloadSource, />[^<]*(fake launcher|interruption pack|library pack)/i);
assertMatch("Explore detail keeps a sticky install CTA", exploreSource, /data-testid="explore-install-button"/);
assertMatch("Explore renders a commitments rail", exploreSource, /data-testid="explore-commitments-rail"/);
assertMatch("Explore commitment CTA says Take this commitment", exploreSource, /Take this commitment/);
// Generated covers are the standard cover system. Uploaded artwork remains a
// data-level override, but the default path needs no manual cover design.
assertMatch("Explore renders uploaded covers as an override before generated covers", exploreSource, /if \(pack\?\.coverImageUrl\) \{[\s\S]{0,160}return <img[\s\S]{0,220}return <GeneratedPackCover/);
assertNoMatch("Explore cover override does not assume pack is defined", exploreSource, /if \(pack\.coverImageUrl\)/);
assertMatch("Generated covers use the fixed premium palette", generatedCoverModelSource, /COVER_PALETTES[\s\S]{0,1600}plum[\s\S]{0,1600}navy[\s\S]{0,1600}teal[\s\S]{0,1600}forest[\s\S]{0,1600}burgundy[\s\S]{0,1600}copper[\s\S]{0,1600}charcoal[\s\S]{0,1600}midnight-blue/);
assertNoMatch("Generated covers do not define texture or accent systems", generatedCoverModelSource + generatedCoverSource + stylesSource, /COVER_TEXTURES|COVER_ACCENTS|generated-cover-texture|generated-cover-accent-|cover-accent/);
assertNoMatch("Generated covers do not depend on goals, themes, or categories", generatedCoverModelSource + generatedCoverSource, /pack\.(goal|theme|category)|getGoalStyle|GOAL_STYLES/);
assertNoMatch("Generated cover art does not typeset preview quotes", generatedCoverModelSource + generatedCoverSource, /promptText|isPreview|getHookQuote|generated-cover-quote/);
assertMatch("GeneratedPackCover catches cover model failures before app render can crash", generatedCoverSource, /function getSafeCoverModel[\s\S]{0,900}try \{[\s\S]{0,900}catch \{/);
assertMatch("GeneratedPackCover has component-level fallback palette", generatedCoverSource, /FALLBACK_PALETTE[\s\S]{0,240}charcoal/);
assertNoMatch("HQ never frames a missing upload as a defect", hqSource, /No cover|Missing cover|Cover required/i);
assertNoMatch("HQ auto cover copy does not imply goal or preview quote inputs", hqSource, /Auto cover[^"]*(goal|first preview|preview card)/i);
assertMatch("HQ labels covers as Auto cover only", hqSource, />Auto cover<\/span>/);
assertNoMatch("HQ does not steer authors toward manual cover uploads", hqSource, /Upload custom cover|Custom cover|No cover|Missing cover|Cover required/i);
assertMatch("HQ pack form previews the generated cover live", hqSource, /data-testid="hq-generated-cover-preview"[\s\S]{0,120}<GeneratedPackCover pack=\{previewPack\}/);
assertMatch("HQ pack telemetry users are labelled as active users", hqSource, /MiniStat label="Active users" value=\{stats\.activeUsers \?\? 0\}/);
assertMatch("HQ pack adoption is labelled as users enabled", hqSource, /MiniStat label="Users enabled" value=\{stats\.usersEnabled \?\? 0\}/);
assertMatch("HQ pack adoption loads from saved state RPC", syncSource, /fetchAdminPackAdoptionSummary[\s\S]{0,240}hq_pack_adoption_summary/);
assertMatch("HQ pack adoption counts saved non-deleted pack cards", hqPackAdoptionMigrationSource, /state_json -> 'cards'[\s\S]{0,360}sourcePackId[\s\S]{0,240}deletedAt/);

const generatedCoverTitleCases = [
  "COURAGE",
  "APPLY PRESSURE",
  "PUT YOURSELF OUT THERE",
  "WHAT TO DO WHEN EVERYTHING FEELS LIKE IT IS FALLING APART",
  "11+",
  "A&E",
  "5AM",
  "GPT",
];
for (const [index, title] of generatedCoverTitleCases.entries()) {
  const model = getCoverModel({
    id: `guardrail-cover-${index}`,
    title,
    description: index % 2 === 0 ? "A useful one-line description for the cover card." : "",
    entries: Array.from({ length: 30 }, (_, cardIndex) => ({ id: `card-${cardIndex}` })),
  });
  const rebuiltTitle = model.titleLines.join(" ");
  if (rebuiltTitle === title && !rebuiltTitle.includes("…") && !rebuiltTitle.includes("...")) {
    pass(`generated cover preserves full title: ${title}`);
  } else {
    fail(`generated cover preserves full title: ${title}`, JSON.stringify(model));
  }
  if (/^\d+(\.\d+)?cqw$/.test(model.titleSize) && Number.parseFloat(model.titleSize) > 0) {
    pass(`generated cover computes responsive title size: ${title}`);
  } else {
    fail(`generated cover computes responsive title size: ${title}`, JSON.stringify(model));
  }
}

assertMatch("Explore Founding Access CTA is Coming Soon, not a payment flow", exploreSource, /Founding Access — Coming Soon/);
assertMatch("Premium install fails closed in activatePack", appSource, /pack\.isPremium === true && !canUsePremiumContent\) return;/);
assertMatch("fake launcher interruption remains planned as second layer", appSource, /const plannedInterruption = interruption;/);
assertNoMatch("interruption must not be disabled by old weighted activation state", appSource, /const plannedInterruption = useWeightedFlow && !selected \? null : interruption/);
assertNoMatch("interruption on with no layer-one card uses caught-up instead of direct continue", appSource, /if \(interruptionEnabled\) \{[\s\S]{0,620}buildFakeLauncherContinueOverlay\(versionId, activationKey\)/);
assertMatch("fake launcher empty state uses caught-up headline", overlayHostSource, /headline=\{isIntercept \? "You're all caught up\." : "You're all caught up for now\."\}/);
assertMatch("fake launcher empty state has launcher-specific Continue", overlayHostSource, /label: `Continue to \$\{appName\}`/);
assertMatch("real app empty state stays softer than fake launcher empty state", overlayHostSource, /subtitle=\{isIntercept \? "See you later\." : ""\}/);
assertNoMatch("action success does not continue to the original launcher", appSource, /source: "action_card_success"[\s\S]{0,220}onContinueToApp/);
assertMatch("action success returns home after no-url alternatives", actionSuccessOverlaySource, /function ActionSuccessOverlay[\s\S]{0,180}label: "Back home"/);

const launcherCardActionsSource = sourceBetween(overlayBuildersSource, "function getLauncherCardActions", "function buildEmptyOverlay");
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

const continueCardSource = continueToAppCardSource;
assertMatch("ContinueToAppCard renders the continue-to-app test id", continueCardSource, /data-testid="continue-to-app-card"/);
assertNoMatch("ContinueToAppCard does not assign window.location directly", continueCardSource, /window\.location\.assign/);

assertMatch("update banner is suppressed while overlays are active", appSource, /const showAppUpdateBanner = appUpdate\.updateAvailable && !overlay;/);
assertMatch("update banner uses deferred visibility guard", appSource, /\{showAppUpdateBanner \? \(/);
const serviceWorkerInstallSource = sourceBetween(serviceWorkerSource, 'self.addEventListener("install"', 'self.addEventListener("activate"');
const serviceWorkerFetchSource = sourceBetween(serviceWorkerSource, 'self.addEventListener("fetch"', 'self.addEventListener("push"');
const serviceWorkerHtmlSource = sourceBetween(serviceWorkerSource, "async function networkFirstHtml", "async function networkFirst");
assertNoMatch("service worker install does not force skipWaiting", serviceWorkerInstallSource, /self\.skipWaiting\(\)/);
assertNoMatch("service worker activate does not always claim clients", serviceWorkerSource, /\.then\(\(\) => self\.clients\.claim\(\)\)/);
assertMatch("service worker only claims clients after explicit update", serviceWorkerSource, /shouldClaimClients \? self\.clients\.claim\(\) : undefined/);
assertMatch("service worker cache-firsts immutable build assets", serviceWorkerFetchSource, /const fetchStrategy = isImmutableBuildAsset\(url\.pathname\) \? cacheFirst : networkFirst;[\s\S]{0,120}fetchStrategy\(event\.request, RUNTIME_CACHE\)/);
assertMatch("service worker only treats hashed JS and CSS assets as immutable", serviceWorkerSource, /function isImmutableBuildAsset\(pathname\) \{[\s\S]{0,220}\/\\\/assets\\\/\[\^\/\]\+-\[A-Za-z0-9_-\]\{8,\}\\\.\(\?:js\|css\)\$\/\.test\(pathname\)/);
assertMatch("service worker keeps HTML network-first with no-store", serviceWorkerHtmlSource, /fetch\(request, \{ cache: "no-store" \}\)/);
assertMatch("service worker keeps version.json network-only", serviceWorkerFetchSource, /version\.json[\s\S]{0,140}fetch\(event\.request, \{ cache: "no-store" \}\)/);

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
  () => selectEligibleCard({
    cards: perfCards,
    timezone: "Europe/London",
    events: perfEvents,
    now,
    settings: { personalCardCooldownMs: 0 },
    random: () => 0.99,
  }),
  50,
);
if (largeSelection.selectedSource === "personal" && largeSelection.selectedPriority === "primary") {
  pass("large selection stays personal-first when personal cards exist");
} else {
  fail("large selection stays personal-first when personal cards exist", JSON.stringify(largeSelection));
}

const packFallback = selectEligibleCard({
  cards: [personal("done", { doneDate: "2026-01-01", statusToday: "doneToday" }), pack("pack-fallback")],
  timezone: "Europe/London",
  now,
});
if (packFallback.selectedSource === "pack" && packFallback.selectionReason === "no_eligible_primary_cards") {
  pass("pack fallback is used only when no primary cards are eligible");
} else {
  fail("pack fallback is used only when no primary cards are eligible", JSON.stringify(packFallback));
}

const caughtUp = selectEligibleCard({
  cards: [personal("paused", { paused: true }), pack("hidden", { hidden: true })],
  timezone: "Europe/London",
  now,
});
if (!caughtUp.selected && caughtUp.selectionReason === "no_eligible_primary_or_fallback_cards") {
  pass("caught-up only occurs when no primary or fallback cards are eligible");
} else {
  fail("caught-up only occurs when no primary or fallback cards are eligible", JSON.stringify(caughtUp));
}

const libraryCards = [
  personal("personal-library"),
  personal("commitment-library", { cardKind: "commitment", commitmentReason: "Because I said I would." }),
  pack("active-pack-a", { sourcePackId: "pack-alpha" }),
  pack("active-pack-b", { sourcePackId: "pack-alpha" }),
  pack("active-pack-hidden-deleted", { sourcePackId: "pack-beta", deletedAt: now.toISOString() }),
  personal("deleted-personal", { deletedAt: now.toISOString() }),
  ...Array.from({ length: 50 }, (_, index) => personal(`many-personal-${index}`)),
];
const librarySections = buildLibrarySections({
  cards: libraryCards,
  libraryPacks: [{ id: "pack-alpha", title: "Alpha Pack" }],
});
if (
  librarySections.personal.some((item) => item.id === "personal-library") &&
  librarySections.personal.some((item) => item.id === "many-personal-49") &&
  !librarySections.personal.some((item) => item.id === "commitment-library") &&
  !librarySections.personal.some((item) => item.id === "pack-alpha") &&
  librarySections.personal.length === 51
) {
  pass("personal cards appear only in Personal Cards and include all 50+ items");
} else {
  fail("personal cards appear only in Personal Cards and include all 50+ items", JSON.stringify(librarySections.personal));
}
if (
  librarySections.commitments.length === 1 &&
  librarySections.commitments[0].id === "commitment-library" &&
  !librarySections.commitments.some((item) => item.id === "personal-library")
) {
  pass("commitment cards appear only in Commitment Cards");
} else {
  fail("commitment cards appear only in Commitment Cards", JSON.stringify(librarySections.commitments));
}
if (
  librarySections.activePacks.length === 1 &&
  librarySections.activePacks[0].id === "pack-alpha" &&
  librarySections.activePacks[0].count === 2 &&
  librarySections.activePacks[0].representative.promptText === "Alpha Pack"
) {
  pass("active packs appear only in Active Packs with correct counts");
} else {
  fail("active packs appear only in Active Packs with correct counts", JSON.stringify(librarySections.activePacks));
}

if (failures.length > 0) {
  console.error(`\nRelease guardrails failed: ${failures.length}`);
  process.exit(1);
}

console.log("\nRelease guardrails passed");
