import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { selectEligibleCard } from "../src/lib/cardSelection.js";
import { buildLibrarySections } from "../src/lib/librarySections.js";
import { getCoverModel } from "../src/lib/generatedCover.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const onboardingSource = await readFile(new URL("../src/features/onboarding/Onboarding.jsx", import.meta.url), "utf8");
const logPanelSource = await readFile(new URL("../src/components/LogPanel.jsx", import.meta.url), "utf8");
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
const syncSource = await readFile(new URL("../src/lib/mybishbashSync.js", import.meta.url), "utf8");
const generatedCoverModelSource = await readFile(new URL("../src/lib/generatedCover.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const launcherEventsMigrationSource = await readFile(new URL("../supabase/migrations/202606130001_allow_authenticated_anonymous_launcher_events.sql", import.meta.url), "utf8");
const hqPackAdoptionMigrationSource = await readFile(new URL("../supabase/migrations/202606250001_hq_pack_adoption_summary.sql", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../src/app/router/routes.js", import.meta.url), "utf8");
const rootRouterFileSource = await readFile(new URL("../src/app/router/RootRouter.jsx", import.meta.url), "utf8");
const standardLibraryPanelSource = await readFile(new URL("../src/features/library/StandardLibraryPanel.jsx", import.meta.url), "utf8");
const libraryListRowSource = await readFile(new URL("../src/features/library/LibraryListRow.jsx", import.meta.url), "utf8");
const expandableCollectionSource = await readFile(new URL("../src/features/library/ExpandableCollection.jsx", import.meta.url), "utf8");
const composerSource = await readFile(new URL("../src/features/composer/Composer.jsx", import.meta.url), "utf8");
const appsPanelSource = await readFile(new URL("../src/features/apps/AppsPanel.jsx", import.meta.url), "utf8");
const appManagementScreenSource = await readFile(new URL("../src/features/apps/AppManagementScreen.jsx", import.meta.url), "utf8");
const homeSpotlightTourSource = await readFile(new URL("../src/features/home/HomeSpotlightTour.jsx", import.meta.url), "utf8");
const mastheadSource = await readFile(new URL("../src/app/shell/Masthead.jsx", import.meta.url), "utf8");
const launchSessionStorageSource = await readFile(new URL("../src/features/launcher/launchSessionStorage.js", import.meta.url), "utf8");
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

const rootRouterSource = sourceBetween(rootRouterFileSource, "function RootRouter()", "export default RootRouter;");
const appBeforeHooksSource = sourceBetween(appSource, "function App()", "const initialState = useMemo");
const appDebugLogSource = sourceBetween(appSource, "function debugLog(...args)", "const TESTPILOT_CONFIG");
const registerServiceWorkerDebugLogSource = sourceBetween(registerServiceWorkerSource, "function debugLog(...args)", "export function registerServiceWorker()");
const launcherDestinationsDebugLogSource = sourceBetween(launcherDestinationsSource, "function debugLog(...args)", "export function getLauncherPlatform()");

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
assertMatch("Log weekly shift count is memoized", appSource, /const weeklyShiftCount = useMemo\(\(\) => getWeeklyShiftCount\(events\), \[events\]\);/);
assertMatch("Apps panel clock is isolated below its memo boundary", appsPanelSource, /function AppsPanel\(\{[\s\S]{0,120}return <AppsPanelClock \{\.\.\.props\} \/>;[\s\S]{0,120}\}([\s\S]*?)function AppsPanelClock\(/);
assertMatch("Apps panel clock owns its live pause interval", appsPanelSource, /function AppsPanelClock\([\s\S]{0,1800}window\.setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/);

assertMatch("fake launcher sessions never allow Back to home", launchSessionStorageSource, /entrySurface === "fake_launcher"[\s\S]{0,280}allowBackHome: false/);
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
assertMatch("openDestinationApp is the single destination href assignment", appSource, /window\.location\.assign\(href\)/);
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
assertMatch("App uses Personal Card launch pool for home decisions", appSource, /selectEligibleCard\(\{[\s\S]{0,500}cards: getLaunchPersonalCardPool\(normalizedHomeCards\),[\s\S]{0,500}events,/);
assertNoMatch("App has no legacy selector call sites", appSource, /selectPersonalFirstLauncherCard\(\{/);
assertNoMatch("App has no manual pack card randomisation path", appSource, /source\[Math\.floor\(Math\.random\(\) \* source\.length\)\]/);
assertMatch("fake launcher event metadata records personal-first fallback", appSource, /selectedPath: "personal_first_fallback"/);
assertMatch("canonical card shown events are logged", appSource, /event_type: CARD_EVENT_TYPES\.SHOWN/);
assertMatch("canonical card completed and ignored events are logged", appSource, /event_type: action === "done" \? CARD_EVENT_TYPES\.COMPLETED : CARD_EVENT_TYPES\.IGNORED/);
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
