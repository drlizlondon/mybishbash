import React, { Suspense, lazy, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LogPanel } from "./components/LogPanel";
import { LogGlyph } from "./components/Glyphs";
import { BrandMark } from "./components/BrandMark";
import {
  DEFAULT_HOME_SCREEN_VERSIONS,
  DEFAULT_ACTION_CARDS,
  clearSharedMyBishBashState,
  loadCards,
  loadCardPacks,
  loadDislikedPackCardIds as loadHiddenPackCardIdsCompat,
  loadGlobalInterruptionMode,
  loadHiddenLibraryPacks,
  loadHomeScreenVersions,
  loadLauncherBehaviorSettings,
  loadMood,
  loadNotificationSettings,
  loadProfile,
  loadActionCards,
  loadSetupComplete,
  saveCards,
  saveCardPacks,
  saveDislikedPackCardIds as saveHiddenPackCardIdsCompat,
  saveGlobalInterruptionMode,
  saveHiddenLibraryPacks,
  saveHomeScreenVersions,
  saveLauncherBehaviorSettings,
  saveNotificationSettings,
  saveProfile,
  saveActionCards,
  saveSetupComplete,
  isAppPaused,
  getAppPauseExpiry,
  pauseApp,
  clearAppPause,
  clearExpiredAppPause,
  loadTimingWindowsPrefs,
  saveTimingWindowsPrefs,
} from "./storage";
import {
  createEventRecord,
  getStartOfWeek,
  loadEventLog,
  persistEventRecord,
  saveEventLog,
  mergeEventsById,
  processEventQueue,
} from "./eventLog";
import {
  getSyncErrorMessage,
  loadSharedState,
  saveSharedState,
  getSession,
  signUp,
  logIn,
  resetPassword,
  logOut,
  deleteCurrentAccount,
  markNotificationOpened,
  saveLauncherEvent,
  saveNotificationPreferences,
  savePushSubscription,
  fetchGlobalPacks,
  fetchLauncherConfigs,
  fetchOwnAccessProfile,
  rememberSignupHandoffReference,
  validateAndRememberGateAccessCode,
  claimAccessCodeForCurrentUser,
  touchUserProfile,
} from "./lib/mybishbashSync";
import { isAccessActive, resolveEntitlements, isUnlimited } from "./lib/accessCapabilities";
import { reportError } from "./services/errors/reporter";
import ExplorePanel from "./features/explore";
import { formatPauseRemaining } from "./lib/pauseFormat";
import {
  PACKS,
  DEFAULT_WINDOW_DEFS,
  setWindowDefs,
  isValidWindowDefs,
  applyCardAction,
  buildEligibleCommitmentLifecycleCards,
  buildCardsFromPack,
  createId,
  getHomeSortRank,
  getThemeClass,
  getCurrentWindow,
  isEligible,
  isCommitmentCheckInCard,
  isCommitmentEncouragementCard,
  isCommitmentReviewCard,
  isPackCardAvailable,
  normalizeCards,
  getTodayKey,
  resolveTheme,
  isCommitmentCard,
  isCardDoneToday,
} from "./utils";
import {
  NORMAL_LAUNCHER_CONTEXT,
  INTERRUPTION_LAUNCHER_CONTEXTS,
  DEFAULT_INTERRUPTION_PACKS,
  getLauncherContextFromRoute,
  normalizeInterruptionPack,
  getStoredInterruptionPackForTarget,
  getPackDislikeKey as getLegacyHiddenPackCardKey,
  buildInterruptionFolder,
  getInterruptionPackForLauncher,
  resolveVersionConfig,
  buildCustomPackOverlay,
  buildInterruptionHomeItem,
  pickInterruptionCardIndex,
  getVersionOpenHref,
  resolveLauncherDestination,
} from "./lib/launcherState";
import { shouldUseTimedWebFallback } from "./lib/launcherDestinations";
import { buildCustomLauncher, getLauncherConfig, isKnownLauncher, mergeLauncherConfig, resolveLauncherIconSrc, APPS_OPTION_IDS } from "./lib/launcherRegistry";
import { cacheAndRegisterDynamicLaunchers } from "./lib/dynamicLauncherCache";
import {
  LAUNCHER_CONTEXTS,
  getAvailableLaunchersForUser,
  isLauncherVisibleInContext,
  shouldBlockCrossAppLaunch,
} from "./lib/launcherAvailability";
import { buildLibrarySections } from "./lib/librarySections";
import {
  FAKE_LAUNCHER_FLOW_STEPS,
  buildFakeLauncherFlowContext,
  getInitialFakeLauncherStep,
  getLauncherDecisionReadiness,
  getNextFakeLauncherStepAfterActionCard,
  getNextFakeLauncherStepAfterInterruption,
  getNextFakeLauncherStepAfterSelectedCard,
  LAUNCHER_DATA_WAIT_TIMEOUT_MS,
} from "./lib/launcherFlow";
import { buildLauncherEventPayload, getAppDisplayMode } from "./lib/launcherEvents";
import {
  buildMorningSummary,
  getPreviousDateKey,
  markMorningSummarySeen,
  shouldAutoShowMorningSummary,
} from "./morningSummary";
import {
  buildCardExposureLookup,
  CARD_EVENT_TYPES,
  DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS,
  selectEligibleCard,
} from "./lib/cardSelection";
import {
  DiagnosticsModal,
  FeedbackModal,
  MyReportsModal,
  ReportIssueModal,
  TesterFloatingButton,
  TesterToolsSheet,
  TestPilotProvider,
} from "./testing/TestPilot";
import "./testing/TestPilot/testPilot.css";
import Onboarding, { DEFAULT_ACTION_CARD_TITLES, DEFAULT_INTERRUPTER_CARDS, DEFAULT_PERSONAL_CARD_TEXTS } from "./features/onboarding";
import { SyncConnectionScreen } from "./features/auth";
import { SettingsPanel, MorningSummaryModal } from "./features/settings";
import { TodayPersonalCardsPanel, StandardLibraryPanel, PackDetailModal } from "./features/library";
import Composer, { PackEditor, CustomPackEditor, ActionCardEditor } from "./features/composer";
import AppsPanel, { LauncherSetupInterstitial } from "./features/apps";
import { AccessPanel, FreeCoreReconciliationScreen } from "./features/access";
import { HomeGlyph, BookGlyph, PacksGlyph, AppsGlyph } from "./app/shell/glyphs";
import Masthead from "./app/shell/Masthead";
import HomePanel, { HomeSpotlightTour } from "./features/home";
import {
  buildLaunchSession,
  persistLaunchSession,
  loadActiveProtectedAppContext,
  persistActiveProtectedAppContext,
  clearActiveProtectedAppContext,
  buildLaunchSessionForRoute,
} from "./features/launcher/launchSessionStorage";
import {
  buildRevealOverlay,
  buildFakeLauncherOverlayContext,
  buildFakeLauncherRevealOverlay,
  buildFakeLauncherContinueOverlay,
  buildFakeLauncherEmptyOverlay,
  buildFakeLauncherPreparingOverlay,
  getLaunchSessionForOverlay,
  isInAppShortcutClick,
  isInstalledFakeLauncherEntry,
  getVisibleDestinationChips,
  getLauncherCardActions,
  getCardSelectionSurfaceForOverlay,
  getActiveFakeLauncherReturnContext,
  buildEmptyOverlay,
  buildActionCardOverlay,
  buildActionCardEmptyOverlay,
  buildActionSuccessOverlay,
  buildFlowConfirmationOverlay,
  buildCommitmentMotivationOverlay,
  getCommitmentAcknowledgementMessage,
  getCommitmentCheckInOutcomeMessage,
  getCommitmentReviewOutcomeMessage,
} from "./features/launcher/overlayBuilders";
import { logCommitmentDebug } from "./features/launcher/commitmentDebug";
import { debugLaunch } from "./features/launcher/launchDebug";
import {
  OverlayHost as Overlay,
  ActiveProtectedAppShortcut,
  ContinueToAppCard,
  CommitmentCardOverlay,
  CommitmentMotivationOverlay,
  CommitmentCheckInOverlay,
  CommitmentEncouragementOverlay,
  CommitmentReviewOverlay,
} from "./features/launcher";
import { refreshMyBishBashAppShell } from "./appUpdate";
import {
  BASE_PATH,
  normalizeRoutePath,
  getPathRelativeToKnownBase,
  getRouteFromLocation,
  parseRoute,
  getSafeAppTab,
  getBottomNavItems,
} from "./app/router/routes";
import { useRoute } from "./app/router/useRoute";
import {
  useThemePreference,
  useAppUpdateStatus,
  useOfflineFlag,
  useNotificationPermission,
} from "./app/providers/environment";
import { useAuthLifecycle } from "./app/providers/auth";
import {
  isE2EModeEnabled,
  isDemoModeEnabled,
  loadE2EAccessProfile,
  recordLaunchTiming,
} from "./app/e2e";
import { useSessionStore, getSessionActions } from "./stores/sessionStore";

const HQPanel = lazy(() => import("./features/hq"));

function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

const TESTPILOT_CONFIG = {
  productName: "myBishBash",
  uiLabel: "Tester Mode",
  accent: "#D9654C",
  appVersion: import.meta.env.VITE_APP_VERSION ?? import.meta.env.VITE_GIT_SHA ?? "0.1.0",
};

const SUPPRESS_HOME_AUTOLAUNCH_AFTER_DESTINATION_KEY = "mybishbash.suppress-home-autolaunch-after-destination.v1";
// How long a custom-scheme launch gets to background the page before the web
// fallback fires. Long enough for the OS app switch on slow devices, short
// enough that a dead button visibly recovers.
const NATIVE_SCHEME_FALLBACK_MS = 1400;
const INSTALLED_LAUNCHER_SHELL_KEY = "mybishbash.installed-launcher-shell.v1";
const SUPPRESS_STANDALONE_LAUNCHER_RECOVERY_KEY = "mybishbash.suppress-standalone-launcher-recovery.v1";
const SUPPRESS_INSTALLED_SHELL_CARD_CONTEXT_KEY = "mybishbash.suppress-installed-shell-card-context.v1";
const LAUNCHER_BEHAVIOR_SETTINGS_KEY = "mybishbash.launcher-behavior-settings.v1";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";
const SIGNUP_ONBOARDING_PENDING_KEY = "mybishbash.signup-onboarding-pending.v1";
const BOTTOM_NAV_ITEMS = [
  { id: "home", label: "Home", path: "/home", testId: "bottom-nav-home", Glyph: HomeGlyph },
  { id: "library", label: "Library", path: "/library", testId: "bottom-nav-library", Glyph: BookGlyph },
  { id: "log", label: "Log", path: "/log", testId: "bottom-nav-log", Glyph: LogGlyph },
  { id: "explore", label: "Explore", path: "/explore", testId: "bottom-nav-explore", Glyph: PacksGlyph },
  { id: "apps", label: "Apps", path: "/apps", testId: "bottom-nav-apps", Glyph: AppsGlyph },
];

function hasSignupOnboardingPending() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIGNUP_ONBOARDING_PENDING_KEY) === "true";
}

function markHomeAutoLaunchSuppressedAfterDestination() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SUPPRESS_HOME_AUTOLAUNCH_AFTER_DESTINATION_KEY, "true");
  } catch {
    // Session storage can be unavailable in constrained browser contexts.
  }
}

function consumeHomeAutoLaunchSuppressedAfterDestination() {
  if (typeof window === "undefined") return false;
  try {
    const value = window.sessionStorage.getItem(SUPPRESS_HOME_AUTOLAUNCH_AFTER_DESTINATION_KEY) === "true";
    if (value) {
      window.sessionStorage.removeItem(SUPPRESS_HOME_AUTOLAUNCH_AFTER_DESTINATION_KEY);
    }
    return value;
  } catch {
    return false;
  }
}

export { isStandaloneDisplayMode, getLauncherSetupUrl, getLauncherBrowserSetupUrl } from "./lib/launcherSetupUrl";
import { isStandaloneDisplayMode, getLauncherSetupUrl, getBrowserSafeDestinationHref } from "./lib/launcherSetupUrl";

export function consumeSignupHandoffFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const wantsSignup = params.get("signup") === "1";
  const handoffRef = String(params.get("handoff") ?? "").trim();
  if (!wantsSignup || !handoffRef) return;

  const rawExpiresAt = params.get("handoffExpires");
  const fallbackExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  rememberSignupHandoffReference(handoffRef, rawExpiresAt || fallbackExpiresAt);
  params.delete("handoff");
  params.delete("handoffExpires");
  const nextSearch = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
}

function getInstalledLauncherShellId() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INSTALLED_LAUNCHER_SHELL_KEY) || "null");
    const launcherId = parsed?.launcher_id ?? parsed?.launcherId ?? parsed?.id ?? null;
    return isKnownLauncher(launcherId) ? launcherId : null;
  } catch {
    return null;
  }
}

function suppressStandaloneLauncherRecoveryOnce() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SUPPRESS_STANDALONE_LAUNCHER_RECOVERY_KEY, "true");
  } catch {
    // Session storage can be unavailable in constrained browser contexts.
  }
}

function consumeStandaloneLauncherRecoverySuppression() {
  if (typeof window === "undefined") return false;
  try {
    const value = window.sessionStorage.getItem(SUPPRESS_STANDALONE_LAUNCHER_RECOVERY_KEY) === "true";
    if (value) {
      window.sessionStorage.removeItem(SUPPRESS_STANDALONE_LAUNCHER_RECOVERY_KEY);
    }
    return value;
  } catch {
    return false;
  }
}

function suppressInstalledShellCardContext() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SUPPRESS_INSTALLED_SHELL_CARD_CONTEXT_KEY, "true");
  } catch {
    // Session storage can be unavailable in constrained browser contexts.
  }
}

function clearInstalledShellCardContextSuppression() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SUPPRESS_INSTALLED_SHELL_CARD_CONTEXT_KEY);
  } catch {
    // Session storage can be unavailable in constrained browser contexts.
  }
}

function isInstalledShellCardContextSuppressed() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SUPPRESS_INSTALLED_SHELL_CARD_CONTEXT_KEY) === "true";
  } catch {
    return false;
  }
}

function loadExplicitLauncherBehaviorSettings() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LAUNCHER_BEHAVIOR_SETTINGS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function setSignupOnboardingPending(value) {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(SIGNUP_ONBOARDING_PENDING_KEY, "true");
    return;
  }
  window.localStorage.removeItem(SIGNUP_ONBOARDING_PENDING_KEY);
}

function getOverlayDebugSnapshot(overlay, routePath = "") {
  return {
    type: overlay?.type ?? null,
    versionId: overlay?.versionId ?? null,
    activationKey: overlay?.activationKey ?? null,
    cardId: overlay?.cardId ?? null,
    routePath,
    timestamp: new Date().toISOString(),
  };
}

function getCardDebugSnapshot(card) {
  if (!card) return { id: null, title: null };
  return {
    id: card.id ?? null,
    title: card.dashboardTitle ?? card.promptText ?? card.title ?? card.name ?? null,
  };
}

function isSameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getLaunchPersonalCardPool(cards = []) {
  return cards.filter((card) => !isCommitmentCard(card) && !String(card?.cardKind ?? "").startsWith("commitment"));
}

function resolveRevealCard(cards, cardId, timezone) {
  if (!cardId) return null;
  const storedCard = cards.find((card) => card.id === cardId);
  if (storedCard) return storedCard;
  return buildEligibleCommitmentLifecycleCards(cards, new Date(), timezone)
    .find((card) => card.id === cardId) ?? null;
}

if (typeof window !== "undefined") {
  window.__bishbashLaunchDebug = () => JSON.parse(window.localStorage.getItem("bishbash.launchDebug.v1") || "[]");
}

class AppShellErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[APP_SHELL_ERROR]", error, info);
    reportError(error, "boundary");
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="sync-screen" data-testid="app-shell-error">
        <BrandMark />
        <h1>myBishBash needs a quick reset.</h1>
        <p>Something in this view did not load cleanly.</p>
        <button type="button" className="save-button" onClick={this.props.onRecover}>
          Back to Home
        </button>
      </main>
    );
  }
}

function urlBase64ToUint8Array(base64String) {
  if (!base64String) return new Uint8Array(0);
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getPushRegistration() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }

  const registration =
    (await navigator.serviceWorker.getRegistration(`${BASE_PATH || ""}/`)) ??
    (import.meta.env.PROD
      ? await navigator.serviceWorker.register(`${BASE_PATH}/service-worker.js`, { scope: `${BASE_PATH}/` })
      : null);

  if (registration) return registration;
  if (!import.meta.env.PROD) {
    throw new Error("Push notifications require the production service worker. Run a production preview to test them.");
  }
  return navigator.serviceWorker.ready;
}

function getInstallUrl(path) {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function isMeaningfulEvent(event) {
  return event.event_type !== "intercept_card_viewed";
}

function isRecentMomentEvent(event) {
  return [
    "bash_done",
    "bash_do_now",
    "intercept_do_something_else",
    "intercept_continue_to_app",
  ].includes(event.event_type);
}

function getWeeklyShiftCount(events, now = new Date()) {
  const weekStart = getStartOfWeek(now).getTime();
  const shiftTypes = new Set(["bash_done", "bash_do_now", "intercept_do_something_else"]);
  return events.filter((event) => {
    if (!shiftTypes.has(event.event_type)) return false;
    return new Date(event.created_at).getTime() >= weekStart;
  }).length;
}


// describeLogEvent, getLogEventDisplayLabel → moved to src/components/LogPanel.jsx

function isCompletionEvent(event) {
  return event.event_type === "bash_done";
}

function isInterruptionSummaryEvent(event) {
  return ["intercept_do_something_else", "intercept_continue_to_app"].includes(event.event_type);
}

function getLauncherCardStats(currentCards, timezone, excludedCardIds = new Set()) {
  const now = new Date();
  const normalized = normalizeCards(currentCards, now, timezone);
  const selectablePersonalCards = [
    ...normalized,
    ...buildEligibleCommitmentLifecycleCards(normalized, now, timezone),
  ];
  const activePackCards = normalized.filter((card) =>
    isPackCardAvailable(card) && !excludedCardIds.has(card.id)
  );
  const eligiblePersonalCards = selectablePersonalCards.filter((card) =>
    !card.sourcePackId && !card.deletedAt && !excludedCardIds.has(card.id) && isEligible(card, now, timezone)
  );
  const eligiblePackCards = activePackCards;
  return {
    totalCardsCount: normalized.length,
    personalCardsCount: normalized.filter((card) => !card.sourcePackId && !card.deletedAt).length,
    packCardsCount: normalized.filter((card) => card.sourcePackId && !card.deletedAt).length,
    activePackCardsCount: activePackCards.length,
    eligiblePersonalCardsCount: eligiblePersonalCards.length,
    eligiblePackCardsCount: eligiblePackCards.length,
  };
}

function countEligibleGeneralCards(currentCards, timezone) {
  const now = new Date();
  const normalized = normalizeCards(currentCards, now, timezone);
  const selectableCards = [
    ...normalized,
    ...buildEligibleCommitmentLifecycleCards(normalized, now, timezone),
  ];
  return selectableCards.filter((card) =>
    card.sourcePackId ? isPackCardAvailable(card) : isEligible(card, now, timezone) && !card.deletedAt
  ).length;
}

function isLauncherAuditEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("launcherAudit") === "1" || window.localStorage.getItem("bishbash.launchAudit.enabled") === "true";
  } catch {
    return false;
  }
}

function getPackName(card, customPacks = []) {
  if (!card?.sourcePackId) return null;
  return customPacks.find((pack) => pack.id === card.sourcePackId)?.title
    ?? customPacks.find((pack) => pack.id === card.sourcePackId)?.name
    ?? PACKS.find((pack) => pack.id === card.sourcePackId)?.title
    ?? card.sourcePackId;
}


function getLauncherEligibilityAudit(card, { date, timezone, excludedCardIds = new Set(), packCardTimeoutMs = 0, exposureByCardId = new Map() }) {
  const todayKey = getTodayKey(date, timezone);
  const currentWindow = getCurrentWindow(date, timezone);
  const isPack = Boolean(card.sourcePackId);
  const windows = card.timingWindows ?? ["morning", "day", "evening"];
  const lastExposure = exposureByCardId.get(card.id) ?? (card.lastShownAt ? new Date(card.lastShownAt).getTime() : 0);
  const activePack = isPackCardAvailable(card) && !excludedCardIds.has(card.id);
  const packOutsideTimeout = !isPack || packCardTimeoutMs <= 0 || !lastExposure || lastExposure + packCardTimeoutMs <= date.getTime();
  const doneToday = card.doneDate === todayKey || (!card.doneDate && card.statusToday === "doneToday");

  const checks = [
    { name: "excluded_by_launcher", pass: !excludedCardIds.has(card.id), appliesToPacks: true },
    { name: "not_deleted", pass: !card.deletedAt, appliesToPacks: true },
    { name: "not_paused", pass: !card.paused, appliesToPacks: true },
    { name: "not_disliked", pass: !card.disliked, appliesToPacks: true },
    { name: "not_hidden_pack_card", pass: !isPack || !card.hidden, appliesToPacks: true },
    { name: "not_done_today", pass: isPack || !doneToday, appliesToPacks: false },
    { name: "personal_cooldown_expired", pass: isPack || !card.lastShownAt || new Date(card.lastShownAt).getTime() + 30 * 60 * 1000 <= date.getTime(), appliesToPacks: false },
    { name: "not_yet_expired", pass: isPack || !card.notYetUntil || new Date(card.notYetUntil).getTime() <= date.getTime(), appliesToPacks: false },
    { name: "timing_window_matches", pass: isPack || windows.includes(currentWindow), appliesToPacks: false },
    { name: "pack_timeout_expired", pass: packOutsideTimeout, appliesToPacks: true },
  ];
  const failed = checks.filter((check) => !check.pass);
  const legacyEligible = !isPack && !card.deletedAt && !excludedCardIds.has(card.id) && isEligible(card, date, timezone);
  const generalEligible = isPack ? activePack : legacyEligible;
  const launcherEligible = isPack ? activePack && packOutsideTimeout : legacyEligible;

  return {
    currentWindow,
    legacyEligible,
    generalEligible,
    launcherEligible,
    activePack,
    checks,
    excludedReason: failed.map((check) => check.name).join(", ") || null,
  };
}

function logLauncherSelectionAudit({
  versionId,
  source,
  cards,
  timezone,
  customPacks,
  events,
  excludedCardIds,
  fallbackDisplay,
  launcherStats,
  selectionModel = "personal_first_fallback",
  interruptionPack,
  selected,
  plannedInterruption,
}) {
  if (!isLauncherAuditEnabled()) return;
  const date = new Date();
  const settings = fallbackDisplay.settings ?? DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS;
  const normalized = normalizeCards(cards, date, timezone);
  const exposureByCardId = buildCardExposureLookup(normalized, events);
  const cardAudits = normalized.map((card) => {
    const eligibility = getLauncherEligibilityAudit(card, {
      date,
      timezone,
      excludedCardIds,
      packCardTimeoutMs: settings.packCardTimeoutMs,
      exposureByCardId,
    });
    return {
      id: card.id,
      title: card.dashboardTitle ?? card.promptText ?? card.title ?? "",
      sourcePackId: card.sourcePackId ?? null,
      packName: getPackName(card, customPacks),
      paused: Boolean(card.paused),
      deleted: Boolean(card.deletedAt),
      disliked: Boolean(card.disliked),
      timingWindows: card.timingWindows ?? ["morning", "day", "evening"],
      lastShownAt: card.lastShownAt ?? null,
      notYetUntil: card.notYetUntil ?? null,
      eligibility,
    };
  });
  const activatedPacks = new Set(cardAudits.filter((card) => card.sourcePackId && !card.deleted).map((card) => card.sourcePackId));
  const audit = {
    path: "launcher tap -> interception flow -> card selection -> final rendered card",
    versionId,
    source,
    selected: selected ? {
      id: selected.id,
      title: selected.dashboardTitle ?? selected.promptText ?? selected.title ?? "",
      sourcePackId: selected.sourcePackId ?? null,
      packName: getPackName(selected, customPacks),
    } : null,
    interruption: plannedInterruption ? {
      packId: plannedInterruption.pack?.id ?? null,
      packName: plannedInterruption.pack?.name ?? null,
      cardId: plannedInterruption.pack?.cards?.[plannedInterruption.activeIndex ?? 0]?.id ?? null,
    } : null,
    finalRenderedCard: selected ? "personal_or_pack_card" : plannedInterruption ? "interruption_card" : "caught_up_empty",
    selectionModel,
    selectedPriority: fallbackDisplay.selectedPriority ?? (selected?.sourcePackId ? "fallback" : selected ? "primary" : "none"),
    selectedSource: fallbackDisplay.selectedSource ?? (selected?.sourcePackId ? "pack" : selected ? "personal" : "none"),
    selectedCardId: selected?.id ?? null,
    selectionReason: fallbackDisplay.selectionReason ?? null,
    packFallbackReason: fallbackDisplay.selectedPriority === "fallback" ? fallbackDisplay.selectionReason ?? "no_eligible_primary_cards" : null,
    caughtUpReason: !selected && !plannedInterruption ? "no_eligible_primary_or_fallback_cards" : null,
    summaryCounts: {
      eligiblePersonalCards: cardAudits.filter((card) => !card.sourcePackId && card.eligibility.generalEligible).length,
      eligiblePackCards: cardAudits.filter((card) => card.sourcePackId && card.eligibility.generalEligible).length,
      activePackCards: launcherStats.activePackCardsCount,
      activatedPacks: activatedPacks.size,
      totalCardsEnteringPersonalFirstSelection: (fallbackDisplay.availablePersonalCount ?? 0) + (fallbackDisplay.availablePackCount ?? 0),
      totalCardsExcluded: cardAudits.filter((card) => !card.eligibility.generalEligible).length,
      interruptionCardsAvailable: interruptionPack?.cards?.length ?? 0,
    },
    cards: cardAudits,
  };
  window.__lastLauncherSelectionAudit = audit;
  debugLog(`[CARD_SELECTION_AUDIT_JSON] ${JSON.stringify(audit)}`);
}

function buildInitialState() {
  const profile = loadProfile();
  const setupComplete = loadSetupComplete();
  const initialRoute = setupComplete ? parseRoute(getRouteFromLocation(setupComplete)) : null;
  const suppressInitialHomeLaunch =
    setupComplete &&
    initialRoute?.kind !== "intercept" &&
    consumeHomeAutoLaunchSuppressedAfterDestination();
  const mood = resolveTheme(loadMood());
  const cards = normalizeCards(loadCards(), new Date(), profile.timezone).map((card) => ({
    ...card,
    theme: resolveTheme(card.theme),
  }));

  if (!setupComplete) {
    return {
      cards,
      mood,
      profile,
      setupComplete,
      suppressInitialHomeLaunch: false,
    };
  }

  return {
    cards,
    mood,
    profile,
    setupComplete,
    suppressInitialHomeLaunch,
  };
}

function buildSharedState({
  cards,
  setupComplete,
  mood,
  profile,
  homeScreenVersions,
  launcherBehaviorSettings,
  cardPacks,
  hiddenLibraryPacks,
  hiddenPackCardIdsCompat,
  globalInterruptionMode,
  events,
  actionCards,
}) {
  return {
    version: 1,
    cards,
    setupComplete,
    mood,
    profile,
    homeScreenVersions,
    launcherBehaviorSettings,
    cardPacks,
    hiddenLibraryPacks,
    dislikedPackCardIds: hiddenPackCardIdsCompat,
    globalInterruptionMode,
    events,
    actionCards,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSharedState(state, fallback) {
  const source = state && typeof state === "object" ? state : {};

  return {
    cards: Array.isArray(source.cards) ? source.cards : fallback.cards,
    setupComplete: typeof source.setupComplete === "boolean" ? source.setupComplete : fallback.setupComplete,
    mood: resolveTheme(source.mood ?? fallback.mood),
    profile: source.profile && typeof source.profile === "object" ? source.profile : fallback.profile,
    homeScreenVersions:
      source.homeScreenVersions && typeof source.homeScreenVersions === "object"
        ? source.homeScreenVersions
        : fallback.homeScreenVersions,
    launcherBehaviorSettings:
      source.launcherBehaviorSettings && typeof source.launcherBehaviorSettings === "object"
        ? source.launcherBehaviorSettings
        : fallback.launcherBehaviorSettings,
    cardPacks: Array.isArray(source.cardPacks) ? source.cardPacks : fallback.cardPacks,
    hiddenLibraryPacks: Array.isArray(source.hiddenLibraryPacks) ? source.hiddenLibraryPacks : fallback.hiddenLibraryPacks,
    hiddenPackCardIdsCompat: Array.isArray(source.dislikedPackCardIds)
      ? source.dislikedPackCardIds
      : fallback.dislikedPackCardIds,
    globalInterruptionMode:
      typeof source.globalInterruptionMode === "boolean"
        ? source.globalInterruptionMode
        : fallback.globalInterruptionMode,
    events: Array.isArray(source.events) ? source.events : fallback.events,
    actionCards: Array.isArray(source.actionCards) ? source.actionCards : fallback.actionCards,
  };
}

function mergeEntitiesById(local = [], incoming = []) {
  const map = new Map();

  const getTime = (item) => {
    if (!item || !item.updatedAt) return 0;
    const t = new Date(item.updatedAt).getTime();
    return isNaN(t) ? 0 : t;
  };

  const formatTime = (t) => (t > 0 ? new Date(t).toISOString() : "0");

  if (Array.isArray(incoming)) {
    incoming.forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
  }

  if (Array.isArray(local)) {
    local.forEach((localItem) => {
      if (localItem?.id) {
        const cloudItem = map.get(localItem.id);
        if (cloudItem) {
          const cloudTime = getTime(cloudItem);
          const localTime = getTime(localItem);

          if (cloudTime > localTime) {
            debugLog(`[MERGE] Cloud is newer for ${localItem.id} (${formatTime(cloudTime)} > ${formatTime(localTime)}). Accepting cloud.`);
          } else if (localTime > cloudTime) {
            debugLog(`[MERGE] Local is newer for ${localItem.id} (${formatTime(localTime)} > ${formatTime(cloudTime)}). Preserving local.`);
            if (localItem.deletedAt) debugLog(`[MERGE] Tombstone preserved for ${localItem.id}`);
            else if (cloudItem.deletedAt) debugLog(`[MERGE] Rejecting stale cloud tombstone for ${localItem.id}`);
            map.set(localItem.id, localItem);
          } else {
            // Times are equal. Prefer local quietly to avoid spam.
            map.set(localItem.id, localItem);
          }
        } else {
          map.set(localItem.id, localItem);
        }
      }
    });
  }

  return Array.from(map.values());
}

function getPackRepresentative(cards, packId) {
  const packCards = cards.filter((card) => card.sourcePackId === packId && !card.deletedAt);
  return packCards.find((card) => !card.paused && !card.disliked) ?? null;
}

function buildLibraryPackHomeItem(packId, packCards, timezone) {
  const representative = packCards.find((card) => isEligible(card, new Date(), timezone)) ?? packCards[0];
  const pack = PACKS.find((item) => item.id === packId);
  const packTitle = pack?.title ?? representative.dashboardTitle ?? representative.promptText;
  return {
    type: "pack",
    id: packId,
    representative: {
      ...representative,
      id: packId,
      promptText: packTitle,
      dashboardTitle: packTitle,
      frequency: "multi_daily",
    },
  };
}


const ONBOARDING_COMMITMENT_DEMO_CARD = {
  id: "onboarding-commitment-demo",
  cardKind: "commitment",
  promptText: "I will go for a walk today.",
  dashboardTitle: "Today’s Commitment",
  commitmentReason: "A short walk helps me feel clearer.",
  commitmentTimingMode: "anytime",
  commitmentStartWindow: "anytime",
  commitmentCheckInEnabled: true,
  commitmentCheckInTime: "20:00",
  timingWindows: ["day"],
  frequency: "once_daily",
  statusToday: "fresh",
  deletedAt: null,
};

const ONBOARDING_COMMITMENT_DEMO_CHECK_IN_CARD = {
  ...ONBOARDING_COMMITMENT_DEMO_CARD,
  id: "onboarding-commitment-demo-check-in",
  cardKind: "commitment_check_in",
  parentCommitmentCardId: ONBOARDING_COMMITMENT_DEMO_CARD.id,
};

const ONBOARDING_COMMITMENT_DEMO_ENCOURAGEMENT_CARD = {
  ...ONBOARDING_COMMITMENT_DEMO_CARD,
  id: "onboarding-commitment-demo-encouragement",
  cardKind: "commitment_encouragement",
  parentCommitmentCardId: ONBOARDING_COMMITMENT_DEMO_CARD.id,
  promptText: "You said you wanted to do this.",
  dashboardTitle: "Commitment reminder",
  commitmentText: ONBOARDING_COMMITMENT_DEMO_CARD.promptText,
};

const ONBOARDING_COMMITMENT_DEMO_REVIEW_CARD = {
  ...ONBOARDING_COMMITMENT_DEMO_CARD,
  id: "onboarding-commitment-demo-review",
  cardKind: "commitment_review",
  parentCommitmentCardId: ONBOARDING_COMMITMENT_DEMO_CARD.id,
  dashboardTitle: "Commitment review",
};

export function shouldStartDemoOnboarding() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demoOnboarding") === "1") return true;
  const routeParam = params.get("route");
  const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
  return normalizeRoutePath(rawPath) === "/demo-onboarding";
}

export function shouldStartDemoSignup() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demoSignup") === "1") return true;
  const routeParam = params.get("route");
  const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
  return normalizeRoutePath(rawPath) === "/demo-signup";
}

export function resetDemoSignupState() {
  if (typeof window === "undefined") return;
  const demoKeysToRemove = [
    "MYBISHBASH_E2E_AUTH_MOCK",
    "MYBISHBASH_E2E_AUTH_SESSION",
    "MYBISHBASH_E2E_MODE",
    "MYBISHBASH_E2E_TESTER_MODE",
    "mybishbash.cards.v1",
    "mybishbash.profile.v1",
    "mybishbash.action-cards.v1",
    "mybishbash.event-log.v1",
    "mybishbash.offline-event-queue.v1",
    "mybishbash.onboarding-protected-app-setup-pending.v1",
    "mybishbash.signup-onboarding-pending.v1",
    "mybishbash.launcher-behavior-settings.v1",
    "mybishbash.app-pauses.v1",
    "mybishbash.setup-complete.v1",
  ];
  demoKeysToRemove.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
}

export function resetDemoOnboardingState() {
  if (typeof window === "undefined") return;
  const demoKeysToRemove = [
    "mybishbash.cards.v1",
    "mybishbash.profile.v1",
    "mybishbash.action-cards.v1",
    "mybishbash.event-log.v1",
    "mybishbash.offline-event-queue.v1",
    "mybishbash.onboarding-protected-app-setup-pending.v1",
    "mybishbash.signup-onboarding-pending.v1",
    "mybishbash.launcher-behavior-settings.v1",
    "mybishbash.app-pauses.v1",
  ];
  demoKeysToRemove.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
  window.localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "true");
  window.localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
  window.localStorage.setItem("mybishbash.setup-complete.v1", "false");
  window.localStorage.setItem("mybishbash.profile.v1", JSON.stringify({
    name: "Demo",
    timezone: "Europe/London",
    plan: "premium",
    hasSeenCommitmentCardDemo: false,
    hasSkippedCommitmentCardDemo: false,
    hasCompletedHomeSpotlightTour: false,
  }));
}

export function applyLocalNormalPreviewFlag() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("normalPreview") !== "1") return;
  window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
  window.localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "false");
  window.localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
  params.delete("normalPreview");
  const nextSearch = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
}

const MemoHomePanel = memo(HomePanel);
const MemoAppsPanel = memo(AppsPanel);
const MemoTodayPersonalCardsPanel = memo(TodayPersonalCardsPanel);
const MemoStandardLibraryPanel = memo(StandardLibraryPanel);
const MemoLogPanel = memo(LogPanel);
const MemoExplorePanel = memo(ExplorePanel);
const MemoOverlay = memo(Overlay);

function App() {
  const initialState = useMemo(() => {
    const base = buildInitialState();
    const hiddenPackCardIdsCompat = loadHiddenPackCardIdsCompat();
    const cards = base.cards.map((card) =>
      card.sourcePackId
        ? { ...card, disliked: hiddenPackCardIdsCompat.includes(getLegacyHiddenPackCardKey(card)) }
        : card,
    );
    return {
      ...base,
      cards,
      cardPacks: loadCardPacks(),
      hiddenPackCardIdsCompat,
      globalInterruptionMode: loadGlobalInterruptionMode(),
      homeScreenVersions: loadHomeScreenVersions(),
      launcherBehaviorSettings: loadLauncherBehaviorSettings(),
      hiddenLibraryPacks: loadHiddenLibraryPacks(),
      events: loadEventLog(),
      actionCards: loadActionCards(),
      notificationSettings: loadNotificationSettings(),
      timingWindowsPrefs: loadTimingWindowsPrefs() ?? DEFAULT_WINDOW_DEFS,
    };
  }, []);
  const e2eMode = isE2EModeEnabled();

  // Initialise the utils singleton with the user's stored prefs on first render.
  // This runs synchronously before any isEligible / getCurrentWindow calls.
  // Guarded to the first render only: re-running it on every render would
  // clobber prefs the user saved during this session back to the boot-time
  // value (the sync effect below only fires when timingWindowsPrefs changes).
  const windowDefsInitializedRef = useRef(false);
  if (!windowDefsInitializedRef.current) {
    windowDefsInitializedRef.current = true;
    setWindowDefs(initialState.timingWindowsPrefs);
  }

  const [cards, setCards] = useState(initialState.cards);
  const cardsRef = useRef(initialState.cards);
  const [mood, setMood] = useState(initialState.mood);
  const [profile, setProfile] = useState(initialState.profile);
  const [homeScreenVersions, setHomeScreenVersions] = useState(initialState.homeScreenVersions);
  const [launcherBehaviorSettings, setLauncherBehaviorSettings] = useState(initialState.launcherBehaviorSettings);
  const [explicitLauncherBehaviorSettings, setExplicitLauncherBehaviorSettings] = useState(() => loadExplicitLauncherBehaviorSettings());
  const [cardPacks, setCardPacks] = useState(initialState.cardPacks);
  const [hiddenPackCardIdsCompat, setHiddenPackCardIdsCompat] = useState(initialState.hiddenPackCardIdsCompat);
  const [globalInterruptionMode, setGlobalInterruptionMode] = useState(initialState.globalInterruptionMode);
  const [hiddenLibraryPacks, setHiddenLibraryPacks] = useState(initialState.hiddenLibraryPacks);
  const [events, setEvents] = useState(initialState.events);
  const [actionCards, setActionCards] = useState(initialState.actionCards);
  const [libraryFocusMode, setLibraryFocusMode] = useState(null);
  const [shellSettingsVersionId, setShellSettingsVersionId] = useState(null);
  const [homeSpotlightActionSignal, setHomeSpotlightActionSignal] = useState(null);
  const [launcherSetupInterstitialVersion, setLauncherSetupInterstitialVersion] = useState(null);
  const [notificationSettings, setNotificationSettings] = useState(initialState.notificationSettings);
  const { notificationStatus, setNotificationStatus } = useNotificationPermission();
  const [setupComplete, setSetupComplete] = useState(initialState.setupComplete);
  const session = useSessionStore((s) => s.session);
  const authReady = useSessionStore((s) => s.authReady);
  const syncStatus = useSessionStore((s) => s.syncStatus);
  const syncError = useSessionStore((s) => s.syncError);
  const { isOffline, setIsOffline } = useOfflineFlag();
  const [timingWindowsPrefs, setTimingWindowsPrefs] = useState(
    initialState.timingWindowsPrefs,
  );
  const isAdmin = useSessionStore((s) => s.isAdmin);
  const adminStatus = useSessionStore((s) => s.adminStatus);
  const testerStatus = useSessionStore((s) => s.testerStatus);
  const [testerReportsRefreshKey, setTesterReportsRefreshKey] = useState(0);
  const [globalPacks, setGlobalPacks] = useState([]);
  // Own access profile for capability checks (premium pack gating). null =
  // unknown/unavailable, which getCapabilities treats as the free tier, so
  // premium installs fail closed.
  const accessProfile = useSessionStore((s) => s.accessProfile);
  const accessStatus = useSessionStore((s) => s.accessStatus);
  const {
    setSession, setAuthReady, setSyncStatus, setSyncError,
    setAccessProfile, setAccessStatus,
  } = getSessionActions();
  const { appUpdate } = useAppUpdateStatus(BASE_PATH);
  const [appPauseRevision, setAppPauseRevision] = useState(0);
  const { setRoutePath, route, initialRoute } = useRoute(initialState.setupComplete);
  const [screen, setScreen] = useState(initialRoute.kind === "intercept" ? "interception" : initialState.setupComplete ? "library" : "onboarding");
  const [overlay, setOverlay] = useState(() =>
    initialRoute.kind === "intercept" ? buildFakeLauncherPreparingOverlay(initialRoute.versionId) : null
  );
  const [activeProtectedAppContext, setActiveProtectedAppContext] = useState(() =>
    initialRoute.kind === "intercept" && isKnownLauncher(initialRoute.versionId)
      ? persistActiveProtectedAppContext(initialRoute.versionId)
      : loadActiveProtectedAppContext()
  );
  const [launchSession, setLaunchSession] = useState(() => {
    const session = buildLaunchSessionForRoute(initialRoute);
    persistLaunchSession(session);
    return session;
  });
  const [launcherContext, setLauncherContext] = useState(() => getLauncherContextFromRoute(initialRoute));
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerInitialKind, setComposerInitialKind] = useState("personal");
  const [composerInitialDraft, setComposerInitialDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [homeSaveConfirmation, setHomeSaveConfirmation] = useState("");
  const composerReturnPathRef = useRef("/home");
  const [editingPackId, setEditingPackId] = useState(null);
  const [editingCustomPackId, setEditingCustomPackId] = useState(null);
  const [isActionCardEditorOpen, setIsActionCardEditorOpen] = useState(false);
  const [selectedPackDetail, setSelectedPackDetail] = useState(null);
  const [morningSummary, setMorningSummary] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const transitionTimerRef = useRef(null);
  const previousOverlayDebugRef = useRef(null);
  const loggedLauncherOpenRef = useRef("");
  const loggedOnboardingStartedRef = useRef(false);
  const signupOnboardingPendingRef = useRef(hasSignupOnboardingPending());
  const interceptActivationRef = useRef(null);
  const interceptActivationCounterRef = useRef(0);
  const launchAttemptCounterRef = useRef(0);
  const launchCompletedCardIdsRef = useRef(new Set());
  // Tracks versionIds for which the app-pause bypass has already fired this
  // page load so the routing useEffect doesn't call openDestinationApp on
  // every state-change re-run.
  const pauseBypassInitiatedRef = useRef(new Set());
  const loggedCardShownRef = useRef(new Set());
  const isApplyingSharedStateRef = useRef(false);
  const cloudSaveTimerRef = useRef(null);
  const cardSaveTimerRef = useRef(null);
  const lastCloudStateStrRef = useRef(null);
  const localDirtyRef = useRef(false);
  const highestKnownCloudTimeRef = useRef(0);
  const activeLauncherOverlayRef = useRef(null);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    const previous = previousOverlayDebugRef.current;
    const next = getOverlayDebugSnapshot(overlay, route.path);
    const previousCard = previous?.cardId
      ? getCardDebugSnapshot(cards.find((candidate) => candidate.id === previous.cardId))
      : { id: null, title: null };
    const nextCard = overlay?.cardId
      ? getCardDebugSnapshot(cards.find((candidate) => candidate.id === overlay.cardId))
      : { id: null, title: null };
    if (
      previous?.type !== next.type ||
      previous?.versionId !== next.versionId ||
      previous?.activationKey !== next.activationKey ||
      previous?.cardId !== next.cardId
    ) {
      debugLaunch("[OVERLAY_CHANGE]", {
        previousOverlayType: previous?.type ?? null,
        nextOverlayType: next.type,
        versionId: next.versionId,
        activationKey: next.activationKey,
        cardId: next.cardId,
        previousCardId: previousCard.id,
        previousCardTitle: previousCard.title,
        nextCardId: nextCard.id,
        nextCardTitle: nextCard.title,
        routePath: next.routePath,
        timestamp: next.timestamp,
      });
    }
    previousOverlayDebugRef.current = next;
  }, [cards, overlay, route.path]);

  const activeTab = getSafeAppTab(route.tab);
  const isShellAppSettingsRoute =
    activeTab === "apps" &&
    route.versionId &&
    route.versionId === shellSettingsVersionId &&
    isKnownLauncher(route.versionId);
  // Single source of truth for limits/flags. null accessProfile resolves to the
  // free tier, so premium installs fail CLOSED. Admin is orthogonal.
  const entitlements = useMemo(
    () => resolveEntitlements(accessProfile ?? {}, { isAdmin }),
    [accessProfile, isAdmin],
  );
  const canUsePremiumContent = entitlements.premiumPacksEnabled;
  // "Unlimited apps" (paid). Free is still limited — its exact cap
  // (maxConnectedApps) is enforced at add time via canAddAnotherApp.
  const canUseMultipleApps = isUnlimited(entitlements.maxConnectedApps);
  // Personal-card count for the maxPersonalCards entitlement (excludes pack
  // cards, deleted cards, and commitments).
  const personalCardCount = useMemo(
    () => cards.filter((card) => !card.sourcePackId && !card.deletedAt && !isCommitmentCard(card)).length,
    [cards],
  );
  const activeInterceptionVersion = useMemo(
    () =>
      route.kind === "intercept"
        ? resolveVersionConfig(
            homeScreenVersions[route.versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[route.versionId],
            launcherBehaviorSettings[route.versionId]
          )
        : null,
    [homeScreenVersions, launcherBehaviorSettings, route.kind, route.versionId],
  );
  const fakeLauncherVersions = useMemo(
    () => {
      // Inside installed launcher version
      if (
        launcherContext &&
        launcherContext !== NORMAL_LAUNCHER_CONTEXT
      ) {
        const version = resolveVersionConfig(
          homeScreenVersions[launcherContext] ??
            DEFAULT_HOME_SCREEN_VERSIONS[launcherContext],
          launcherBehaviorSettings[launcherContext],
        );
        const visible = version?.realAppLabel && isLauncherVisibleInContext(version, {
          testerStatus,
          context: LAUNCHER_CONTEXTS.FAKE_LAUNCHER_BAR,
        });
        return visible ? [version] : [];
      }

      // Normal myBishBash app — HQ availability decides which launchers a
      // user (or tester) can see here.
      // Static registry contexts plus HQ-created launchers present in
      // homeScreenVersions (registered dynamic apps merged after fetch).
      const candidateIds = Array.from(new Set([
        ...INTERRUPTION_LAUNCHER_CONTEXTS,
        ...Object.keys(homeScreenVersions).filter((versionId) => isKnownLauncher(versionId)),
      ]));
      const candidates = candidateIds
        .map((versionId) =>
          resolveVersionConfig(
            homeScreenVersions[versionId] ??
              DEFAULT_HOME_SCREEN_VERSIONS[versionId] ??
              getLauncherConfig(versionId),
            launcherBehaviorSettings[versionId],
          ),
        )
        .filter((version) => Boolean(version?.realAppLabel));
      return getAvailableLaunchersForUser({
        launchers: candidates,
        testerStatus,
        context: LAUNCHER_CONTEXTS.FAKE_LAUNCHER_BAR,
      });
    }, [
      launcherContext,
      homeScreenVersions,
      launcherBehaviorSettings,
      testerStatus,
    ]
  );
  const protectedAppStatuses = useMemo(() => {
    const candidateIds = Array.from(new Set([
      ...INTERRUPTION_LAUNCHER_CONTEXTS,
      ...APPS_OPTION_IDS,
      ...Object.keys(homeScreenVersions).filter((versionId) => isKnownLauncher(versionId)),
    ]));
    const candidates = candidateIds
      .map((versionId) =>
        resolveVersionConfig(
          homeScreenVersions[versionId] ??
            DEFAULT_HOME_SCREEN_VERSIONS[versionId] ??
            getLauncherConfig(versionId),
          launcherBehaviorSettings[versionId],
        ),
      )
      .filter((version) => Boolean(version?.id && version.id !== "mybishbash" && version.realAppLabel));
    const visibleVersions = getAvailableLaunchersForUser({
      launchers: candidates,
      testerStatus,
      context: LAUNCHER_CONTEXTS.SETTINGS,
    });
    const visibleVersionIds = new Set(visibleVersions.map((version) => version.id));
    const appsOptionVersions = candidates.filter((version) =>
      APPS_OPTION_IDS.includes(version.id) && !visibleVersionIds.has(version.id)
    );
    return [...visibleVersions, ...appsOptionVersions].map((version) => {
      const behavior = launcherBehaviorSettings[version.id] ?? {};
      const explicitBehavior = explicitLauncherBehaviorSettings[version.id] ?? {};
      const hasUserSetup =
        Object.prototype.hasOwnProperty.call(explicitBehavior, "appEnabled") ||
        Object.prototype.hasOwnProperty.call(explicitBehavior, "useInterruptionPack");
      const explicitlyRemoved = explicitBehavior.appEnabled === false && explicitBehavior.useInterruptionPack === false;
      const pauseExpiry = getAppPauseExpiry(version.id);
      const paused = isAppPaused(version.id);
      return {
        version,
        configured: hasUserSetup,
        explicitlyRemoved,
        setupState: explicitBehavior.setupState ?? "",
        pendingSetup: explicitBehavior.setupState === "pending_setup",
        protectedOn: explicitBehavior.appEnabled === true,
        promptsOn: explicitBehavior.useInterruptionPack === true,
        pauseExpiry,
        paused,
        pauseRemaining: paused ? formatPauseRemaining(pauseExpiry) : "",
      };
    });
  }, [
    appPauseRevision,
    explicitLauncherBehaviorSettings,
    homeScreenVersions,
    launcherBehaviorSettings,
    testerStatus,
  ]);
  const activePauseStatuses = useMemo(
    () => protectedAppStatuses.filter((status) => status.paused),
    [protectedAppStatuses],
  );
  const enabledProtectedAppStatuses = useMemo(
    () => protectedAppStatuses.filter((status) => status.protectedOn),
    [protectedAppStatuses],
  );
  const shouldShowFreeCoreReconciliation =
    !canUseMultipleApps &&
    ["home", "apps"].includes(activeTab) &&
    !isShellAppSettingsRoute &&
    enabledProtectedAppStatuses.length > 1;
  const hasConfiguredMyBishBashApp = useMemo(() => {
    if (protectedAppStatuses.some((status) => status.protectedOn)) return true;
    if (!profile.hasCompletedProtectedAppSetup || !profile.selectedProtectedApp) return false;
    const selectedStatus = protectedAppStatuses.find((status) => status.version.id === profile.selectedProtectedApp);
    return selectedStatus?.explicitlyRemoved !== true;
  }, [
    profile.hasCompletedProtectedAppSetup,
    profile.selectedProtectedApp,
    protectedAppStatuses,
  ]);
  const pendingOnboardingShortcuts = useMemo(() => {
    const apps = Array.isArray(profile.onboardingShortcutSetup?.apps) ? profile.onboardingShortcutSetup.apps : [];
    return apps
      .filter((app) => !["marked_added", "tested"].includes(app.status))
      .map((app) => {
        const version = homeScreenVersions[app.id] ?? DEFAULT_HOME_SCREEN_VERSIONS[app.id] ?? getLauncherConfig(app.id);
        return {
          ...app,
          label: app.label ?? version?.realAppLabel ?? version?.name ?? version?.displayName ?? app.id,
          iconSrc: version ? resolveLauncherIconSrc(version) : app.iconSrc ?? "",
        };
      });
  }, [homeScreenVersions, profile.onboardingShortcutSetup]);
  const onboardingSelectedAppSetup = useMemo(() => {
    if (!profile.selectedProtectedApp || !isKnownLauncher(profile.selectedProtectedApp)) return null;
    const selectedStatus = protectedAppStatuses.find((status) => status.version.id === profile.selectedProtectedApp);
    if (selectedStatus?.protectedOn) return null;
    const version =
      selectedStatus?.version ??
      homeScreenVersions[profile.selectedProtectedApp] ??
      DEFAULT_HOME_SCREEN_VERSIONS[profile.selectedProtectedApp] ??
      getLauncherConfig(profile.selectedProtectedApp);
    if (!version) return null;
    return {
      id: version.id,
      label: version.realAppLabel ?? version.name ?? version.displayName ?? version.id,
      iconSrc: resolveLauncherIconSrc(version),
      version,
    };
  }, [homeScreenVersions, profile.selectedProtectedApp, protectedAppStatuses]);
  const activationChecklistItems = useMemo(() => {
    const items = [];
    const displayMode = getAppDisplayMode();
    const isInstalledAppRoute = ["standalone", "fullscreen", "minimal-ui"].includes(displayMode);
    const shouldShowHomeScreenInstall =
      profile.hasSkippedHomeScreenInstallPrompt === true ||
      (profile.hasCompletedHomeScreenInstall === false && !isInstalledAppRoute);
    if (shouldShowHomeScreenInstall) {
      items.push({
        id: "home-screen",
        label: "Add myBishBash to your Home Screen",
        action: "download",
      });
    }
    const hasPersonalCards = cards.some((card) => !card.deletedAt && !card.sourcePackId && (card.cardKind ?? "personal") === "personal");
    if (!hasPersonalCards) {
      items.push({
        id: "personal-card",
        label: "Create your first Personal Card",
        action: "create-card",
      });
    }
    if (!hasConfiguredMyBishBashApp) {
      items.push({
        id: "protected-app",
        label: "Choose your first app",
        action: "apps",
      });
    }
    return items;
  }, [
    cards,
    hasConfiguredMyBishBashApp,
    profile.hasCompletedHomeScreenInstall,
    profile.hasSkippedHomeScreenInstallPrompt,
  ]);
  const completeHomeSpotlightTour = useCallback(() => {
    setProfile((current) => {
      const next = {
        ...current,
        hasCompletedHomeSpotlightTour: true,
      };
      saveProfile(next);
      return next;
    });
  }, []);

  const signalHomeSpotlightAction = useCallback((id) => {
    setHomeSpotlightActionSignal({ id, sequence: Date.now() });
  }, []);
  const shouldShowHomeSpotlightTour =
    setupComplete &&
    screen === "library" &&
    profile.onboardingRoute === "personal_card_play_by_play" &&
    profile.hasCompletedHomeSpotlightTour !== true;
  const effectiveLaunchSession = useMemo(
    () => getLaunchSessionForOverlay(launchSession, overlay),
    [launchSession, overlay],
  );
  const overlayLauncherVersions = useMemo(
    () => getVisibleDestinationChips(effectiveLaunchSession, fakeLauncherVersions),
    [
      effectiveLaunchSession,
      fakeLauncherVersions,
    ],
  );
  const [logFilter, setLogFilter] = useState("all");
  const [shouldLaunchOverlay, setShouldLaunchOverlay] = useState(initialState.setupComplete && !initialState.suppressInitialHomeLaunch);
  const [resumeLaunchNonce, setResumeLaunchNonce] = useState(0);
  const [launcherDataWaitExpired, setLauncherDataWaitExpired] = useState(false);
  const hiddenSinceRef = useRef(null);
  const handledResumeLaunchNonceRef = useRef(0);
  const suppressNextHomeAutoLaunchRef = useRef(false);
  const suppressResumeHomeAutoLaunchRef = useRef(false);
  const launcherTimingSeenRef = useRef(new Set());
  const visibleActionCards = useMemo(
    () => actionCards.filter((card) => !card.hidden && !card.deletedAt),
    [actionCards],
  );
  const isHomeRoute = route.kind === "home";
  const isAppTabRoute = ["home", "library", "log", "explore", "apps", "access", "settings"].includes(route.kind);
  const isLaunchingHomeOverlay = isHomeRoute && shouldLaunchOverlay && overlay == null;
  const isPreparingIntercept = route.kind === "intercept" && overlay == null;
  const isPreparingSpecificCard = route.kind === "card" && overlay == null;
  const isPreparingCaughtUp = route.kind === "caught-up" && overlay == null;
  const hideAppShell = isLaunchingHomeOverlay || isPreparingIntercept || isPreparingSpecificCard || isPreparingCaughtUp;

  useEffect(() => {
    if (!e2eMode || typeof window === "undefined") return;
    window.__MYBISHBASH_LAUNCH_SESSION = launchSession;
  }, [e2eMode, launchSession]);

  useEffect(() => {
    if (route.kind !== "intercept") {
      launcherTimingSeenRef.current = new Set();
    }
  }, [route.kind]);

  useLayoutEffect(() => {
    if (route.kind !== "intercept") return;
    if (!overlay) {
      setLauncherContext(route.versionId);
      setScreen("interception");
      setOverlay(buildFakeLauncherPreparingOverlay(route.versionId));
    }
    const key = `route:${route.versionId}:${route.path}`;
    if (launcherTimingSeenRef.current.has(key)) return;
    launcherTimingSeenRef.current.add(key);
    recordLaunchTiming("route detected", {
      route: route.path,
      versionId: route.versionId,
    }, testerStatus);
    if (authReady) {
      recordLaunchTiming("auth ready", {
        route: route.path,
        versionId: route.versionId,
        sessionPresent: Boolean(session?.user?.id),
        source: "route_snapshot",
      }, testerStatus);
    }
    if (syncStatus === "ready") {
      recordLaunchTiming("sync ready", {
        route: route.path,
        versionId: route.versionId,
        sessionPresent: Boolean(session?.user?.id),
        source: "route_snapshot",
      }, testerStatus);
    }
    if (!session?.user?.id || testerStatus !== null) {
      recordLaunchTiming("tester status ready", {
        route: route.path,
        versionId: route.versionId,
        sessionPresent: Boolean(session?.user?.id),
        isTester: testerStatus?.is_tester === true,
        source: "route_snapshot",
      }, testerStatus);
    }
  }, [authReady, overlay, route.kind, route.path, route.versionId, session?.user?.id, syncStatus, testerStatus]);

  useLayoutEffect(() => {
    if (overlay?.launchSource !== "fake_launcher") return;
    const visibleKey = `first-overlay:${overlay.versionId}`;
    if (!launcherTimingSeenRef.current.has(visibleKey)) {
      launcherTimingSeenRef.current.add(visibleKey);
      recordLaunchTiming("first overlay visible", {
        route: route.path,
        versionId: overlay.versionId,
        overlayType: overlay.type,
      }, testerStatus);
    }
    if (overlay.type === "launcher-preparing") return;
    const finalKey = `final-overlay:${overlay?.activationKey ?? overlay.versionId}:${overlay.type}`;
    if (launcherTimingSeenRef.current.has(finalKey)) return;
    launcherTimingSeenRef.current.add(finalKey);
    recordLaunchTiming("final overlay type rendered", {
      route: route.path,
      versionId: overlay.versionId,
      overlayType: overlay.type,
    }, testerStatus);
  }, [overlay?.activationKey, overlay?.launchSource, overlay?.type, overlay?.versionId, route.path, testerStatus]);

  useEffect(() => {
    if (route.kind === "intercept" && isKnownLauncher(route.versionId)) {
      clearInstalledShellCardContextSuppression();
      setActiveProtectedAppContext(persistActiveProtectedAppContext(route.versionId));
      setLaunchSession((current) => {
        if (current?.entrySurface === "fake_launcher" && current?.launcherId === route.versionId) {
          return current;
        }
        const nextSession = buildLaunchSession("fake_launcher", route.versionId);
        persistLaunchSession(nextSession);
        return nextSession;
      });
      return;
    }

    if (isAppTabRoute && overlay?.launchSource !== "fake_launcher") {
      setLaunchSession((current) => {
        if (current?.entrySurface === "mybishbash_home") {
          return current;
        }
        const nextSession = buildLaunchSession("mybishbash_home");
        persistLaunchSession(nextSession);
        return nextSession;
      });
    }
  }, [isAppTabRoute, overlay?.launchSource, route.kind, route.versionId]);

  const activeProtectedAppVersion = useMemo(() => {
    const launcherId = activeProtectedAppContext?.launcherId;
    if (!isKnownLauncher(launcherId)) return null;
    const version = resolveVersionConfig(
      homeScreenVersions[launcherId] ?? DEFAULT_HOME_SCREEN_VERSIONS[launcherId] ?? getLauncherConfig(launcherId),
      launcherBehaviorSettings[launcherId],
    );
    return version?.realAppLabel ? version : null;
  }, [activeProtectedAppContext?.launcherId, homeScreenVersions, launcherBehaviorSettings]);

  const showActiveProtectedAppShortcut = Boolean(
    activeProtectedAppVersion &&
    !overlay &&
    screen === "library" &&
    ["home", "explore", "library", "log", "apps"].includes(activeTab),
  );

  function getFakeLauncherShellContextId() {
    const installedLauncherId = getInstalledLauncherShellId();
    if (!installedLauncherId || installedLauncherId === NORMAL_LAUNCHER_CONTEXT) return null;
    return installedLauncherId;
  }

  function isFakeLauncherShellContext() {
    return Boolean(getFakeLauncherShellContextId());
  }

  function buildRevealOverlayForCurrentShell(cardId) {
    const installedShellId = isInstalledShellCardContextSuppressed() ? null : getFakeLauncherShellContextId();
    const fakeContext = getActiveFakeLauncherReturnContext(route, overlay, interceptActivationRef.current, installedShellId);
    const installedLauncherId = fakeContext?.versionId;
    if (installedLauncherId) {
      const nextSession = buildLaunchSession("fake_launcher", installedLauncherId);
      persistLaunchSession(nextSession);
      setLaunchSession(nextSession);
      return buildFakeLauncherRevealOverlay(
        cardId,
        installedLauncherId,
        fakeContext?.activationKey || null,
      );
    }
    const nextSession = buildLaunchSession("mybishbash_home");
    persistLaunchSession(nextSession);
    setLaunchSession(nextSession);
    return { ...buildRevealOverlay(cardId), origin: "home" };
  }

  const currentSharedState = useCallback(
    () =>
      buildSharedState({
        cards,
        setupComplete,
        mood,
        profile,
        homeScreenVersions,
        launcherBehaviorSettings,
        cardPacks,
        hiddenLibraryPacks,
        hiddenPackCardIdsCompat,
        globalInterruptionMode,
        events,
        actionCards,
      }),
    [
      cards,
      setupComplete,
      mood,
      profile,
      homeScreenVersions,
      launcherBehaviorSettings,
      cardPacks,
      hiddenLibraryPacks,
      hiddenPackCardIdsCompat,
      globalInterruptionMode,
      events,
      actionCards,
    ],
  );

  useEffect(() => {
    activeLauncherOverlayRef.current = overlay?.launchSource === "fake_launcher" ? overlay : null;
  }, [overlay]);

  const applySharedState = useCallback((incomingState, options = {}) => {
    const { updatedAt, ...incomingStateContent } = incomingState || {};
    lastCloudStateStrRef.current = JSON.stringify(incomingStateContent);

    const fallback = buildSharedState({
      cards: initialState.cards,
      setupComplete: initialState.setupComplete,
      mood: initialState.mood,
      profile: initialState.profile,
      homeScreenVersions: initialState.homeScreenVersions,
      launcherBehaviorSettings: initialState.launcherBehaviorSettings,
      cardPacks: initialState.cardPacks,
      hiddenLibraryPacks: initialState.hiddenLibraryPacks,
      hiddenPackCardIdsCompat: initialState.hiddenPackCardIdsCompat,
      globalInterruptionMode: initialState.globalInterruptionMode,
      events: initialState.events,
      actionCards: initialState.actionCards,
    });
    const next = normalizeSharedState(incomingState, fallback);
    const nextSetupComplete = options.forceSetupComplete ? true : next.setupComplete;

    isApplyingSharedStateRef.current = true;

    setCards((currentCards) => {
      const merged = mergeEntitiesById(currentCards, next.cards);
      const normalized = normalizeCards(merged, new Date(), next.profile.timezone).map((card) => ({
        ...card,
        theme: resolveTheme(card.theme),
      }));
      return isSameJsonValue(currentCards, normalized) ? currentCards : normalized;
    });
    setSetupComplete(nextSetupComplete);
    setMood(resolveTheme(next.mood));
    setProfile((currentProfile) => {
      const nextProfile = {
        ...currentProfile,
        ...(next.profile ?? {}),
        name: next.profile?.name ?? currentProfile.name ?? "",
        timezone: next.profile?.timezone ?? currentProfile.timezone ?? "Europe/London",
        hasCompletedHomeSpotlightTour:
          next.profile?.hasCompletedHomeSpotlightTour ??
          currentProfile.hasCompletedHomeSpotlightTour ??
          false,
      };
      return isSameJsonValue(currentProfile, nextProfile) ? currentProfile : nextProfile;
    });
    setHomeScreenVersions((current) => {
      const merged = {
        ...current,
        ...(next.homeScreenVersions ?? {}),
      };
      return isSameJsonValue(current, merged) ? current : merged;
    });
    setLauncherBehaviorSettings((current) => {
      const merged = {
        ...current,
        ...(next.launcherBehaviorSettings ?? {}),
      };
      return isSameJsonValue(current, merged) ? current : merged;
    });
    setCardPacks((currentPacks) => {
      const merged = mergeEntitiesById(currentPacks, next.cardPacks);
      return isSameJsonValue(currentPacks, merged) ? currentPacks : merged;
    });
    setHiddenLibraryPacks((current) => (isSameJsonValue(current, next.hiddenLibraryPacks) ? current : next.hiddenLibraryPacks));
    setHiddenPackCardIdsCompat((current) => (isSameJsonValue(current, next.hiddenPackCardIdsCompat) ? current : next.hiddenPackCardIdsCompat));
    setGlobalInterruptionMode(next.globalInterruptionMode);

    // Merge incoming cloud events with current local events to prevent data loss.
    // This ensures offline actions survive sync.
    setEvents((currentEvents) => {
      const merged = mergeEventsById(currentEvents, next.events);
      return isSameJsonValue(currentEvents, merged) ? currentEvents : merged;
    });
    setActionCards((current) => {
      const merged = mergeEntitiesById(current, next.actionCards);
      return isSameJsonValue(current, merged) ? current : merged;
    });

    const activeLauncherOverlay = activeLauncherOverlayRef.current;
    if (activeLauncherOverlay?.launchSource === "fake_launcher") {
      debugLaunch("[SYNC] Shared state merged without interrupting active launcher overlay", {
        overlayType: activeLauncherOverlay.type,
        versionId: activeLauncherOverlay.versionId,
      });
    } else {
      setScreen(nextSetupComplete ? "library" : "onboarding");
      const nextRoutePath = getRouteFromLocation(nextSetupComplete);
      if (nextSetupComplete && nextRoutePath === "/onboarding") {
        setRoutePath("/home");
        window.history.replaceState({}, "", `${BASE_PATH}/home`);
      } else {
        setRoutePath(nextRoutePath);
      }
    }

    window.setTimeout(() => {
      isApplyingSharedStateRef.current = false;
    }, 0);
  }, [initialState]);

  useEffect(() => {
    if (cardSaveTimerRef.current) {
      window.clearTimeout(cardSaveTimerRef.current);
    }
    cardSaveTimerRef.current = window.setTimeout(() => {
      saveCards(cards);
      cardSaveTimerRef.current = null;
    }, 120);
    return () => {
      if (cardSaveTimerRef.current) {
        window.clearTimeout(cardSaveTimerRef.current);
        cardSaveTimerRef.current = null;
      }
    };
  }, [cards]);

  useAuthLifecycle({ e2eMode, testerStatus, setShouldLaunchOverlay });

  useEffect(() => {
    if (!authReady) return;
    if (e2eMode) {
      setGlobalPacks([]);
      return;
    }
    if (!session?.user?.id) {
      setGlobalPacks([]);
      return;
    }
    fetchGlobalPacks()
      .then(setGlobalPacks)
      .catch((err) => console.warn("Could not load global packs", err));
  }, [authReady, e2eMode, session?.user?.id]);

  const handleClaimInAppAccessCode = useCallback(async (accessCode) => {
    const claimed = await claimAccessCodeForCurrentUser(accessCode);
    if (!claimed) return false;

    if (e2eMode || isDemoModeEnabled()) {
      setAccessProfile(loadE2EAccessProfile());
      setAccessStatus("granted");
      return true;
    }

    if (session?.user?.id) {
      const profileRow = await fetchOwnAccessProfile(session.user.id);
      setAccessProfile(profileRow);
      setAccessStatus(!profileRow || isAccessActive(profileRow) ? "granted" : "denied");
    } else {
      setAccessStatus("granted");
    }
    return true;
  }, [e2eMode, session?.user?.id]);

  useEffect(() => {
    if (e2eMode) return undefined;
    let cancelled = false;
    fetchLauncherConfigs()
      .then((configs) => {
        if (cancelled || configs.length === 0) return;
        // HQ-created launchers become first-class runtime launchers: register
        // them (routes/shell guard/destination resolver) and cache them for
        // cold-start route parsing on this device.
        cacheAndRegisterDynamicLaunchers(configs);
        setHomeScreenVersions((current) => {
          const next = { ...current };
          configs.forEach((config) => {
            const defaults = DEFAULT_HOME_SCREEN_VERSIONS[config.id];
            if (defaults) {
              next[config.id] = mergeLauncherConfig(defaults, {
                ...(current[config.id] ?? {}),
                ...config,
              });
              return;
            }
            if (config.isCustom === true) {
              const customLauncher = buildCustomLauncher(config);
              if (customLauncher) next[config.id] = customLauncher;
            }
          });
          return next;
        });
        setLauncherBehaviorSettings((current) => {
          const next = { ...current };
          configs.forEach((config) => {
            if (!DEFAULT_HOME_SCREEN_VERSIONS[config.id] && config.isCustom !== true) return;
            next[config.id] = {
              ...(current[config.id] ?? {}),
              useInterruptionPack: config.useInterruptionPack ?? current[config.id]?.useInterruptionPack ?? false,
              interruptionPackId: config.interruptionPackId ?? current[config.id]?.interruptionPackId ?? "",
            };
          });
          return next;
        });
      })
      .catch((err) => console.warn("[HQ LAUNCHERS] Could not load HQ launcher config; using static defaults", err));
    return () => {
      cancelled = true;
    };
  }, [e2eMode]);

  useEffect(() => {
    setLauncherDataWaitExpired(false);
  }, [route.kind, route.versionId, resumeLaunchNonce]);

  // Clear the pause-bypass ref and prune expired pause state on every route
  // transition (kind or versionId change).  Adding versionId to the deps
  // means switching between /intercept/instagram → /intercept/youtube also
  // clears the ref, so each app gets a fresh bypass decision.
  // clearExpiredAppPause is called here (once per transition) rather than
  // inside the heavy routing useEffect (which runs on every state change).
  useEffect(() => {
    if (route.kind === "intercept") {
      clearExpiredAppPause(route.versionId);
    }
    pauseBypassInitiatedRef.current.clear();
  }, [route.kind, route.versionId]);

  // Clear the bypass ref on warm resume (app returns to foreground) so the
  // pause bypass re-fires correctly when the user switches back to myBishBash
  // while still on an intercept route.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        pauseBypassInitiatedRef.current.clear();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (route.kind !== "intercept") return undefined;
    const routeInterruptionPack = route.kind === "intercept"
      ? getInterruptionPackForLauncher(route.versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
          hiddenCardIds: hiddenPackCardIdsCompat,
          globalEnabled: globalInterruptionMode,
        })
      : null;
    const routeNow = new Date();
    const normalizedCards = normalizeCards(cards, routeNow, profile.timezone);
    const selectableCards = [
      ...normalizedCards,
      ...buildEligibleCommitmentLifecycleCards(normalizedCards, routeNow, profile.timezone),
    ];
    const hasUsableCachedLauncherState =
      selectableCards.some((card) =>
        card.sourcePackId
          ? isPackCardAvailable(card)
          : !card.deletedAt && isEligible(card, routeNow, profile.timezone)
      ) ||
      (routeInterruptionPack?.cards?.length ?? 0) > 0;
    const readiness = getLauncherDecisionReadiness({
      routeKind: route.kind,
      authReady,
      sessionPresent: Boolean(session?.user?.id),
      syncStatus,
      hasUsableCachedLauncherState,
      waitExpired: launcherDataWaitExpired,
      isDemoMode: window.localStorage.getItem("MYBISHBASH_DEMO_MODE") === "true",
    });
    if (readiness.ready) return undefined;
    debugLaunch("[LAUNCHER_DATA_WAIT_STARTED]", {
      versionId: route.versionId,
      reason: readiness.reason,
      authReady,
      sessionPresent: Boolean(session?.user?.id),
      syncStatus,
      rawCardsCount: cards.length,
      hasUsableCachedLauncherState,
    });
    if (launcherDataWaitExpired) return undefined;
    const timeoutId = window.setTimeout(() => {
      console.warn("[LAUNCHER_DATA_WAIT_TIMEOUT]", {
        versionId: route.versionId,
        timeoutMs: LAUNCHER_DATA_WAIT_TIMEOUT_MS,
        rawCardsCount: cards.length,
      });
      setLauncherDataWaitExpired(true);
    }, LAUNCHER_DATA_WAIT_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [authReady, cardPacks, cards, hiddenPackCardIdsCompat, globalInterruptionMode, homeScreenVersions, launcherBehaviorSettings, launcherDataWaitExpired, profile.timezone, route.kind, route.versionId, session?.user?.id, syncStatus]);

  const refreshGlobalPacks = useCallback(() => {
    return fetchGlobalPacks()
      .then(setGlobalPacks)
      .catch((err) => console.warn("Could not refresh global packs", err));
  }, []);

  useEffect(() => {
    if (e2eMode) return;
    if (!session?.user) return;
    touchUserProfile(session.user);
  }, [e2eMode, session?.user?.email, session?.user?.id]);

  const refreshAppShell = useCallback(() => {
    refreshMyBishBashAppShell(BASE_PATH);
  }, []);

  // Auto-apply a detected update at a SAFE moment so installed PWAs pick up new
  // builds without a manual tap. "Safe" = nothing interactive on screen; we
  // apply only when the user returns to the tab (visibility/focus) so a reload
  // never interrupts an active card, composer, or onboarding. The visible
  // banner remains for immediate in-session updates.
  const autoUpdateSafeRef = useRef(false);
  useEffect(() => {
    autoUpdateSafeRef.current =
      !e2eMode && appUpdate.updateAvailable && !overlay && !isComposerOpen && setupComplete;
  });
  useEffect(() => {
    if (e2eMode || !appUpdate.updateAvailable) return undefined;
    const applyIfSafe = () => {
      if (document.visibilityState === "visible" && autoUpdateSafeRef.current) {
        refreshAppShell();
      }
    };
    document.addEventListener("visibilitychange", applyIfSafe);
    window.addEventListener("focus", applyIfSafe);
    return () => {
      document.removeEventListener("visibilitychange", applyIfSafe);
      window.removeEventListener("focus", applyIfSafe);
    };
  }, [appUpdate.updateAvailable, e2eMode, refreshAppShell]);

  useEffect(() => {
    if (e2eMode) return undefined;
    if (!session?.user?.id) return undefined;

    let cancelled = false;
    setSyncStatus("loading");
    setSyncError("");

    debugLaunch("[SYNC] session user", session.user.id);

    loadSharedState(session.user.id)
      .then((sharedState) => {
        if (cancelled) return;
        debugLaunch("[SYNC] loaded cloud state", sharedState);
        const shouldRunSignupOnboarding = signupOnboardingPendingRef.current;
        if (sharedState) {
          const incomingTime = new Date(sharedState.updatedAt).getTime();
          if (!isNaN(incomingTime)) highestKnownCloudTimeRef.current = incomingTime;
          applySharedState(sharedState, { forceSetupComplete: !shouldRunSignupOnboarding });
        } else if (!shouldRunSignupOnboarding) {
          setSetupComplete(true);
          setScreen("library");
          const nextRoutePath = getRouteFromLocation(true);
          if (nextRoutePath === "/onboarding") {
            setRoutePath("/home");
            window.history.replaceState({}, "", `${BASE_PATH}/home`);
          } else {
            setRoutePath(nextRoutePath);
          }
          setShouldLaunchOverlay(false);
        }
        setSyncStatus("ready");
        recordLaunchTiming("sync ready", { sessionPresent: true }, testerStatus);
      })
      .catch((error) => {
        if (cancelled) return;
        setSyncError(getSyncErrorMessage(error, "Could not load your myBishBash profile."));
        setSyncStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [e2eMode, session?.user?.id, applySharedState]);

  useEffect(() => {
    if (syncStatus !== "ready" || !session?.user?.id || isApplyingSharedStateRef.current) return undefined;

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
    }

    localDirtyRef.current = true;

    cloudSaveTimerRef.current = window.setTimeout(() => {
      if (isApplyingSharedStateRef.current) return;

      const stateToSave = currentSharedState();
      const { updatedAt, ...stateContent } = stateToSave;
      const stateStr = JSON.stringify(stateContent);

      if (stateStr === lastCloudStateStrRef.current) {
        localDirtyRef.current = false;
        return;
      }

      const saveTime = new Date(updatedAt).getTime();

      debugLaunch("[SYNC] saving cloud state", stateToSave);

      saveSharedState(session.user.id, stateToSave)
        .then(() => {
          lastCloudStateStrRef.current = stateStr;
          localDirtyRef.current = false;
          if (!isNaN(saveTime) && saveTime > highestKnownCloudTimeRef.current) {
            highestKnownCloudTimeRef.current = saveTime;
          }
        })
        .catch((error) => {
          console.error("UPSERT ERROR", error);
          // TODO: queue offline saves instead of only preserving the local mirror.
          console.warn("Could not save myBishBash shared state", error);
        });
    }, 500);

    return () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    };
  }, [syncStatus, session?.user?.id, currentSharedState]);

  useEffect(() => {
    if (e2eMode) return undefined;
    if (screen === "hq" || syncStatus !== "ready" || !session?.user?.id) return undefined;

    const pollInterval = window.setInterval(() => {
      if (localDirtyRef.current) {
        debugLaunch("[POLLING] skipped: local state has unsynced changes");
        return;
      }

      loadSharedState(session.user.id)
        .then((sharedState) => {
          if (!sharedState) return;
          if (localDirtyRef.current) {
            debugLaunch("[POLLING] aborted: local state changed during fetch");
            return;
          }

          const incomingTime = new Date(sharedState.updatedAt).getTime();
          if (!isNaN(incomingTime) && incomingTime < highestKnownCloudTimeRef.current) {
            debugLaunch("[POLLING] skipped: stale cloud state");
            return;
          }

          debugLaunch("[POLLING] loaded state", sharedState);

          const { updatedAt, ...incomingStateContent } = sharedState;
          const incomingStateStr = JSON.stringify(incomingStateContent);

          if (incomingStateStr === lastCloudStateStrRef.current) {
            return;
          }

          if (!isNaN(incomingTime)) {
            highestKnownCloudTimeRef.current = incomingTime;
          }

          applySharedState(sharedState);
        })
        .catch((error) => {
          console.warn("Could not periodically sync myBishBash profile", error);
        });
    }, 5000);

    return () => window.clearInterval(pollInterval);
  }, [e2eMode, screen, syncStatus, session?.user?.id, applySharedState]);

  useEffect(() => {
    saveSetupComplete(setupComplete);
    if (setupComplete) {
      signupOnboardingPendingRef.current = false;
      setSignupOnboardingPending(false);
    }
  }, [setupComplete]);

  useThemePreference(mood);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    saveHomeScreenVersions(homeScreenVersions);
  }, [homeScreenVersions]);

  useEffect(() => {
    saveLauncherBehaviorSettings(launcherBehaviorSettings);
  }, [launcherBehaviorSettings]);

  useEffect(() => {
    setExplicitLauncherBehaviorSettings((current) => {
      let changed = false;
      const next = { ...current };
      for (const [versionId, behavior] of Object.entries(launcherBehaviorSettings)) {
        const hasExplicitSetupState =
          Object.prototype.hasOwnProperty.call(behavior, "appEnabled") ||
          Object.prototype.hasOwnProperty.call(behavior, "setupState");
        if (!hasExplicitSetupState) continue;
        const currentBehavior = next[versionId] ?? {};
        const mergedBehavior = {
          ...currentBehavior,
          appEnabled: behavior.appEnabled,
          setupState: behavior.setupState,
        };
        if (typeof behavior.useInterruptionPack === "boolean") {
          mergedBehavior.useInterruptionPack = behavior.useInterruptionPack;
        }
        if (typeof behavior.interruptionPaused === "boolean") {
          mergedBehavior.interruptionPaused = behavior.interruptionPaused;
        }
        if (JSON.stringify(currentBehavior) !== JSON.stringify(mergedBehavior)) {
          next[versionId] = mergedBehavior;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [launcherBehaviorSettings]);

  useEffect(() => {
    saveCardPacks(cardPacks);
  }, [cardPacks]);

  useEffect(() => {
    saveHiddenPackCardIdsCompat(hiddenPackCardIdsCompat);
  }, [hiddenPackCardIdsCompat]);

  useEffect(() => {
    saveGlobalInterruptionMode(globalInterruptionMode);
  }, [globalInterruptionMode]);

  useEffect(() => {
    saveHiddenLibraryPacks(hiddenLibraryPacks);
  }, [hiddenLibraryPacks]);

  useEffect(() => {
    saveEventLog(events);
  }, [events]);

  useEffect(() => {
    saveActionCards(actionCards);
  }, [actionCards]);

  useEffect(() => {
    if (overlay?.type === "action-card" && visibleActionCards.length === 0) {
      debugLog("[ACTION CARDS] No visible action cards; switching to empty fallback.");
      const nextOverlay = {
        ...buildActionCardEmptyOverlay(overlay.versionId),
        origin: overlay.origin,
        activationKey: overlay?.activationKey,
        launchSource: overlay.launchSource,
      };
      setOverlay(nextOverlay);
    }
  }, [overlay?.type, overlay?.versionId, overlay?.origin, overlay?.activationKey, overlay?.launchSource, visibleActionCards.length]);

  useEffect(() => {
    saveNotificationSettings(notificationSettings);
  }, [notificationSettings]);

  useEffect(() => {
    const normalized = normalizeCards(cards, new Date(), profile.timezone);
    if (JSON.stringify(normalized) !== JSON.stringify(cards)) {
      setCards(normalized);
    }
  }, []);

  useEffect(() => {
    if (screen !== "library" || overlay) return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelector("[data-testid='app-shell']")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [screen, route.path, overlay]);

  useEffect(() => {
    const handlePopState = () => {
      setRoutePath(getRouteFromLocation(setupComplete));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, [setupComplete]);

  useEffect(() => {
    setCards((current) => normalizeCards(current, new Date(), profile.timezone));
  }, [profile.timezone]);

  useEffect(() => {
    setCards((current) =>
      normalizeCards(current, new Date(), profile.timezone).map((card) => ({
        ...card,
        disliked: card.sourcePackId ? hiddenPackCardIdsCompat.includes(getLegacyHiddenPackCardKey(card)) : card.disliked ?? false,
      })),
    );
  }, [hiddenPackCardIdsCompat, profile.timezone]);

  useEffect(() => {
    if (activeTab !== "log" && logFilter !== "all") {
      setLogFilter("all");
    }
  }, [activeTab, logFilter]);

  useEffect(() => {
    if (!menuOpenId) return undefined;

    function handlePointerDown(event) {
      if (event.target.closest?.(".menu-wrap")) return;
      setMenuOpenId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpenId]);

  useEffect(() => {
    setMenuOpenId(null);
  }, [activeTab, route.kind, overlay?.type]);

  const logEvent = useCallback(async (input) => {
    const record = createEventRecord({
      launcher_context: launcherContext,
      ...input,
    });
    const next = await persistEventRecord(record);
    setEvents(next);
  }, [launcherContext]);

  const showMorningSummaryForDate = useCallback((dateKey, { forced = false } = {}) => {
    const summary = buildMorningSummary(events, { dateKey, timezone: profile.timezone });
    setMorningSummary({ ...summary, forced });
    setOverlay(null);
    setShouldLaunchOverlay(false);
  }, [events, profile.timezone]);

  const showMorningSummaryNow = useCallback(() => {
    showMorningSummaryForDate(getPreviousDateKey(new Date(), profile.timezone), { forced: true });
  }, [profile.timezone, showMorningSummaryForDate]);

  const showMorningSummaryForToday = useCallback(() => {
    showMorningSummaryForDate(getTodayKey(new Date(), profile.timezone), { forced: true });
  }, [profile.timezone, showMorningSummaryForDate]);

  const showMorningSummaryForYesterday = useCallback(() => {
    showMorningSummaryForDate(getPreviousDateKey(new Date(), profile.timezone), { forced: true });
  }, [profile.timezone, showMorningSummaryForDate]);

  const morningSummaryDebug = useMemo(
    () => buildMorningSummary(events, {
      dateKey: getPreviousDateKey(new Date(), profile.timezone),
      timezone: profile.timezone,
    }),
    [events, profile.timezone],
  );

  function closeMorningSummary(summary = morningSummary) {
    if (summary?.dateKey) {
      markMorningSummarySeen(getTodayKey(new Date(), profile.timezone));
    }
    setMorningSummary(null);
  }

  useEffect(() => {
    if (screen === "onboarding" && !loggedOnboardingStartedRef.current) {
      loggedOnboardingStartedRef.current = true;
      void logEvent({
        event_type: "onboarding_started",
        source_type: "onboarding",
        card_source: "onboarding",
        action_taken: "started",
      });
    }
  }, [screen, logEvent]);

  const logLauncherEvent = useCallback(
    async (eventType, launcherId, metadata = {}) => {
      const launcher = homeScreenVersions[launcherId] ?? getLauncherConfig(launcherId);
      if (!launcher) return;
      const routeValue = metadata.route || getPathRelativeToKnownBase(window.location.pathname);
      const payload = buildLauncherEventPayload({
        eventType,
        launcher,
        route: routeValue,
        session,
        metadata,
      });

      debugLog("[INTERCEPT] Launcher event", payload);
      void saveLauncherEvent(payload);
      void logEvent({
        event_type: eventType,
        source_type: "fake_launcher",
        card_source: "fake_launcher",
        launcher_context: launcher.id,
        target_app: launcher.id,
        app_id: launcher.id,
        app_name: launcher.displayName,
        action_taken: eventType,
        metadata: {
          launcher_id: launcher.id,
          launcher_name: launcher.displayName,
          launcher_category: launcher.category,
          route: payload.route,
          source: "fake_launcher",
          anonymous_device_id: payload.anonymous_device_id,
          session_id: payload.session_id,
          is_standalone: payload.is_standalone,
          app_display_mode: payload.app_display_mode,
          platform: payload.platform,
          ...metadata,
        },
      });
    },
    [homeScreenVersions, logEvent, session],
  );

  function createInterceptActivation(versionId, source = "route") {
    interceptActivationCounterRef.current += 1;
    return `${versionId}:${source}:${Date.now()}:${interceptActivationCounterRef.current}`;
  }

  function createLaunchAttemptId(routeKind, source = "route") {
    launchAttemptCounterRef.current += 1;
    return `${routeKind}:${source}:${Date.now()}:${launchAttemptCounterRef.current}`;
  }

  function selectLauncherActivationCard(versionId, source = "route") {
    const activationKey = createInterceptActivation(versionId, source);
    launchCompletedCardIdsRef.current = new Set();
    debugLaunch("[LAUNCH_ATTEMPT] intercept started", {
      route: route.path,
      launcherContext: versionId,
      launchAttemptId: activationKey,
      source,
      selectedPath: "personal_first_fallback",
    });
    const selectionEvents =
      overlay?.type === "intercept-pack" && overlay?.versionId === versionId
        ? [
            ...events,
            {
              event_type: "intercept_card_viewed",
              created_at: new Date().toISOString(),
              source_type: "interruption",
              card_source: "interruption",
              pack_id: overlay.packId,
              card_id: overlay.cards?.[overlay.activeIndex ?? 0]?.id ?? `${overlay.packId}:${overlay.activeIndex ?? 0}`,
              message_id: `${overlay.packId}:${overlay.activeIndex ?? 0}`,
            },
          ]
        : events;
    const interruptionPack = getInterruptionPackForLauncher(versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
      hiddenCardIds: hiddenPackCardIdsCompat,
      globalEnabled: globalInterruptionMode,
    });
    const configuredLauncher = resolveVersionConfig(
      homeScreenVersions[versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[versionId],
      launcherBehaviorSettings[versionId],
    );
    const interruptionEnabled = Boolean(globalInterruptionMode && configuredLauncher?.useInterruptionPack && !configuredLauncher?.interruptionPaused);
    const eligibleCardCount = interruptionPack?.cards?.length ?? 0;
    const interruption = eligibleCardCount > 0
      ? {
          type: "interruption",
          pack: interruptionPack,
          versionId,
          activeIndex: pickInterruptionCardIndex(interruptionPack, selectionEvents),
        }
      : null;

    recordLaunchTiming("card selection started", {
      route: route.path,
      versionId,
      activationKey,
      selectedPath: "personal_first_fallback",
    }, testerStatus);
    const selectionNow = new Date();
    const normalizedSelectionCards = normalizeCards(cards, selectionNow, profile.timezone);
    const fallbackDisplay = selectEligibleCard({
      cards: getLaunchPersonalCardPool(normalizedSelectionCards),
      timezone: profile.timezone,
      events: selectionEvents,
      excludedCardIds: launchCompletedCardIdsRef.current,
    });
    recordLaunchTiming("card selection finished", {
      route: route.path,
      versionId,
      activationKey,
      selectedPath: "personal_first_fallback",
      selectedCardId: fallbackDisplay.selected?.id ?? null,
      selectedPriority: fallbackDisplay.selectedPriority ?? "none",
      selectedSource: fallbackDisplay.selectedSource ?? null,
      selectionReason: fallbackDisplay.selectionReason ?? null,
    }, testerStatus);
    const selected = fallbackDisplay.selected;
    const launcherStats = getLauncherCardStats(cards, profile.timezone, launchCompletedCardIdsRef.current);
    const plannedInterruption = interruption;
    const selectedSource = fallbackDisplay.selectedSource ?? (selected?.sourcePackId ? "pack" : selected ? "personal" : "none");
    const flowContext = buildFakeLauncherFlowContext({
      launcherId: versionId,
      launcherName: configuredLauncher?.name ?? configuredLauncher?.displayName ?? versionId,
      destinationUrl: configuredLauncher ? getBrowserSafeDestinationHref(getVersionOpenHref(configuredLauncher)) : "",
      interruptionEnabled,
      activationKey,
    });
    const initialFlowStep = getInitialFakeLauncherStep({
      selectedCard: selected,
      interruption: plannedInterruption,
      interruptionEnabled,
    });

    const selectedCard = selected ?? plannedInterruption?.pack?.cards?.[plannedInterruption.activeIndex ?? 0] ?? null;
    const selectedCardDebug = getCardDebugSnapshot(selectedCard);
    logLauncherSelectionAudit({
      versionId,
      source,
      cards,
      timezone: profile.timezone,
      customPacks: cardPacks,
      events: selectionEvents,
      excludedCardIds: launchCompletedCardIdsRef.current,
      fallbackDisplay,
      launcherStats,
      selectionModel: "personal_first_fallback",
      interruptionPack,
      selected,
      plannedInterruption,
    });
    debugLaunch("[LAUNCH_SELECTION_CARD_IDENTITY]", {
      route: route.path,
      launcherContext: versionId,
      activationKey,
      source,
      selectedOverlayType: selected ? "reveal" : plannedInterruption ? "intercept-pack" : "empty",
      selectedCardId: selectedCardDebug.id,
      selectedCardTitle: selectedCardDebug.title,
      selectedCardSource: selected?.sourcePackId ? "library_pack" : selected ? "personal" : plannedInterruption ? "interruption" : null,
    });
    debugLaunch("[LAUNCH_ATTEMPT] intercept resolved", {
      route: route.path,
      launcherContext: versionId,
      launchAttemptId: activationKey,
      versionId,
      source,
      eligibleCardCount,
      selectedPath: "personal_first_fallback",
      selectionReason: fallbackDisplay.selectionReason ?? null,
      selectedPriority: fallbackDisplay.selectedPriority ?? "none",
      selectedSource,
      eligiblePersonalCount: fallbackDisplay.eligiblePersonalCount ?? launcherStats.eligiblePersonalCardsCount,
      eligiblePackCardCount: fallbackDisplay.eligiblePackCardCount ?? launcherStats.eligiblePackCardsCount,
      overlayType: selected ? "reveal" : plannedInterruption ? "intercept-pack" : "empty",
      packId: selected?.sourcePackId ?? plannedInterruption?.pack?.id ?? null,
      cardId: selectedCard?.id ?? null,
      selectedCardId: selectedCard?.id ?? null,
      selectedCardSource: selected?.sourcePackId ? "library_pack" : selected ? "personal" : plannedInterruption ? "interruption" : null,
      activeIndex: plannedInterruption?.activeIndex ?? null,
      interruptionEnabled,
      actionCardAvailable: visibleActionCards.length > 0,
      emptyStateType: selected || plannedInterruption ? null : "fake_launcher",
      nextState: initialFlowStep,
      flowContext,
      ...launcherStats,
      caughtUpReason: selected || plannedInterruption ? null : "no_eligible_primary_or_fallback_cards",
      fallbackReason: selected || plannedInterruption ? fallbackDisplay.selectionReason ?? null : "no_eligible_primary_or_fallback_cards",
    });
    void logEvent({
      event_type: "launcher_session_started",
      source_type: "fake_launcher",
      card_source: "fake_launcher",
      card_id: selected?.id ?? null,
      card_title: selected?.dashboardTitle ?? selected?.promptText ?? null,
      card_text: selected?.promptText ?? null,
      pack_id: selected?.sourcePackId ?? null,
      app_id: versionId,
      app_name: homeScreenVersions[versionId]?.displayName ?? homeScreenVersions[versionId]?.name ?? versionId,
      launcher_context: versionId,
      action_taken: "started",
      metadata: {
        activationKey,
        launcherId: versionId,
        launchedFrom: source,
        selectedPath: "personal_first_fallback",
        selectionReason: fallbackDisplay.selectionReason ?? null,
        selectedPriority: fallbackDisplay.selectedPriority ?? "none",
        selectedSource,
        eligiblePersonalCount: fallbackDisplay.eligiblePersonalCount ?? launcherStats.eligiblePersonalCardsCount,
        eligiblePackCardCount: fallbackDisplay.eligiblePackCardCount ?? launcherStats.eligiblePackCardsCount,
        selectedCardId: selected?.id ?? null,
        selectedPackId: selected?.sourcePackId ?? null,
        interruptionShown: Boolean(plannedInterruption),
        interruptionEnabled,
        flowContext,
        nextState: initialFlowStep,
        actionCardAvailable: visibleActionCards.length > 0,
        emptyStateType: selected || plannedInterruption ? null : "fake_launcher",
        actionCardShown: false,
        destinationOpened: false,
      },
    });
    interceptActivationRef.current = {
      activationKey,
      versionId,
      source,
      selected,
      interruption: plannedInterruption,
      interruptionEnabled,
      flowContext,
      selectionModel: "personal_first_fallback",
      selectionDecision: fallbackDisplay,
    };
    return interceptActivationRef.current;
  }

  useEffect(() => {
    if (route.kind !== "intercept" && overlay?.launchSource !== "fake_launcher") {
      setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
    }
  }, [route.kind, overlay?.launchSource]);

  // Keep the utils getCurrentWindow singleton in sync with the user's saved prefs.
  useEffect(() => {
    setWindowDefs(timingWindowsPrefs);
  }, [timingWindowsPrefs]);

  useEffect(() => {
    if (syncStatus === "ready") {
      void processEventQueue();
    }
  }, [syncStatus]);

  useEffect(() => {
    const handleLauncherResume = (source, hiddenFor) => {
      if (hiddenFor <= 1000 || !setupComplete) return;
      const resumeRoute = parseRoute(getRouteFromLocation(setupComplete));
      if (resumeRoute.path !== route.path) {
        setRoutePath(resumeRoute.path);
      }

      if (resumeRoute.kind === "intercept") {
        const previousOverlay = activeLauncherOverlayRef.current ?? overlay;
        const previousCard = previousOverlay?.cardId
          ? getCardDebugSnapshot(cards.find((candidate) => candidate.id === previousOverlay.cardId))
          : { id: null, title: null };
        interceptActivationRef.current = null;
        launchCompletedCardIdsRef.current = new Set();
        loggedLauncherOpenRef.current = "";
        suppressNextHomeAutoLaunchRef.current = false;
        debugLaunch("[LAUNCH_ATTEMPT] intercept resume", {
          route: resumeRoute.path,
          launcherContext: resumeRoute.versionId,
          launchAttemptId: `${resumeRoute.versionId}:home_screen_resume:${Date.now()}`,
          source: "home_screen_resume",
          resumeEventSource: source,
          eligibleCardCount: null,
          previousOverlayType: previousOverlay?.type ?? null,
          previousOverlayCardId: previousCard.id,
          previousOverlayCardTitle: previousCard.title,
          selectedCardId: null,
          caughtUpReason: null,
          fallbackReason: null,
        });
        const nextOverlay = beginInterceptionFlow(resumeRoute.versionId, {
          source: "home_screen_resume",
          replace: true,
          navigate: true,
        });
        const nextActivation = interceptActivationRef.current;
        const nextSelectedCard = nextOverlay?.cardId
          ? getCardDebugSnapshot(cards.find((candidate) => candidate.id === nextOverlay.cardId))
          : getCardDebugSnapshot(
              nextActivation?.selected ??
                nextActivation?.interruption?.pack?.cards?.[nextActivation?.interruption?.activeIndex ?? 0] ??
                null,
            );
        debugLaunch("[WARM_RESUME_ATOMIC_OVERLAY_REPLACE]", {
          route: resumeRoute.path,
          launcherContext: resumeRoute.versionId,
          resumeEventSource: source,
          previousOverlayType: previousOverlay?.type ?? null,
          previousOverlayCardId: previousCard.id,
          previousOverlayCardTitle: previousCard.title,
          nextOverlayType: nextOverlay?.type ?? null,
          nextOverlayCardId: nextSelectedCard.id,
          nextOverlayCardTitle: nextSelectedCard.title,
          activationKey: nextOverlay?.activationKey ?? nextActivation?.activationKey ?? null,
        });
        return;
      }

      suppressNextHomeAutoLaunchRef.current = false;
      interceptActivationRef.current = null;
      setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
      if (suppressResumeHomeAutoLaunchRef.current) {
        suppressResumeHomeAutoLaunchRef.current = false;
        suppressNextHomeAutoLaunchRef.current = true;
        setShouldLaunchOverlay(false);
      } else {
        suppressNextHomeAutoLaunchRef.current = false;
        setShouldLaunchOverlay(true);
      }
      setOverlay(null);
    };

    const handleHidden = () => {
      hiddenSinceRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleHidden();
        return;
      }

      if (document.visibilityState === "visible") {
        const hiddenFor = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
        hiddenSinceRef.current = null;
        handleLauncherResume("visibilitychange", hiddenFor);
      }
    };

    const handlePageShow = () => {
      const hiddenFor = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
      hiddenSinceRef.current = null;
      handleLauncherResume("pageshow", hiddenFor);
    };

    const handlePageHide = () => {
      handleHidden();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [cards, profile.timezone, route.kind, route.path, route.versionId, setupComplete, authReady, session, syncStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deliveryId = params.get("deliveryId");
    if (deliveryId) {
      debugLog("[NOTIFICATIONS] Opened with deliveryId:", deliveryId);
      void markNotificationOpened(deliveryId);

      // Clean the URL
      params.delete("deliveryId");
      params.delete("source");
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  useEffect(() => {
    if (!setupComplete && route.kind !== "intercept") {
      setScreen("onboarding");
      setOverlay(null);
      if (route.kind !== "onboarding") {
        setRoutePath("/onboarding");
        window.history.replaceState({}, "", `${BASE_PATH}/onboarding`);
      }
      return;
    }

    if (route.kind === "onboarding") {
      setScreen("onboarding");
      setOverlay(null);
      return;
    }

    if (route.kind === "hq") {
      setScreen("hq");
      setOverlay(null);
      return;
    }

    if (route.kind === "preview-continue") {
      setScreen("preview-continue");
      setOverlay(null);
      return;
    }

    if (route.kind === "invalid-intercept") {
      console.warn("[INTERCEPT] Unknown launcher id; returning home", route.versionId);
      setScreen("library");
      setOverlay(null);
      navigateTo("/home", { replace: true });
      return;
    }

    if (route.kind === "intercept") {
      // Expired app pauses are pruned once per route transition in a separate
      // useEffect above — not here, to avoid a synchronous localStorage read
      // on every state-change re-run of this effect.
      const isTestMode = Boolean(testerStatus?.is_tester);
      const isDemoMode = window.localStorage.getItem("MYBISHBASH_DEMO_MODE") === "true";
      const routeNow = new Date();
      const normalizedDiagCards = normalizeCards(cards, routeNow, profile.timezone);
      const selectableDiagCards = [
        ...normalizedDiagCards,
        ...buildEligibleCommitmentLifecycleCards(normalizedDiagCards, routeNow, profile.timezone),
      ];
      const eligiblePersonalCount = selectableDiagCards.filter((c) => !c.sourcePackId && !c.deletedAt && isEligible(c, routeNow, profile.timezone)).length;
      const eligiblePackCount = normalizedDiagCards.filter(isPackCardAvailable).length;
      const routeInterruptionPack = getInterruptionPackForLauncher(route.versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
        hiddenCardIds: hiddenPackCardIdsCompat,
        globalEnabled: globalInterruptionMode,
      });
      const hasUsableCachedLauncherState =
        eligiblePersonalCount > 0 ||
        eligiblePackCount > 0 ||
        (routeInterruptionPack?.cards?.length ?? 0) > 0;
      const launcherReadiness = getLauncherDecisionReadiness({
        routeKind: route.kind,
        authReady,
        sessionPresent: Boolean(session?.user?.id),
        testerStatusReady: !session?.user?.id || testerStatus !== null,
        syncStatus,
        hasUsableCachedLauncherState,
        waitExpired: launcherDataWaitExpired,
        isDemoMode,
      });
      debugLaunch("[LAUNCHER ROUTE DETECTED]", {
        routeKind: route.kind,
        route: route.path,
        versionId: route.versionId,
        isTestMode,
        authReady,
        sessionPresent: Boolean(session?.user?.id),
        testerStatusReady: !session?.user?.id || testerStatus !== null,
        syncStatus,
        rawCardsCount: cards.length,
        eligiblePersonalCount,
        eligiblePackCount,
        eligibleInterruptionCount: routeInterruptionPack?.cards?.length ?? 0,
        hasUsableCachedLauncherState,
        readiness: launcherReadiness,
        online: typeof navigator === "undefined" ? null : navigator.onLine,
      });
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        debugLaunch("[OFFLINE CACHED LAUNCH USED]", { versionId: route.versionId, route: route.path });
      }
      if (!launcherReadiness.ready) {
        setLauncherContext(route.versionId);
        setScreen("interception");
        if (overlay?.type !== "launcher-preparing" || overlay?.versionId !== route.versionId) {
          const nextOverlay = buildFakeLauncherPreparingOverlay(route.versionId);
          debugLaunch("[LAUNCHER_DECISION_WAITING]", {
            routeKind: route.kind,
            isTestMode,
            authReady,
            sessionPresent: Boolean(session?.user?.id),
            testerStatusReady: !session?.user?.id || testerStatus !== null,
            syncStatus,
            rawCardsCount: cards.length,
            eligiblePersonalCount,
            eligiblePackCount,
            eligibleInterruptionCount: routeInterruptionPack?.cards?.length ?? 0,
            hasUsableCachedLauncherState,
            reason: launcherReadiness.reason,
            finalDecision: "preparing",
          });
          setOverlay(nextOverlay);
        }
        return;
      }

      // ── App pause bypass ─────────────────────────────────────────────────
      // Placed AFTER the readiness check so the "preparing" overlay is shown
      // while data loads rather than a black screen.  The ref guard ensures
      // openDestinationApp is called at most once per page load per versionId,
      // preventing the rapid re-fire loop that occurred with every useEffect
      // dependency change.
      if (isAppPaused(route.versionId)) {
        if (!pauseBypassInitiatedRef.current.has(route.versionId)) {
          pauseBypassInitiatedRef.current.add(route.versionId);
          debugLog("[LAUNCHER] App paused — bypassing card flow", { versionId: route.versionId });
          void logLauncherEvent("fake_launcher_pause_bypass_used", route.versionId, {
            launched_from: "app_pause_bypass",
            pause_expiry: getAppPauseExpiry(route.versionId),
          });
          openDestinationApp(route.versionId, { source: "app_pause_bypass", reason: "app_paused" });
        }
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      const isResumeInterceptLaunch = resumeLaunchNonce !== handledResumeLaunchNonceRef.current;

      if (
        !isResumeInterceptLaunch &&
        ["action-card", "action-card-empty", "action-success", "flow-confirmation", "commitment-motivation"].includes(overlay?.type) &&
        overlay?.versionId === route.versionId
      ) {
        return;
      }

      if (!isResumeInterceptLaunch && ["intercept-pack", "continue-to-app"].includes(overlay?.type) && overlay?.versionId === route.versionId) {
        debugLaunch("[INTERCEPT] skipped rebuild because overlay already active", {
          versionId: route.versionId,
          activationKey: interceptActivationRef.current?.activationKey ?? null,
        });
        setScreen("interception");
        return;
      }

      if (!isResumeInterceptLaunch && ["reveal", "empty"].includes(overlay?.type) && overlay?.versionId === route.versionId) {
        return;
      }

      if (isResumeInterceptLaunch) {
        handledResumeLaunchNonceRef.current = resumeLaunchNonce;
        interceptActivationRef.current = null;
      }
      if (
        !isResumeInterceptLaunch &&
        overlay?.type === "launcher-preparing" &&
        overlay?.versionId === route.versionId &&
        interceptActivationRef.current?.versionId === route.versionId
      ) {
        debugLaunch("[INTERCEPT] skipped duplicate rebuild while launcher decision is settling", {
          versionId: route.versionId,
          activationKey: interceptActivationRef.current?.activationKey ?? null,
        });
        setScreen("interception");
        return;
      }
      const launcherOpenKey = `${route.versionId}:${route.path}:${session?.user?.id ?? "anon"}`;
      if (loggedLauncherOpenRef.current !== launcherOpenKey) {
        loggedLauncherOpenRef.current = launcherOpenKey;
      }
      debugLaunch("[LAUNCHER_FINAL_DECISION]", {
        routeKind: route.kind,
        isTestMode,
        authReady,
        sessionPresent: Boolean(session?.user?.id),
        syncStatus,
        rawCardsCount: cards.length,
        eligiblePersonalCount,
        eligiblePackCount,
        finalDecision: "begin_interception_flow",
      });
      beginInterceptionFlow(route.versionId, {
        source: isResumeInterceptLaunch ? "home_screen_resume" : "route",
        navigate: false,
      });
      return;
    }

    if (route.kind === "caught-up") {
      setScreen("library");
      const fakeContext = getActiveFakeLauncherReturnContext(route, overlay, interceptActivationRef.current, getFakeLauncherShellContextId());
      if (!fakeContext) {
        debugLaunch("[CARD_ORIGIN] direct caught-up route redirected home");
        suppressNextHomeAutoLaunchRef.current = true;
        setShouldLaunchOverlay(false);
        navigateTo("/home", { replace: true });
        setOverlay(null);
        return;
      }
      const nextOverlay = fakeContext
        ? { ...buildFakeLauncherEmptyOverlay(fakeContext.versionId, fakeContext.activationKey), origin: "home" }
        : { ...buildEmptyOverlay(), origin: "home" };
      debugLaunch("[CARD_ORIGIN] caught-up created", nextOverlay);
      setOverlay(nextOverlay);
      return;
    }

    setScreen("library");

    if (route.kind === "card") {
      if (["flow-confirmation", "commitment-motivation"].includes(overlay?.type)) {
        return;
      }
      if (overlay?.type === "reveal" && overlay.cardId === route.cardId) {
        return;
      }
      const nextOverlay = buildRevealOverlayForCurrentShell(route.cardId);
      debugLaunch(
        isFakeLauncherShellContext()
          ? "[CARD_ORIGIN] launcher shell card created"
          : "[CARD_ORIGIN] home card created",
        nextOverlay,
      );
      setOverlay(nextOverlay);
      return;
    }

    if (isHomeRoute && testerStatus?.is_tester === true && isStandaloneDisplayMode()) {
      const installedLauncherId = getInstalledLauncherShellId();
      if (installedLauncherId && !consumeStandaloneLauncherRecoverySuppression()) {
        debugLaunch("[STANDALONE_LAUNCHER_RECOVERY] restarting launcher shell from home", {
          route: route.path,
          launcherContext: installedLauncherId,
        });
        interceptActivationRef.current = null;
        launchCompletedCardIdsRef.current = new Set();
        suppressNextHomeAutoLaunchRef.current = false;
        setShouldLaunchOverlay(false);
        setOverlay(null);
        beginInterceptionFlow(installedLauncherId, {
          source: "standalone_home_recovery",
          replace: true,
          navigate: true,
        });
        return;
      }
    }

    if (isHomeRoute && shouldLaunchOverlay) {
      const todayKey = getTodayKey(new Date(), profile.timezone);
      if (shouldAutoShowMorningSummary({ timezone: profile.timezone, seenDateKey: todayKey })) {
        const summary = buildMorningSummary(events, {
          dateKey: getPreviousDateKey(new Date(), profile.timezone),
          timezone: profile.timezone,
        });
        if (summary.hasMeaningfulData) {
          setShouldLaunchOverlay(false);
          setOverlay(null);
          setMorningSummary(summary);
          return;
        }
      }

      if (e2eMode) {
        setShouldLaunchOverlay(false);
        setOverlay(null);
        return;
      }

      if (suppressNextHomeAutoLaunchRef.current) {
        suppressNextHomeAutoLaunchRef.current = false;
        setShouldLaunchOverlay(false);
        setOverlay((current) => (current?.type === "custom-pack-preview" ? current : null));
        debugLaunch("[LAUNCH_ATTEMPT] personal suppressed", {
          route: route.path,
          launcherContext: NORMAL_LAUNCHER_CONTEXT,
          launchAttemptId: createLaunchAttemptId("personal", "suppressed"),
          eligibleCardCount: countEligibleGeneralCards(cards, profile.timezone),
          selectedCardId: null,
          caughtUpReason: null,
          fallbackReason: "suppression ref was set by an intentional in-app action",
        });
        return;
      }

      debugLaunch("[LAUNCH_CHECK] evaluating personal route launch", {
        route: route.path,
        shouldLaunchOverlay,
        overlayType: overlay?.type,
        isHomeRoute,
      });

      const launchAttemptId = createLaunchAttemptId("personal", "route");
      const homeNow = new Date();
      const normalizedHomeCards = normalizeCards(cards, homeNow, profile.timezone);
      const homeDecision = selectEligibleCard({
        cards: getLaunchPersonalCardPool(normalizedHomeCards),
        events,
        timezone: profile.timezone,
      });
      const selected = homeDecision.selected;

      const eligibleCount = countEligibleGeneralCards(cards, profile.timezone);
      debugLaunch("[ELIGIBLE_COUNTS]", {
        totalCards: cards.length,
        eligible: eligibleCount,
        eligiblePrimaryCount: homeDecision.eligiblePrimaryCount ?? homeDecision.eligiblePersonalCount ?? 0,
        eligibleFallbackCount: homeDecision.eligiblePackCardCount ?? 0,
      });

      setShouldLaunchOverlay(false);

      debugLaunch("[SELECTED_CARD]", selected);
      debugLaunch("[EMPTY_REASON]", selected ? null : "No eligible cards found at launch check.");

      debugLaunch("[LAUNCH_ATTEMPT] personal resolved", {
        route: route.path,
        launcherContext: NORMAL_LAUNCHER_CONTEXT,
        launchAttemptId,
        eligibleCardCount: eligibleCount,
        selectedPriority: homeDecision.selectedPriority ?? "none",
        selectedSource: homeDecision.selectedSource ?? null,
        selectedCardId: selected?.id ?? null,
        caughtUpReason: selected ? null : "no eligible general bash cards",
        fallbackReason: selected ? homeDecision.selectionReason ?? null : "no_eligible_primary_or_fallback_cards",
      });
      
      const fakeContext = getActiveFakeLauncherReturnContext(route, overlay, interceptActivationRef.current);

      if (selected) {
        debugLaunch("[LAUNCH_DIAG_DECISION]", "personal -> reveal");
        debugLaunch("[REVEAL_SELECTED_AFTER_SYNC] found eligible card", selected.id);
        debugLaunch("[LAUNCH_DECISION]", "personal -> reveal");
        debugLaunch("[REVEAL_SELECTED_AFTER_SYNC]", { cardId: selected.id });
        const nextOverlay = fakeContext
          ? { ...buildFakeLauncherRevealOverlay(selected.id, fakeContext.versionId, fakeContext.activationKey), origin: "home" }
          : { ...buildRevealOverlay(selected.id), origin: "home" };
        debugLaunch("[CARD_ORIGIN] home reveal created", nextOverlay);
        setOverlay(nextOverlay);
        return;
      }

      debugLaunch("[LAUNCH_DIAG_DECISION]", "personal -> empty");
      debugLaunch("[LAUNCH_DECISION]", "personal -> empty");
      if (fakeContext) {
        const nextOverlayEmpty = { ...buildFakeLauncherEmptyOverlay(fakeContext.versionId, fakeContext.activationKey), origin: "home" };
        debugLaunch("[CARD_ORIGIN] home empty created", nextOverlayEmpty);
        setOverlay(nextOverlayEmpty);
        return;
      }
      debugLaunch("[CARD_ORIGIN] home empty skipped; Home is the empty state");
      suppressNextHomeAutoLaunchRef.current = true;
      setOverlay(null);
      return;
    }

    if (isAppTabRoute) {
      if (route.kind === "home" && (overlay?.type === "reveal" || overlay?.type === "empty")) {
        return;
      }
      setOverlay((current) => (current?.type === "custom-pack-preview" ? current : null));
      return;
    }

    setOverlay((current) => (current?.type === "custom-pack-preview" ? current : null));
  }, [route, setupComplete, homeScreenVersions, launcherBehaviorSettings, cardPacks, cards, profile.timezone, shouldLaunchOverlay, launcherContext, hiddenPackCardIdsCompat, globalInterruptionMode, events, authReady, session, syncStatus, resumeLaunchNonce, launcherDataWaitExpired, testerStatus?.is_tester, overlay?.type, overlay?.versionId, overlay?.cardId, overlay?.launchSource, logLauncherEvent, e2eMode]);

  function navigateTo(path, { replace = false } = {}) {
    const normalized = normalizeRoutePath(path);
    const nextRoute = parseRoute(normalized);
    if (nextRoute.kind === "settings") {
      setShellSettingsVersionId(null);
      setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
      suppressInstalledShellCardContext();
      clearActiveProtectedAppContext();
      setActiveProtectedAppContext(null);
    }
    const url = `${BASE_PATH}${normalized === "/" ? "" : normalized}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoutePath(normalized);
  }

  function openLauncherSetupFromApp(versionOrId) {
    const versionId = typeof versionOrId === "string" ? versionOrId : versionOrId?.id;
    if (!versionId || !isKnownLauncher(versionId)) return;
    const version =
      typeof versionOrId === "object" && versionOrId?.id
        ? versionOrId
        : homeScreenVersions[versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[versionId] ?? getLauncherConfig(versionId);
    if (isStandaloneDisplayMode()) {
      setLauncherSetupInterstitialVersion(version);
      return;
    }
    window.location.href = getLauncherSetupUrl(versionId);
  }

  function renderInterceptionDecision(versionId, activation, { source = "route" } = {}) {
    const { selected, interruption, activationKey, interruptionEnabled } = activation;
    const initialStep = getInitialFakeLauncherStep({
      selectedCard: selected,
      interruption,
      interruptionEnabled,
    });

    setScreen(selected ? "library" : "interception");

    if (initialStep === FAKE_LAUNCHER_FLOW_STEPS.SELECTED_CARD) {
      debugLaunch("[INTERCEPT] Opening fallback myBishBash card", { versionId, source, cardId: selected.id });
      debugLaunch("[LAUNCHER_FINAL_DECISION]", {
        source,
        versionId,
        selectedCardId: selected.id,
        finalDecision: "personal_card",
      });
      const nextOverlay = buildFakeLauncherRevealOverlay(selected.id, versionId, activationKey);
      debugLaunch("[LAUNCHSOURCE PRESERVED]", nextOverlay);
      debugLaunch("[CARD_ORIGIN] launcher reveal created", nextOverlay);
      setOverlay(nextOverlay);
      return nextOverlay;
    }

    if (initialStep === FAKE_LAUNCHER_FLOW_STEPS.INTERRUPTION_CARD) {
      debugLaunch("[INTERCEPT] Opening interruption pack", { versionId, source, packId: interruption.pack?.id });
      debugLaunch("[LAUNCHER_FINAL_DECISION]", {
        source,
        versionId,
        selectedCardId: interruption.pack?.cards?.[interruption.activeIndex ?? 0]?.id ?? null,
        finalDecision: "interruption_pack",
      });
      const nextOverlay = {
        ...buildCustomPackOverlay(interruption.pack, interruption.activeIndex, "intercept-pack"),
        ...buildFakeLauncherOverlayContext(versionId, activationKey),
      };
      debugLaunch("[LAUNCHSOURCE PRESERVED]", nextOverlay);
      debugLaunch("[CARD_ORIGIN] launcher pack created", nextOverlay);
      setOverlay(nextOverlay);
      return nextOverlay;
    }

    if (initialStep === FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD) {
      debugLaunch("[INTERCEPT] No eligible cards; continuing to app directly", { versionId, source });
      debugLaunch("[LAUNCHER_FINAL_DECISION]", {
        source,
        versionId,
        selectedCardId: null,
        finalDecision: "continue_to_app",
      });
      const nextOverlay = buildFakeLauncherContinueOverlay(versionId, activationKey);
      debugLaunch("[CARD_ORIGIN] launcher continue created", nextOverlay);
      setOverlay(nextOverlay);
      return nextOverlay;
    }

    debugLaunch("[INTERCEPT] No eligible primary or fallback cards; showing caught-up launcher state", {
      versionId,
      source,
    });
    debugLaunch("[LAUNCHER_FINAL_DECISION]", {
      source,
      versionId,
      selectedCardId: null,
      finalDecision: "caught_up_empty",
    });
    const nextOverlay = buildFakeLauncherEmptyOverlay(versionId, activationKey);
    debugLaunch("[CARD_ORIGIN] launcher empty created", nextOverlay);
    setOverlay(nextOverlay);
    return nextOverlay;
  }

  function beginInterceptionFlow(versionId, { source = "launcher", replace = true, navigate = true } = {}) {
    if (!isInstalledFakeLauncherEntry(source)) {
      console.warn("[LAUNCHER] Ignoring non-installed interception request", { versionId, source });
      return null;
    }
    debugLaunch("[INTERCEPT] Starting interception flow", { versionId, source });
    const nextSession = buildLaunchSession("fake_launcher", versionId);
    persistLaunchSession(nextSession);
    setLaunchSession(nextSession);
    suppressNextHomeAutoLaunchRef.current = false;
    setShouldLaunchOverlay(false);
    setLauncherContext(versionId);
    loggedLauncherOpenRef.current = `${versionId}:/intercept/${versionId}:${session?.user?.id ?? "anon"}`;
    void logLauncherEvent("first_interruption_seen", versionId, { launched_from: source });

    const activation = selectLauncherActivationCard(versionId, source);
    const nextOverlay = renderInterceptionDecision(versionId, activation, { source });
    if (navigate) {
      navigateTo(`/intercept/${versionId}`, { replace });
    }
    return nextOverlay;
  }

  function openDestinationApp(versionId, { source = "continue_card", reason = "user_pressed_continue", allowDefaultNavigation = false, preferDirectAppDestination = false } = {}) {
    // Only supported launcher IDs may ever be launched.
    if (!isKnownLauncher(versionId)) {
      console.warn("[LAUNCHER] Blocking unsupported launcher destination", { versionId, source, reason });
      return false;
    }

    // Final shell-matching guard: a fake-launcher shell session may only
    // continue to its own app (Safari shell → Safari, Instagram shell →
    // Instagram, …). Anything else is blocked and logged.
    if (shouldBlockCrossAppLaunch({ launchSession: effectiveLaunchSession, requestedLauncherId: versionId })) {
      const shellLauncherId = effectiveLaunchSession.launcherId;
      console.warn("[LAUNCHER] Blocked cross-app launch from fake launcher shell", {
        shellLauncherId,
        requestedLauncherId: versionId,
        source,
        reason,
      });
      void logLauncherEvent("fake_launcher_cross_app_blocked", shellLauncherId, {
        requested_launcher_id: versionId,
        shell_launcher_id: shellLauncherId,
        launched_from: source,
        reason,
        route: getPathRelativeToKnownBase(window.location.pathname),
      });
      setOverlay(buildFlowConfirmationOverlay(shellLauncherId, "That app isn't available here.", null, "OK"));
      return false;
    }

    const version = resolveVersionConfig(
      homeScreenVersions[versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[versionId] ?? getLauncherConfig(versionId),
      launcherBehaviorSettings[versionId],
    );
    const preferFastDestination = reason === "fake_launcher_icon_clicked";
    const resolution = resolveLauncherDestination(version, { preferFastDestination, preferDirectAppDestination });
    const href = getBrowserSafeDestinationHref(resolution.href);
    const destinationMetadata = {
      destination_strategy: resolution.strategy,
      destination_source_field: resolution.sourceField,
      destination_fallback_href: resolution.fallbackHref || null,
      used_x_safari_prefix: resolution.usedXSafariPrefix,
      destination_platform: resolution.platform,
      destination_attempted: Boolean(href),
      destination_missing: !href,
    };

    if (!href) {
      // Continue-to-app must never silently do nothing.
      console.error("[LAUNCHER] No destination could be resolved", { versionId, source, reason, resolution });
      void logLauncherEvent("fake_launcher_destination_missing", versionId, {
        launched_from: source,
        reason,
        ...destinationMetadata,
      });
      setOverlay(buildFlowConfirmationOverlay(versionId, "We couldn't open this app — its destination link is missing.", null, "OK"));
      return false;
    }

    void logLauncherEvent("intercept_continue_to_app", versionId, {
      launched_from: source,
      reason,
      href,
      ...destinationMetadata,
    });
    void logLauncherEvent("fake_launcher_real_app_opened", versionId, {
      launched_from: source,
      reason,
      href,
      ...destinationMetadata,
    });
    void logEvent({
      event_type: "intercept_continue_to_app",
      source_type: source,
      card_source: source,
      app_id: version?.id,
      app_name: version?.name,
      launcher_context: version?.id,
      action_taken: "continued_to_app",
      metadata: {
        href,
        reason,
        selectionModel: interceptActivationRef.current?.selectionModel ?? null,
        activationKey: interceptActivationRef.current?.activationKey ?? null,
        destinationOpened: Boolean(href),
        ...destinationMetadata,
      },
    });

    if (href) {
      markHomeAutoLaunchSuppressedAfterDestination();
      suppressStandaloneLauncherRecoveryOnce();
      suppressResumeHomeAutoLaunchRef.current = true;
      suppressNextHomeAutoLaunchRef.current = true;
      setShouldLaunchOverlay(false);
      debugLog("[LAUNCHER] opening destination", { versionId, href, source, reason });
      const captureNavigation = window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION;
      if (typeof captureNavigation === "function") {
        const handled = captureNavigation(href, { versionId, source, reason });
        if (handled) return true;
      }
      const fallbackHref = getBrowserSafeDestinationHref(resolution.fallbackHref);
      const needsTimedFallback = shouldUseTimedWebFallback(href) && fallbackHref && fallbackHref !== href;
      if (allowDefaultNavigation) {
        // The caller's <a href> performs the navigation (anchor default
        // behaviour — continue-to-app cards). Still arm the silent-failure
        // recovery: the anchor fires right after this handler returns.
        if (needsTimedFallback) {
          scheduleNativeSchemeFallback({ versionId, source, reason, href, fallbackHref });
        }
        return false;
      }
      if (needsTimedFallback) {
        scheduleNativeSchemeFallback({ versionId, source, reason, href, fallbackHref });
      }
      window.location.assign(href);
      return true;
    }
    return true;
  }

  // A custom-scheme launch that the OS cannot handle (native app not
  // installed, or x-safari- on iOS <17) fails silently and leaves the user on
  // a dead screen. If the page is still visible shortly after the attempt,
  // open the web fallback instead. Any signal that the launch worked —
  // pagehide, blur (OS app-open sheet), or the tab going hidden — cancels the
  // timer so we never double-navigate.
  function scheduleNativeSchemeFallback({ versionId, source, reason, href, fallbackHref }) {
    let timerId = 0;
    const cancel = () => {
      window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("blur", cancel);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("blur", cancel);
    timerId = window.setTimeout(() => {
      cancel();
      if (document.visibilityState === "hidden") return;
      console.warn("[LAUNCHER] Native scheme did not open — using web fallback", { versionId, href, fallbackHref });
      void logLauncherEvent("fake_launcher_destination_fallback_used", versionId, {
        launched_from: source,
        reason,
        attempted_href: href,
        fallback_href: fallbackHref,
      });
      window.location.assign(fallbackHref);
    }, NATIVE_SCHEME_FALLBACK_MS);
  }

  function isSafeExternalUrl(url) {
    if (typeof url !== "string") return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function openExternalActionUrl(url, { source = "action_card", cardId = null } = {}) {
    if (!url) return;
    if (!isSafeExternalUrl(url)) {
      console.warn("[ACTION_CARD] blocked unsafe URL", { source, cardId, protocol: typeof url === "string" ? url.trim().split(":")[0] : typeof url });
      return;
    }
    debugLog("[ACTION_CARD] opening external URL", { source, cardId });
    const captureNavigation = window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION;
    if (typeof captureNavigation === "function") {
      const handled = captureNavigation(url, { source, cardId });
      if (handled) return;
    }
    window.location.assign(url);
  }

  function handleFakeLauncherLaunch(versionId, source) {
    if (!isInAppShortcutClick(source)) {
      console.warn("[LAUNCHER] Ignoring unknown in-app shortcut source", { versionId, source });
      return;
    }

    // ── Settings / HQ context ────────────────────────────────────────────────
    // The settings panel is admin/config only — not the ordinary user journey.
    // Tapping a launcher icon from there goes directly to the app with no card.
    if (source === "settings_fake_launcher") {
      openDestinationApp(versionId, { source, reason: "fake_launcher_icon_clicked" });
      return;
    }

    // ── Home-screen / overlay shortcut: enforce the card flow ────────────────
    // Always clear a potentially-expired pause before deciding to bypass, so a
    // stale localStorage entry can never accidentally skip the intervention.
    clearExpiredAppPause(versionId);

    if (isAppPaused(versionId)) {
      // Active, unexpired, app-specific pause → open real destination directly.
      debugLog("[LAUNCHER] App paused — bypassing card flow from shortcut", { versionId, source });
      void logLauncherEvent("fake_launcher_pause_bypass_used", versionId, {
        launched_from: source,
        pause_expiry: getAppPauseExpiry(versionId),
      });
      openDestinationApp(versionId, { source, reason: "fake_launcher_icon_clicked" });
      return;
    }

    // No active pause → navigate into the myBishBash intervention flow.
    // The routing useEffect will select a card (or show the caught-up empty screen).
    // The pause button is shown on cards launched from this path.
    debugLog("[LAUNCHER] No active pause — entering card flow", { versionId, source });
    navigateTo(`/intercept/${versionId}`);
  }

  function handleOverlayFakeLauncherLaunch(versionId) {
    handleFakeLauncherLaunch(versionId, "overlay_fake_launcher");
  }

  // E2E test hook — lets Playwright tests drive handleFakeLauncherLaunch without
  // needing a real Supabase session (which the FakeAppLauncherBar normally requires).
  useEffect(() => {
    if (!e2eMode) return;
    window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH = (versionId, source = "home_fake_launcher_bar") => {
      handleFakeLauncherLaunch(versionId, source);
    };
    return () => { delete window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH; };
  });

  // Called when the user selects a pause duration from the pause modal.
  // pauseApp write is intentionally deferred here — AppPauseModal delays
  // onPause by 1400ms so the confirmation screen is visible before navigating.
  // The write therefore happens atomically with the navigation, not before.
  function handlePauseApp(appId, durationMinutes) {
    const expiry = pauseApp(appId, durationMinutes);
    debugLog("[LAUNCHER] App paused by user", { appId, durationMinutes, expiry });
    setAppPauseRevision((current) => current + 1);
    openDestinationApp(appId, { source: "app_pause_selected", reason: "user_paused" });
  }

  function handleSetAppPause(appId, durationMinutes) {
    const expiry = pauseApp(appId, durationMinutes);
    debugLog("[LAUNCHER] App paused from Apps", { appId, durationMinutes, expiry });
    setAppPauseRevision((current) => current + 1);
  }

  function handleClearAppPause(appId) {
    clearAppPause(appId);
    pauseBypassInitiatedRef.current.delete(appId);
    setAppPauseRevision((current) => current + 1);
  }

  function updateCards(updater) {
    const current = cardsRef.current;
    const normalized = normalizeCards(typeof updater === "function" ? updater(current) : updater, new Date(), profile.timezone);
    cardsRef.current = normalized;
    saveCards(normalized);
    setCards(normalized);
  }

  useEffect(() => {
    if (!authReady) return;
    let pending = null;
    try {
      pending = JSON.parse(window.localStorage.getItem("mybishbash.pending-launcher-install.v1") || "null");
    } catch {
      pending = null;
    }
    const pendingEvents = Array.isArray(pending) ? pending : [pending].filter(Boolean);
    if (pendingEvents.length === 0) return;
    window.localStorage.removeItem("mybishbash.pending-launcher-install.v1");
    pendingEvents.forEach((event) => {
      if (!event?.launcher_id || !event?.event_type) return;
      void logLauncherEvent(event.event_type, event.launcher_id, {
        route: event.route,
        install_page_created_at: event.created_at,
        is_standalone: event.is_standalone,
      });
    });
  }, [authReady, logLauncherEvent]);

  const syncNotificationPreferences = useCallback(
    async (nextSettings) => {
      if (!session?.user?.id) return;

      await saveNotificationPreferences(session.user.id, {
        enabled: Boolean(nextSettings.enabled),
        notifications_per_day: Number(nextSettings.notificationsPerDay) || 3,
        timezone: profile.timezone,
      });
    },
    [profile.timezone, session?.user?.id],
  );

  const enableNotifications = useCallback(async () => {
    debugLog("[NOTIFICATIONS] Enable requested");

    if (!session?.user?.id) {
      setNotificationStatus("needs-login");
      console.warn("[NOTIFICATIONS] Cannot enable without a logged-in user.");
      return;
    }

    if (!("Notification" in window) || !("PushManager" in window)) {
      setNotificationStatus("unsupported");
      console.warn("[NOTIFICATIONS] Browser does not support Notification or PushManager.");
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setNotificationStatus("missing-vapid-key");
      console.warn("[NOTIFICATIONS] Missing VITE_VAPID_PUBLIC_KEY.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);
    debugLog("[NOTIFICATIONS] Permission result", permission);

    if (permission !== "granted") {
      const nextSettings = { ...notificationSettings, enabled: false };
      setNotificationSettings(nextSettings);
      await syncNotificationPreferences(nextSettings);
      return;
    }

    try {
      const registration = await getPushRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await savePushSubscription(session.user.id, subscription, navigator.userAgent);
      const nextSettings = { ...notificationSettings, enabled: true };
      setNotificationSettings(nextSettings);
      await syncNotificationPreferences(nextSettings);
      void logEvent({
        event_type: "notification_toggle_on",
        source_type: "notification",
        card_source: "notification",
        action_taken: "enabled",
      });
      debugLog("[NOTIFICATIONS] Push subscription saved");
    } catch (error) {
      setNotificationStatus("error");
      console.error("[NOTIFICATIONS] Could not enable push notifications", error);
    }
  }, [logEvent, notificationSettings, session?.user?.id, syncNotificationPreferences]);

  const disableNotifications = useCallback(async () => {
    const nextSettings = { ...notificationSettings, enabled: false };
    setNotificationSettings(nextSettings);
    await syncNotificationPreferences(nextSettings);
    void logEvent({
      event_type: "notification_toggle_off",
      source_type: "notification",
      card_source: "notification",
      action_taken: "disabled",
    });
    debugLog("[NOTIFICATIONS] Disabled");
  }, [logEvent, notificationSettings, syncNotificationPreferences]);

  const updateNotificationsPerDay = useCallback(
    async (value) => {
      const nextSettings = {
        ...notificationSettings,
        notificationsPerDay: Math.max(1, Math.min(6, Number(value) || 3)),
      };
      setNotificationSettings(nextSettings);
      await syncNotificationPreferences(nextSettings);
    },
    [notificationSettings, syncNotificationPreferences],
  );

  useEffect(() => {
    if (!session?.user?.id) return;
    void syncNotificationPreferences(notificationSettings);
  }, [notificationSettings, session?.user?.id, syncNotificationPreferences]);

  function openSpecificReveal(cardId) {
    const selected = cards.find((card) => card.id === cardId);
    if (!selected) return;

    updateCards((current) =>
      current.map((card) =>
        card.id === cardId
          ? { ...card, lastShownAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : card,
      ),
    );
    navigateTo(`/card/${encodeURIComponent(cardId)}`);
  }

  function openPackReveal(packId) {
    const packCards = cards.filter((card) => card.sourcePackId === packId && !card.deletedAt);
    if (packCards.length === 0) return;

    const { selected } = selectEligibleCard({
      cards: packCards,
      events,
      timezone: profile.timezone,
      settings: { packCardTimeoutMs: 0 },
    });
    if (!selected || !isPackCardAvailable(selected)) return;
    openSpecificReveal(selected.id);
  }

  function handleRevealCompletion(options = {}) {
    if (options.confirmationMessage) {
      if (overlay?.launchSource === "fake_launcher" && overlay?.versionId) {
        const versionId = overlay.versionId;
        const completedCardId = options.completedCardId ?? overlay.cardId ?? null;
        if (completedCardId) {
          launchCompletedCardIdsRef.current = new Set([...launchCompletedCardIdsRef.current, completedCardId]);
        }
        const activation = interceptActivationRef.current;
        const activationKey = overlay?.activationKey || activation?.activationKey || Date.now().toString();
        setScreen("interception");
        const nextOverlay = buildFlowConfirmationOverlay(versionId, options.confirmationMessage, activationKey, options.confirmationActionLabel);
        setOverlay(nextOverlay);
        navigateTo(`/intercept/${versionId}`, { replace: true });
        return;
      }

      debugLaunch("[CONTINUE_DECISION] home confirmation -> returning home");
      suppressNextHomeAutoLaunchRef.current = true;
      setShouldLaunchOverlay(false);
      setScreen("library");
      navigateTo("/home", { replace: true });
      setOverlay(null);
      return;
    }

    if (overlay?.launchSource === "fake_launcher" && overlay?.versionId) {
      const versionId = overlay.versionId;
      const completedCardId = options.completedCardId ?? overlay.cardId ?? null;
      if (completedCardId) {
        launchCompletedCardIdsRef.current = new Set([...launchCompletedCardIdsRef.current, completedCardId]);
      }
      const excludedCardIds = launchCompletedCardIdsRef.current;
      const activation = interceptActivationRef.current;
      const activationKey = overlay?.activationKey || activation?.activationKey || Date.now().toString();
      const cardsForDecision = options.cardsOverride ?? cards;
      const completedCard = completedCardId
        ? cardsForDecision.find((card) => card.id === completedCardId) ?? cards.find((card) => card.id === completedCardId)
        : null;
      if (overlay.type === "reveal") {
        const nextStep = getNextFakeLauncherStepAfterSelectedCard({
          interruption:
            activation?.versionId === versionId && activation.activationKey === activationKey
              ? activation.interruption
              : null,
        });

        if (nextStep === FAKE_LAUNCHER_FLOW_STEPS.INTERRUPTION_CARD) {
          setScreen("interception");
          const nextOverlay = {
            ...buildCustomPackOverlay(activation.interruption.pack, activation.interruption.activeIndex, "intercept-pack"),
            ...buildFakeLauncherOverlayContext(versionId, activationKey),
          };
          setOverlay(nextOverlay);
          debugLaunch("[LAUNCHSOURCE PRESERVED]", nextOverlay);
          debugLaunch("[CONTINUE_DECISION] launcher handled card -> routing to interruption card", {
            ...nextOverlay,
            completedCardId,
            completedCardSource: completedCard?.sourcePackId ? "pack" : completedCard ? "personal" : null,
            completedPackId: completedCard?.sourcePackId ?? null,
            selectionModel: activation?.selectionModel ?? null,
          });
          navigateTo(`/intercept/${versionId}`, { replace: true });
          return;
        }

        setScreen("interception");
        const nextOverlay = buildFakeLauncherContinueOverlay(versionId, activationKey);
        setOverlay(nextOverlay);
        debugLaunch("[CONTINUE-TO-APP DISPLAYED]", nextOverlay);
        debugLaunch("[CONTINUE_DECISION] launcher handled card -> routing to ContinueToAppCard", {
          ...nextOverlay,
          completedCardId,
          completedCardSource: completedCard?.sourcePackId ? "pack" : completedCard ? "personal" : null,
          completedPackId: completedCard?.sourcePackId ?? null,
          selectionModel: activation?.selectionModel ?? null,
        });
        navigateTo(`/intercept/${versionId}`, { replace: true });
        return;
      }
      const nextStep = overlay.type === "intercept-pack"
        ? getNextFakeLauncherStepAfterInterruption("continue")
        : FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD;
      const launcherStats = getLauncherCardStats(cardsForDecision, profile.timezone, excludedCardIds);

      debugLaunch("[REVEAL COMPLETION DECISION]", {
        pathname: window.location.pathname,
        currentPathname: window.location.pathname,
        launchSource: overlay.launchSource,
        origin: overlay.origin,
        overlayTypeBeforeCompletion: overlay.type,
        versionId,
        routeKind: route.kind,
        overlayVersionId: overlay.versionId,
        selectedNextCardId: null,
        selectedNextOverlayType: nextStep === FAKE_LAUNCHER_FLOW_STEPS.INTERRUPTION_CARD ? "intercept-pack" : "continue-to-app",
        continueReason: nextStep === FAKE_LAUNCHER_FLOW_STEPS.CONTINUE_CARD
          ? "shared fake launcher template terminal continue"
          : null,
        ...launcherStats,
        nextStep,
      });

      setScreen("interception");
      const nextOverlay = buildFakeLauncherContinueOverlay(versionId, activationKey);
      setOverlay(nextOverlay);
      debugLaunch("[CONTINUE-TO-APP DISPLAYED]", nextOverlay);
      debugLaunch("[CONTINUE_DECISION] intercept -> routing to ContinueToAppCard", nextOverlay);
      navigateTo(`/intercept/${versionId}`, { replace: true });
      return;
    }

    debugLaunch("[CONTINUE_DECISION] home -> falling back to home");
    suppressNextHomeAutoLaunchRef.current = true;
    setShouldLaunchOverlay(false);
    setScreen("library");
    navigateTo("/home", { replace: true });
    setOverlay(null);
    return;
  }

  function handleAction(action) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard) {
      setOverlay(null);
      return;
    }

    const updatedCard = applyCardAction(activeCard, action, new Date(), profile.timezone);
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);
    const eventType =
      action === "done"
        ? "bash_done"
        : action === "now"
          ? "bash_do_now"
          : "bash_not_done";
    void logEvent({
      event_type: eventType,
      source_type: activeCard.sourcePackId ? "library" : "personal",
      card_source: activeCard.sourcePackId ? "library" : "personal",
      bash_id: activeCard.id,
      bash_title: activeCard.promptText,
      card_id: activeCard.id,
      card_title: activeCard.dashboardTitle ?? activeCard.promptText,
      card_text: activeCard.promptText,
      pack_id: activeCard.sourcePackId ?? null,
      action_taken: action === "done" ? "completed" : action === "now" ? "liked" : "dismissed",
      metadata: {
        frequency: activeCard.frequency,
        timingWindows: activeCard.timingWindows,
      },
    });
    if (!activeCard.sourcePackId) {
      void logEvent({
        event_type: action === "done" ? CARD_EVENT_TYPES.COMPLETED : CARD_EVENT_TYPES.IGNORED,
        source_type: "personal",
        card_source: "personal",
        bash_id: activeCard.id,
        bash_title: activeCard.promptText,
        card_id: activeCard.id,
        card_title: activeCard.dashboardTitle ?? activeCard.promptText,
        card_text: activeCard.promptText,
        action_taken: action === "done" ? "completed" : "ignored",
        metadata: {
          legacyEventType: eventType,
          cardKind: activeCard.cardKind ?? "personal",
          surface: getCardSelectionSurfaceForOverlay(overlay),
          selectedAction: action,
          frequency: activeCard.frequency,
          timingWindows: activeCard.timingWindows,
          origin: overlay.origin ?? null,
          launchSource: overlay.launchSource ?? null,
          activationKey: overlay?.activationKey ?? null,
        },
      });
    }

    handleRevealCompletion({ cardsOverride: cardsAfterAction, completedCardId: activeCard.id });
    return;
  }

  function handleCommitmentAction(action) {
    if (!overlay || !["reveal", "commitment-motivation"].includes(overlay.type)) return;

    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard || !isCommitmentCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const savedMotivation = String(activeCard.commitmentReason ?? "").trim();
    if (action === "decline" && overlay.type === "reveal" && savedMotivation) {
      const activation = interceptActivationRef.current;
      const activationKey = overlay?.activationKey || activation?.activationKey || Date.now().toString();
      const nextOverlay = buildCommitmentMotivationOverlay(
        activeCard.id,
        overlay?.launchSource === "fake_launcher" ? overlay.versionId : null,
        activationKey
      );
      logCommitmentDebug("showing commitment motivation before final decline", {
        cardId: activeCard.id,
        commitmentText: activeCard.promptText,
      });
      setOverlay(nextOverlay);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const committed = action === "commit" || action === "commit_after_all";
    const updatedCard = {
      ...activeCard,
      statusToday: "doneToday",
      doneDate: todayKey,
      lastShownAt: now.toISOString(),
      notYetUntil: null,
      updatedAt: now.toISOString(),
      commitmentStatusToday: committed ? "made" : "declined",
      commitmentLifecycleStatus: committed ? "active" : "declined",
      commitmentDecisionDate: todayKey,
      commitmentDecisionAt: now.toISOString(),
      commitmentCheckInPendingDate: committed && activeCard.commitmentCheckInEnabled ? todayKey : null,
      commitmentCheckInShownDate: null,
      commitmentCheckInResponse: null,
      commitmentCheckInResponseDate: null,
      commitmentCheckInResponseAt: null,
      commitmentEncouragementRequestedDate: null,
      commitmentEncouragementCompletedDate: null,
      commitmentClosedEarlyDate: null,
      commitmentReviewDueDate: null,
      commitmentReviewResponse: null,
      commitmentReviewResponseDate: null,
      commitmentReviewResponseAt: null,
      commitmentFinalOutcome: null,
    };
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    const eventType = committed ? "commitment_made" : "commitment_declined";
    void logEvent({
      event_type: eventType,
      source_type: "personal",
      card_source: "personal",
      bash_id: activeCard.id,
      bash_title: activeCard.promptText,
      card_id: activeCard.id,
      card_title: "Today’s Commitment",
      card_text: activeCard.promptText,
      action_taken: committed ? "committed" : "declined",
      metadata: {
        cardKind: "commitment",
        reason: activeCard.commitmentReason ?? "",
        decisionSource: action,
        frequency: activeCard.frequency,
        timingWindows: activeCard.timingWindows,
      },
    });
    void logEvent({
      event_type: CARD_EVENT_TYPES.COMPLETED,
      source_type: "personal",
      card_source: "personal",
      bash_id: activeCard.id,
      bash_title: activeCard.promptText,
      card_id: activeCard.id,
      card_title: "Today’s Commitment",
      card_text: activeCard.promptText,
      action_taken: committed ? "committed" : "declined",
      metadata: {
        legacyEventType: eventType,
        cardKind: "commitment",
        surface: getCardSelectionSurfaceForOverlay(overlay),
        decisionSource: action,
        frequency: activeCard.frequency,
        timingWindows: activeCard.timingWindows,
        origin: overlay.origin ?? null,
        launchSource: overlay.launchSource ?? null,
        activationKey: overlay?.activationKey ?? null,
      },
    });

    if (action === "commit_after_all") {
      logCommitmentDebug("user committed after the second screen", {
        cardId: activeCard.id,
        commitmentText: activeCard.promptText,
      });
    } else {
      logCommitmentDebug(committed ? "user committed" : "user declined commitment", {
        cardId: activeCard.id,
        commitmentText: activeCard.promptText,
      });
    }

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: getCommitmentAcknowledgementMessage({
        committed,
        checkInEnabled: Boolean(activeCard.commitmentCheckInEnabled),
      }),
      confirmationActionLabel: "Continue",
    });
  }

  function handleCommitmentCheckInAction(response) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = resolveRevealCard(cards, overlay.cardId, profile.timezone);
    if (!activeCard || !isCommitmentCheckInCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const parentCard = cards.find((card) => card.id === activeCard.parentCommitmentCardId);
    if (!parentCard || !isCommitmentCard(parentCard)) {
      setOverlay(null);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const closesEarly = response === "closed_early";
    const needsEncouragement = response === "somewhat_on_track";
    const updatedCard = {
      ...parentCard,
      lastShownAt: now.toISOString(),
      updatedAt: now.toISOString(),
      commitmentCheckInResponse: response,
      commitmentCheckInResponseDate: todayKey,
      commitmentCheckInResponseAt: now.toISOString(),
      commitmentCheckInShownDate: todayKey,
      commitmentCheckInPendingDate: null,
      commitmentLifecycleStatus: closesEarly ? "closed_early" : "active",
      commitmentEncouragementRequestedDate: needsEncouragement ? todayKey : null,
      commitmentEncouragementCompletedDate: needsEncouragement ? null : parentCard.commitmentEncouragementCompletedDate ?? null,
      commitmentClosedEarlyDate: closesEarly ? todayKey : null,
      commitmentReviewDueDate: closesEarly ? null : todayKey,
    };
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    void logEvent({
      event_type: "commitment_check_in",
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Check-in",
      card_text: parentCard.promptText,
      action_taken: response,
      metadata: {
        cardKind: "commitment_check_in",
        parentCommitmentCardId: parentCard.id,
        checkInTime: parentCard.commitmentCheckInTime ?? "",
        response,
        phase: "in_progress",
      },
    });
    void logEvent({
      event_type: CARD_EVENT_TYPES.COMPLETED,
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Check-in",
      card_text: parentCard.promptText,
      action_taken: response,
      metadata: {
        legacyEventType: "commitment_check_in",
        cardKind: "commitment_check_in",
        surface: getCardSelectionSurfaceForOverlay(overlay),
        parentCommitmentCardId: parentCard.id,
        checkInTime: parentCard.commitmentCheckInTime ?? "",
        response,
        phase: "in_progress",
        origin: overlay.origin ?? null,
        launchSource: overlay.launchSource ?? null,
        activationKey: overlay?.activationKey ?? null,
      },
    });

    if (needsEncouragement) {
      const encouragementCard = buildEligibleCommitmentLifecycleCards(cardsAfterAction, now, profile.timezone)
        .find((candidate) => candidate.parentCommitmentCardId === parentCard.id && isCommitmentEncouragementCard(candidate));
      if (encouragementCard) {
        setOverlay({
          ...overlay,
          type: "reveal",
          cardId: encouragementCard.id,
          phase: null,
        });
        return;
      }
    }

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: getCommitmentCheckInOutcomeMessage(response),
      confirmationActionLabel: "Continue",
    });
  }

  function handleCommitmentEncouragementAction() {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = resolveRevealCard(cards, overlay.cardId, profile.timezone);
    if (!activeCard || !isCommitmentEncouragementCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const parentCard = cards.find((card) => card.id === activeCard.parentCommitmentCardId);
    if (!parentCard || !isCommitmentCard(parentCard)) {
      setOverlay(null);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const updatedCard = {
      ...parentCard,
      lastShownAt: now.toISOString(),
      updatedAt: now.toISOString(),
      commitmentEncouragementCompletedDate: todayKey,
      commitmentLifecycleStatus: "active",
      commitmentReviewDueDate: parentCard.commitmentReviewDueDate ?? todayKey,
    };
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    void logEvent({
      event_type: "commitment_encouragement_completed",
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Commitment reminder",
      card_text: activeCard.promptText,
      action_taken: "continued",
      metadata: {
        cardKind: "commitment_encouragement",
        parentCommitmentCardId: parentCard.id,
        phase: "encouragement",
      },
    });

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: "Good.\nKeep this with you.",
      confirmationActionLabel: "Continue",
    });
  }

  function handleCommitmentReviewAction(response) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = resolveRevealCard(cards, overlay.cardId, profile.timezone);
    if (!activeCard || !isCommitmentReviewCard(activeCard)) {
      setOverlay(null);
      return;
    }

    const parentCard = cards.find((card) => card.id === activeCard.parentCommitmentCardId);
    if (!parentCard || !isCommitmentCard(parentCard)) {
      setOverlay(null);
      return;
    }

    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const finalOutcome = response === "did_it"
      ? "completed"
      : response === "nearly_did_it"
        ? "partially_completed"
        : "not_completed";
    const updatedCard = {
      ...parentCard,
      lastShownAt: now.toISOString(),
      updatedAt: now.toISOString(),
      commitmentLifecycleStatus: "reviewed",
      commitmentReviewResponse: response,
      commitmentReviewResponseDate: todayKey,
      commitmentReviewResponseAt: now.toISOString(),
      commitmentFinalOutcome: finalOutcome,
    };
    const cardsAfterAction = cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
    setCards(cardsAfterAction);

    void logEvent({
      event_type: "commitment_review",
      source_type: "personal",
      card_source: "personal",
      bash_id: parentCard.id,
      bash_title: parentCard.promptText,
      card_id: activeCard.id,
      card_title: "Commitment review",
      card_text: parentCard.promptText,
      action_taken: response,
      metadata: {
        cardKind: "commitment_review",
        parentCommitmentCardId: parentCard.id,
        response,
        finalOutcome,
        phase: "review",
      },
    });

    handleRevealCompletion({
      cardsOverride: cardsAfterAction,
      completedCardId: activeCard.id,
      confirmationMessage: getCommitmentReviewOutcomeMessage(response),
      confirmationActionLabel: "Continue",
    });
  }

  function handleSaveCard(formData) {
    const returnPath = composerReturnPathRef.current || "/home";
    if (formData.cardKind === "commitment") {
      const commitmentText = formData.promptText;
      if (!commitmentText.trim()) return;

      const now = new Date().toISOString();
      const newCard = {
        id: createId(),
        cardKind: "commitment",
        promptText: commitmentText,
        dashboardTitle: "Today’s Commitment",
        commitmentReason: formData.commitmentReason ?? "",
        commitmentTimingMode: formData.commitmentTimingMode,
        commitmentStartWindow: formData.commitmentTimingMode,
        commitmentCustomStartTime: formData.commitmentCustomStartTime ?? "",
        commitmentCustomEndTime: formData.commitmentCustomEndTime ?? "",
        commitmentCheckInEnabled: Boolean(formData.commitmentCheckInEnabled),
        commitmentCheckInTime: formData.commitmentCheckInEnabled ? formData.commitmentCheckInTime ?? "" : "",
        commitmentCheckInPendingDate: null,
        commitmentLifecycleStatus: null,
        commitmentCheckInShownDate: null,
        commitmentCheckInResponse: null,
        commitmentCheckInResponseDate: null,
        commitmentCheckInResponseAt: null,
        commitmentEncouragementRequestedDate: null,
        commitmentEncouragementCompletedDate: null,
        commitmentClosedEarlyDate: null,
        commitmentReviewDueDate: null,
        commitmentReviewResponse: null,
        commitmentReviewResponseDate: null,
        commitmentReviewResponseAt: null,
        commitmentFinalOutcome: null,
        theme: formData.theme,
        icon: formData.icon,
        statusToday: "fresh",
        createdAt: now,
        updatedAt: now,
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        frequency: "once_daily",
        timingWindows: formData.timingWindows,
        paused: false,
        disliked: false,
        deletedAt: null,
      };

      const isFirstCard = !setupComplete && !editingId;

      if (editingId) {
        updateCards((current) =>
          current.map((card) =>
            card.id === editingId
              ? {
                  ...card,
                  ...newCard,
                  id: card.id,
                  createdAt: card.createdAt ?? now,
                  lastShownAt: card.lastShownAt ?? null,
                  doneDate: card.doneDate ?? null,
                  statusToday: card.statusToday ?? "fresh",
                  commitmentStatusToday: card.commitmentStatusToday ?? null,
                  commitmentDecisionDate: card.commitmentDecisionDate ?? null,
                  commitmentDecisionAt: card.commitmentDecisionAt ?? null,
                  commitmentCheckInPendingDate: card.commitmentCheckInPendingDate ?? null,
                  commitmentLifecycleStatus: card.commitmentLifecycleStatus ?? null,
                  commitmentCheckInShownDate: card.commitmentCheckInShownDate ?? null,
                  commitmentCheckInResponse: card.commitmentCheckInResponse ?? null,
                  commitmentCheckInResponseDate: card.commitmentCheckInResponseDate ?? null,
                  commitmentCheckInResponseAt: card.commitmentCheckInResponseAt ?? null,
                  commitmentEncouragementRequestedDate: card.commitmentEncouragementRequestedDate ?? null,
                  commitmentEncouragementCompletedDate: card.commitmentEncouragementCompletedDate ?? null,
                  commitmentClosedEarlyDate: card.commitmentClosedEarlyDate ?? null,
                  commitmentReviewDueDate: card.commitmentReviewDueDate ?? null,
                  commitmentReviewResponse: card.commitmentReviewResponse ?? null,
                  commitmentReviewResponseDate: card.commitmentReviewResponseDate ?? null,
                  commitmentReviewResponseAt: card.commitmentReviewResponseAt ?? null,
                  commitmentFinalOutcome: card.commitmentFinalOutcome ?? null,
                }
              : card,
          ),
        );
      } else {
        updateCards((current) => [newCard, ...current]);
      }

      logCommitmentDebug("commitment card created", {
        cardId: newCard.id,
        commitmentText: newCard.promptText,
      });
      logCommitmentDebug("selected display time/window", {
        cardId: newCard.id,
        commitmentTimingMode: newCard.commitmentTimingMode,
        commitmentStartWindow: newCard.commitmentStartWindow,
        commitmentCustomStartTime: newCard.commitmentCustomStartTime,
        commitmentCustomEndTime: newCard.commitmentCustomEndTime,
        timingWindows: newCard.timingWindows,
      });

      setEditingId(null);
      setComposerInitialDraft(null);
      setIsComposerOpen(false);
      setHomeSaveConfirmation(commitmentText);

      if (isFirstCard) {
        setSetupComplete(true);
        navigateTo("/home", { replace: true });
        return;
      }

      navigateTo(returnPath);
      return;
    }

    if (Array.isArray(formData.bulkTexts) && formData.bulkTexts.length > 0) {
      const now = new Date().toISOString();
      const newCards = formData.bulkTexts.map((text) => ({
        id: createId(),
        promptText: text,
        dashboardTitle: text,
        theme: formData.theme,
        icon: formData.icon,
        statusToday: "fresh",
        createdAt: now,
        updatedAt: now,
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        frequency: formData.frequency,
        timingWindows: formData.timingWindows,
        paused: false,
        disliked: false,
        deletedAt: null,
      }));

      const isFirstCard = !setupComplete && !editingId;

      updateCards((current) => [...newCards, ...current]);

      setEditingId(null);
      setIsComposerOpen(false);
      setHomeSaveConfirmation(newCards[0]?.promptText ?? "");

      if (isFirstCard) {
        setSetupComplete(true);
        navigateTo("/home", { replace: true });
        return;
      }

      navigateTo(returnPath);
      return;
    }

    const trimmedText = formData.promptText.trim();
    if (!trimmedText) return;

    const isFirstCard = !setupComplete && !editingId;

    if (editingId) {
      updateCards((current) =>
        current.map((card) =>
          card.id === editingId
            ? {
                ...card,
                promptText: trimmedText,
                theme: formData.theme,
                icon: formData.icon,
                frequency: formData.frequency,
                timingWindows: formData.timingWindows,
                updatedAt: new Date().toISOString(),
              }
            : card,
        ),
      );
    } else {
      updateCards((current) => [
        {
          id: createId(),
          cardKind: "personal",
          promptText: trimmedText,
          theme: formData.theme,
          icon: formData.icon,
          statusToday: "fresh",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastShownAt: null,
          notYetUntil: null,
          doneDate: null,
          frequency: formData.frequency,
          timingWindows: formData.timingWindows,
          paused: false,
          deletedAt: null,
        },
        ...current,
      ]);
    }

    setEditingId(null);
    setComposerInitialDraft(null);
    setIsComposerOpen(false);
    setHomeSaveConfirmation(trimmedText);

    if (isFirstCard) {
      setSetupComplete(true);
      navigateTo("/home", { replace: true });
      return;
    }

    navigateTo(returnPath);
  }

  function handleDeleteCard(cardId) {
    const now = new Date().toISOString();
    updateCards((current) =>
      current.map((card) =>
        card.id === cardId
          ? { ...card, deletedAt: now, updatedAt: now }
          : card
      )
    );
    setMenuOpenId(null);
  }

  function handleDuplicateCard(cardId) {
    const cardToDuplicate = cards.find((c) => c.id === cardId);
    if (!cardToDuplicate) return;

    const now = new Date().toISOString();
    updateCards((current) => [
      {
        ...cardToDuplicate,
        id: createId(),
        createdAt: now,
        updatedAt: now,
        statusToday: "fresh",
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        commitmentStatusToday: null,
        commitmentDecisionDate: null,
        commitmentDecisionAt: null,
        commitmentCheckInPendingDate: null,
        commitmentLifecycleStatus: null,
        commitmentCheckInShownDate: null,
        commitmentCheckInResponse: null,
        commitmentCheckInResponseDate: null,
        commitmentCheckInResponseAt: null,
        commitmentEncouragementRequestedDate: null,
        commitmentEncouragementCompletedDate: null,
        commitmentClosedEarlyDate: null,
        commitmentReviewDueDate: null,
        commitmentReviewResponse: null,
        commitmentReviewResponseDate: null,
        commitmentReviewResponseAt: null,
        commitmentFinalOutcome: null,
        paused: false,
        deletedAt: null,
        sourcePackId: null,
      },
      ...current,
    ]);
    setMenuOpenId(null);
  }

  function handleResetItem(item) {
    updateCards((current) =>
      current.map((card) => {
        const matches =
          item.type === "pack"
            ? card.sourcePackId === item.id && !card.deletedAt
            : card.id === item.id;

        if (!matches) return card;

        const resetCard = {
          ...card,
          statusToday: "fresh",
          doneDate: null,
          notYetUntil: null,
          lastShownAt: null,
          paused: false,
          updatedAt: new Date().toISOString(),
        };

        if (!isCommitmentCard(card)) return resetCard;

        return {
          ...resetCard,
          commitmentCheckInPendingDate: null,
          commitmentLifecycleStatus: null,
          commitmentCheckInShownDate: null,
          commitmentCheckInResponse: null,
          commitmentCheckInResponseDate: null,
          commitmentCheckInResponseAt: null,
          commitmentEncouragementRequestedDate: null,
          commitmentEncouragementCompletedDate: null,
          commitmentClosedEarlyDate: null,
          commitmentReviewDueDate: null,
          commitmentReviewResponse: null,
          commitmentReviewResponseDate: null,
          commitmentReviewResponseAt: null,
          commitmentFinalOutcome: null,
        };
      }),
    );
    setMenuOpenId(null);
  }

  function handleTogglePause(item) {
    updateCards((current) =>
      current.map((card) => {
        const matches =
          item.type === "pack"
            ? card.sourcePackId === item.id && !card.deletedAt
            : card.id === item.id;

        if (!matches) return card;

        return {
          ...card,
          paused: !card.paused,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    setMenuOpenId(null);
  }

  function openEditor(cardId) {
    setEditingId(cardId);
    setComposerInitialKind("personal");
    setComposerInitialDraft(null);
    composerReturnPathRef.current = route.path;
    setIsComposerOpen(true);
    setMenuOpenId(null);
  }

  function openCardComposerFromCurrentRoute(initialKind = "personal") {
    setEditingId(null);
    setComposerInitialKind(initialKind);
    setComposerInitialDraft(null);
    composerReturnPathRef.current = route.path;
    setIsComposerOpen(true);
  }

  function takeCommitmentTemplate(template) {
    if (!template?.promptText?.trim()) return;
    setEditingId(null);
    setComposerInitialKind("commitment");
    setComposerInitialDraft({
      cardKind: "commitment",
      promptText: template.promptText,
      commitmentReason: template.defaults?.commitmentReason ?? template.defaults?.reason ?? template.attribution ?? "",
      commitmentTimingMode: template.defaults?.commitmentTimingMode ?? "anytime",
      commitmentCustomStartTime: template.defaults?.commitmentCustomStartTime ?? "09:00",
      commitmentCustomEndTime: template.defaults?.commitmentCustomEndTime ?? "17:00",
      commitmentCheckInEnabled: Boolean(template.defaults?.commitmentCheckInEnabled),
      commitmentCheckInTime: template.defaults?.commitmentCheckInTime ?? "20:00",
      theme: template.defaults?.theme ?? template.theme,
      icon: template.defaults?.icon ?? template.icon ?? "star",
    });
    composerReturnPathRef.current = "/library";
    setIsComposerOpen(true);
  }

  function openPackEditor(packId) {
    setEditingPackId(packId);
    setMenuOpenId(null);
  }

  function handleSavePackSettings(packId, formData) {
    updateCards((current) =>
      current.map((card) =>
        card.sourcePackId === packId && !card.deletedAt
          ? {
              ...card,
              frequency: formData.frequency,
              timingWindows: formData.timingWindows,
              updatedAt: new Date().toISOString(),
            }
          : card,
      ),
    );
    setEditingPackId(null);
  }

  function isPackActive(packId) {
    return cards.some((card) => card.sourcePackId === packId && !card.deletedAt);
  }

  function handlePremiumInterest(pack) {
    void logEvent({
      event_type: "premium_interest",
      source_type: "explore",
      card_source: "explore",
      pack_id: pack.id,
      action_taken: "premium_interest",
      metadata: { packTitle: pack.title },
    });
  }

  function activatePack(packId) {
    const pack = visibleLibraryPacks.find((item) => item.id === packId);
    if (!pack || isPackActive(packId)) return;
    // Premium installs fail closed; the Explore CTA is also gated, this is
    // the backstop.
    if (pack.isPremium === true && !canUsePremiumContent) return;

    setCards((current) => {
      const hasOldCards = current.some((c) => c.sourcePackId === packId);
      if (hasOldCards) {
        const now = new Date().toISOString();
        let changed = false;
        const next = current.map((c) => {
          if (c.sourcePackId !== packId || c.deletedAt == null) return c;
          changed = true;
          return { ...c, deletedAt: null, updatedAt: now };
        });
        return changed ? next : current;
      }
      return [...buildCardsFromPack(pack), ...current];
    });
    setHiddenLibraryPacks((current) => (current.includes(packId) ? current.filter((id) => id !== packId) : current));
    void logEvent({
      event_type: "pack_activated",
      source_type: "library",
      card_source: "library",
      pack_id: packId,
      action_taken: "activated",
      metadata: { packTitle: pack.title },
    });
  }

  function deactivatePack(packId) {
    const now = new Date().toISOString();
    setCards((current) => {
      let changed = false;
      const next = current.map((card) => {
        if (card.sourcePackId !== packId || card.deletedAt) return card;
        changed = true;
        return { ...card, deletedAt: now, updatedAt: now };
      });
      return changed ? next : current;
    });
    const pack = visibleLibraryPacks.find((item) => item.id === packId);
    void logEvent({
      event_type: "pack_deactivated",
      source_type: "library",
      card_source: "library",
      pack_id: packId,
      action_taken: "deactivated",
      metadata: { packTitle: pack?.title ?? packId },
    });
  }

  function hideLibraryPack(packId) {
    setHiddenLibraryPacks((current) => (current.includes(packId) ? current : [...current, packId]));
  }

  function setPackCardHidden(packId, text, hidden) {
    const hiddenCardKeyCompat = getLegacyHiddenPackCardKey({ sourcePackId: packId, promptText: text });
    if (!hiddenCardKeyCompat) return;
    setHiddenPackCardIdsCompat((current) => {
      if (hidden) {
        return current.includes(hiddenCardKeyCompat) ? current : [...current, hiddenCardKeyCompat];
      }
      return current.filter((item) => item !== hiddenCardKeyCompat);
    });
    const isInterruption = packId.endsWith("-interruption");
    void logEvent({
      event_type: isInterruption
        ? hidden ? "intercept_card_disliked" : "intercept_card_restored"
        : hidden ? "pack_card_disliked" : "pack_card_restored",
      source_type: isInterruption ? "interruption" : "library",
      card_source: isInterruption ? "interruption" : "library",
      card_id: hiddenCardKeyCompat,
      card_title: text,
      card_text: text,
      pack_id: packId,
      target_app: isInterruption ? packId.replace(/-interruption$/, "") : null,
      action_taken: hidden ? "disliked" : "restored",
    });
  }

  function hidePackCardCompat(cardId) {
    const card = cards.find((item) => item.id === cardId);
    const hiddenCardKeyCompat = getLegacyHiddenPackCardKey(card);
    if (!hiddenCardKeyCompat) return;
    setHiddenPackCardIdsCompat((current) => (current.includes(hiddenCardKeyCompat) ? current : [...current, hiddenCardKeyCompat]));
    void logEvent({
      event_type: "pack_card_disliked",
      source_type: "library",
      card_source: "library",
      bash_id: card.id,
      bash_title: card.promptText,
      card_id: card.id,
      card_title: card.dashboardTitle ?? card.promptText,
      card_text: card.promptText,
      pack_id: card.sourcePackId,
      action_taken: "disliked",
    });
    handleRevealCompletion({ completedCardId: card.id });
    return;
  }

  function hideInterruptionPackCardCompat(packId, card) {
    const hiddenCardKeyCompat = getLegacyHiddenPackCardKey({ sourcePackId: packId, promptText: card?.text });
    if (!hiddenCardKeyCompat) return;
    setHiddenPackCardIdsCompat((current) => (current.includes(hiddenCardKeyCompat) ? current : [...current, hiddenCardKeyCompat]));
    void logEvent({
      event_type: "intercept_card_disliked",
      source_type: "interruption",
      card_source: "interruption",
      card_id: card?.id ?? hiddenCardKeyCompat,
      card_title: card?.title ?? card?.text ?? null,
      card_text: card?.text ?? null,
      pack_id: packId,
      message_id: card?.id ?? null,
      target_app: launcherContext === NORMAL_LAUNCHER_CONTEXT ? null : launcherContext,
      action_taken: "disliked",
    });
  }

  function handleSaveInterruptionCard(targetApp, cardId, text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    setCardPacks((current) => {
      const existing = getStoredInterruptionPackForTarget(targetApp, current, homeScreenVersions, launcherBehaviorSettings);
      const packId = existing?.id ?? `${targetApp}-user-interruptions`;
      const existingCards = existing?.cards ?? existing?.messages?.map((message, index) => ({
        id: `${packId}:${index}`,
        text: message,
        title: message,
      })) ?? [];
      const nextCard = {
        id: cardId ?? createId(),
        text: trimmedText,
        title: trimmedText,
        readOnly: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const nextCards = cardId
        ? existingCards.map((card) => (card.id === cardId ? nextCard : card))
        : [...existingCards, nextCard];
      const nextPack = {
        id: packId,
        type: "interruption",
        name: `${homeScreenVersions[targetApp]?.name ?? targetApp} Interruptions`,
        targetApp,
        linkedVersionId: targetApp,
        active: true,
        editable: true,
        cards: nextCards,
        messages: nextCards.map((card) => card.text),
        updatedAt: new Date().toISOString(),
      };

      if (existing) {
        return current.map((pack) => (pack.id === existing.id ? nextPack : pack));
      }
      return [nextPack, ...current];
    });
  }

  function saveOnboardingSetup({
    personalCards = DEFAULT_PERSONAL_CARD_TEXTS,
    interrupterCards = DEFAULT_INTERRUPTER_CARDS,
    actionCards: selectedActionCards = DEFAULT_ACTION_CARD_TITLES,
    launcherId = "instagram",
    appContext = { id: "instagram", label: "Instagram", launcherId: "instagram" },
  }) {
    const supportedLauncherId = isKnownLauncher(launcherId) ? launcherId : "instagram";
    const cleanPersonalCards = personalCards.map((text) => text.trim()).filter(Boolean);
    const cleanInterrupterCards = interrupterCards.map((text) => text.trim()).filter(Boolean);
    const cleanActionCards = selectedActionCards.map((text) => text.trim()).filter(Boolean);
    const now = new Date().toISOString();
    const fallbackPersonalCards = cleanPersonalCards.length > 0 ? cleanPersonalCards : DEFAULT_PERSONAL_CARD_TEXTS;
    const fallbackInterrupters = cleanInterrupterCards.length > 0 ? cleanInterrupterCards : DEFAULT_INTERRUPTER_CARDS;
    const fallbackActions = cleanActionCards.length > 0 ? cleanActionCards : DEFAULT_ACTION_CARD_TITLES;
    void logEvent({
      event_type: "onboarding_completed",
      source_type: "onboarding",
      card_source: "onboarding",
      target_app: supportedLauncherId,
      launcher_context: supportedLauncherId,
      action_taken: "completed",
      metadata: {
        selected_personal_cards: fallbackPersonalCards.length,
        selected_interrupter_cards: fallbackInterrupters.length,
        selected_action_cards: fallbackActions.length,
        app_context: appContext,
      },
    });

    setCardPacks((current) => {
      const existing = getStoredInterruptionPackForTarget(supportedLauncherId, current, homeScreenVersions, launcherBehaviorSettings);
      const packId = existing?.id ?? `${supportedLauncherId}-user-interruptions`;
      const nextCards = fallbackInterrupters.map((text) => ({
        id: createId(),
        text,
        title: text,
        readOnly: false,
        createdAt: now,
        updatedAt: now,
      }));
      const nextPack = {
        id: packId,
        type: "interruption",
        name: `${homeScreenVersions[supportedLauncherId]?.name ?? appContext?.label ?? supportedLauncherId} Interruptions`,
        targetApp: supportedLauncherId,
        linkedVersionId: supportedLauncherId,
        active: true,
        editable: true,
        cards: nextCards,
        messages: nextCards.map((card) => card.text),
        updatedAt: now,
      };

      if (existing) return current.map((pack) => (pack.id === existing.id ? nextPack : pack));
      return [nextPack, ...current];
    });

    updateCards((current) => [
      ...fallbackPersonalCards.map((text) => ({
        id: createId(),
        promptText: text,
        dashboardTitle: text,
        theme: "Soft Bloom",
        icon: "heart",
        statusToday: "fresh",
        createdAt: now,
        updatedAt: now,
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        frequency: "once_daily",
        timingWindows: ["morning", "day", "evening"],
        paused: false,
        disliked: false,
        deletedAt: null,
      })),
      ...current,
    ]);

    setLauncherBehaviorSettings((current) => ({
      ...current,
      [supportedLauncherId]: {
        ...(current[supportedLauncherId] || {}),
        useInterruptionPack: true,
        interruptionPaused: false,
      },
    }));

    const defaultMessages = DEFAULT_INTERRUPTION_PACKS[supportedLauncherId]?.messages ?? [];
    const defaultPackId = DEFAULT_INTERRUPTION_PACKS[supportedLauncherId]?.id ?? `${supportedLauncherId}-interruption`;
    setHiddenPackCardIdsCompat((current) => {
      const hiddenDefaultCards = defaultMessages.map((message) =>
        getLegacyHiddenPackCardKey({ sourcePackId: defaultPackId, promptText: message }),
      );
      return Array.from(new Set([...current, ...hiddenDefaultCards]));
    });

    setActionCards((current) => {
      const hiddenStarterCards = DEFAULT_ACTION_CARDS.map((card) => ({
        ...card,
        hidden: true,
        updatedAt: now,
        defaultsVersion: card.defaultsVersion,
      }));
      const preservedUserCards = current.filter((card) => card.source !== "starter" && !card.id?.startsWith("onboarding-action-"));
      const onboardingCards = fallbackActions.map((title) => ({
        id: createId(),
        title,
        body: "",
        category: "Action",
        launchUrl: "",
        hidden: false,
        source: "user",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }));
      return [...onboardingCards, ...preservedUserCards, ...hiddenStarterCards];
    });

    setProfile((current) => ({
      ...current,
      onboardingAppContext: appContext,
      onboardingLauncherId: supportedLauncherId,
      onboardingRoute: "pause_before_scrolling",
    }));

    setOverlay(null);
    setMenuOpenId(null);
    setShouldLaunchOverlay(false);
  }

  function savePersonalOnboardingSetup({
    selectedStrategyAreaIds = [],
    personalCards = DEFAULT_PERSONAL_CARD_TEXTS,
    launcherId = "safari",
    selectedLauncherIds = [],
    shortcutSetup = null,
    appContext = { id: "safari", label: "Safari", launcherId: "safari" },
    timingWindows = ["morning", "day", "evening"],
  }) {
    const isHomeOnboardingLocation = launcherId === "mybishbash_home" || appContext?.place === "home";
    const supportedLauncherId = isKnownLauncher(launcherId) ? launcherId : "safari";
    const onboardingLocationId = isHomeOnboardingLocation ? "mybishbash_home" : supportedLauncherId;
    const selectedSupportedLauncherIds = Array.from(new Set(
      (Array.isArray(selectedLauncherIds) && selectedLauncherIds.length > 0 ? selectedLauncherIds : [supportedLauncherId])
        .filter((id) => isKnownLauncher(id)),
    ));
    const cleanPersonalCards = personalCards.map((text) => text.trim()).filter(Boolean);
    const onboardingCardsToCreate = cleanPersonalCards;
    const cleanStrategyAreaIds = Array.isArray(selectedStrategyAreaIds) ? selectedStrategyAreaIds.filter(Boolean) : [];
    const cleanTimingWindows = Array.isArray(timingWindows) && timingWindows.length > 0 ? timingWindows : ["morning", "day", "evening"];
    const now = new Date().toISOString();

    void logEvent({
      event_type: "onboarding_completed",
      source_type: "onboarding",
      card_source: "personal",
      target_app: onboardingLocationId,
      launcher_context: onboardingLocationId,
      action_taken: "completed",
      metadata: {
        route: "personal_card_play_by_play",
        selected_strategy_area_ids: cleanStrategyAreaIds,
        selected_personal_cards: onboardingCardsToCreate.length,
        selected_starter_pack_id: null,
        selected_starter_commitment_id: null,
        app_context: appContext,
      },
    });

    updateCards((current) => {
      const existingPrompts = new Set(
        current
          .map((card) => card.promptText?.trim().toLowerCase())
          .filter(Boolean),
      );
      const starterCards = onboardingCardsToCreate
        .filter((text) => !existingPrompts.has(text.toLowerCase()))
        .map((text) => ({
          id: createId(),
          promptText: text,
          dashboardTitle: text,
          theme: "Soft Bloom",
          icon: "heart",
          statusToday: "fresh",
          createdAt: now,
          updatedAt: now,
          lastShownAt: null,
          notYetUntil: null,
          doneDate: null,
          frequency: "once_daily",
          timingWindows: cleanTimingWindows,
          paused: false,
          disliked: false,
          deletedAt: null,
        }));
      return [...starterCards, ...current];
    });

    if (!isHomeOnboardingLocation) {
      setLauncherBehaviorSettings((current) => ({
        ...current,
        ...selectedSupportedLauncherIds.reduce((acc, launcherContextId) => ({
          ...acc,
          [launcherContextId]: {
            ...(current[launcherContextId] || {}),
            useInterruptionPack: false,
            interruptionPaused: false,
          },
        }), {}),
      }));
    }

    setProfile((current) => ({
      ...current,
      plan: current.plan ?? "free",
      onboardingAppContext: appContext,
      onboardingLauncherId: onboardingLocationId,
      onboardingShortcutSetup: shortcutSetup,
      onboardingRoute: "personal_card_play_by_play",
      onboardingCompletedAt: now,
      onboardingCompletedSection: "personal_cards",
      onboardingSkipped: false,
      selectedStrategyAreaIds: cleanStrategyAreaIds,
      onboardingStarterPackId: null,
      onboardingStarterCommitmentId: null,
      hasCompletedPersonalCardSetup: onboardingCardsToCreate.length > 0,
    }));

    setOverlay(null);
    setMenuOpenId(null);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    setShouldLaunchOverlay(false);
  }

  function updateOnboardingShortcutSetup(shortcutSetup) {
    setProfile((current) => ({
      ...current,
      onboardingShortcutSetup: shortcutSetup,
    }));

    const apps = Array.isArray(shortcutSetup?.apps) ? shortcutSetup.apps : [];
    const activatedIds = apps
      .filter((app) => ["marked_added", "tested"].includes(app.status) && isKnownLauncher(app.id))
      .map((app) => app.id);
    if (activatedIds.length === 0) return;

    setLauncherBehaviorSettings((current) => ({
      ...current,
      ...activatedIds.reduce((acc, launcherContextId) => ({
        ...acc,
        [launcherContextId]: {
          ...(current[launcherContextId] || {}),
          useInterruptionPack: true,
          interruptionPaused: false,
        },
      }), {}),
    }));
  }

  function completeProtectedAppOnboarding({ appId, completed, useInterruptionCard = false }) {
    const supportedLauncherId = isKnownLauncher(appId) ? appId : "instagram";
    const now = new Date().toISOString();
    setProfile((current) => ({
      ...current,
      plan: current.plan ?? "free",
      selectedProtectedApp: supportedLauncherId,
      hasCompletedProtectedAppSetup: Boolean(completed),
      protectedAppSetupSkipped: !completed,
      protectedAppSetupUpdatedAt: now,
    }));
    if (completed) {
      setLauncherBehaviorSettings((current) => ({
        ...current,
        [supportedLauncherId]: {
          ...(current[supportedLauncherId] || {}),
          appEnabled: true,
          useInterruptionPack: Boolean(useInterruptionCard),
          interruptionPaused: false,
        },
      }));
    }
  }

  function completeCommitmentCardDemo({ skipped = false } = {}) {
    setProfile((current) => ({
      ...current,
      plan: current.plan ?? "free",
      hasSeenCommitmentCardDemo: !skipped,
      hasSkippedCommitmentCardDemo: Boolean(skipped),
    }));
  }

  function skipPersonalCardSetupForNow({ sourceStep = "personal_cards" } = {}) {
    const now = new Date().toISOString();
    void logEvent({
      event_type: "onboarding_step_skipped",
      source_type: "onboarding",
      card_source: "personal",
      action_taken: "skipped_personal_card_setup",
      metadata: { source_step: sourceStep },
    });
    setProfile((current) => ({
      ...current,
      plan: current.plan ?? "free",
      onboardingRoute: "personal_card_play_by_play",
      onboardingCompletedAt: now,
      onboardingCompletedSection: "personal_cards",
      onboardingSkipped: true,
      hasCompletedPersonalCardSetup: false,
    }));
  }

  function finishOnboarding(destination = "home", launcherId = profile.onboardingLauncherId ?? "instagram") {
    const supportedLauncherId = isKnownLauncher(launcherId) ? launcherId : "instagram";
    saveSetupComplete(true);
    setScreen("library");
    setOverlay(null);
    setMenuOpenId(null);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    saveSetupComplete(true);
    setSetupComplete(true);
    setShouldLaunchOverlay(destination === "try");
    navigateTo(destination === "try" ? `/intercept/${supportedLauncherId}` : "/home", { replace: true });
  }

  function skipInstagramOnboarding() {
    const now = new Date().toISOString();
    void logEvent({
      event_type: "onboarding_completed",
      source_type: "onboarding",
      card_source: "onboarding",
      action_taken: "skipped_personal_card_setup",
    });
    setProfile((current) => ({
      ...current,
      plan: current.plan ?? "free",
      onboardingRoute: "personal_card_play_by_play",
      onboardingCompletedAt: now,
      onboardingCompletedSection: "personal_cards",
      onboardingSkipped: true,
      hasCompletedPersonalCardSetup: false,
    }));
    setOverlay(null);
    setMenuOpenId(null);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    setSetupComplete(true);
    setShouldLaunchOverlay(false);
    setScreen("library");
    navigateTo("/home", { replace: true });
  }

  function handleDeleteInterruptionCard(targetApp, cardId) {
    setCardPacks((current) => {
      const existing = getStoredInterruptionPackForTarget(targetApp, current, homeScreenVersions, launcherBehaviorSettings);
      if (!existing) return current;
      const existingCards = existing.cards ?? existing.messages?.map((message, index) => ({
        id: `${existing.id}:${index}`,
        text: message,
        title: message,
      })) ?? [];
      const nextCards = existingCards.filter((card) => card.id !== cardId);
      const nextPack = {
        ...existing,
        cards: nextCards,
        messages: nextCards.map((card) => card.text),
        updatedAt: new Date().toISOString(),
      };
      return current.map((pack) => (pack.id === existing.id ? nextPack : pack));
    });
  }

  function handleToggleInterruptionPause(versionId) {
    const willPause = !launcherBehaviorSettings[versionId]?.interruptionPaused;
    setLauncherBehaviorSettings((current) => ({
      ...current,
      [versionId]: {
        ...(current[versionId] || {}),
        interruptionPaused: willPause,
      },
    }));
    void logEvent({
      event_type: willPause ? "interruption_pack_deactivated" : "interruption_pack_activated",
      source_type: "interruption",
      card_source: "interruption",
      pack_id: resolveVersionConfig(homeScreenVersions[versionId], launcherBehaviorSettings[versionId])?.interruptionPackId || DEFAULT_INTERRUPTION_PACKS[versionId]?.id,
      target_app: versionId,
      action_taken: willPause ? "deactivated" : "activated",
    });
    setMenuOpenId(null);
  }

  function openInterruptionHomeReveal(versionId, cardIndex = null) {
    const version = resolveVersionConfig(
      homeScreenVersions[versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[versionId],
      launcherBehaviorSettings[versionId]
    );
    const pack = getInterruptionPackForLauncher(versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
      hiddenCardIds: hiddenPackCardIdsCompat,
      globalEnabled: globalInterruptionMode,
    });
    if (version.interruptionPaused || !pack || pack.messages.length === 0) return;
    const activeIndex = typeof cardIndex === "number" ? cardIndex : pickInterruptionCardIndex(pack, events);
    const nextOverlay = { ...buildCustomPackOverlay(pack, activeIndex, "intercept-pack"), versionId, origin: "home" };
    debugLog("[CARD_ORIGIN] home interruption preview created", nextOverlay);
    setOverlay(nextOverlay);
  }

  function handleUpdateHomeScreenIcon(versionId, imageDataUrl) {
    setHomeScreenVersions((current) => ({
      ...current,
      [versionId]: {
        ...current[versionId],
        customIconSrc: imageDataUrl,
      },
    }));
  }

  function handleSaveVersionBehavior(versionId, updates) {
    setLauncherBehaviorSettings((current) => ({
      ...current,
      [versionId]: {
        ...(current[versionId] || {}),
        ...updates,
      },
    }));
    setExplicitLauncherBehaviorSettings((current) => ({
      ...current,
      [versionId]: {
        ...(current[versionId] || {}),
        ...updates,
      },
    }));
    if (typeof updates.useInterruptionPack === "boolean") {
      void logEvent({
        event_type: updates.useInterruptionPack ? "interruption_pack_activated" : "interruption_pack_deactivated",
        source_type: "interruption",
        card_source: "interruption",
        pack_id: resolveVersionConfig(homeScreenVersions[versionId], { ...launcherBehaviorSettings[versionId], ...updates })?.interruptionPackId || DEFAULT_INTERRUPTION_PACKS[versionId]?.id,
        target_app: versionId,
        action_taken: updates.useInterruptionPack ? "activated" : "deactivated",
      });
    }
  }

  function keepOnlyActiveApp(versionIdToKeep) {
    setLauncherBehaviorSettings((current) => {
      const next = { ...current };
      protectedAppStatuses.forEach(({ version, protectedOn }) => {
        if (!protectedOn && version.id !== versionIdToKeep) return;
        next[version.id] = {
          ...(next[version.id] || {}),
          appEnabled: version.id === versionIdToKeep,
          setupState: version.id === versionIdToKeep ? "enabled" : next[version.id]?.setupState,
        };
      });
      return next;
    });
    setExplicitLauncherBehaviorSettings((current) => {
      const next = { ...current };
      protectedAppStatuses.forEach(({ version, protectedOn }) => {
        if (!protectedOn && version.id !== versionIdToKeep) return;
        next[version.id] = {
          ...(next[version.id] || {}),
          appEnabled: version.id === versionIdToKeep,
          setupState: version.id === versionIdToKeep ? "enabled" : next[version.id]?.setupState,
        };
      });
      return next;
    });
  }

  function switchActiveApp(versionIdToEnable) {
    if (!isKnownLauncher(versionIdToEnable)) return;
    keepOnlyActiveApp(versionIdToEnable);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pendingSetupLauncherId =
      route.kind === "apps" && route.versionId && params.get("installed") === "1"
        ? route.versionId
        : params.get("launcherInstalled");
    if (!isKnownLauncher(pendingSetupLauncherId)) return;
    handleSaveVersionBehavior(pendingSetupLauncherId, {
      appEnabled: false,
      useInterruptionPack: false,
      interruptionPaused: false,
      setupState: "pending_setup",
    });
    params.delete("installed");
    params.delete("launcherInstalled");
    const remainingSearch = params.toString();
    const cleanPath = route.kind === "apps" && route.versionId ? `/apps/${route.versionId}` : route.path;
    window.history.replaceState(
      {},
      "",
      `${BASE_PATH}${cleanPath}${remainingSearch ? `?${remainingSearch}` : ""}`,
    );
  }, [route.kind, route.path, route.versionId]);

  useEffect(() => {
    if (route.kind !== "intercept" || !isKnownLauncher(route.versionId)) return;
    if (!session?.user?.id && !e2eMode && !isDemoModeEnabled()) return;
    const currentBehavior = explicitLauncherBehaviorSettings[route.versionId] ?? {};
    if (currentBehavior.appEnabled === true && currentBehavior.setupState === "enabled") return;
    const enabledAppIds = Object.entries(explicitLauncherBehaviorSettings)
      .filter(([, behavior]) => behavior?.appEnabled === true)
      .map(([versionId]) => versionId);
    if (!canUseMultipleApps && enabledAppIds.length > 0 && !enabledAppIds.includes(route.versionId)) return;
    handleSaveVersionBehavior(route.versionId, {
      appEnabled: true,
      interruptionPaused: false,
      setupState: "enabled",
    });
  }, [canUseMultipleApps, e2eMode, explicitLauncherBehaviorSettings, route.kind, route.versionId, session?.user?.id]);

  function handleSaveTimingWindowsPrefs(defs) {
    if (!isValidWindowDefs(defs)) return;
    saveTimingWindowsPrefs(defs);
    setTimingWindowsPrefs(defs);
  }

  function handleSetGlobalInterruptionMode(value) {
    setGlobalInterruptionMode(value);
    void logEvent({
      event_type: value ? "global_interruption_mode_enabled" : "global_interruption_mode_disabled",
      source_type: "settings",
      card_source: "settings",
      action_taken: value ? "enabled" : "disabled",
    });
  }

  function resetLocalMyBishBashState({ routeToOnboarding = true, clearStorage = true } = {}) {
    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }
    if (cardSaveTimerRef.current) {
      window.clearTimeout(cardSaveTimerRef.current);
      cardSaveTimerRef.current = null;
    }
    lastCloudStateStrRef.current = null;
    localDirtyRef.current = false;
    highestKnownCloudTimeRef.current = 0;
    isApplyingSharedStateRef.current = false;
    if (clearStorage) {
      clearSharedMyBishBashState();
    }
    const nextLaunchSession = buildLaunchSession("mybishbash_home");
    persistLaunchSession(nextLaunchSession);
    setCards([]);
    setMood(resolveTheme("Minimal"));
    setProfile({ name: "", timezone: "Europe/London", plan: "free" });
    setHomeScreenVersions(loadHomeScreenVersions());
    const storedLauncherBehaviorSettings = loadLauncherBehaviorSettings();
    setLauncherBehaviorSettings(storedLauncherBehaviorSettings);
    setExplicitLauncherBehaviorSettings(loadExplicitLauncherBehaviorSettings());
    setCardPacks([]);
    setHiddenPackCardIdsCompat([]);
    setGlobalInterruptionMode(true);
    setHiddenLibraryPacks([]);
    setEvents([]);
    setActionCards(loadActionCards());
    setNotificationSettings(loadNotificationSettings());
    setTimingWindowsPrefs(DEFAULT_WINDOW_DEFS);
    setWindowDefs(DEFAULT_WINDOW_DEFS);
    setSetupComplete(false);
    setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
    setActiveProtectedAppContext(null);
    setLaunchSession(nextLaunchSession);
    setOverlay(null);
    setMenuOpenId(null);
    setMorningSummary(null);
    setShouldLaunchOverlay(false);
    if (routeToOnboarding) {
      setScreen("onboarding");
      navigateTo("/onboarding", { replace: true });
    }
  }

  async function handleResetSharedState() {
    const confirmed = window.confirm("Clear all myBishBash data from this device? This will remove your cards, packs, settings and local history. This cannot be undone. Your cloud account is not deleted.");
    if (!confirmed) return;

    setSyncStatus("needs-connection");
    setSyncError("");
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    resetLocalMyBishBashState();
  }

  async function handleSignUp(email, password) {
    resetLocalMyBishBashState();
    setSyncStatus("loading");
    setSyncError("");
    signupOnboardingPendingRef.current = true;
    setSignupOnboardingPending(true);
    void logEvent({
      event_type: "signup_started",
      source_type: "auth",
      card_source: "auth",
      action_taken: "started",
    });
    try {
      const createdSession = await signUp(email, password);
      void logEvent({
        event_type: "signup_completed",
        source_type: "auth",
        card_source: "auth",
        action_taken: "completed",
      });
      if (createdSession) {
        setSession(createdSession);
        setAuthReady(true);
      } else {
        debugLog("[SIGNUP_SUCCESS_NO_SESSION]");
        setSyncError("Account created. Check your email if Supabase asks for confirmation, then log in here to start onboarding.");
        setSyncStatus("needs-connection");
      }
    } catch (error) {
      console.error("[SIGNUP_ERROR]", error);
      signupOnboardingPendingRef.current = false;
      setSignupOnboardingPending(false);
      setSyncError(getSyncErrorMessage(error, "Could not sign up."));
      setSyncStatus("needs-connection");
    }
  }

  async function handleLogIn(email, password) {
    setSyncStatus("loading");
    setSyncError("");
    try {
      const nextSession = await logIn(email, password);
      if (nextSession) {
        setSession(nextSession);
        setAuthReady(true);
        signupOnboardingPendingRef.current = false;
        setSignupOnboardingPending(false);
      } else {
        debugLog("[LOGIN_SUCCESS_NO_SESSION]");
        setSyncStatus("needs-connection");
        setSyncError("Login succeeded, but myBishBash could not start your session. Please close and reopen the app.");
      }
    } catch (error) {
      console.error("[LOGIN_ERROR]", error);
      signupOnboardingPendingRef.current = false;
      setSignupOnboardingPending(false);
      setSyncError(getSyncErrorMessage(error, "Could not log in."));
      setSyncStatus("needs-connection");
    }
  }

  async function handlePasswordReset(email) {
    setSyncError("");
    const redirectTo = typeof window === "undefined" ? undefined : window.location.href.split("#")[0];
    await resetPassword(email, redirectTo);
  }

  async function handleLogOut() {
    const confirmed = window.confirm("Log out of this myBishBash profile?");
    if (!confirmed) return;
    setSyncStatus("loading");
    try {
      await logOut();
    } catch (err) {
      console.warn(err);
    }
    setSession(null);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    clearSharedMyBishBashState();
    resetLocalMyBishBashState({ clearStorage: false });
    setSyncStatus("needs-connection");
    setSyncError("");
  }

  async function handleDeleteAccount() {
    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }
    if (cardSaveTimerRef.current) {
      window.clearTimeout(cardSaveTimerRef.current);
      cardSaveTimerRef.current = null;
    }
    localDirtyRef.current = false;
    setSyncError("");

    await deleteCurrentAccount();

    setSession(null);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    resetLocalMyBishBashState();
    setSyncStatus("needs-connection");
    setSyncError("");
  }

  async function handleRefreshSession() {
    debugLog("[AUTH] Refreshing session manually...");
    try {
      const currentSession = await getSession();
      setSession(currentSession);
      if (!currentSession) {
        setSyncStatus("needs-connection");
        alert("No active session found. Please log in again.");
      } else {
        alert("Session refreshed successfully.");
      }
    } catch (e) {
      console.error("Session refresh failed", e);
      alert("Failed to refresh session.");
    }
  }

  function handleSaveCustomPack(packData) {
    const targetApp = packData.targetApp ?? packData.linkedVersionId ?? "";
    const packId = packData.id ?? createId();
    const nextPack = {
      id: packId,
      type: "interruption",
      name: packData.name.trim(),
      targetApp,
      linkedVersionId: targetApp,
      active: typeof packData.active === "boolean" ? packData.active : true,
      cards: packData.messages.map((item, index) => {
        const text = item.trim();
        return text ? { id: `${packId}:${index}`, text, title: text } : null;
      }).filter(Boolean),
      messages: packData.messages.map((item) => item.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    };

    if (!nextPack.name || nextPack.messages.length === 0) return null;

    if (nextPack.targetApp) {
      setLauncherBehaviorSettings((current) => ({
        ...current,
        [nextPack.targetApp]: {
          ...(current[nextPack.targetApp] || {}),
          interruptionPackId: nextPack.id,
        },
      }));
    }

    setCardPacks((current) => {
      const exists = current.some((pack) => pack.id === nextPack.id);
      if (exists) {
        return current.map((pack) => (pack.id === nextPack.id ? nextPack : pack));
      }
      return [nextPack, ...current];
    });

    setEditingCustomPackId(null);
    return nextPack;
  }

  function handleDeleteCustomPack(packId) {
    setCardPacks((current) => current.filter((pack) => pack.id !== packId));
    setLauncherBehaviorSettings((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, behavior]) => [
          id,
          (behavior.interruptionPackId === packId || behavior.selectedPackId === packId)
            ? { ...behavior, interruptionPackId: "" }
            : behavior,
        ]),
      ),
    );
  }

  function handleSaveActionCard(cardData) {
    const newCard = {
      id: createId(),
      ...cardData,
      hidden: false,
      source: "user",
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setActionCards((current) => [newCard, ...current]);
    setIsActionCardEditorOpen(false);
  }

  function handleToggleActionCardHidden(cardId, hidden) {
    setActionCards((current) => current.map((c) => c.id === cardId ? { ...c, hidden, updatedAt: new Date().toISOString() } : c));
  }

  function handleDeleteActionCard(cardId) {
    const now = new Date().toISOString();
    setActionCards((current) => current.map((c) => c.id === cardId ? { ...c, deletedAt: now, updatedAt: now } : c));
  }

  function handleRestoreActionCards(cardIds) {
    const now = new Date().toISOString();
    setActionCards((current) =>
      current.map((card) =>
        cardIds.includes(card.id) ? { ...card, deletedAt: null, updatedAt: now } : card
      )
    );
  }

  function openCustomPackPreview(packId) {
    const pack = cardPacks.find((item) => item.id === packId);
    const normalizedPack = normalizeInterruptionPack(pack, pack?.targetApp ?? pack?.linkedVersionId ?? "");
    if (!normalizedPack || normalizedPack.messages.length === 0) return;
    const nextOverlay = { ...buildCustomPackOverlay(normalizedPack), origin: "home" };
    debugLog("[CARD_ORIGIN] custom pack preview created", nextOverlay);
    setOverlay(nextOverlay);
  }

  const editingCard = useMemo(
    () => cards.find((card) => card.id === editingId) ?? null,
    [cards, editingId],
  );

  const editingPackCard = useMemo(
    () => (editingPackId ? getPackRepresentative(cards, editingPackId) : null),
    [cards, editingPackId],
  );

  const editingCustomPack = useMemo(
    () => cardPacks.find((pack) => pack.id === editingCustomPackId) ?? null,
    [cardPacks, editingCustomPackId],
  );

  const activeRevealCard = overlay?.cardId
    ? resolveRevealCard(cards, overlay.cardId, profile.timezone)
    : null;
  const recordActiveRevealCardIgnored = useCallback((reason) => {
    if (!overlay || overlay.type !== "reveal" || !activeRevealCard || activeRevealCard.sourcePackId) return;
    const now = new Date();
    const surface = getCardSelectionSurfaceForOverlay(overlay);
    updateCards((current) =>
      current.map((card) =>
        card.id === activeRevealCard.id
          ? { ...card, lastShownAt: now.toISOString(), updatedAt: now.toISOString() }
          : card,
      ),
    );
    void logEvent({
      event_type: CARD_EVENT_TYPES.IGNORED,
      source_type: "personal",
      card_source: "personal",
      bash_id: activeRevealCard.parentCommitmentCardId ?? activeRevealCard.id,
      bash_title: activeRevealCard.promptText,
      card_id: activeRevealCard.id,
      card_title: activeRevealCard.dashboardTitle ?? activeRevealCard.promptText,
      card_text: activeRevealCard.promptText,
      action_taken: "ignored",
      metadata: {
        cardKind: activeRevealCard.cardKind ?? "personal",
        surface,
        reason,
        origin: overlay.origin ?? null,
        launchSource: overlay.launchSource ?? null,
        activationKey: overlay?.activationKey ?? null,
      },
    });
  }, [activeRevealCard, logEvent, overlay, updateCards]);
  const activeOverlayVersion = useMemo(
    () =>
      overlay?.versionId
        ? resolveVersionConfig(
            homeScreenVersions[overlay.versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[overlay.versionId],
            launcherBehaviorSettings[overlay.versionId]
          )
        : activeInterceptionVersion,
    [activeInterceptionVersion, homeScreenVersions, launcherBehaviorSettings, overlay?.versionId],
  );

  useEffect(() => {
    if (!overlay || overlay.type !== "reveal" || !activeRevealCard) return;
    if (activeRevealCard.sourcePackId) return;
    const shownKey = [
      overlay?.activationKey ?? overlay.origin ?? route.path,
      overlay.cardId,
      activeRevealCard.id,
    ].join(":");
    if (loggedCardShownRef.current.has(shownKey)) return;
    loggedCardShownRef.current.add(shownKey);

    const isCheckIn = isCommitmentCheckInCard(activeRevealCard);
    const isCommitment = isCommitmentCard(activeRevealCard);
    const surface = getCardSelectionSurfaceForOverlay(overlay);
    const baseEvent = {
      source_type: "personal",
      card_source: "personal",
      bash_id: activeRevealCard.parentCommitmentCardId ?? activeRevealCard.id,
      bash_title: activeRevealCard.promptText,
      card_id: activeRevealCard.id,
      card_title: activeRevealCard.dashboardTitle ?? activeRevealCard.promptText,
      card_text: activeRevealCard.promptText,
      action_taken: "shown",
      metadata: {
        cardKind: activeRevealCard.cardKind ?? "personal",
        surface,
        origin: overlay.origin ?? null,
        launchSource: overlay.launchSource ?? null,
        activationKey: overlay?.activationKey ?? null,
      },
    };

    if (isCheckIn) {
      void logEvent({
        ...baseEvent,
        event_type: "commitment_check_in_generated",
        metadata: {
          ...baseEvent.metadata,
          parentCommitmentCardId: activeRevealCard.parentCommitmentCardId,
        },
      });
      void logEvent({
        ...baseEvent,
        event_type: CARD_EVENT_TYPES.SHOWN,
        metadata: {
          ...baseEvent.metadata,
          legacyEventType: "commitment_check_in_generated",
          parentCommitmentCardId: activeRevealCard.parentCommitmentCardId,
        },
      });
      return;
    }

    void logEvent({
      ...baseEvent,
      event_type: isCommitment ? "commitment_card_shown" : "personal_card_shown",
    });
    void logEvent({
      ...baseEvent,
      event_type: CARD_EVENT_TYPES.SHOWN,
      metadata: {
        ...baseEvent.metadata,
        legacyEventType: isCommitment ? "commitment_card_shown" : "personal_card_shown",
      },
    });
  }, [activeRevealCard, logEvent, overlay, route.path]);

  useEffect(() => {
    if (!e2eMode || typeof window === "undefined") return;
    const cardType = activeRevealCard?.sourcePackId ? "pack" : activeRevealCard ? "personal" : null;
    const actionLabels = cardType
      ? getLauncherCardActions({ launchSession: effectiveLaunchSession, cardType }).actions.map((action) => action.label)
      : [];
    window.__MYBISHBASH_OVERLAY_DEBUG = {
      route: {
        kind: route.kind,
        path: route.path,
      },
      overlay: overlay
        ? {
            type: overlay.type,
            origin: overlay.origin ?? null,
            launchSource: overlay.launchSource ?? null,
            versionId: overlay.versionId ?? null,
            activationKey: overlay?.activationKey ?? null,
          }
        : null,
      launchSession: {
        entrySurface: effectiveLaunchSession.entrySurface,
        launcherId: effectiveLaunchSession.launcherId,
        allowBackHome: effectiveLaunchSession.allowBackHome,
      },
      visibleDestinationChips: overlayLauncherVersions.map((version) => version.id),
      selectedCtaLabels: actionLabels,
    };
  }, [activeRevealCard, e2eMode, effectiveLaunchSession, overlay, overlayLauncherVersions, route.kind, route.path]);

  const homeItems = useMemo(() => {
    const items = cards
      .filter((card) => !card.sourcePackId && !card.disliked && !card.deletedAt)
      .map((card) => ({
        type: "single",
        id: card.id,
        representative: card,
      }));

    const packMap = new Map();
    cards.forEach((card) => {
      if (!card.sourcePackId || card.deletedAt || card.paused || card.disliked) return;
      if (!packMap.has(card.sourcePackId)) {
        packMap.set(card.sourcePackId, []);
      }
      packMap.get(card.sourcePackId).push(card);
    });

    packMap.forEach((packCards, packId) => {
      items.push(buildLibraryPackHomeItem(packId, packCards, profile.timezone));
    });

    Object.values(homeScreenVersions).forEach((version) => {
      if (version.id === "mybishbash" || launcherContext === NORMAL_LAUNCHER_CONTEXT) return;
      const resolvedVersion = resolveVersionConfig(version, launcherBehaviorSettings[version.id]);
      if (resolvedVersion.id !== launcherContext) return;
      const pack = getInterruptionPackForLauncher(resolvedVersion.id, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
        hiddenCardIds: hiddenPackCardIdsCompat,
        globalEnabled: globalInterruptionMode,
      });
      if (!pack || pack.messages.length === 0) return;

      items.unshift(buildInterruptionHomeItem(resolvedVersion, pack, launcherBehaviorSettings[version.id]));
    });

    return items.sort((left, right) => {
      const leftInterruption = left.type === "interruption-version" || left.type === "interruption-card";
      const rightInterruption = right.type === "interruption-version" || right.type === "interruption-card";
      if (leftInterruption !== rightInterruption) return leftInterruption ? -1 : 1;

      const leftRank = getHomeSortRank(left.representative);
      const rightRank = getHomeSortRank(right.representative);

      if (leftRank !== rightRank) return leftRank - rightRank;

      const leftCreated = new Date(left.representative.createdAt ?? 0).getTime();
      const rightCreated = new Date(right.representative.createdAt ?? 0).getTime();
      return rightCreated - leftCreated;
    });
  }, [cards, profile.timezone, homeScreenVersions, launcherBehaviorSettings, cardPacks, launcherContext, hiddenPackCardIdsCompat, globalInterruptionMode]);
  const eligibleHomeCount = useMemo(() => {
    let count = 0;
    const seenPackIds = new Set();

    cards.forEach((card) => {
      if (card.deletedAt) return;
      if (card.sourcePackId) {
        if (seenPackIds.has(card.sourcePackId)) return;
        const packHasEligible = cards.some(
          (candidate) =>
            candidate.sourcePackId === card.sourcePackId &&
            isPackCardAvailable(candidate),
        );
        if (packHasEligible) {
          seenPackIds.add(card.sourcePackId);
          count += 1;
        }
        return;
      }

      if (isEligible(card, new Date(), profile.timezone)) {
        count += 1;
      }
    });

    return count;
  }, [cards, profile.timezone]);
  const recentMeaningfulEvents = useMemo(
    () => events.filter(isRecentMomentEvent).slice(0, 5),
    [events],
  );
  const visibleLibraryPacks = useMemo(
    () => {
      const databaseSourceKeys = new Set(globalPacks.map((pack) => pack.sourceKey).filter(Boolean));
      const fallbackPacks = PACKS.filter((pack) => !databaseSourceKeys.has(pack.id));
      return [...fallbackPacks, ...globalPacks].filter((pack) => !hiddenLibraryPacks.includes(pack.id));
    },
    [hiddenLibraryPacks, globalPacks],
  );
  // Unlike visibleActionCards (intercept surface), the Library list keeps
  // hidden starters so they can be restored.
  const libraryDoInsteadItems = useMemo(
    () => actionCards.filter((card) => !card.deletedAt),
    [actionCards],
  );
  const librarySections = useMemo(
    () => buildLibrarySections({ cards, libraryPacks: visibleLibraryPacks }),
    [cards, visibleLibraryPacks],
  );
  const todayPersonalLibrary = useMemo(() => {
    const now = new Date();
    const todayKey = getTodayKey(now, profile.timezone);
    const personalCards = normalizeCards(cards, now, profile.timezone)
      .filter((card) => !card.sourcePackId && !card.deletedAt && !isCommitmentCard(card));
    const todayCards = personalCards.filter((card) =>
      isCardDoneToday(card, todayKey) || card.statusToday === "pending" || isEligible(card, now, profile.timezone)
    );
    return {
      totalCount: personalCards.length,
      completed: todayCards.filter((card) => isCardDoneToday(card, todayKey)),
      outstanding: todayCards.filter((card) => !isCardDoneToday(card, todayKey)),
    };
  }, [cards, profile.timezone]);
  const completionEvents = useMemo(
    () => events.filter(isCompletionEvent).slice(0, 3),
    [events],
  );
  const interruptionTodayCount = useMemo(() => {
    const todayKey = getTodayKey(new Date(), profile.timezone);
    return events.filter((event) => {
      if (!isInterruptionSummaryEvent(event)) return false;
      return getTodayKey(new Date(event.created_at), profile.timezone) === todayKey;
    }).length;
  }, [events, profile.timezone]);
  const logEventsForPanel = useMemo(() => {
    if (logFilter === "intercepts") {
      return recentMeaningfulEvents.filter((event) => event.event_type.startsWith("intercept_"));
    }
    return recentMeaningfulEvents;
  }, [logFilter, recentMeaningfulEvents]);
  const weeklyShiftCount = useMemo(() => getWeeklyShiftCount(events), [events]);
  const interruptionPacks = useMemo(
    () =>
      Array.from(new Set([
        ...INTERRUPTION_LAUNCHER_CONTEXTS,
        ...Object.keys(homeScreenVersions).filter((versionId) => isKnownLauncher(versionId)),
      ])).map((targetApp) =>
        buildInterruptionFolder(targetApp, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
          hiddenCardIds: hiddenPackCardIdsCompat,
          globalEnabled: globalInterruptionMode,
          includeHidden: true,
        }),
      ).filter(Boolean),
    [homeScreenVersions, launcherBehaviorSettings, cardPacks, hiddenPackCardIdsCompat, globalInterruptionMode],
  );
  const homeReminderItems = useMemo(() => homeItems, [homeItems]);

  const isFakeLauncherFlow = route.kind === "intercept" || overlay?.launchSource === "fake_launcher";
  const isHqScreen = screen === "hq";
  const showAppUpdateBanner = appUpdate.updateAvailable && !overlay;

  const hasLocalCards = cards.length > 0;
  const routeLauncherName = route.kind === "intercept"
    ? homeScreenVersions[route.versionId]?.realAppLabel
      ?? homeScreenVersions[route.versionId]?.displayName
      ?? homeScreenVersions[route.versionId]?.name
      ?? getLauncherConfig(route.versionId)?.displayName
      ?? getLauncherConfig(route.versionId)?.name
      ?? route.versionId
    : "";

  if (!authReady && !isFakeLauncherFlow) {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (authReady && route.kind === "intercept" && !session && !e2eMode && !hasLocalCards) {
    return (
      <SyncConnectionScreen
        mode="launcher"
        error={syncError}
        launcherName={routeLauncherName}
        onSignUp={handleSignUp}
        onLogIn={handleLogIn}
        onPasswordReset={handlePasswordReset}
        onRecoverSignupAccess={validateAndRememberGateAccessCode}
        onClearError={() => setSyncError("")}
      />
    );
  }

  if (!session && !isFakeLauncherFlow) {
    return (
      <SyncConnectionScreen
        mode="connect"
        error={syncError}
        onSignUp={handleSignUp}
        onLogIn={handleLogIn}
        onPasswordReset={handlePasswordReset}
        onRecoverSignupAccess={validateAndRememberGateAccessCode}
        onClearError={() => setSyncError("")}
      />
    );
  }

  if (session && !e2eMode && !isFakeLauncherFlow && !isHqScreen && (accessStatus === "loading" || accessStatus === "unknown")) {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (session && !e2eMode && !isFakeLauncherFlow && !isHqScreen && accessStatus === "denied") {
    return (
      <SyncConnectionScreen
        mode="access-denied"
        error={syncError || "This account does not have beta access yet."}
        onSignUp={handleSignUp}
        onLogIn={handleLogIn}
        onPasswordReset={handlePasswordReset}
        onRecoverSignupAccess={validateAndRememberGateAccessCode}
        onClearError={() => setSyncError("")}
      />
    );
  }

  // Skip the sync loading screen when the user is offline but already has local
  // cards — show the cached experience instead of a spinner.
  if (session && syncStatus === "loading" && !isFakeLauncherFlow && !isHqScreen && !(isOffline && hasLocalCards)) {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (isHqScreen) {
    return (
      <Suspense fallback={<SyncConnectionScreen mode="loading" error={syncError} />}>
        <HQPanel
          isAdmin={isAdmin}
          isAdminLoading={adminStatus !== "ready"}
          session={session}
          libraryPacks={visibleLibraryPacks}
          interruptionPacks={interruptionPacks}
          onGlobalPacksChanged={refreshGlobalPacks}
          onBack={() => navigateTo("/home", { replace: true })}
        />
      </Suspense>
    );
  }

  if (screen === "preview-continue") {
    return (
      <ContinueToAppCard
        appName="Instagram"
        appIcon={resolveLauncherIconSrc(homeScreenVersions.instagram ?? DEFAULT_HOME_SCREEN_VERSIONS.instagram)}
        onContinue={() => openDestinationApp("instagram", { source: "preview_continue", reason: "user_pressed_continue" })}
        onBack={() => navigateTo("/home", { replace: true })}
        onDashboard={() => navigateTo("/home", { replace: true })}
      />
    );
  }

  const testPilotDiagnosticsContext = {
    route: route.path,
    launcherContext,
    displayMode: getAppDisplayMode(),
    recentEvents: events,
    selectedLauncher: profile.onboardingLauncherId,
    setupComplete,
  };
  return (
    <TestPilotProvider
      config={TESTPILOT_CONFIG}
      session={session}
      testerStatus={testerStatus}
      diagnosticsContext={testPilotDiagnosticsContext}
      getDisplayMode={getAppDisplayMode}
    >
      <div className="grain" />
      <AppShellErrorBoundary
        resetKey={`${screen}:${route.path}:${activeTab}:${hideAppShell ? "hidden" : "visible"}`}
        onRecover={() => navigateTo("/home", { replace: true })}
      >
      {screen === "library" && !hideAppShell ? (
      <div className={`app-shell app-mood theme-${getThemeClass(mood)} ${activeTab === "home" ? "home-shell" : ""} ${isShellAppSettingsRoute ? "shell-app-settings-shell" : ""}`.trim()} data-testid="app-shell">
          <div className="app-inner">
            {activeTab === "home" || isShellAppSettingsRoute ? null : (
              <Masthead
                onCreate={() => {
                  signalHomeSpotlightAction("personal-card");
                  if (shouldShowHomeSpotlightTour) return;
                  openCardComposerFromCurrentRoute();
                }}
                session={session}
                onNavigate={navigateTo}
                onLogOut={handleLogOut}
                hideCreate={activeTab === "apps"}
              />
            )}

            <main className="content">
              {activeTab === "home" ? (
                shouldShowFreeCoreReconciliation ? (
                  <FreeCoreReconciliationScreen
                    enabledAppStatuses={enabledProtectedAppStatuses}
                    onKeepApp={keepOnlyActiveApp}
                    onUpgrade={() => navigateTo("/access")}
                  />
                ) : (
                  <MemoHomePanel
                    cards={cards}
                    events={events}
                    timezone={profile.timezone}
                    homeScreenVersions={homeScreenVersions}
                    pendingOnboardingShortcuts={pendingOnboardingShortcuts}
                    onboardingSelectedAppSetup={onboardingSelectedAppSetup}
                    activationChecklistItems={activationChecklistItems}
                    saveConfirmation={homeSaveConfirmation}
                    onCreate={openCardComposerFromCurrentRoute}
                    onOpenDownload={() => {
                      window.location.href = `${BASE_PATH}/download`;
                    }}
                    onOpenApps={() => navigateTo("/apps")}
                    onOpenLauncherSetup={openLauncherSetupFromApp}
                    onOpenTodayCards={() => {
                      signalHomeSpotlightAction("today-cards");
                      setLibraryFocusMode("today-personal");
                      navigateTo("/library");
                    }}
                    onOpenCard={openSpecificReveal}
                  />
                )
              ) : null}

              {activeTab === "apps" ? (
                shouldShowFreeCoreReconciliation ? (
                  <FreeCoreReconciliationScreen
                    enabledAppStatuses={enabledProtectedAppStatuses}
                    onKeepApp={keepOnlyActiveApp}
                    onUpgrade={() => navigateTo("/access")}
                  />
                ) : (
                <MemoAppsPanel
                  protectedAppStatuses={protectedAppStatuses}
                  onSaveVersionBehavior={handleSaveVersionBehavior}
                  onSwitchActiveApp={switchActiveApp}
                  onUpdateHomeScreenIcon={handleUpdateHomeScreenIcon}
                  onOpenDestinationApp={(versionId) =>
                    openDestinationApp(versionId, { source: "apps_direct_open_test", reason: "labelled_direct_open_test" })
                  }
                  onProtectedLaunch={(versionId) =>
                    handleFakeLauncherLaunch(versionId, "apps_protected_launch")
                  }
                  onManageApp={(versionId) => {
                    setShellSettingsVersionId(null);
                    navigateTo(`/apps/${versionId}`);
                  }}
                  onBackToApps={() => {
                    setShellSettingsVersionId(null);
                    navigateTo("/apps");
                  }}
                  onOpenPremiumOptions={() => {
                    navigateTo("/access");
                  }}
                  onClaimAccessCode={handleClaimInAppAccessCode}
                  onOpenInstallGuide={() => {
                    window.location.href = `${BASE_PATH}/download`;
                  }}
                  onOpenLauncherSetup={openLauncherSetupFromApp}
                  homeScreenVersions={homeScreenVersions}
                  onPauseApp={handleSetAppPause}
                  onClearAppPause={handleClearAppPause}
                  onLogLauncherEvent={logLauncherEvent}
                  selectedVersionId={route.versionId}
                  appPauseRevision={appPauseRevision}
                  pendingOnboardingShortcuts={pendingOnboardingShortcuts}
                  onboardingSelectedAppSetup={onboardingSelectedAppSetup}
                  isTester={testerStatus?.is_tester === true}
                  isShellContext={isShellAppSettingsRoute}
                  canUseMultipleApps={canUseMultipleApps}
                  maxConnectedApps={entitlements.maxConnectedApps}
                  onOpenMyBishBash={() => {
                    setShellSettingsVersionId(null);
                    setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
                    suppressInstalledShellCardContext();
                    clearActiveProtectedAppContext();
                    setActiveProtectedAppContext(null);
                    navigateTo("/apps");
                  }}
                />
                )
              ) : null}

              {activeTab === "library" ? (
                libraryFocusMode === "today-personal" ? (
                  <MemoTodayPersonalCardsPanel
                    todayPersonalLibrary={todayPersonalLibrary}
                    onCreatePersonal={() => openCardComposerFromCurrentRoute("personal")}
                    onBackToLibrary={() => setLibraryFocusMode(null)}
                    onOpenCard={openSpecificReveal}
                  />
                ) : (
                  <MemoStandardLibraryPanel
                    personalItems={librarySections.personal}
                    commitmentItems={librarySections.commitments}
                    activePackItems={librarySections.activePacks}
                    libraryPacks={visibleLibraryPacks}
                    timezone={profile.timezone}
                    menuOpenId={menuOpenId}
                    setMenuOpenId={setMenuOpenId}
                    openEditor={openEditor}
                    handleResetItem={handleResetItem}
                    handleTogglePause={handleTogglePause}
                    handleDeleteCard={handleDeleteCard}
                    handleDuplicateCard={handleDuplicateCard}
                    openSpecificReveal={openSpecificReveal}
                    openPackReveal={openPackReveal}
                    deactivatePack={deactivatePack}
                    onCreatePersonal={() => openCardComposerFromCurrentRoute("personal")}
                    onCreateCommitment={() => openCardComposerFromCurrentRoute("commitment")}
                    onAddPack={() => navigateTo("/explore")}
                    doInsteadItems={libraryDoInsteadItems}
                    onToggleActionCardHidden={handleToggleActionCardHidden}
                    onDeleteActionCard={handleDeleteActionCard}
                    onCreateActionCard={() => setIsActionCardEditorOpen(true)}
                  />
                )
              ) : null}

              {activeTab === "log" ? (
                <MemoLogPanel
                  events={logEventsForPanel}
                  allEvents={events}
                  timezone={profile.timezone}
                  weeklyShiftCount={weeklyShiftCount}
                  filter={logFilter}
                  onShowSummary={showMorningSummaryNow}
                />
              ) : null}

              {activeTab === "explore" ? (
                <MemoExplorePanel
                  packs={visibleLibraryPacks}
                  isPackActive={isPackActive}
                  onInstallPack={activatePack}
                  onRemovePack={deactivatePack}
                  onManageCards={(packId) => setSelectedPackDetail({ type: "library", id: packId })}
                  isTester={testerStatus?.is_tester === true}
                  canUsePremiumContent={canUsePremiumContent}
                  onPremiumInterest={handlePremiumInterest}
                  onTakeCommitment={takeCommitmentTemplate}
                />
              ) : null}
              {activeTab === "access" ? (
                <AccessPanel
                  accessProfile={accessProfile}
                  canUseMultipleApps={canUseMultipleApps}
                  onManageApps={() => navigateTo("/apps")}
                  onEnterCode={() => {
                    window.location.href = `${BASE_PATH}/invite`;
                  }}
                />
              ) : null}
              {activeTab === "settings" ? (
                <SettingsPanel
                  homeScreenVersions={homeScreenVersions}
                  session={session}
                  onLogOut={handleLogOut}
                  onDeleteAccount={handleDeleteAccount}
                  onRefreshSession={handleRefreshSession}
                  onRefreshAppShell={refreshAppShell}
                  onResetSharedState={handleResetSharedState}
                  isTester={testerStatus?.is_tester === true}
                  notificationSettings={notificationSettings}
                  notificationStatus={notificationStatus}
                  onEnableNotifications={enableNotifications}
                  onDisableNotifications={disableNotifications}
                  onUpdateNotificationsPerDay={updateNotificationsPerDay}
                  actionCards={actionCards}
                  onRestoreActionCards={handleRestoreActionCards}
                  morningSummaryDebug={morningSummaryDebug}
                  onShowMorningSummaryNow={showMorningSummaryNow}
                  onGenerateMorningSummaryForToday={showMorningSummaryForToday}
                  onGenerateMorningSummaryForYesterday={showMorningSummaryForYesterday}
                  onFakeLauncherLaunch={(versionId) =>
                    handleFakeLauncherLaunch(versionId, "settings_fake_launcher")
                  }
                  timingWindowsPrefs={timingWindowsPrefs}
                  onSaveTimingWindowsPrefs={handleSaveTimingWindowsPrefs}
                />
              ) : null}
            </main>

            {showActiveProtectedAppShortcut && !isShellAppSettingsRoute ? (
              <ActiveProtectedAppShortcut
                version={activeProtectedAppVersion}
                onOpen={() =>
                  openDestinationApp(activeProtectedAppVersion.id, {
                    source: "active_protected_app_shortcut",
                    reason: "user_pressed_persisted_real_app_button",
                    preferDirectAppDestination: true,
                  })
                }
              />
            ) : null}
          </div>

          {!isShellAppSettingsRoute ? (
          <nav className="bottom-nav" aria-label="Primary">
            {getBottomNavItems(BOTTOM_NAV_ITEMS).map(({ id, label, path, testId, Glyph }) => (
              <button
                type="button"
                className={`nav-item ${activeTab === id ? "active" : ""}`}
                data-testid={testId}
                key={id}
                onClick={() => {
                  signalHomeSpotlightAction(id);
                  if (id === "library") setLibraryFocusMode(null);
                  navigateTo(path);
                }}
              >
                <Glyph />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          ) : null}
          {shouldShowHomeSpotlightTour ? (
            <HomeSpotlightTour
              actionSignal={homeSpotlightActionSignal}
              firstApp={
                profile.selectedProtectedApp && isKnownLauncher(profile.selectedProtectedApp)
                  ? homeScreenVersions[profile.selectedProtectedApp] ?? DEFAULT_HOME_SCREEN_VERSIONS[profile.selectedProtectedApp] ?? getLauncherConfig(profile.selectedProtectedApp)
                  : null
              }
              locationKey={route.path}
              onComplete={completeHomeSpotlightTour}
              onNavigate={(path) => {
                if (path === "/library") setLibraryFocusMode(null);
                navigateTo(path);
              }}
              onOpenLauncherSetup={openLauncherSetupFromApp}
            />
          ) : null}
          {launcherSetupInterstitialVersion ? (
            <LauncherSetupInterstitial
              version={launcherSetupInterstitialVersion}
              onClose={() => setLauncherSetupInterstitialVersion(null)}
            />
          ) : null}
        </div>
      ) : null}
      </AppShellErrorBoundary>

      {screen === "onboarding" ? (
        <Onboarding
          onSkip={skipInstagramOnboarding}
          onSkipPersonalSetup={skipPersonalCardSetupForNow}
          onSaveSetup={saveOnboardingSetup}
          onSavePersonalSetup={savePersonalOnboardingSetup}
          onCommitmentDemoComplete={completeCommitmentCardDemo}
          onUpdateShortcutSetup={updateOnboardingShortcutSetup}
          onCompleteProtectedAppSetup={completeProtectedAppOnboarding}
          onSaveProtectedAppPreference={({ appId, useInterruptionCard }) => {
            if (!isKnownLauncher(appId)) return;
            handleSaveVersionBehavior(appId, {
              useInterruptionPack: Boolean(useInterruptionCard),
              interruptionPaused: false,
            });
          }}
          onTryLauncher={(launcherId) => finishOnboarding("try", launcherId)}
          onGoHome={() => finishOnboarding("home")}
          availableLaunchers={getAvailableLaunchersForUser({
            launchers: Object.values(homeScreenVersions).filter((version) => version.id !== "mybishbash"),
            testerStatus,
            context: LAUNCHER_CONTEXTS.ONBOARDING,
          })}
          renderCommitmentDemoCard={({ onCommitmentAction }) => (
            <CommitmentCardOverlay
              card={ONBOARDING_COMMITMENT_DEMO_CARD}
              onCommitmentAction={onCommitmentAction}
              showDashboardShortcut={false}
              className="onboarding-commitment-real-card"
              cardOverlayKey="onboarding-commitment-demo"
            />
          )}
          renderCommitmentMotivationDemoCard={({ onCommitmentAction }) => (
            <CommitmentMotivationOverlay
              card={ONBOARDING_COMMITMENT_DEMO_CARD}
              onCommitmentAction={onCommitmentAction}
              showDashboardShortcut={false}
              className="onboarding-commitment-real-card"
              cardOverlayKey="onboarding-commitment-motivation-demo"
            />
          )}
          renderCommitmentCheckInDemoCard={({ onCheckInAction }) => (
            <CommitmentCheckInOverlay
              card={ONBOARDING_COMMITMENT_DEMO_CHECK_IN_CARD}
              onCheckInAction={onCheckInAction}
              showDashboardShortcut={false}
              className="onboarding-commitment-real-card"
              cardOverlayKey="onboarding-commitment-check-in-demo"
            />
          )}
          renderCommitmentEncouragementDemoCard={({ onContinue }) => (
            <CommitmentEncouragementOverlay
              card={ONBOARDING_COMMITMENT_DEMO_ENCOURAGEMENT_CARD}
              onContinue={onContinue}
              showDashboardShortcut={false}
              className="onboarding-commitment-real-card"
              cardOverlayKey="onboarding-commitment-encouragement-demo"
            />
          )}
          renderCommitmentReviewDemoCard={({ onReviewAction }) => (
            <CommitmentReviewOverlay
              card={ONBOARDING_COMMITMENT_DEMO_REVIEW_CARD}
              onReviewAction={onReviewAction}
              showDashboardShortcut={false}
              className="onboarding-commitment-real-card"
              cardOverlayKey="onboarding-commitment-review-demo"
            />
          )}
        />
      ) : null}

      {isComposerOpen ? (
        <Composer
          key={editingId ?? `new-${composerInitialKind}-${composerInitialDraft?.promptText ?? ""}`}
          initialCard={editingCard}
          initialKind={composerInitialKind}
          initialDraft={composerInitialDraft}
          personalCardCount={personalCardCount}
          maxPersonalCards={entitlements.maxPersonalCards}
          onClose={() => {
            setEditingId(null);
            setComposerInitialKind("personal");
            setComposerInitialDraft(null);
            composerReturnPathRef.current = "/home";
            setIsComposerOpen(false);
          }}
          onSave={handleSaveCard}
        />
      ) : null}

      {editingPackId && editingPackCard ? (
        <PackEditor
          key={editingPackId}
          packTitle={editingPackCard.dashboardTitle ?? "Pack"}
          initialCard={editingPackCard}
          onClose={() => setEditingPackId(null)}
          onSave={(formData) => handleSavePackSettings(editingPackId, formData)}
        />
      ) : null}

      {editingCustomPackId ? (
        <CustomPackEditor
          key={editingCustomPackId}
          initialPack={editingCustomPack}
          linkedVersionId={editingCustomPackId.startsWith("new:") ? editingCustomPackId.replace("new:", "") : editingCustomPack?.linkedVersionId ?? ""}
          versions={homeScreenVersions}
          onClose={() => setEditingCustomPackId(null)}
          onSave={handleSaveCustomPack}
        />
      ) : null}

      {isActionCardEditorOpen ? (
        <ActionCardEditor
          onClose={() => setIsActionCardEditorOpen(false)}
          onSave={handleSaveActionCard}
        />
      ) : null}

      {selectedPackDetail ? (
        <PackDetailModal
          detail={selectedPackDetail}
          cards={cards}
          libraryPacks={visibleLibraryPacks}
          interruptionPacks={interruptionPacks}
          hiddenCardIds={hiddenPackCardIdsCompat}
          isPackActive={isPackActive}
          onActivateLibraryPack={activatePack}
          onDeactivateLibraryPack={deactivatePack}
          onSetPackCardHidden={setPackCardHidden}
          onSaveInterruptionCard={handleSaveInterruptionCard}
          onDeleteInterruptionCard={handleDeleteInterruptionCard}
          onClose={() => setSelectedPackDetail(null)}
        />
      ) : null}

      {morningSummary ? (
        <MorningSummaryModal
          summary={morningSummary}
          onClose={() => closeMorningSummary(morningSummary)}
        />
      ) : null}

      {overlay ? (
        <MemoOverlay
          key={`${overlay.type}:${overlay.versionId ?? ""}:${overlay.cardId ?? ""}:${overlay.packId ?? ""}:${overlay?.activationKey ?? ""}`}
          overlay={overlay}
          card={activeRevealCard}
          route={route}
          launchSession={effectiveLaunchSession}
          version={activeOverlayVersion}
          timezone={profile.timezone}
          isOffline={isOffline}
          onRetryConnection={() => {
            setIsOffline(false);
            void processEventQueue();
          }}
          onClose={() => {
            if (overlay.type === "custom-pack-preview") {
              setOverlay(null);
              return;
            }
            recordActiveRevealCardIgnored("overlay_closed");
            suppressNextHomeAutoLaunchRef.current = true;
            suppressStandaloneLauncherRecoveryOnce();
            setShouldLaunchOverlay(false);
            setScreen("library");
            navigateTo("/home", { replace: true });
            setOverlay(null);
          }}
          onDashboard={() => {
            recordActiveRevealCardIgnored("dashboard_opened");
            suppressNextHomeAutoLaunchRef.current = true;
            suppressStandaloneLauncherRecoveryOnce();
            setShouldLaunchOverlay(false);
            setScreen("library");
            navigateTo("/home", { replace: true });
            setOverlay(null);
          }}
          onAction={handleAction}
          onCommitmentAction={handleCommitmentAction}
          onCommitmentCheckInAction={handleCommitmentCheckInAction}
          onCommitmentEncouragementAction={handleCommitmentEncouragementAction}
          onCommitmentReviewAction={handleCommitmentReviewAction}
          onCreateCard={openCardComposerFromCurrentRoute}
          actionCards={actionCards}
          onAcceptActionCard={(card) => {
            const nextStep = getNextFakeLauncherStepAfterActionCard();
            const nextOverlay = {
              ...buildActionSuccessOverlay(overlay?.versionId),
              origin: overlay?.origin,
              activationKey: overlay?.activationKey,
              launchSource: overlay?.launchSource,
              flowStep: nextStep,
            };
            debugLog("[CARD_ORIGIN] action success created", nextOverlay);
            setOverlay(nextOverlay);
            if (card.launchUrl) {
              openExternalActionUrl(card.launchUrl, { source: "action_card", cardId: card.id });
            }
          }}
          onPackContinue={() => {
            handleRevealCompletion({ completedCardId: activeRevealCard?.id });
            return;
          }}
          onPackLike={() => {
            if (activeRevealCard?.sourcePackId) {
              void logEvent({
                event_type: "pack_card_liked",
                source_type: "library",
                card_source: "library",
                bash_id: activeRevealCard.id,
                bash_title: activeRevealCard.promptText,
                card_id: activeRevealCard.id,
                card_title: activeRevealCard.dashboardTitle ?? activeRevealCard.promptText,
                card_text: activeRevealCard.promptText,
                pack_id: activeRevealCard.sourcePackId,
                action_taken: "liked",
              });
            }
            handleRevealCompletion();
            return;
          }}
          onChooseElse={() => {
            debugLog("[INTERCEPT] Choose something else", {
              versionId: overlay?.versionId,
              visibleActionCards: visibleActionCards.length,
            });
            if (overlay?.versionId) {
              void logLauncherEvent("intercept_do_something_else", overlay.versionId, {
                visible_action_cards: visibleActionCards.length,
              });
            }
            void logEvent({
              event_type: "intercept_do_something_else",
              source_type: "interruption",
              card_source: "interruption",
              app_id: activeOverlayVersion?.id,
              app_name: activeOverlayVersion?.name,
              launcher_context: activeOverlayVersion?.id,
              action_taken: "chose_something_else",
              metadata: {
                selectionModel: interceptActivationRef.current?.selectionModel ?? null,
                activationKey: overlay?.activationKey ?? interceptActivationRef.current?.activationKey ?? null,
                actionCardShown: visibleActionCards.length > 0,
              },
            });
            const nextStep = getNextFakeLauncherStepAfterInterruption("do_something_else");
            if (visibleActionCards.length === 0) {
              debugLog("[ACTION CARDS] Opening empty fallback.");
              const nextOverlay = {
                ...buildActionCardEmptyOverlay(overlay?.versionId),
                origin: overlay?.origin || "home",
                activationKey: overlay?.activationKey,
                launchSource: overlay?.launchSource,
                flowStep: nextStep,
              };
              debugLog("[CARD_ORIGIN] action card empty created", nextOverlay);
              setOverlay(nextOverlay);
            } else {
              debugLog("[ACTION CARDS] Opening overlay.");
              const nextOverlay = {
                ...buildActionCardOverlay(overlay?.versionId),
                origin: overlay?.origin || "home",
                activationKey: overlay?.activationKey,
                launchSource: overlay?.launchSource,
                flowStep: nextStep,
              };
              debugLog("[CARD_ORIGIN] action card created", nextOverlay);
              setOverlay(nextOverlay);
            }
          }}
          onLogEvent={logEvent}
          onLogLauncherEvent={logLauncherEvent}
          onContinueToApp={(versionId, options) => openDestinationApp(versionId, options)}
          onCreateActionCard={() => {
            setOverlay(null);
            setIsActionCardEditorOpen(true);
          }}
          fakeLauncherVersions={overlayLauncherVersions}
          onFakeLauncherLaunch={handleOverlayFakeLauncherLaunch}
          onPauseApp={handlePauseApp}
          onManageApp={(versionId) => {
            const shellLauncherId = getFakeLauncherShellContextId();
            const shouldUseShellSettings = shellLauncherId === versionId;
            setOverlay(null);
            setShouldLaunchOverlay(false);
            setShellSettingsVersionId(shouldUseShellSettings ? versionId : null);
            setLauncherContext(shouldUseShellSettings && isKnownLauncher(versionId) ? versionId : NORMAL_LAUNCHER_CONTEXT);
            suppressNextHomeAutoLaunchRef.current = true;
            suppressStandaloneLauncherRecoveryOnce();
            navigateTo(`/apps/${versionId}`, { replace: true });
          }}
        />
      ) : null}

      {showAppUpdateBanner ? (
        <div style={{ position: "fixed", left: "16px", right: "16px", bottom: "calc(16px + env(safe-area-inset-bottom))", zIndex: 80, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", maxWidth: "420px", width: "100%", padding: "12px 14px", borderRadius: "16px", background: "rgba(255,255,255,0.96)", boxShadow: "0 14px 40px rgba(0,0,0,0.18)", pointerEvents: "auto" }}>
            <span style={{ flex: 1, color: "var(--charcoal)", fontWeight: 700 }}>Update available</span>
            <button type="button" className="pack-button" onClick={refreshAppShell}>
              Update
            </button>
          </div>
        </div>
      ) : null}
      <TesterFloatingButton />
      <TesterToolsSheet />
      <ReportIssueModal onSubmitted={() => setTesterReportsRefreshKey((value) => value + 1)} />
      <FeedbackModal onSubmitted={() => setTesterReportsRefreshKey((value) => value + 1)} />
      <MyReportsModal refreshKey={testerReportsRefreshKey} />
      <DiagnosticsModal />
    </TestPilotProvider>
  );
}


export default App;
