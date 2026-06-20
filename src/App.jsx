import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LogPanel } from "./components/LogPanel";
import { HeartGlyph, LogGlyph } from "./components/Glyphs";
import { authContent } from "./content/authContent";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
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
  saveMood,
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
  formatTwentyFourHourTime,
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
  onAuthStateChange,
  signUp,
  logIn,
  resetPassword,
  logOut,
  markNotificationOpened,
  saveLauncherEvent,
  saveNotificationPreferences,
  savePushSubscription,
  checkIsAdmin,
  fetchGlobalPacks,
  fetchLauncherConfigs,
  fetchOwnAccessProfile,
  getSignupHandoffReference,
  claimAccessCodeForCurrentUser,
  touchUserProfile,
} from "./lib/mybishbashSync";
import { ACCESS_TIERS, CAPABILITIES, getCapabilities, isAccessActive } from "./lib/accessCapabilities";
import ExplorePanel from "./ExplorePanel";
import GeneratedPackCover from "./GeneratedPackCover";
import {
  PACKS,
  FREQUENCY_OPTIONS,
  ICON_OPTIONS,
  THEMES,
  TIME_WINDOWS,
  DEFAULT_WINDOW_DEFS,
  setWindowDefs,
  isValidWindowDefs,
  applyCardAction,
  buildEligibleCommitmentLifecycleCards,
  buildCardsFromPack,
  createId,
  getGreeting,
  getHomeSortRank,
  getStatusMeta,
  getThemeClass,
  getCurrentWindow,
  isEligible,
  isCommitmentCheckInCard,
  isCommitmentEncouragementCard,
  isCommitmentReviewCard,
  isCommitmentLikeCard,
  isPackCardAvailable,
  normalizeCards,
  getTodayKey,
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
import { buildCustomLauncher, getAllLauncherIds, getLauncherConfig, isKnownLauncher, mergeLauncherConfig, resolveLauncherIconSrc } from "./lib/launcherRegistry";
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
  CARD_SELECTION_SURFACES,
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
  fetchTesterStatus,
} from "./testing/TestPilot";
import "./testing/TestPilot/testPilot.css";
import Onboarding, { DEFAULT_ACTION_CARD_TITLES, DEFAULT_INTERRUPTER_CARDS, DEFAULT_PERSONAL_CARD_TEXTS } from "./Onboarding";
import FakeAppLauncherBar from "./lib/FakeLauncherBar";
import { EditableLandingPage } from "./LandingPage";
import EarlyAccessPage from "./EarlyAccessPage";
import AboutPage from "./AboutPage";
import DownloadPage from "./DownloadPage";
import { checkForAppUpdate, refreshMyBishBashAppShell } from "./appUpdate";

const HQPanel = lazy(() => import("./HQPanel"));
const AUTH_SESSION_RETRY_DELAYS_MS = [150, 450, 900];
const TESTPILOT_CONFIG = {
  productName: "MyBishBash",
  uiLabel: "Tester Mode",
  accent: "#D9654C",
  appVersion: import.meta.env.VITE_APP_VERSION ?? import.meta.env.VITE_GIT_SHA ?? "0.1.0",
};

function resolveTheme(theme) {
  if (theme === "Paper Cut") return "Soft Bloom";
  return THEMES.includes(theme) ? theme : THEMES[0];
}

const BASE_PATH = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const LEGACY_BASE_PATHS = ["/bishbash"];
const E2E_MODE_KEY = "MYBISHBASH_E2E_MODE";
const E2E_TESTER_MODE_KEY = "MYBISHBASH_E2E_TESTER_MODE";
const SUPPRESS_HOME_AUTOLAUNCH_AFTER_DESTINATION_KEY = "mybishbash.suppress-home-autolaunch-after-destination.v1";
const ACTIVE_PROTECTED_APP_CONTEXT_KEY = "mybishbash.active-protected-app-context.v1";
const ACTIVE_PROTECTED_APP_CONTEXT_TTL_MS = 8 * 60 * 60 * 1000;
// How long a custom-scheme launch gets to background the page before the web
// fallback fires. Long enough for the OS app switch on slow devices, short
// enough that a dead button visibly recovers.
const NATIVE_SCHEME_FALLBACK_MS = 1400;
const INSTALLED_LAUNCHER_SHELL_KEY = "mybishbash.installed-launcher-shell.v1";
const SUPPRESS_STANDALONE_LAUNCHER_RECOVERY_KEY = "mybishbash.suppress-standalone-launcher-recovery.v1";
const LAUNCHER_BEHAVIOR_SETTINGS_KEY = "mybishbash.launcher-behavior-settings.v1";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";
const HQ_ADMIN_EMAILS = (import.meta.env.VITE_HQ_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const SIGNUP_ONBOARDING_PENDING_KEY = "mybishbash.signup-onboarding-pending.v1";
const LAUNCH_TIMING_LOG_KEY = "bishbash.launchTiming.v1";
const LAUNCHER_PREPARING_VISIBLE_DELAY_MS = 180;
const COMMITMENT_TIMING_OPTIONS = [
  { id: "anytime", label: "Anytime today", timingWindows: ["morning", "day", "evening", "night"] },
  { id: "morning", label: "Morning", timingWindows: ["morning"] },
  { id: "afternoon", label: "Afternoon", timingWindows: ["day"] },
  { id: "evening", label: "Evening", timingWindows: ["evening"] },
  { id: "custom", label: "Custom time window", timingWindows: ["morning", "day", "evening", "night"] },
];
const APPS_OPTION_IDS = ["whatsapp", "instagram", "youtube", "safari"];

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

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true || window.Capacitor);
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

function isE2EModeEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(E2E_MODE_KEY) === "true";
}

function isDemoModeEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem("MYBISHBASH_DEMO_MODE") === "true";
}

function loadE2EAccessProfile() {
  if (typeof window === "undefined") return null;
  const accessTier = window.localStorage.getItem("MYBISHBASH_E2E_ACCESS_TIER") || ACCESS_TIERS.FREE_CORE;
  return { access_tier: accessTier, has_access: true };
}

function loadExplicitLauncherBehaviorSettings() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LAUNCHER_BEHAVIOR_SETTINGS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function buildE2ESession() {
  return {
    user: {
      id: "e2e-user",
      email: "e2e@mybishbash.local",
    },
  };
}

function setSignupOnboardingPending(value) {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(SIGNUP_ONBOARDING_PENDING_KEY, "true");
    return;
  }
  window.localStorage.removeItem(SIGNUP_ONBOARDING_PENDING_KEY);
}

function isLaunchDebugEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("bishbash.launchDebug.enabled") === "true";
}

function debugLaunch(label, payload) {
  if (!isLaunchDebugEnabled()) return;
  console.log(label, payload);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = JSON.parse(window.localStorage.getItem("bishbash.launchDebug.v1") || "[]");
      stored.push({ label, payload, at: new Date().toISOString() });
      if (stored.length > 100) {
        stored.splice(0, stored.length - 100);
      }
      window.localStorage.setItem("bishbash.launchDebug.v1", JSON.stringify(stored));
    }
  } catch (e) {
    // ignore storage errors
  }
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

function getCardOverlayRenderKey(overlay, activeCardId = null) {
  return [
    overlay?.type ?? "none",
    overlay?.versionId ?? "",
    overlay?.activationKey ?? "",
    overlay?.cardId ?? "",
    overlay?.packId ?? "",
    overlay?.flowStep ?? "",
    activeCardId ?? "",
  ].join(":");
}

function isSameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isLaunchTimingEnabled(testerStatus = null) {
  if (typeof window === "undefined") return false;
  if (testerStatus?.is_tester === true) return true;
  return window.localStorage.getItem(E2E_TESTER_MODE_KEY) === "true";
}

function recordLaunchTiming(label, payload = {}, testerStatus = null) {
  if (!isLaunchTimingEnabled(testerStatus)) return;
  const entry = {
    label,
    payload,
    at: new Date().toISOString(),
    t: performance.now(),
  };
  window.__MYBISHBASH_LAUNCH_TIMINGS = [
    ...(window.__MYBISHBASH_LAUNCH_TIMINGS ?? []),
    entry,
  ].slice(-200);
  try {
    const stored = JSON.parse(window.localStorage.getItem(LAUNCH_TIMING_LOG_KEY) || "[]");
    stored.push(entry);
    if (stored.length > 200) stored.splice(0, stored.length - 200);
    window.localStorage.setItem(LAUNCH_TIMING_LOG_KEY, JSON.stringify(stored));
  } catch {
    // Timing logs are diagnostic only.
  }
}

function logCommitmentDebug(label, payload = {}) {
  const entry = {
    label,
    payload,
    at: new Date().toISOString(),
  };
  console.log(`[COMMITMENT_CARD] ${label}`, payload);
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const stored = JSON.parse(window.localStorage.getItem("mybishbash.commitmentDebug.v1") || "[]");
    stored.push(entry);
    if (stored.length > 100) stored.splice(0, stored.length - 100);
    window.localStorage.setItem("mybishbash.commitmentDebug.v1", JSON.stringify(stored));
    window.__MYBISHBASH_COMMITMENT_DEBUG = stored;
  } catch {
    // Debug logging must never block the card flow.
  }
}

function isCommitmentCard(card) {
  return isCommitmentLikeCard(card);
}

function resolveRevealCard(cards, cardId, timezone) {
  if (!cardId) return null;
  const storedCard = cards.find((card) => card.id === cardId);
  if (storedCard) return storedCard;
  return buildEligibleCommitmentLifecycleCards(cards, new Date(), timezone)
    .find((card) => card.id === cardId) ?? null;
}

function getCommitmentStartWindow(timingWindows = []) {
  const orderedWindowIds = TIME_WINDOWS.map((item) => item.id);
  return orderedWindowIds.find((windowId) => timingWindows.includes(windowId)) ?? "day";
}

function getCommitmentTimingOptionId(card) {
  const validTimingIds = new Set(COMMITMENT_TIMING_OPTIONS.map((option) => option.id));
  if (!card) return "anytime";
  if (validTimingIds.has(card.commitmentTimingMode)) return card.commitmentTimingMode;
  const windows = card?.timingWindows ?? [];
  if (windows.includes("morning") && windows.includes("day") && windows.includes("evening") && windows.includes("night")) return "anytime";
  if (windows.length === 1 && windows[0] === "morning") return "morning";
  if (windows.length === 1 && windows[0] === "day") return "afternoon";
  if (windows.length === 1 && windows[0] === "evening") return "evening";
  const startWindow = getCommitmentStartWindow(windows);
  if (startWindow === "day") return "afternoon";
  if (startWindow === "night") return "anytime";
  return validTimingIds.has(startWindow) ? startWindow : "anytime";
}

function getCommitmentTimingConfig(mode) {
  return COMMITMENT_TIMING_OPTIONS.find((option) => option.id === mode) ?? COMMITMENT_TIMING_OPTIONS[0];
}

if (typeof window !== "undefined") {
  window.__bishbashLaunchDebug = () => JSON.parse(window.localStorage.getItem("bishbash.launchDebug.v1") || "[]");
}

function normalizeRoutePath(path) {
  if (!path) return "/";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function getPathRelativeToKnownBase(pathname) {
  const knownBasePaths = [BASE_PATH, ...LEGACY_BASE_PATHS].filter(Boolean).sort((a, b) => b.length - a.length);
  const matchingBase = knownBasePaths.find((basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`));
  return matchingBase ? pathname.slice(matchingBase.length) || "/" : pathname || "/";
}

function getRouteFromLocation(setupComplete) {
  if (typeof window === "undefined") {
    return setupComplete ? "/home" : "/onboarding";
  }

  const params = new URLSearchParams(window.location.search);
  const routeParam = params.get("route");
  const disguiseParam = params.get("disguise");
  const disguisedVersion = isKnownLauncher(disguiseParam) ? disguiseParam : null;
  if (disguisedVersion) {
    return `/intercept/${disguisedVersion}`;
  }

  const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
  const normalized = normalizeRoutePath(rawPath);

  if (routeParam) {
    params.delete("route");
    const remainingSearch = params.toString();
    window.history.replaceState(
      {},
      "",
      `${BASE_PATH}${normalized}${remainingSearch ? `?${remainingSearch}` : ""}`,
    );
  }

  if (normalized === "/" || normalized === "/index.html") {
    return setupComplete ? "/home" : "/onboarding";
  }

  const interceptMatch = normalized.match(/^\/intercept\/([^/]+)$/);
  const validInterceptPath = interceptMatch && isKnownLauncher(interceptMatch[1]);

  if (!setupComplete && normalized !== "/onboarding" && !validInterceptPath) {
    return "/onboarding";
  }

  return normalized;
}

function parseRoute(path) {
  const normalized = normalizeRoutePath(path);

  if (normalized === "/onboarding") {
    return { kind: "onboarding", path: normalized, tab: "home" };
  }

  const interceptMatch = normalized.match(/^\/intercept\/([^/]+)$/);
  if (interceptMatch && isKnownLauncher(interceptMatch[1])) {
    return {
      kind: "intercept",
      path: normalized,
      tab: null,
      versionId: interceptMatch[1],
    };
  }

  if (interceptMatch) {
    return { kind: "invalid-intercept", path: "/home", tab: "home", versionId: interceptMatch[1] };
  }

  const cardMatch = normalized.match(/^\/card\/([^/]+)$/);
  if (cardMatch) {
    return {
      kind: "card",
      path: normalized,
      tab: "home",
      cardId: decodeURIComponent(cardMatch[1]),
    };
  }

  if (normalized === "/caught-up") return { kind: "caught-up", path: normalized, tab: "home" };
  if (normalized === "/hq") return { kind: "hq", path: normalized, tab: null };
  if (normalized === "/preview-continue") return { kind: "preview-continue", path: normalized, tab: null };
  if (normalized === "/log") return { kind: "log", path: normalized, tab: "log" };
  if (normalized === "/explore") return { kind: "explore", path: normalized, tab: "explore" };
  // Legacy route: Packs became Explore (docs/explore-architecture.md).
  if (normalized === "/packs") return { kind: "explore", path: "/explore", tab: "explore" };
  if (normalized === "/library") return { kind: "library", path: normalized, tab: "library" };
  if (normalized === "/apps") return { kind: "apps", path: normalized, tab: "apps" };
  const appsMatch = normalized.match(/^\/apps\/([^/]+)$/);
  if (appsMatch && isKnownLauncher(appsMatch[1])) {
    return { kind: "apps", path: normalized, tab: "apps", versionId: appsMatch[1] };
  }
  if (normalized === "/mood") return { kind: "settings", path: "/settings", tab: "settings" };
  if (normalized === "/settings") return { kind: "settings", path: normalized, tab: "settings" };
  return { kind: "home", path: "/home", tab: "home" };
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

function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
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

function formatPauseRemaining(expiry, nowMs = Date.now()) {
  if (!expiry) return "";
  const remainingMs = new Date(expiry).getTime() - nowMs;
  if (!(remainingMs > 0)) return "";
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes < 60) return `${remainingMinutes} min${remainingMinutes === 1 ? "" : "s"} left`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes === 0
    ? `${hours} hr${hours === 1 ? "" : "s"} left`
    : `${hours} hr ${minutes} mins left`;
}

function formatPauseUntil(expiry, nowMs = Date.now()) {
  if (!expiry) return "";
  const date = new Date(expiry);
  if (!(date.getTime() > nowMs)) return "";
  return formatTwentyFourHourTime(date.toISOString());
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

function getBrowserSafeDestinationHref(href) {
  if (!href) return "";
  if (!isStandaloneDisplayMode() && href.startsWith("x-safari-")) {
    return href.replace(/^x-safari-/, "");
  }
  return href;
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

function isCardDoneToday(card, todayKey) {
  return card?.doneDate === todayKey || (!card?.doneDate && card?.statusToday === "doneToday");
}

function getUsageDays(cards = [], events = []) {
  const dateValues = [
    ...cards.map((card) => card.createdAt),
    ...events.map((event) => event.created_at),
  ]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (dateValues.length === 0) return 1;
  return Math.max(1, Math.floor((Date.now() - Math.min(...dateValues)) / 86400000) + 1);
}

function getCommitmentAppMeta(card, versions = {}) {
  const explicitName = card?.appName ?? card?.app_name ?? card?.appLabel ?? card?.app_label ?? null;
  if (explicitName) {
    return {
      name: explicitName,
      iconUrl: card?.appIconUrl ?? card?.app_icon_url ?? card?.appIcon ?? card?.app_icon ?? "",
    };
  }

  const launcherId = card?.launcherContext ?? card?.targetApp ?? card?.appId ?? card?.app_id ?? null;
  if (!launcherId || !isKnownLauncher(launcherId)) return null;
  const version = versions[launcherId] ?? getLauncherConfig(launcherId);
  if (!version) return null;
  return {
    name: version.realAppLabel || version.displayName || version.name || launcherId,
    iconUrl: resolveLauncherIconSrc(version),
  };
}

function buildHomeState({ cards = [], events = [], timezone, homeScreenVersions = {} }) {
  const now = new Date();
  const todayKey = getTodayKey(now, timezone);
  const normalized = normalizeCards(cards, now, timezone);
  const personalCardsTotal = normalized.filter((card) =>
    !card.sourcePackId && !card.deletedAt && !isCommitmentCard(card)
  );
  const personalCardsToday = personalCardsTotal.filter((card) => {
    if (card.sourcePackId || card.deletedAt || isCommitmentCard(card)) return false;
    return isCardDoneToday(card, todayKey) || card.statusToday === "pending" || isEligible(card, now, timezone);
  });
  const completedPersonalCardsToday = Math.min(
    personalCardsToday.filter((card) => isCardDoneToday(card, todayKey)).length,
    personalCardsTotal.length,
  );
  const nextIncompletePersonalCard = personalCardsToday.find((card) => !isCardDoneToday(card, todayKey)) ?? null;
  const liveCommitments = normalized
    .filter((card) =>
      isCommitmentCard(card) &&
      !card.deletedAt &&
      !card.paused &&
      !card.disliked &&
      card.commitmentStatusToday === "made" &&
      card.commitmentDecisionDate === todayKey &&
      card.commitmentLifecycleStatus !== "closed_early" &&
      card.commitmentLifecycleStatus !== "reviewed"
    )
    .sort((left, right) => new Date(right.commitmentDecisionAt ?? right.updatedAt ?? 0).getTime() - new Date(left.commitmentDecisionAt ?? left.updatedAt ?? 0).getTime());
  const activeCommitment = liveCommitments[0] ?? null;
  const hasCompletedCommitmentToday = !activeCommitment && normalized.some((card) =>
    isCommitmentCard(card) &&
    !card.deletedAt &&
    card.commitmentDecisionDate === todayKey &&
    Boolean(card.commitmentStatusToday)
  );
  const activeCommitmentApp = getCommitmentAppMeta(activeCommitment, homeScreenVersions);
  const checkInComplete = activeCommitment?.commitmentCheckInResponseDate === todayKey;
  const hasCheckIn = Boolean(activeCommitment?.commitmentCheckInEnabled);

  return {
    usageDays: getUsageDays(normalized, events),
    completedPersonalCardsToday,
    totalPersonalCardsToday: personalCardsTotal.length,
    nextIncompletePersonalCard,
    liveCommitmentCount: liveCommitments.length,
    hasCompletedCommitmentToday,
    activeCommitment: activeCommitment
      ? {
          id: activeCommitment.id,
          title: activeCommitment.promptText || activeCommitment.dashboardTitle || "Untitled commitment",
          appName: activeCommitmentApp?.name ?? "",
          appIconUrl: activeCommitmentApp?.iconUrl ?? "",
          progressPercentage: hasCheckIn ? (checkInComplete ? 100 : 50) : null,
          metadataText: hasCheckIn
            ? checkInComplete
              ? "Check-in complete"
              : activeCommitment.commitmentCheckInTime
                ? `Check-in at ${activeCommitment.commitmentCheckInTime}`
                : "Check-in set"
            : "",
        }
      : null,
  };
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
  console.log(`[CARD_SELECTION_AUDIT_JSON] ${JSON.stringify(audit)}`);
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
            console.log(`[MERGE] Cloud is newer for ${localItem.id} (${formatTime(cloudTime)} > ${formatTime(localTime)}). Accepting cloud.`);
          } else if (localTime > cloudTime) {
            console.log(`[MERGE] Local is newer for ${localItem.id} (${formatTime(localTime)} > ${formatTime(cloudTime)}). Preserving local.`);
            if (localItem.deletedAt) console.log(`[MERGE] Tombstone preserved for ${localItem.id}`);
            else if (cloudItem.deletedAt) console.log(`[MERGE] Rejecting stale cloud tombstone for ${localItem.id}`);
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

function getHomeCardTitle(card) {
  if (isCommitmentCard(card)) return "Today’s Commitment";
  return card.dashboardTitle ?? card.promptText?.trim() ?? "";
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

function buildRevealOverlay(cardId, versionId = null) {
  return { type: "reveal", cardId, versionId };
}

function buildFakeLauncherOverlayContext(versionId, activationKey = null) {
  return {
    versionId,
    activationKey,
    launchSource: "fake_launcher",
    origin: "intercept",
  };
}

function buildFakeLauncherRevealOverlay(cardId, versionId, activationKey = null) {
  return {
    ...buildRevealOverlay(cardId, versionId),
    ...buildFakeLauncherOverlayContext(versionId, activationKey),
  };
}

function buildFakeLauncherContinueOverlay(versionId, activationKey = null) {
  return {
    type: "continue-to-app",
    ...buildFakeLauncherOverlayContext(versionId, activationKey),
  };
}

function buildFakeLauncherEmptyOverlay(versionId, activationKey = null) {
  return {
    ...buildEmptyOverlay(versionId),
    ...buildFakeLauncherOverlayContext(versionId, activationKey),
  };
}

function buildFakeLauncherPreparingOverlay(versionId) {
  return {
    type: "launcher-preparing",
    ...buildFakeLauncherOverlayContext(versionId, `preparing:${versionId}`),
  };
}

const LAUNCH_SESSION_STORAGE_KEY = "mybishbash.launch-session.v1";

const LAUNCH_ENTRY_SURFACES = new Set(["fake_launcher", "mybishbash_home", "unknown"]);
const LAUNCH_PRIMARY_ACTIONS = {
  CONTINUE_TO_APP: "continue_to_app",
  BACK_TO_HOME: "back_to_home",
};
const IN_APP_SHORTCUT_SOURCES = new Set([
  "apps_protected_launch",
  "home_fake_launcher_bar",
  "overlay_fake_launcher",
  "settings_fake_launcher",
]);
const INSTALLED_FAKE_LAUNCHER_ENTRY_SOURCES = new Set([
  "route",
  "home_screen_resume",
  "standalone_home_recovery",
]);

function normalizeLaunchSession(source = {}) {
  const entrySurface = LAUNCH_ENTRY_SURFACES.has(source.entrySurface) ? source.entrySurface : "unknown";
  const launcherId = isKnownLauncher(source.launcherId) ? source.launcherId : null;

  if (entrySurface === "fake_launcher" && launcherId) {
    return {
      entrySurface,
      launcherId,
      allowBackHome: false,
      allowedDestinationIds: [launcherId],
      primaryAction: LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP,
      startedAt: source.startedAt ?? new Date().toISOString(),
    };
  }

  if (entrySurface === "mybishbash_home") {
    return {
      entrySurface,
      launcherId: null,
      allowBackHome: true,
      allowedDestinationIds: getAllLauncherIds(),
      primaryAction: LAUNCH_PRIMARY_ACTIONS.BACK_TO_HOME,
      startedAt: source.startedAt ?? new Date().toISOString(),
    };
  }

  return {
    entrySurface: "unknown",
    launcherId: null,
    allowBackHome: false,
    allowedDestinationIds: [],
    primaryAction: LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP,
    startedAt: source.startedAt ?? new Date().toISOString(),
  };
}

function buildLaunchSession(entrySurface, launcherId = null) {
  return normalizeLaunchSession({ entrySurface, launcherId });
}

function persistLaunchSession(session) {
  if (typeof window === "undefined" || !session) return;
  try {
    window.localStorage.setItem(LAUNCH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Local storage can be unavailable in private or embedded contexts.
  }
}

function loadActiveProtectedAppContext() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_PROTECTED_APP_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const launcherId = isKnownLauncher(parsed?.launcherId) ? parsed.launcherId : null;
    const updatedAt = Number(parsed?.updatedAt ?? 0);
    if (!launcherId || !Number.isFinite(updatedAt)) return null;
    if (Date.now() - updatedAt > ACTIVE_PROTECTED_APP_CONTEXT_TTL_MS) {
      window.sessionStorage.removeItem(ACTIVE_PROTECTED_APP_CONTEXT_KEY);
      return null;
    }
    return { launcherId, updatedAt };
  } catch {
    return null;
  }
}

function persistActiveProtectedAppContext(launcherId) {
  if (typeof window === "undefined" || !isKnownLauncher(launcherId)) return null;
  const nextContext = { launcherId, updatedAt: Date.now() };
  try {
    window.sessionStorage.setItem(ACTIVE_PROTECTED_APP_CONTEXT_KEY, JSON.stringify(nextContext));
  } catch {
    // Session storage can be unavailable in private or embedded contexts.
  }
  return nextContext;
}

function buildLaunchSessionForRoute(route) {
  if (route?.kind === "intercept" && isKnownLauncher(route.versionId)) {
    return buildLaunchSession("fake_launcher", route.versionId);
  }
  return buildLaunchSession("mybishbash_home");
}

function getLaunchSessionForOverlay(launchSession, overlay) {
  if (overlay?.launchSource === "fake_launcher" && isKnownLauncher(overlay.versionId)) {
    return normalizeLaunchSession({
      ...launchSession,
      entrySurface: "fake_launcher",
      launcherId: overlay.versionId,
    });
  }
  return normalizeLaunchSession(launchSession);
}

function isFakeLauncherSession(launchSession) {
  return launchSession?.entrySurface === "fake_launcher";
}

function isInAppShortcutClick(source) {
  return IN_APP_SHORTCUT_SOURCES.has(source);
}

function isInstalledFakeLauncherEntry(source) {
  return INSTALLED_FAKE_LAUNCHER_ENTRY_SOURCES.has(source);
}

function getVisibleDestinationChips(launchSession, versions) {
  const normalizedSession = normalizeLaunchSession(launchSession);
  if (normalizedSession.entrySurface !== "fake_launcher") return [];
  const byId = new Map((versions ?? []).map((version) => [version.id, version]));
  return normalizedSession.allowedDestinationIds
    .map((destinationId) => byId.get(destinationId))
    .filter((version) => Boolean(version?.realAppLabel));
}

function getLauncherCardActions({ launchSession, cardType }) {
  const normalizedSession = normalizeLaunchSession(launchSession);

  if (cardType === "pack") {
    return {
      actions: [
        { id: "really_like_pack_card", label: "I really like this one", variant: "secondary" },
        {
          id: normalizedSession.primaryAction,
          label: normalizedSession.primaryAction === LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP ? "Continue" : "Back to home",
          variant: "primary",
        },
      ],
    };
  }

  return {
    actions: [
      { id: "done", label: "Done", variant: "primary" },
      { id: "do_now", label: "I’ll do it now", variant: "secondary" },
      { id: "not_done", label: "Not done", variant: "secondary" },
    ],
  };
}

function getCardSelectionSurfaceForOverlay(overlay) {
  if (overlay?.launchSource === "fake_launcher" || overlay?.versionId) return CARD_SELECTION_SURFACES.SHELL;
  return CARD_SELECTION_SURFACES.HOME;
}

function getActiveFakeLauncherReturnContext(route, overlay, interceptActivation, installedShellId = null) {
  const isInterceptRoute = route?.kind === "intercept";
  const isFakeLauncherOverlay = overlay?.launchSource === "fake_launcher" || !!overlay?.versionId;
  const isStandaloneShell = !!installedShellId;

  if (!isInterceptRoute && !isFakeLauncherOverlay && !isStandaloneShell) {
    return null;
  }

  const versionId =
    route?.versionId ||
    overlay?.versionId ||
    interceptActivation?.versionId ||
    installedShellId ||
    null;

  const activationKey =
    overlay?.activationKey ||
    interceptActivation?.activationKey ||
    null;

  if (!versionId) return null;

  return {
    versionId,
    activationKey,
    launchSource: "fake_launcher",
  };
}

function buildEmptyOverlay(versionId = null) {
  return { type: "empty", versionId };
}

function buildActionCardOverlay(versionId = null) {
  return { type: "action-card", versionId };
}

function buildActionCardEmptyOverlay(versionId = null) {
  return { type: "action-card-empty", versionId };
}

function buildActionSuccessOverlay(versionId = null) {
  return { type: "action-success", versionId };
}

function buildFlowConfirmationOverlay(versionId = null, message = "Thanks for the update.", activationKey = null, actionLabel = "Continue") {
  return {
    type: "flow-confirmation",
    versionId,
    message,
    actionLabel,
    ...(versionId ? buildFakeLauncherOverlayContext(versionId, activationKey) : {}),
  };
}

function buildCommitmentMotivationOverlay(cardId, versionId = null, activationKey = null) {
  return {
    type: "commitment-motivation",
    cardId,
    versionId,
    ...(versionId ? buildFakeLauncherOverlayContext(versionId, activationKey) : {}),
  };
}

function stripCommitmentPrefix(value = "") {
  return String(value ?? "").trim().replace(/^I\s+will\b[\s:,-]*/i, "").trim();
}

function getCommitmentAcknowledgementMessage({ committed, checkInEnabled }) {
  if (!committed) return "That’s okay.\nAnother day.";
  return checkInEnabled
    ? "Nice choice.\nWe’ll check in later."
    : "Nice choice.\nKeep this in mind today.";
}

function getCommitmentCheckInOutcomeMessage(response) {
  if (response === "on_track") return "Good.\nKeep going.";
  if (response === "somewhat_on_track") return null;
  return "That’s okay.\nWe’ll leave this for another day.";
}

function getCommitmentReviewOutcomeMessage(response) {
  if (response === "did_it") return "You did it.\nHold onto that.";
  if (response === "nearly_did_it") return "That still counts.\nYou stayed close to it.";
  return "That’s okay.\nYou can try again another time.";
}

const ONBOARDING_COMMITMENT_DEMO_CARD = {
  id: "onboarding-commitment-demo",
  cardKind: "commitment",
  promptText: "I will go to the gym today.",
  dashboardTitle: "Today’s Commitment",
  commitmentReason: "I feel so good after a great workout at the gym.",
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

function shouldStartDemoOnboarding() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demoOnboarding") === "1") return true;
  const routeParam = params.get("route");
  const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
  return normalizeRoutePath(rawPath) === "/demo-onboarding";
}

function shouldStartDemoSignup() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demoSignup") === "1") return true;
  const routeParam = params.get("route");
  const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
  return normalizeRoutePath(rawPath) === "/demo-signup";
}

function resetDemoSignupState() {
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

function resetDemoOnboardingState() {
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

function App() {
  if (typeof window !== "undefined") {
    if (shouldStartDemoOnboarding()) {
      resetDemoOnboardingState();
      window.history.replaceState({}, "", `${BASE_PATH}/onboarding`);
    } else if (shouldStartDemoSignup()) {
      resetDemoSignupState();
      window.history.replaceState({}, "", `${BASE_PATH}/home?signup=1`);
    }

    const params = new URLSearchParams(window.location.search);
    const routeParam = params.get("route");
    const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
    const normalizedPath = normalizeRoutePath(rawPath);
    const hasAppRouteParam = params.has("route");
    const isStandaloneMode = isStandaloneDisplayMode();

    if (normalizedPath === "/early-access") {
      return <EarlyAccessPage />;
    }

    if (normalizedPath === "/download" || normalizedPath === "/invite") {
      return <DownloadPage />;
    }

    if (normalizedPath === "/about") {
      return <AboutPage />;
    }

    if (normalizedPath === "/terms" || normalizedPath === "/privacy") {
      const isTerms = normalizedPath === "/terms";
      return (
        <LegalPage 
          title={isTerms ? "Terms of Use" : "Privacy Policy"} 
          docUrl={`${BASE_PATH}/${isTerms ? "terms-of-use.md" : "privacy-policy.md"}`} 
        />
      );
    }

    if (!hasAppRouteParam && !isStandaloneMode && (normalizedPath === "/" || normalizedPath === "/index.html")) {
      return <EditableLandingPage />;
    }
  }

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
  const [notificationSettings, setNotificationSettings] = useState(initialState.notificationSettings);
  const [notificationStatus, setNotificationStatus] = useState(() => getNotificationPermission());
  const [setupComplete, setSetupComplete] = useState(initialState.setupComplete);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncError, setSyncError] = useState("");
  // Start optimistically online — we only flip to true when the browser fires
  // an explicit 'offline' event. This avoids false positives from unreliable
  // navigator.onLine values in test / sandboxed environments.
  const [isOffline, setIsOffline] = useState(false);
  const [timingWindowsPrefs, setTimingWindowsPrefs] = useState(
    initialState.timingWindowsPrefs,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [testerStatus, setTesterStatus] = useState(() => {
    const e2eTesterMode = e2eMode && typeof window !== "undefined" && window.localStorage.getItem(E2E_TESTER_MODE_KEY) === "true";
    return e2eMode ? { is_tester: e2eTesterMode } : null;
  });
  const [testerReportsRefreshKey, setTesterReportsRefreshKey] = useState(0);
  const [globalPacks, setGlobalPacks] = useState([]);
  // Own access profile for capability checks (premium pack gating). null =
  // unknown/unavailable, which getCapabilities treats as the free tier, so
  // premium installs fail closed.
  const [accessProfile, setAccessProfile] = useState(() => e2eMode ? loadE2EAccessProfile() : null);
  const [accessStatus, setAccessStatus] = useState(e2eMode ? "granted" : "unknown");
  const [appUpdate, setAppUpdate] = useState({ checking: true, updateAvailable: false });
  const [appPauseRevision, setAppPauseRevision] = useState(0);
  const [routePath, setRoutePath] = useState(() => getRouteFromLocation(initialState.setupComplete));
  const initialRoute = useMemo(() => parseRoute(routePath), []);
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
  const route = useMemo(() => parseRoute(routePath), [routePath]);

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

  const activeTab = route.tab ?? "home";
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

      // Normal MyBishBash app — HQ availability decides which launchers a
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
      const pauseExpiry = getAppPauseExpiry(version.id);
      const paused = isAppPaused(version.id);
      return {
        version,
        configured: hasUserSetup,
        protectedOn: explicitBehavior.appEnabled === true || explicitBehavior.useInterruptionPack === true,
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
  const pendingOnboardingShortcuts = useMemo(() => {
    const apps = Array.isArray(profile.onboardingShortcutSetup?.apps) ? profile.onboardingShortcutSetup.apps : [];
    return apps
      .filter((app) => !["marked_added", "tested"].includes(app.status))
      .map((app) => {
        const version = homeScreenVersions[app.id] ?? DEFAULT_HOME_SCREEN_VERSIONS[app.id] ?? getLauncherConfig(app.id);
        return {
          ...app,
          label: app.label ?? version?.realAppLabel ?? version?.name ?? version?.displayName ?? app.id,
          iconSrc: app.iconSrc ?? (version ? resolveLauncherIconSrc(version) : ""),
        };
      });
  }, [homeScreenVersions, profile.onboardingShortcutSetup]);
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
        label: "Add MyBishBash to your Home Screen",
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
    if (!profile.hasCompletedProtectedAppSetup || !profile.selectedProtectedApp) {
      items.push({
        id: "protected-app",
        label: "Choose your first app",
        action: "apps",
      });
    }
    return items;
  }, [
    cards,
    profile.hasCompletedHomeScreenInstall,
    profile.hasCompletedProtectedAppSetup,
    profile.selectedProtectedApp,
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
  const isAppTabRoute = ["home", "library", "log", "explore", "apps", "settings"].includes(route.kind);
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
    if (testerStatus?.is_tester !== true) return null;
    const installedLauncherId = getInstalledLauncherShellId();
    if (!installedLauncherId || installedLauncherId === NORMAL_LAUNCHER_CONTEXT) return null;
    return installedLauncherId;
  }

  function isFakeLauncherShellContext() {
    return Boolean(getFakeLauncherShellContextId());
  }

  function buildRevealOverlayForCurrentShell(cardId) {
    const fakeContext = getActiveFakeLauncherReturnContext(route, overlay, interceptActivationRef.current, getFakeLauncherShellContextId());
    const installedLauncherId = getFakeLauncherShellContextId() || fakeContext?.versionId;
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

  useEffect(() => {
    let mounted = true;
    let authSessionForTiming = null;

    if (e2eMode) {
      setSession(buildE2ESession());
      setSyncStatus("ready");
      recordLaunchTiming("sync ready", { source: "e2e" }, { is_tester: true });
      setSyncError("");
      setAuthReady(true);
      recordLaunchTiming("auth ready", { source: "e2e" }, { is_tester: true });
      setShouldLaunchOverlay(false);
      return undefined;
    }

    async function resolveSessionWithRetry() {
      let lastError = null;
      for (let attempt = 0; attempt <= AUTH_SESSION_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          return await getSession();
        } catch (error) {
          lastError = error;
          const delay = AUTH_SESSION_RETRY_DELAYS_MS[attempt];
          if (delay === undefined) break;
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
      }
      throw lastError;
    }

    resolveSessionWithRetry()
      .then((currentSession) => {
        console.log("[AUTH] Session check complete. Found:", !!currentSession);
        if (currentSession?.user?.email) console.log("[AUTH] Email:", currentSession.user.email);
        if (typeof window !== "undefined") console.log("[AUTH] Storage key present:", !!window.localStorage.getItem("mybishbash.supabase.auth.v1"));

        if (mounted) {
          authSessionForTiming = currentSession;
          setSession(currentSession);
          if (!currentSession) setSyncStatus("needs-connection");
        }
      })
      .catch((error) => {
        console.warn("[AUTH] Session check failed after retries", error);
        if (mounted) {
          setSyncError(getSyncErrorMessage(error, "Still checking your MyBishBash login. Please try again in a moment."));
          setSyncStatus("error");
        }
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
        if (mounted) recordLaunchTiming("auth ready", { sessionPresent: Boolean(authSessionForTiming?.user?.id) }, testerStatus);
      });

    const { data: { subscription } } = onAuthStateChange((event, newSession) => {
      if (mounted) {
        setSession((currentSession) => {
          if (newSession) return newSession;
          if (event === "SIGNED_OUT") return null;
          return currentSession;
        });
        if (newSession) {
          setSyncError("");
        } else if (event === "SIGNED_OUT") {
          setSyncStatus("needs-connection");
        }
        setAuthReady(true);
        recordLaunchTiming("auth ready", { sessionPresent: Boolean(newSession?.user?.id), event }, testerStatus);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [e2eMode]);

  useEffect(() => {
    if (e2eMode) {
      setIsAdmin(false);
      return;
    }
    if (session?.user?.id) {
      if (session.user.email && HQ_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
        setIsAdmin(true);
        return;
      }
      checkIsAdmin(session.user.id).then(setIsAdmin).catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
    }
  }, [e2eMode, session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (e2eMode) {
      const e2eTesterMode = typeof window !== "undefined" && window.localStorage.getItem(E2E_TESTER_MODE_KEY) === "true";
      setTesterStatus({ is_tester: e2eTesterMode });
      recordLaunchTiming("tester status ready", { source: "e2e", isTester: e2eTesterMode }, { is_tester: e2eTesterMode });
      return undefined;
    }
    if (!session?.user?.id) {
      setTesterStatus({ is_tester: false });
      recordLaunchTiming("tester status ready", { sessionPresent: false, isTester: false }, { is_tester: false });
      return undefined;
    }

    let cancelled = false;
    setTesterStatus(null);
    fetchTesterStatus(session.user.id)
      .then((status) => {
        if (!cancelled) {
          const nextStatus = status ?? { is_tester: false };
          setTesterStatus(nextStatus);
          recordLaunchTiming("tester status ready", { sessionPresent: true, isTester: nextStatus.is_tester === true }, nextStatus);
        }
      })
      .catch((error) => {
        console.warn("Could not load tester status", error);
        if (!cancelled) {
          setTesterStatus({ is_tester: false });
          recordLaunchTiming("tester status ready", { sessionPresent: true, isTester: false, error: true }, { is_tester: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [e2eMode, session?.user?.id]);

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

  useEffect(() => {
    if (!authReady || e2eMode || !session?.user?.id) {
      setAccessProfile(e2eMode ? loadE2EAccessProfile() : null);
      setAccessStatus(e2eMode ? "granted" : session?.user?.id ? "unknown" : "signed-out");
      return undefined;
    }
    let cancelled = false;
    setAccessStatus("loading");
    fetchOwnAccessProfile(session.user.id).then((profileRow) => {
      if (!cancelled) {
        setAccessProfile(profileRow);
        setAccessStatus(!profileRow || isAccessActive(profileRow) ? "granted" : "denied");
      }
    }).catch((error) => {
      console.warn("Could not load access profile; preserving signed-in session", error);
      if (!cancelled) {
        setAccessProfile(null);
        setAccessStatus("granted");
      }
    });
    return () => {
      cancelled = true;
    };
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
  // pause bypass re-fires correctly when the user switches back to MyBishBash
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

  useEffect(() => {
    let cancelled = false;

    checkForAppUpdate(BASE_PATH || "/mybishbash").then((result) => {
      if (!cancelled) setAppUpdate({ ...result, checking: false });
    });

    const interval = window.setInterval(() => {
      checkForAppUpdate(BASE_PATH || "/mybishbash").then((result) => {
        if (!cancelled && result.updateAvailable) setAppUpdate({ ...result, checking: false });
      });
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const refreshAppShell = useCallback(() => {
    refreshMyBishBashAppShell(BASE_PATH || "/mybishbash");
  }, []);

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
        setSyncError(getSyncErrorMessage(error, "Could not load your MyBishBash profile."));
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
          console.warn("Could not save MyBishBash shared state", error);
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
          console.warn("Could not periodically sync MyBishBash profile", error);
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

  useEffect(() => {
    saveMood(mood);

    // Map your exact MyBishBash background hex colors here
    const themeColors = {
      "Minimal": "#F6EBCF",
      "Pop Art": "#F4A261",
      "Soft Bloom": "#FAD2E1",
      "Rainbow": "#E2ECE9",
      "Starry Sky": "#1B263B",
    };
    const activeThemeBackground = themeColors[mood] || "#F6EBCF";

    document.documentElement.style.setProperty("--app-bg", activeThemeBackground);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", activeThemeBackground);
    }
  }, [mood]);

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
      console.log("[ACTION CARDS] No visible action cards; switching to empty fallback.");
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

      console.log("[INTERCEPT] Launcher event", payload);
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
    const selectableSelectionCards = [
      ...normalizedSelectionCards,
      ...buildEligibleCommitmentLifecycleCards(normalizedSelectionCards, selectionNow, profile.timezone),
    ];
    const fallbackDisplay = selectEligibleCard({
      cards: selectableSelectionCards,
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

  useEffect(() => {
    function handleOnline() {
      console.log("[NETWORK] App is online. Processing offline event queue...");
      setIsOffline(false);
      void processEventQueue();
    }
    function handleOffline() {
      console.log("[NETWORK] App is offline.");
      setIsOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
      console.log("[NOTIFICATIONS] Opened with deliveryId:", deliveryId);
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
          console.log("[LAUNCHER] App paused — bypassing card flow", { versionId: route.versionId });
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
      const selectableHomeCards = [
        ...normalizedHomeCards,
        ...buildEligibleCommitmentLifecycleCards(normalizedHomeCards, homeNow, profile.timezone),
      ];
      const homeDecision = selectEligibleCard({
        cards: selectableHomeCards,
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
    const url = `${BASE_PATH}${normalized === "/" ? "" : normalized}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoutePath(normalized);
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
      debugLaunch("[INTERCEPT] Opening fallback MyBishBash card", { versionId, source, cardId: selected.id });
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
      setOverlay(buildFlowConfirmationOverlay(shellLauncherId, "That app isn't available from this shortcut.", null, "OK"));
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
      console.log("[LAUNCHER] opening destination", { versionId, href, source, reason });
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
    console.log("[ACTION_CARD] opening external URL", { source, cardId });
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
      console.log("[LAUNCHER] App paused — bypassing card flow from shortcut", { versionId, source });
      void logLauncherEvent("fake_launcher_pause_bypass_used", versionId, {
        launched_from: source,
        pause_expiry: getAppPauseExpiry(versionId),
      });
      openDestinationApp(versionId, { source, reason: "fake_launcher_icon_clicked" });
      return;
    }

    // No active pause → navigate into the MyBishBash intervention flow.
    // The routing useEffect will select a card (or show the caught-up empty screen).
    // The pause button is shown on cards launched from this path.
    console.log("[LAUNCHER] No active pause — entering card flow", { versionId, source });
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
    console.log("[LAUNCHER] App paused by user", { appId, durationMinutes, expiry });
    setAppPauseRevision((current) => current + 1);
    openDestinationApp(appId, { source: "app_pause_selected", reason: "user_paused" });
  }

  function handleSetAppPause(appId, durationMinutes) {
    const expiry = pauseApp(appId, durationMinutes);
    console.log("[LAUNCHER] App paused from Apps", { appId, durationMinutes, expiry });
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

      console.log("[NOTIFICATIONS] Saving notification preferences", nextSettings);
      await saveNotificationPreferences(session.user.id, {
        enabled: Boolean(nextSettings.enabled),
        notifications_per_day: Number(nextSettings.notificationsPerDay) || 3,
        timezone: profile.timezone,
      });
    },
    [profile.timezone, session?.user?.id],
  );

  const enableNotifications = useCallback(async () => {
    console.log("[NOTIFICATIONS] Enable requested");

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
    console.log("[NOTIFICATIONS] Permission result", permission);

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
      console.log("[NOTIFICATIONS] Push subscription saved");
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
    console.log("[NOTIFICATIONS] Disabled");
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
        selected_personal_cards: onboardingCardsToCreate.length,
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
    console.log("[CARD_ORIGIN] home interruption preview created", nextOverlay);
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
    setLauncherBehaviorSettings(loadLauncherBehaviorSettings());
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
    const confirmed = window.confirm("Clear all MyBishBash data from this device? This will remove your cards, packs, settings and local history. This cannot be undone. Your cloud account is not deleted.");
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
        console.log("[SIGNUP_SUCCESS_SESSION_RETURNED]", createdSession?.user?.id);
        setSession(createdSession);
        setAuthReady(true);
      } else {
        console.log("[SIGNUP_SUCCESS_NO_SESSION]");
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
        console.log("[LOGIN_SUCCESS_SESSION_RETURNED]", nextSession?.user?.id);
        setSession(nextSession);
        setAuthReady(true);
        signupOnboardingPendingRef.current = false;
        setSignupOnboardingPending(false);
      } else {
        console.log("[LOGIN_SUCCESS_NO_SESSION]");
        setSyncStatus("needs-connection");
        setSyncError("Login succeeded, but MyBishBash could not start your session. Please close and reopen the app.");
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
    const confirmed = window.confirm("Log out of this MyBishBash profile?");
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

  async function handleRefreshSession() {
    console.log("[AUTH] Refreshing session manually...");
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
    console.log("[CARD_ORIGIN] custom pack preview created", nextOverlay);
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
  const canUsePremiumContent = useMemo(
    () => getCapabilities(accessProfile ?? {}).has(CAPABILITIES.CAN_USE_PREMIUM_CONTENT),
    [accessProfile],
  );
  const canUseMultipleApps = useMemo(
    () => getCapabilities(accessProfile ?? {}).has(CAPABILITIES.CAN_USE_MULTIPLE_APPS),
    [accessProfile],
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
        onClearError={() => setSyncError("")}
      />
    );
  }

  if (session && !e2eMode && !isFakeLauncherFlow && (accessStatus === "loading" || accessStatus === "unknown")) {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (session && !e2eMode && !isFakeLauncherFlow && accessStatus === "denied") {
    return (
      <SyncConnectionScreen
        mode="access-denied"
        error={syncError || "This account does not have beta access yet."}
        onSignUp={handleSignUp}
        onLogIn={handleLogIn}
        onPasswordReset={handlePasswordReset}
        onClearError={() => setSyncError("")}
      />
    );
  }

  // Skip the sync loading screen when the user is offline but already has local
  // cards — show the cached experience instead of a spinner.
  if (session && syncStatus === "loading" && !isFakeLauncherFlow && !(isOffline && hasLocalCards)) {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (screen === "hq") {
    return (
      <Suspense fallback={<SyncConnectionScreen mode="loading" error={syncError} />}>
        <HQPanel
          isAdmin={isAdmin}
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
  const isShellAppSettingsRoute =
    activeTab === "apps" &&
    route.versionId &&
    route.versionId === shellSettingsVersionId &&
    isKnownLauncher(route.versionId);

  return (
    <TestPilotProvider
      config={TESTPILOT_CONFIG}
      session={session}
      testerStatus={testerStatus}
      diagnosticsContext={testPilotDiagnosticsContext}
      getDisplayMode={getAppDisplayMode}
    >
      <div className="grain" />
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
                <HomePanel
                  cards={cards}
                  events={events}
                  timezone={profile.timezone}
                  homeScreenVersions={homeScreenVersions}
                  pendingOnboardingShortcuts={pendingOnboardingShortcuts}
                  activationChecklistItems={activationChecklistItems}
                  saveConfirmation={homeSaveConfirmation}
                  onCreate={openCardComposerFromCurrentRoute}
                  onOpenDownload={() => {
                    window.location.href = `${BASE_PATH}/download`;
                  }}
                  onOpenApps={() => navigateTo("/apps")}
                  onOpenTodayCards={() => {
                    signalHomeSpotlightAction("today-cards");
                    setLibraryFocusMode("today-personal");
                    navigateTo("/library");
                  }}
                  onOpenCard={openSpecificReveal}
                />
              ) : null}

              {activeTab === "apps" ? (
                <AppsPanel
                  protectedAppStatuses={protectedAppStatuses}
                  onSaveVersionBehavior={handleSaveVersionBehavior}
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
                    window.location.href = `${BASE_PATH}/invite`;
                  }}
                  onClaimAccessCode={handleClaimInAppAccessCode}
                  onOpenInstallGuide={() => {
                    window.location.href = `${BASE_PATH}/download`;
                  }}
                  onPauseApp={handleSetAppPause}
                  onClearAppPause={handleClearAppPause}
                  onLogLauncherEvent={logLauncherEvent}
                  selectedVersionId={route.versionId}
                  appPauseRevision={appPauseRevision}
                  pendingOnboardingShortcuts={pendingOnboardingShortcuts}
                  isTester={testerStatus?.is_tester === true}
                  isShellContext={isShellAppSettingsRoute}
                  canUseMultipleApps={canUseMultipleApps}
                  onOpenMyBishBash={() => {
                    setShellSettingsVersionId(null);
                    setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
                    navigateTo("/home");
                  }}
                />
              ) : null}

              {activeTab === "library" ? (
                libraryFocusMode === "today-personal" ? (
                  <TodayPersonalCardsPanel
                    todayPersonalLibrary={todayPersonalLibrary}
                    onCreatePersonal={() => openCardComposerFromCurrentRoute("personal")}
                    onBackToLibrary={() => setLibraryFocusMode(null)}
                    onOpenCard={openSpecificReveal}
                  />
                ) : (
                  <StandardLibraryPanel
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
                <LogPanel
                  events={logEventsForPanel}
                  allEvents={events}
                  timezone={profile.timezone}
                  weeklyShiftCount={getWeeklyShiftCount(events)}
                  filter={logFilter}
                  onShowSummary={showMorningSummaryNow}
                />
              ) : null}

              {activeTab === "explore" ? (
                <ExplorePanel
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
              {activeTab === "settings" ? (
                <SettingsPanel
                  mood={mood}
                  onSelectMood={setMood}
                  homeScreenVersions={homeScreenVersions}
                  launcherBehaviorSettings={launcherBehaviorSettings}
                  onUpdateHomeScreenIcon={handleUpdateHomeScreenIcon}
                  onSaveVersionBehavior={handleSaveVersionBehavior}
                  globalInterruptionMode={globalInterruptionMode}
                  onSetGlobalInterruptionMode={handleSetGlobalInterruptionMode}
          session={session}
                  onLogOut={handleLogOut}
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
                  interruptionPacks={interruptionPacks}
                  onOpenInterruptionPack={setSelectedPackDetail}
                  launcherContext={launcherContext}
                  onLogLauncherEvent={logLauncherEvent}
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
            <button type="button" className={`nav-item ${activeTab === "home" ? "active" : ""}`} data-testid="bottom-nav-home" onClick={() => navigateTo("/home")}>
              <HomeGlyph />
              <span>Home</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "library" ? "active" : ""}`} data-testid="bottom-nav-library" onClick={() => {
              signalHomeSpotlightAction("library");
              setLibraryFocusMode(null);
              navigateTo("/library");
            }}>
              <BookGlyph />
              <span>Library</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "log" ? "active" : ""}`} data-testid="bottom-nav-log" onClick={() => {
              signalHomeSpotlightAction("log");
              navigateTo("/log");
            }}>
              <LogGlyph />
              <span>Log</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "explore" ? "active" : ""}`} data-testid="bottom-nav-explore" onClick={() => {
              signalHomeSpotlightAction("explore");
              navigateTo("/explore");
            }}>
              <PacksGlyph />
              <span>Explore</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "apps" ? "active" : ""}`} data-testid="bottom-nav-apps" onClick={() => {
              signalHomeSpotlightAction("apps");
              navigateTo("/apps");
            }}>
              <AppsGlyph />
              <span>Apps</span>
            </button>
          </nav>
          ) : null}
          {shouldShowHomeSpotlightTour ? (
            <HomeSpotlightTour
              actionSignal={homeSpotlightActionSignal}
              locationKey={route.path}
              onComplete={completeHomeSpotlightTour}
              onNavigate={(path) => {
                if (path === "/library") setLibraryFocusMode(null);
                navigateTo(path);
              }}
            />
          ) : null}
        </div>
      ) : null}

      {screen === "onboarding" ? (
        <Onboarding
          onSkip={skipInstagramOnboarding}
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
        <Overlay
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
            console.log("[CARD_ORIGIN] action success created", nextOverlay);
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
            console.log("[INTERCEPT] Choose something else", {
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
              console.log("[ACTION CARDS] Opening empty fallback.");
              const nextOverlay = {
                ...buildActionCardEmptyOverlay(overlay?.versionId),
                origin: overlay?.origin || "home",
                activationKey: overlay?.activationKey,
                launchSource: overlay?.launchSource,
                flowStep: nextStep,
              };
              console.log("[CARD_ORIGIN] action card empty created", nextOverlay);
              setOverlay(nextOverlay);
            } else {
              console.log("[ACTION CARDS] Opening overlay.");
              const nextOverlay = {
                ...buildActionCardOverlay(overlay?.versionId),
                origin: overlay?.origin || "home",
                activationKey: overlay?.activationKey,
                launchSource: overlay?.launchSource,
                flowStep: nextStep,
              };
              console.log("[CARD_ORIGIN] action card created", nextOverlay);
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

function parseBulkCards(text) {
  const lines = text.split(/\r?\n/);
  const cards = [];
  const seen = new Set();

  for (const line of lines) {
    let clean = line.trim();
    if (!clean) continue;

    clean = clean.replace(/^[-•*]\s+/, "");
    clean = clean.replace(/^\d+[.)]\s+/, "");
    clean = clean.trim();

    if (clean && !seen.has(clean)) {
      seen.add(clean);
      cards.push(clean);
    }
  }

  return cards;
}

function Composer({ initialCard, initialKind = "personal", initialDraft = null, onClose, onSave }) {
  const commitmentInputRef = useRef(null);
  const initialCardKind = initialCard ? (isCommitmentCard(initialCard) ? "commitment" : "personal") : initialKind;
  const [cardKind, setCardKind] = useState(initialCardKind);
  const [promptText, setPromptText] = useState(initialCard?.promptText ?? initialDraft?.promptText ?? "");
  const [commitmentReason, setCommitmentReason] = useState(initialCard?.commitmentReason ?? initialDraft?.commitmentReason ?? "");
  const [commitmentTimingMode, setCommitmentTimingMode] = useState(initialCard ? getCommitmentTimingOptionId(initialCard) : initialDraft?.commitmentTimingMode ?? "anytime");
  const [commitmentCustomStartTime, setCommitmentCustomStartTime] = useState(initialCard?.commitmentCustomStartTime ?? initialDraft?.commitmentCustomStartTime ?? "09:00");
  const [commitmentCustomEndTime, setCommitmentCustomEndTime] = useState(initialCard?.commitmentCustomEndTime ?? initialDraft?.commitmentCustomEndTime ?? "17:00");
  const [commitmentCheckInEnabled, setCommitmentCheckInEnabled] = useState(initialCard ? Boolean(initialCard.commitmentCheckInEnabled) : Boolean(initialDraft?.commitmentCheckInEnabled));
  const [commitmentCheckInTime, setCommitmentCheckInTime] = useState(initialCard?.commitmentCheckInTime ?? initialDraft?.commitmentCheckInTime ?? "20:00");
  const [bulkText, setBulkText] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [theme, setTheme] = useState(resolveTheme(initialCard?.theme ?? initialDraft?.theme));
  const [icon, setIcon] = useState(initialCard?.icon ?? initialDraft?.icon ?? "heart");
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);
  const [showValidation, setShowValidation] = useState(false);

  const bulkCardsCount = isBulkMode ? parseBulkCards(bulkText).length : 0;
  const trimmedCommitment = promptText.trim();
  const isCommitmentMode = cardKind === "commitment";
  const commitmentTimingConfig = getCommitmentTimingConfig(commitmentTimingMode);
  const commitmentCustomTimeMissing = commitmentTimingMode === "custom" && (!commitmentCustomStartTime || !commitmentCustomEndTime);
  const commitmentCheckInTimeMissing = commitmentCheckInEnabled && !commitmentCheckInTime;
  const canSaveCommitment = Boolean(trimmedCommitment) && !commitmentCustomTimeMissing && !commitmentCheckInTimeMissing;

  function handleSubmit(event) {
    event.preventDefault();
    if (isCommitmentMode) {
      if (!canSaveCommitment) {
        setShowValidation(true);
        return;
      }
      onSave({
        cardKind: "commitment",
        promptText,
        commitmentReason,
        commitmentTimingMode,
        commitmentCustomStartTime: commitmentTimingMode === "custom" ? commitmentCustomStartTime : "",
        commitmentCustomEndTime: commitmentTimingMode === "custom" ? commitmentCustomEndTime : "",
        commitmentCheckInEnabled,
        commitmentCheckInTime: commitmentCheckInEnabled ? commitmentCheckInTime : "",
        theme,
        icon,
        frequency: "once_daily",
        timingWindows: commitmentTimingConfig.timingWindows,
      });
      return;
    }

    if (isBulkMode) {
      const parsed = parseBulkCards(bulkText);
      if (parsed.length === 0) {
        setShowValidation(true);
        return;
      }
      onSave({ bulkTexts: parsed, theme, icon: "heart", frequency: "once_daily", timingWindows: ["day"] });
    } else {
      const trimmed = promptText.trim();
      if (!trimmed) {
        setShowValidation(true);
        return;
      }

      onSave({ promptText: trimmed, theme, icon, frequency, timingWindows });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer" data-testid="card-composer" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">{initialCard ? "Edit your MyBishBash" : "Make a MyBishBash"}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        {!initialCard ? (
          <div className="field" style={{ marginBottom: "24px" }}>
            <div className="frequency-grid">
              <button
                type="button"
                className={`frequency-option ${cardKind === "personal" ? "selected" : ""}`}
                onClick={() => {
                  setCardKind("personal");
                  setIsBulkMode(false);
                }}
              >
                Personal Card
              </button>
              <button
                type="button"
                className={`frequency-option ${cardKind === "commitment" ? "selected" : ""}`}
                onClick={() => {
                  setCardKind("commitment");
                  setIsBulkMode(false);
                }}
              >
                Commitment Card
              </button>
            </div>
          </div>
        ) : null}
        {!initialCard && !isCommitmentMode ? (
          <div className="field" style={{ marginBottom: "24px" }}>
            <div className="frequency-grid">
              <button
                type="button"
                className={`frequency-option ${!isBulkMode ? "selected" : ""}`}
                onClick={() => setIsBulkMode(false)}
              >
                Single card
              </button>
              <button
                type="button"
                className={`frequency-option ${isBulkMode ? "selected" : ""}`}
                onClick={() => setIsBulkMode(true)}
              >
                Multiple cards
              </button>
            </div>
          </div>
        ) : null}
        {isCommitmentMode ? (
          <>
            <label className="field">
              <span>What are you committing to?</span>
              <textarea
                data-testid="commitment-text-input"
                ref={commitmentInputRef}
                value={promptText}
                onChange={(event) => {
                  setPromptText(event.target.value);
                  if (showValidation && event.target.value.trim()) {
                    setShowValidation(false);
                  }
                }}
                placeholder="not have a cigarette today"
                rows={4}
              />
              <span className="field-hint">Write something that makes sense after “I will...”</span>
              <span className="field-hint">Examples: not have a cigarette today · not eat snacks after dinner · avoid cheese · read my Bible · go for a walk · be patient with the children</span>
              {showValidation ? (
                <span className="field-hint">
                  {trimmedCommitment ? "Finish the selected timing details before saving." : "Add the exact commitment text before saving."}
                </span>
              ) : null}
            </label>
            <label className="field">
              <span>Why is this important?</span>
              <textarea
                data-testid="commitment-reason-input"
                value={commitmentReason}
                onChange={(event) => setCommitmentReason(event.target.value)}
                placeholder="Write the message you want to see if this feels hard today."
                rows={4}
              />
            </label>
            <label className="field">
              <span>When should this card appear?</span>
              <select
                className="settings-input"
                data-testid="commitment-window-select"
                value={commitmentTimingMode}
                onChange={(event) => setCommitmentTimingMode(event.target.value)}
              >
                {COMMITMENT_TIMING_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {commitmentTimingMode === "custom" ? (
              <div className="commitment-custom-time-grid">
                <label className="field">
                  <span>Start time</span>
                  <input
                    className="settings-input"
                    data-testid="commitment-start-time-input"
                    type="time"
                    value={commitmentCustomStartTime}
                    onChange={(event) => setCommitmentCustomStartTime(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>End time</span>
                  <input
                    className="settings-input"
                    data-testid="commitment-end-time-input"
                    type="time"
                    value={commitmentCustomEndTime}
                    onChange={(event) => setCommitmentCustomEndTime(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <div className="field">
              <span>Would you like a check-in?</span>
              <div className="frequency-grid" data-testid="commitment-check-in-toggle">
                <button
                  type="button"
                  className={`frequency-option ${!commitmentCheckInEnabled ? "selected" : ""}`}
                  onClick={() => setCommitmentCheckInEnabled(false)}
                >
                  No
                </button>
                <button
                  type="button"
                  className={`frequency-option ${commitmentCheckInEnabled ? "selected" : ""}`}
                  onClick={() => setCommitmentCheckInEnabled(true)}
                >
                  Yes
                </button>
              </div>
            </div>
            {commitmentCheckInEnabled ? (
              <label className="field">
                <span>Check-in time</span>
                <input
                  className="settings-input"
                  data-testid="commitment-check-in-time-input"
                  type="time"
                  value={commitmentCheckInTime}
                  onChange={(event) => setCommitmentCheckInTime(event.target.value)}
                />
              </label>
            ) : null}
            <div className={`composer-preview theme-${getThemeClass(theme)}`} data-testid="commitment-preview">
              <p className="eyebrow">TODAY’S COMMITMENT</p>
              <span className="composer-mini-heart" aria-hidden="true">
                <HeartGlyph />
              </span>
              <div className="composer-preview-copy commitment-preview-copy">
                <p>I will</p>
                <h3>{promptText || "not have a cigarette today"}</h3>
                <div className="commitment-preview-actions">
                  <button type="button" className="premium-action-button premium-action-button-primary" disabled>
                    I will commit to this
                  </button>
                  <button type="button" className="premium-action-button premium-action-button-secondary" disabled>
                    Not this time
                  </button>
                </div>
              </div>
            </div>
            <div className="field" data-testid="commitment-self-check">
              <span>Does this sound right?</span>
              <div className="frequency-grid">
                <button
                  type="submit"
                  className="frequency-option selected"
                  data-testid="save-commitment-card-button"
                  disabled={!canSaveCommitment}
                >
                  Yes, save
                </button>
                <button
                  type="button"
                  className="frequency-option"
                  onClick={() => commitmentInputRef.current?.focus()}
                >
                  Edit commitment
                </button>
              </div>
            </div>
          </>
        ) : isBulkMode ? (
          <>
            <label className="field">
              <span>Paste one card per line</span>
              <textarea
                value={bulkText}
                onChange={(event) => {
                  setBulkText(event.target.value);
                  if (showValidation && event.target.value.trim()) {
                    setShowValidation(false);
                  }
                }}
                placeholder="Drink some water&#10;Go outside for a minute&#10;Stretch your neck"
                rows={8}
              />
              {bulkCardsCount > 0 ? (
                <span className="field-hint">{bulkCardsCount} {bulkCardsCount === 1 ? "card" : "cards"} ready</span>
              ) : showValidation ? (
                <span className="field-hint">Add at least one MyBishBash before saving.</span>
              ) : null}
            </label>
            <button
              type="submit"
              className="save-button"
              disabled={bulkCardsCount === 0}
            >
              Create {bulkCardsCount || "0"} {bulkCardsCount === 1 ? "card" : "cards"}
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>What does future-you need nudging towards?</span>
              <textarea
                data-testid="card-prompt-input"
                value={promptText}
                onChange={(event) => {
                  setPromptText(event.target.value);
                  if (showValidation && event.target.value.trim()) {
                    setShowValidation(false);
                  }
                }}
                placeholder="Have you stretched today? Drink some water. Go outside for a minute."
                rows={5}
              />
              {showValidation ? (
                <span className="field-hint">Add one gentle MyBishBash before saving.</span>
              ) : null}
            </label>
            <div className="field">
              <span>Choose the mood</span>
              <div className="theme-grid">
                {THEMES.map((themeName) => (
                  <button
                    key={themeName}
                    type="button"
                    className={`theme-option ${themeName === theme ? "selected" : ""} theme-${getThemeClass(themeName)}`}
                    onClick={() => setTheme(themeName)}
                  >
                    {themeName}
                  </button>
                ))}
              </div>
            </div>
            <div className={`composer-preview theme-${getThemeClass(theme)}`}>
              <p className="eyebrow">{getGreeting(new Date())}</p>
              <span className="composer-mini-heart" aria-hidden="true">
                <HeartGlyph />
              </span>
              <div className="composer-preview-copy">
                <h3>{promptText.trim() || "Have you stretched today?"}</h3>
                <p>a gentle nudge from your future self</p>
              </div>
              <div className="composer-preview-scene" aria-hidden="true">
                <div className="composer-preview-tile">
                  <CardIcon icon={icon} />
                </div>
                <span className="composer-sparkle composer-sparkle-one" />
                <span className="composer-sparkle composer-sparkle-two" />
                <span className="composer-sun" />
                <span className="composer-horizon" />
              </div>
            </div>
            <div className="field">
              <span>Choose an icon</span>
              <div className="icon-grid">
                {ICON_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`icon-option ${icon === option.id ? "selected" : ""}`}
                    onClick={() => setIcon(option.id)}
                  >
                    <CardIcon icon={option.id} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>How often can this show up?</span>
              <div className="frequency-grid">
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`frequency-option ${frequency === option.id ? "selected" : ""}`}
                    onClick={() => setFrequency(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>When should this MyBishBash appear?</span>
              <div className="timing-grid">
                {TIME_WINDOWS.map((windowOption) => (
                  <label key={windowOption.id} className="timing-option">
                    <input
                      type="checkbox"
                      checked={timingWindows.includes(windowOption.id)}
                      onChange={() => {
                        setTimingWindows((current) => {
                          if (current.includes(windowOption.id)) {
                            const next = current.filter((item) => item !== windowOption.id);
                            return next.length === 0 ? current : next;
                          }
                          return [...current, windowOption.id];
                        });
                      }}
                    />
                    <span>{windowOption.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="save-button"
              data-testid="save-card-button"
            >
              Save MyBishBash
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function Masthead({ onCreate, onNavigate, onLogOut, session, hideCreate = false }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  function handleNavigate(path) {
    setAccountMenuOpen(false);
    onNavigate?.(path);
  }

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    function handlePointerDown(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  return (
    <header className="hero">
      <div className="hero-copy">
        <div className="hero-mark" aria-hidden="true">
          <HeartGlyph />
        </div>
      </div>
      <div className="account-menu-wrap" ref={accountMenuRef}>
      <button
        type="button"
        className="settings-gear-button"
        data-testid="settings-gear"
        onClick={() => setAccountMenuOpen((current) => !current)}
        aria-label="Account menu"
        aria-expanded={accountMenuOpen}
        title="Account"
      >
        <span className="account-avatar-mark" aria-hidden="true">
          <span className="account-avatar-head" />
          <span className="account-avatar-body" />
        </span>
      </button>
      {accountMenuOpen ? (
        <div className="account-menu" data-testid="account-menu">
          <button type="button" onClick={() => handleNavigate("/settings")}>My Account</button>
          <button type="button" onClick={() => handleNavigate("/settings")}>Notifications</button>
          <button type="button" onClick={() => { setAccountMenuOpen(false); window.location.href = `${BASE_PATH}/invite`; }}>Premium</button>
          <button type="button" onClick={() => { setAccountMenuOpen(false); window.location.href = `${BASE_PATH}/about`; }}>Help</button>
          <button type="button" onClick={() => { setAccountMenuOpen(false); onLogOut?.(); }}>Sign Out</button>
          <button type="button" className="account-menu-close" onClick={() => setAccountMenuOpen(false)}>Close</button>
        </div>
      ) : null}
      </div>
      {!hideCreate ? (
        <button
          type="button"
          className="add-button"
          data-testid="create-card-button"
          onClick={onCreate}
          aria-label="Create a MyBishBash"
        >
          +
        </button>
      ) : null}
    </header>
  );
}

const HOME_SPOTLIGHT_STEPS = [
  {
    id: "home",
    path: "/home",
    selector: '[data-testid="home-panel"]',
    title: "Home",
    body: "Home is your daily starting point. Get a quick overview of how well you’re meeting your daily intentions and your Personal Cards: messages from yourself about things you genuinely mean to do, but don’t always remember. This is the heart of MyBishBash.",
    button: "Next",
  },
  {
    id: "library",
    path: "/library",
    selector: '[data-testid="bottom-nav-library"]',
    title: "Library",
    body: "Your Library is where all your cards live. Review, organise and manage the reminders and commitments you’ve chosen for yourself.",
    button: "Next",
  },
  {
    id: "explore",
    path: "/explore",
    selector: '[data-testid="bottom-nav-explore"]',
    title: "Explore",
    body: "Explore helps you discover new cards and packs to support the habits, goals and routines that matter to you.",
    button: "Next",
  },
  {
    id: "apps",
    path: "/apps",
    selector: '[data-testid="bottom-nav-apps"]',
    title: "Apps",
    body: "Choose which apps MyBishBash appears before. A quick reminder at the right moment can help you use your phone more intentionally.",
    button: "Next",
  },
  {
    id: "log",
    path: "/log",
    selector: '[data-testid="bottom-nav-log"]',
    title: "Log",
    body: "Your Log keeps a record of your activity, helping you see the reminders you’ve completed and the commitments you’ve kept over time.",
    button: "Next",
  },
  {
    id: "ready",
    path: "/home",
    selector: '[data-testid="app-shell"]',
    title: "You’re ready",
    body: "You’re ready.",
    button: "Done",
  },
];

function HomeSpotlightTour({ actionSignal, locationKey = "", onComplete, onNavigate }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const visibleSteps = HOME_SPOTLIGHT_STEPS;
  const step = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)] ?? visibleSteps[0];
  const isFinalStep = stepIndex >= visibleSteps.length - 1;

  useLayoutEffect(() => {
    if (!step) return undefined;
    setTargetRect(null);
    const targets = Array.from(document.querySelectorAll(step.selector)).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const target = targets[0];
    if (!target) return undefined;

    const updateRect = () => {
      const rect = target.getBoundingClientRect();
      setTargetRect({
        top: Math.max(8, rect.top - 8),
        left: Math.max(8, rect.left - 8),
        width: Math.min(window.innerWidth - 16, rect.width + 16),
        height: Math.min(window.innerHeight - 16, rect.height + 16),
      });
    };

    targets.forEach((item) => item.classList.add("home-spotlight-target-active"));
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      targets.forEach((item) => {
        item.classList.remove("home-spotlight-target-active");
      });
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [step, visibleSteps.length, locationKey]);

  useEffect(() => {
    if (!actionSignal || !step?.advanceOnTargetClick || actionSignal.id !== step.id) return;
    setStepIndex((current) => Math.min(current + 1, visibleSteps.length - 1));
  }, [actionSignal, step, visibleSteps.length]);

  if (!step) return null;

  function finish() {
    onNavigate?.("/home");
    onComplete?.();
  }

  function next() {
    if (isFinalStep) {
      finish();
      return;
    }
    setStepIndex((current) => {
      const nextIndex = current + 1;
      const nextStep = visibleSteps[nextIndex];
      if (nextStep?.path) onNavigate?.(nextStep.path);
      return nextIndex;
    });
  }

  function previous() {
    setStepIndex((current) => {
      const nextIndex = Math.max(0, current - 1);
      const nextStep = visibleSteps[nextIndex];
      if (nextStep?.path) onNavigate?.(nextStep.path);
      return nextIndex;
    });
  }

  const cardPlacement = targetRect && targetRect.top > 140 && targetRect.top < window.innerHeight / 2 ? "below" : "above";

  return (
    <div className="home-spotlight-tour" data-testid="home-spotlight-tour" role="dialog" aria-modal="true" aria-labelledby="home-spotlight-title">
      <div className="home-spotlight-dim" />
      {targetRect ? (
        <div
          className="home-spotlight-ring"
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
          }}
          aria-hidden="true"
        />
      ) : null}
      <article className={`home-spotlight-card ${cardPlacement}`}>
        <div className="home-spotlight-dots" aria-label={`Step ${stepIndex + 1} of ${visibleSteps.length}`}>
          {visibleSteps.map((item, index) => (
            <span key={item.id} className={index === stepIndex ? "active" : ""} />
          ))}
        </div>
        <h2 id="home-spotlight-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="home-spotlight-actions">
          <button
            type="button"
            className="home-spotlight-back"
            onClick={previous}
            disabled={stepIndex === 0}
            aria-label="Previous spotlight step"
          >
            ←
          </button>
          <button type="button" className="home-spotlight-next" onClick={next}>
            {isFinalStep ? "Done" : step.button}
          </button>
        </div>
        <a
          className="home-spotlight-skip-link"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            finish();
          }}
        >
          Skip
        </a>
      </article>
    </div>
  );
}

function HomePanel({
  cards = [],
  events = [],
  timezone,
  homeScreenVersions = {},
  pendingOnboardingShortcuts = [],
  activationChecklistItems = [],
  saveConfirmation = "",
  onCreate,
  onOpenDownload,
  onOpenApps,
  onOpenTodayCards,
  onOpenCard,
}) {
  const homeState = useMemo(
    () => buildHomeState({ cards, events, timezone, homeScreenVersions }),
    [cards, events, timezone, homeScreenVersions],
  );
  const completed = homeState.completedPersonalCardsToday;
  const total = homeState.totalPersonalCardsToday;
  const progressPercent = total > 0 ? Math.min(100, Math.max(0, (completed / total) * 100)) : 0;
  const personalCardNoun = total === 1 ? "personal card" : "personal cards";
  const progressNumber = total > 0 ? `${completed}/${total}` : "0";
  const progressCopy = total === 0
    ? "No Personal Cards yet."
    : completed === total
      ? `All ${total} ${personalCardNoun} complete today.`
      : `${completed} of ${total} card${total === 1 ? "" : "s"} completed today.`;
  const progressSubcopy = total === 0 ? "Create one when you are ready." : "";
  const canOpenCommitment = Boolean(homeState.activeCommitment?.id);
  const hasLiveCommitment = Boolean(homeState.activeCommitment);
  const liveCommitmentCountLabel = `${homeState.liveCommitmentCount} live commitment${homeState.liveCommitmentCount === 1 ? "" : "s"}`;
  const commitmentLabel = hasLiveCommitment
    ? "Live Commitment"
    : homeState.hasCompletedCommitmentToday
      ? "Commitments complete"
      : "No live commitment";
  const emptyCommitmentTitle = homeState.hasCompletedCommitmentToday ? "You’re clear for now." : "You’re clear for now.";
  const logoSrc = `${BASE_PATH || ""}/icons/mybishbash-cover.png`;
  const greeting = getGreeting(new Date(), timezone);
  const hasMeaningfulSetup = activationChecklistItems.length === 0 || cards.length > 0 || pendingOnboardingShortcuts.length > 0;

  const openProgressCard = () => {
    onOpenTodayCards?.();
  };

  const openCommitmentCard = () => {
    if (!homeState.activeCommitment?.id) return;
    onOpenCard(homeState.activeCommitment.id);
  };

  const openCommitmentEmptyState = () => {
    onCreate("commitment");
  };

  const handleChecklistAction = (item) => {
    if (item.action === "download") {
      onOpenDownload?.();
      return;
    }
    if (item.action === "create-card") {
      onCreate("personal");
      return;
    }
    if (item.action === "apps") {
      onOpenApps();
    }
  };

  return (
    <section className="home-dashboard" data-testid="home-panel">
      <div className="home-atmosphere" aria-hidden="true" />
      <div className="home-top-controls" aria-label="Home controls">
        <button
          type="button"
          className="home-floating-button"
          data-testid="create-card-button"
          onClick={onCreate}
          aria-label="Add a MyBishBash"
        >
          <PlusGlyph />
        </button>
        <button
          type="button"
          className="home-floating-button"
          data-testid="home-apps-button"
          onClick={onOpenApps}
          aria-label="Open apps"
        >
          <AppsGlyph />
        </button>
      </div>

      <div className="home-content">
        <header className="home-brand-hero">
          <img className="home-brand-logo" src={logoSrc} alt="MyBishBash" />
          <h1>{greeting}</h1>
          <p>{hasMeaningfulSetup ? `Day ${homeState.usageDays || 1} with MyBishBash` : "Welcome to MyBishBash"}</p>
        </header>

        <div className="home-card-stack" data-testid="home-dashboard-summary">
          {activationChecklistItems.length > 0 ? (
            <section className="home-activation-checklist" data-testid="home-activation-checklist" aria-labelledby="home-activation-title">
              <h2 id="home-activation-title">Your next step</h2>
              <div className="home-activation-items">
                {activationChecklistItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="home-activation-item"
                    onClick={() => handleChecklistAction(item)}
                  >
                    <span />
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {pendingOnboardingShortcuts.length > 0 ? (
            <button
              type="button"
              className="home-setup-reminder"
              data-testid="home-shortcut-setup-reminder"
              onClick={onOpenApps}
            >
              <span className="home-card-label">Shortcut setup</span>
              <strong>{pendingOnboardingShortcuts.length} app{pendingOnboardingShortcuts.length === 1 ? "" : "s"} waiting in Apps</strong>
              <span>Finish adding MyBishBash shortcuts when you are ready.</span>
            </button>
          ) : null}

          <button
            type="button"
            className="home-progress-card"
            data-testid="home-progress-card"
            onClick={openProgressCard}
            aria-label="Open today’s Personal Cards"
          >
            <HomeProgressRing percent={progressPercent} />
            <span className="home-progress-copy">
              <span className="home-card-label">Today</span>
              <span className="home-progress-number">{progressNumber}</span>
              <span className="home-card-body">{progressCopy}</span>
              {progressSubcopy ? <span className="home-card-subbody">{progressSubcopy}</span> : null}
            </span>
          </button>

          {hasLiveCommitment ? (
            <button
              type="button"
              className="home-commitment-card"
              data-testid="home-live-commitment-card"
              onClick={openCommitmentCard}
              aria-label="Open active commitment"
            >
            <span className="home-commitment-header">
              <span className="home-card-label">{commitmentLabel}</span>
              <span className="home-commitment-count">
                <span className="home-live-dot" aria-hidden="true" />
                {liveCommitmentCountLabel}
              </span>
            </span>
            <span className="home-commitment-title">
              {homeState.activeCommitment.title}
            </span>
            {homeState.activeCommitment?.appName ? (
              <span className="home-app-pill">
                <HomeAppIcon src={homeState.activeCommitment.appIconUrl} />
                <span>{homeState.activeCommitment.appName}</span>
              </span>
            ) : null}
            {homeState.activeCommitment?.metadataText ? (
              <span className="home-commitment-meta">{homeState.activeCommitment.metadataText}</span>
            ) : null}
            {typeof homeState.activeCommitment?.progressPercentage === "number" ? (
              <span className="home-commitment-track" aria-hidden="true">
                <span style={{ width: `${homeState.activeCommitment.progressPercentage}%` }} />
              </span>
            ) : null}
            </button>
          ) : null}
        </div>
        {saveConfirmation ? (
          <p className="home-save-confirmation" role="status">
            Saved “{saveConfirmation}”.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function HomeAppIcon({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="home-app-icon-fallback" aria-hidden="true">
        <AppsGlyph />
      </span>
    );
  }
  return <img src={src} alt="" className="home-app-icon" onError={() => setFailed(true)} />;
}

function HomeProgressRing({ percent }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <svg
      viewBox="0 0 94 94"
      className="home-progress-ring"
      data-testid="home-progress-ring"
      aria-hidden="true"
      style={{
        "--home-ring-circumference": circumference,
        "--home-ring-offset": offset,
      }}
    >
      <circle className="home-progress-ring-track" cx="47" cy="47" r={radius} />
      <circle className="home-progress-ring-value" cx="47" cy="47" r={radius} />
    </svg>
  );
}

function HomeReminderCard({
  item,
  timezone,
  menuOpenId,
  setMenuOpenId,
  openSpecificReveal,
  openPackReveal,
  openEditor,
  openPackEditor,
  handleResetItem,
  handleTogglePause,
  handleDeleteCard,
  handleDuplicateCard,
  deactivatePack,
}) {
  const status = getStatusMeta(item.representative, new Date(), timezone);
  const openCard = () => {
    if (item.type === "pack") {
      openPackReveal(item.id);
      return;
    }
    openSpecificReveal(item.id);
  };

  return (
    <article
      className={`reminder-card ${menuOpenId === item.id ? "menu-open" : ""}`}
      onClick={openCard}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard();
        }
      }}
    >
      <div className="reminder-top">
        <div className="reminder-icon-bubble">
          <CardIcon icon={item.representative.icon} sourcePackId={item.representative.sourcePackId} />
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className="menu-trigger reminder-menu-trigger"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpenId((current) => (current === item.id ? null : item.id));
            }}
            aria-label="Card menu"
          >
            •••
          </button>
          {menuOpenId === item.id ? (
            <div className="menu">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.type === "pack") {
                    openPackEditor(item.id);
                    return;
                  }
                  openEditor(item.id);
                }}
              >
                {item.type === "pack" ? "Edit pack" : "Edit"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.type === "pack") return;
                  handleDuplicateCard(item.id);
                }}
                disabled={item.type === "pack"}
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleResetItem(item);
                }}
              >
                Reset for today
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleTogglePause(item);
                }}
              >
                {item.representative.paused ? "Unpause" : "Pause"}
              </button>
              <button
                type="button"
                className="danger-soft"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.type === "pack") {
                    deactivatePack(item.id);
                    return;
                  }
                  handleDeleteCard(item.id);
                }}
              >
                {item.type === "pack" ? "Remove pack" : "Delete"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <h3>{getHomeCardTitle(item.representative)}</h3>
      <span className={`reminder-status-pill ${status.badge}`}>{status.badge}</span>
    </article>
  );
}

function LibrarySectionHeader({ id, icon, title, description, countLabel, isOpen, onToggle, onAdd, addLabel, testId }) {
  return (
    <div className="library-section-header">
      <button
        type="button"
        className="library-section-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={id}
        data-testid={`${testId}-toggle`}
      >
        <span className="tile library-section-icon">
          <CardIcon icon={icon} />
        </span>
        <span className="library-section-copy">
          <span className="library-section-title">{title}</span>
          <span className="library-section-description">{description}</span>
        </span>
      </button>
      <span className="library-section-meta">
        <span className="library-section-count">{countLabel}</span>
        <button
          type="button"
          className="library-section-add"
          onClick={onAdd}
          aria-label={addLabel}
          data-testid={`${testId}-add`}
        >
          +
        </button>
        <span className={`library-section-chevron ${isOpen ? "open" : ""}`} aria-hidden="true">
          ›
        </span>
      </span>
    </div>
  );
}

function LibraryListRow({
  item,
  title,
  secondary,
  menuOpenId,
  setMenuOpenId,
  onOpen,
  menuActions,
}) {
  return (
    <article
      className={`library-list-row ${menuOpenId === item.id ? "menu-open" : ""}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="library-list-copy">
        <h3>{title}</h3>
        {secondary ? <p>{secondary}</p> : null}
      </div>
      <div className="menu-wrap">
        <button
          type="button"
          className="menu-trigger library-list-menu-trigger"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpenId((current) => (current === item.id ? null : item.id));
          }}
          aria-label="Card menu"
        >
          •••
        </button>
        {menuOpenId === item.id ? (
          <div className="menu">
            {menuActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.danger ? "danger-soft" : ""}
                disabled={action.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ─── ExpandableCollection ────────────────────────────────────────────────────
// Reusable animated collection component for the Library page.
// Shows a header (icon, title, description, count pill, add button, chevron)
// and an animated body that reveals up to `maxPreview` items when open.
// When more items exist than the preview cap, a "View all" footer appears.
// If `onViewAll` is provided it is called; otherwise all items expand inline.

function ExpandableCollection({
  id,
  icon,
  title,
  description,
  countLabel,
  items = [],
  maxPreview = 5,
  isOpen,
  onToggle,
  onAdd,
  addLabel,
  onViewAll,
  testId,
  renderRow,
  emptyLabel = "Nothing here yet",
}) {
  const [showAll, setShowAll] = useState(false);

  // Collapse "show all" when the section closes
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (!isOpen && prevIsOpen.current) setShowAll(false);
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  const displayItems = showAll ? items : items.slice(0, maxPreview);
  const hasMore = items.length > maxPreview && !showAll;

  function handleViewAll() {
    if (onViewAll) {
      onViewAll();
    } else {
      setShowAll(true);
    }
  }

  return (
    <div className={`expandable-collection${isOpen ? " open" : ""}`} data-testid={testId}>
      {/* Header ─ the toggle button covers the icon + copy; add + chevron are independent */}
      <div className="library-section-header">
        <button
          type="button"
          className="library-section-toggle"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={id}
          data-testid={`${testId}-toggle`}
        >
          <span className="tile library-section-icon">
            <CardIcon icon={icon} />
          </span>
          <span className="library-section-copy">
            <span className="library-section-title">{title}</span>
            <span className="library-section-description">{description}</span>
          </span>
        </button>
        <span className="library-section-meta">
          <span className="library-section-count">{countLabel}</span>
          <button
            type="button"
            className="library-section-add"
            onClick={onAdd}
            aria-label={addLabel}
            data-testid={`${testId}-add`}
          >
            +
          </button>
          <span
            className={`library-section-chevron${isOpen ? " open" : ""}`}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </span>
      </div>

      {/* Animated body ─ CSS grid-template-rows trick for smooth height animation */}
      <div
        className={`expandable-collection-body-wrap${isOpen ? " open" : ""}`}
        id={id}
        aria-hidden={!isOpen}
      >
        <div className="expandable-collection-body-inner">
          <div className="library-list-card">
            {items.length === 0 ? (
              <article className="library-list-empty">
                <h3>{emptyLabel}</h3>
              </article>
            ) : null}
            {displayItems.map((item) => renderRow(item))}
            {items.length > 0 && hasMore ? (
              <button
                type="button"
                className="collection-view-all"
                onClick={handleViewAll}
              >
                View all {items.length} {items.length === 1 ? "item" : "items"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CollectionPreviewRow ────────────────────────────────────────────────────
// A richer list row for use inside ExpandableCollection.
// Unlike LibraryListRow it includes an item icon column and an optional status
// badge, giving the "drawer glimpse" feel described in the design spec.

function CollectionPreviewRow({
  item,
  icon = "heart",
  art = null,
  title,
  secondary,
  statusBadge,
  menuOpenId,
  setMenuOpenId,
  onOpen,
  menuActions = [],
}) {
  return (
    <article
      className={`collection-preview-row${menuOpenId === item.id ? " menu-open" : ""}`}
      data-testid={`library-row-${item.id}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="collection-preview-icon">
        {art ?? <CardIcon icon={icon} />}
      </span>
      <div className="collection-preview-copy">
        <h3>{title}</h3>
        {secondary ? <p>{secondary}</p> : null}
      </div>
      {statusBadge ? (
        <span className={`collection-preview-status ${statusBadge}`}>
          {statusBadge}
        </span>
      ) : null}
      <div className="menu-wrap">
        <button
          type="button"
          className="menu-trigger collection-preview-menu-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId((current) => (current === item.id ? null : item.id));
          }}
          aria-label="Card options"
        >
          •••
        </button>
        {menuOpenId === item.id ? (
          <div className="menu">
            {menuActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.danger ? "danger-soft" : ""}
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function getLibraryPersonalSecondary(card, timezone) {
  const status = getStatusMeta(card, new Date(), timezone);
  return status.badge;
}

function getLibraryCommitmentSecondary(card) {
  if (card.commitmentCheckInEnabled && card.commitmentCheckInTime) {
    return `check-in ${card.commitmentCheckInTime}`;
  }
  return card.commitmentTimingMode === "custom" ? "custom timing" : "commitment";
}

function getLibraryPackSecondary(item) {
  const count = item.count ?? 0;
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

function TodayPersonalCardsPanel({ todayPersonalLibrary, onCreatePersonal, onBackToLibrary, onOpenCard }) {
  const completed = todayPersonalLibrary.completed ?? [];
  const outstanding = todayPersonalLibrary.outstanding ?? [];
  const hasAnyPersonalCards = todayPersonalLibrary.totalCount > 0;
  const hasTodayCards = completed.length > 0 || outstanding.length > 0;

  function renderTodayCard(card, status) {
    return (
      <button
        key={card.id}
        type="button"
        className="today-personal-card-row"
        data-testid={`today-personal-card-${card.id}`}
        onClick={() => onOpenCard(card.id)}
      >
        <span className={`today-personal-status ${status}`}>{status === "completed" ? "Completed" : "Outstanding"}</span>
        <strong>{card.promptText}</strong>
      </button>
    );
  }

  return (
    <section className="library today-personal-library" data-testid="today-personal-library">
      <div className="section-heading solo">
        <div>
          <h2>Today’s Personal Cards</h2>
          <p>Completed today at the top. Outstanding cards below.</p>
        </div>
        <button type="button" className="text-button" onClick={onBackToLibrary}>
          All Library
        </button>
      </div>

      {!hasAnyPersonalCards ? (
        <div className="today-personal-empty" data-testid="today-personal-empty">
          <h3>No Personal Cards yet.</h3>
          <button type="button" className="save-button" onClick={onCreatePersonal}>
            Create Personal Card
          </button>
        </div>
      ) : null}

      {hasAnyPersonalCards && !hasTodayCards ? (
        <div className="today-personal-empty" data-testid="today-personal-clear">
          <h3>You’re all clear today.</h3>
          <p>Nothing needs your attention right now.</p>
        </div>
      ) : null}

      {completed.length > 0 ? (
        <section className="today-personal-section" aria-labelledby="today-personal-completed">
          <h3 id="today-personal-completed">Completed today</h3>
          <div className="today-personal-list">
            {completed.map((card) => renderTodayCard(card, "completed"))}
          </div>
        </section>
      ) : null}

      {outstanding.length > 0 ? (
        <section className="today-personal-section" aria-labelledby="today-personal-outstanding">
          <h3 id="today-personal-outstanding">Outstanding today</h3>
          <div className="today-personal-list">
            {outstanding.map((card) => renderTodayCard(card, "outstanding"))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function StandardLibraryPanel({
  personalItems,
  commitmentItems,
  activePackItems,
  doInsteadItems,
  libraryPacks = [],
  timezone,
  menuOpenId,
  setMenuOpenId,
  openEditor,
  handleResetItem,
  handleTogglePause,
  handleDeleteCard,
  handleDuplicateCard,
  openSpecificReveal,
  openPackReveal,
  deactivatePack,
  onCreatePersonal,
  onCreateCommitment,
  onAddPack,
  onToggleActionCardHidden,
  onDeleteActionCard,
  onCreateActionCard,
}) {
  const [openSections, setOpenSections] = useState({
    personal: false,
    commitments: false,
    activePacks: false,
    doInstead: false,
  });
  const personalOpen = openSections.personal;
  const commitmentsOpen = openSections.commitments;
  const activePacksOpen = openSections.activePacks;
  const doInsteadOpen = openSections.doInstead;
  const personalCountLabel = `${personalItems.length} ${personalItems.length === 1 ? "card" : "cards"}`;
  const commitmentCountLabel = `${commitmentItems.length} ${commitmentItems.length === 1 ? "card" : "cards"}`;
  const activePackCountLabel = `${activePackItems.length} ${activePackItems.length === 1 ? "pack" : "packs"}`;
  const doInsteadCountLabel = `${doInsteadItems.length} ${doInsteadItems.length === 1 ? "card" : "cards"}`;

  function toggleSection(sectionId) {
    setOpenSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  function personalActions(item) {
    return [
      { label: "Edit", onClick: () => openEditor(item.id) },
      { label: "Duplicate", onClick: () => handleDuplicateCard(item.id) },
      { label: "Reset for today", onClick: () => handleResetItem(item) },
      { label: item.representative.paused ? "Unpause" : "Pause", onClick: () => handleTogglePause(item) },
      { label: "Delete", danger: true, onClick: () => handleDeleteCard(item.id) },
    ];
  }

  function packActions(item) {
    return [
      { label: "Open card", onClick: () => openPackReveal(item.id) },
      { label: "Reset for today", onClick: () => handleResetItem(item) },
      { label: item.representative.paused ? "Unpause" : "Pause", onClick: () => handleTogglePause(item) },
      { label: "Remove pack", danger: true, onClick: () => deactivatePack(item.id) },
    ];
  }

  return (
    <section className="library" data-testid="library-panel">
      <div className="section-heading solo">
        <div>
          <h2>Library</h2>
          <p>Your own MyBishBashes, gathered in one quiet place.</p>
        </div>
      </div>
      <div className="library-sections">
        <section className="library-section-group">
          <ExpandableCollection
            id="personal-card-section"
            icon="heart"
            title="Personal Cards"
            description="Cards you have written for yourself."
            countLabel={personalCountLabel}
            items={personalItems}
            isOpen={personalOpen}
            onToggle={() => toggleSection("personal")}
            onAdd={onCreatePersonal}
            addLabel="Create personal card"
            testId="library-personal-section"
            emptyLabel="No personal cards yet"
            renderRow={(item) => (
              <CollectionPreviewRow
                key={item.id}
                item={item}
                icon={item.representative.icon ?? "heart"}
                title={item.representative.promptText}
                secondary={getLibraryPersonalSecondary(item.representative, timezone)}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onOpen={() => openSpecificReveal(item.id)}
                menuActions={personalActions(item)}
              />
            )}
          />
        </section>

        <section className="library-section-group">
          <ExpandableCollection
            id="commitment-card-section"
            icon="star"
            title="Commitment Cards"
            description="Promises you've made to yourself."
            countLabel={commitmentCountLabel}
            items={commitmentItems}
            isOpen={commitmentsOpen}
            onToggle={() => toggleSection("commitments")}
            onAdd={onCreateCommitment}
            addLabel="Create commitment card"
            testId="library-commitment-section"
            emptyLabel="No commitment cards yet"
            renderRow={(item) => (
              <CollectionPreviewRow
                key={item.id}
                item={item}
                icon={item.representative.icon ?? "star"}
                title={item.representative.promptText}
                secondary={getLibraryCommitmentSecondary(item.representative)}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onOpen={() => openSpecificReveal(item.id)}
                menuActions={personalActions(item)}
              />
            )}
          />
        </section>

        <section className="library-section-group">
          <ExpandableCollection
            id="active-pack-section"
            icon="book"
            title="Active Packs"
            description="Packs you've added to your library."
            countLabel={activePackCountLabel}
            items={activePackItems}
            isOpen={activePacksOpen}
            onToggle={() => toggleSection("activePacks")}
            onAdd={onAddPack}
            addLabel="Add active pack"
            testId="library-active-packs-section"
            emptyLabel="No active packs yet"
            renderRow={(item) => {
              const pack = libraryPacks.find((candidate) => candidate.id === item.id || candidate.sourceKey === item.id);
              return (
                <CollectionPreviewRow
                  key={item.id}
                  item={item}
                  icon={item.representative.icon ?? "book"}
                  art={pack ? (
                    <GeneratedPackCover pack={pack} variant="thumb" className="library-pack-thumb" isActive />
                  ) : null}
                  title={item.representative.promptText}
                  secondary={getLibraryPackSecondary(item)}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  onOpen={() => openPackReveal(item.id)}
                  menuActions={packActions(item)}
                />
              );
            }}
          />
        </section>

        <section className="library-section-group">
          <ExpandableCollection
            id="do-instead-card-section"
            icon="star"
            title="Do Instead Cards"
            description="Things to do instead of opening an app."
            countLabel={doInsteadCountLabel}
            items={doInsteadItems}
            isOpen={doInsteadOpen}
            onToggle={() => toggleSection("doInstead")}
            onAdd={onCreateActionCard}
            addLabel="Create Do Instead card"
            testId="library-do-instead-section"
            emptyLabel="No Do Instead cards yet"
            renderRow={(item) => (
              <CollectionPreviewRow
                key={item.id}
                item={item}
                icon="star"
                title={item.title}
                secondary={item.hidden ? "Hidden" : item.body || item.category || ""}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onOpen={() => setMenuOpenId((current) => (current === item.id ? null : item.id))}
                menuActions={
                  item.source === "starter"
                    ? [{ label: item.hidden ? "Restore" : "Hide", onClick: () => onToggleActionCardHidden(item.id, !item.hidden) }]
                    : [{ label: "Delete", danger: true, onClick: () => onDeleteActionCard(item.id) }]
                }
              />
            )}
          />
        </section>
      </div>
    </section>
  );
}

// LogPanel → moved to src/components/LogPanel.jsx

function PackEditor({ packTitle, initialCard, onClose, onSave }) {
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);

  function handleSubmit(event) {
    event.preventDefault();
    onSave({ frequency, timingWindows });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer pack-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">Edit pack</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="field">
          <span>{packTitle}</span>
          <p className="pack-editor-copy">Choose when this pack can appear and how often it can come back.</p>
        </div>
        <div className="field">
          <span>How often can this show up?</span>
          <div className="frequency-grid">
            {FREQUENCY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`frequency-option ${frequency === option.id ? "selected" : ""}`}
                onClick={() => setFrequency(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>When should this pack appear?</span>
          <div className="timing-grid">
            {TIME_WINDOWS.map((windowOption) => (
              <label key={windowOption.id} className="timing-option">
                <input
                  type="checkbox"
                  checked={timingWindows.includes(windowOption.id)}
                  onChange={() => {
                    setTimingWindows((current) => {
                      if (current.includes(windowOption.id)) {
                        const next = current.filter((item) => item !== windowOption.id);
                        return next.length === 0 ? current : next;
                      }
                      return [...current, windowOption.id];
                    });
                  }}
                />
                <span>{windowOption.label}</span>
              </label>
            ))}
          </div>
        </div>
        <button type="submit" className="save-button">
          Save pack
        </button>
      </form>
    </div>
  );
}

function CustomPackEditor({ initialPack, linkedVersionId, versions, onClose, onSave }) {
  const [name, setName] = useState(initialPack?.name ?? "");
  const initialMessages = initialPack?.messages ?? initialPack?.cards?.map((card) => card.text ?? card.title).filter(Boolean) ?? [""];
  const [messages, setMessages] = useState(initialMessages);
  const [selectedVersion, setSelectedVersion] = useState(initialPack?.targetApp ?? initialPack?.linkedVersionId ?? linkedVersionId ?? "");

  function updateMessage(index, value) {
    setMessages((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addMessage() {
    setMessages((current) => [...current, ""]);
  }

  function removeMessage(index) {
    setMessages((current) => (current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      id: initialPack?.id,
      name,
      linkedVersionId: selectedVersion,
      messages,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer pack-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">{initialPack ? "Edit app pack" : "Create app pack"}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field">
          <span>Pack name</span>
          <input
            className="settings-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Instagram Interruptions"
          />
        </label>
        <label className="field">
          <span>Linked Home Screen version, optional</span>
          <select
            className="settings-input"
            value={selectedVersion}
            onChange={(event) => setSelectedVersion(event.target.value)}
          >
            <option value="">Not linked</option>
            {Object.values(versions).filter((version) => version.id !== "mybishbash").map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Messages</span>
          <div className="custom-pack-message-grid">
            {messages.map((message, index) => (
              <div key={`${index}-${initialPack?.id ?? "new"}`} className="custom-pack-message-row">
                <textarea
                  value={message}
                  onChange={(event) => updateMessage(index, event.target.value)}
                  rows={3}
                  placeholder="Do you really want to go on Instagram right now?"
                />
                <button
                  type="button"
                  className="text-button danger-soft-button"
                  onClick={() => removeMessage(index)}
                >
                  Delete message
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="pack-button secondary" onClick={addMessage}>
            Add message
          </button>
        </div>
        <button type="submit" className="save-button">
            Save app pack
        </button>
      </form>
    </div>
  );
}

function ActionCardEditor({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [launchUrl, setLaunchUrl] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      body: body.trim(),
      category: category.trim(),
      launchUrl: launchUrl.trim(),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer pack-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">New Action Card</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field">
          <span>Title</span>
          <input className="settings-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call a family member" required />
        </label>
        <label className="field">
          <span>Body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="A quick catch-up might feel better..." />
        </label>
        <label className="field">
          <span>Category</span>
          <input className="settings-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Connection" />
        </label>
        <label className="field">
          <span>Launch URL (optional)</span>
          <input type="url" className="settings-input" value={launchUrl} onChange={(e) => setLaunchUrl(e.target.value)} placeholder="https://..." />
        </label>
        <button type="submit" className="save-button">
          Save Action Card
        </button>
      </form>
    </div>
  );
}

// PacksPanel → replaced by src/ExplorePanel.jsx (docs/explore-architecture.md)

function PackDetailModal({
  detail,
  cards,
  libraryPacks,
  interruptionPacks,
  hiddenCardIds,
  isPackActive,
  onActivateLibraryPack,
  onDeactivateLibraryPack,
  onSetPackCardHidden,
  onSaveInterruptionCard,
  onDeleteInterruptionCard,
  onClose,
}) {
  const [editingCard, setEditingCard] = useState(null);
  const [draftText, setDraftText] = useState("");

  const libraryPack = detail.type === "library"
    ? libraryPacks.find((pack) => pack.id === detail.id)
    : null;
  const interruptionPack = detail.type === "interruption"
    ? interruptionPacks.find((pack) => pack.id === detail.id)
    : null;
  const active = libraryPack ? isPackActive(libraryPack.id) : interruptionPack?.active;

  function startNewInterruptionCard() {
    setEditingCard({ id: null });
    setDraftText("");
  }

  function startEditInterruptionCard(card) {
    setEditingCard(card);
    setDraftText(card.text);
  }

  function saveInterruptionDraft(event) {
    event.preventDefault();
    if (!interruptionPack) return;
    onSaveInterruptionCard(interruptionPack.targetApp, editingCard?.id ?? null, draftText);
    setEditingCard(null);
    setDraftText("");
  }

  if (!libraryPack && !interruptionPack) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer pack-editor" onClick={(event) => event.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">{libraryPack ? "Manage cards" : "Interruption messages"}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>

        {libraryPack ? (
          <>
            <div className="field">
              <span>{libraryPack.title}</span>
              <p className="pack-editor-copy">{libraryPack.description}</p>
              <p className="pack-meta">{libraryPack.entries.length} cards · read-only</p>
            </div>
            <button
              type="button"
              className={`pack-button ${active ? "secondary" : ""}`}
              onClick={() => {
                if (active) {
                  onDeactivateLibraryPack(libraryPack.id);
                  return;
                }
                onActivateLibraryPack(libraryPack.id);
              }}
              disabled={libraryPack.entries.length === 0}
            >
              {active ? "Remove pack" : "Install pack"}
            </button>
            <div className="custom-pack-message-grid">
              {libraryPack.entries.map((entry, index) => {
                const hidden = hiddenCardIds.includes(
                  getLegacyHiddenPackCardKey({ sourcePackId: libraryPack.id, promptText: entry.promptText }),
                );
                const activeCard = cards.find(
                  (card) => card.sourcePackId === libraryPack.id && card.promptText === entry.promptText && !card.deletedAt,
                );
                return (
                  <article key={`${libraryPack.id}-${index}`} className="home-screen-version-card pack-manager-card">
                    <div className="home-screen-version-copy pack-manager-copy">
                      <div className="home-screen-version-title">
                        <strong>{entry.promptText}</strong>
                        <span>{hidden ? "Hidden" : "Visible"}</span>
                      </div>
                      {entry.attribution ? <p>{entry.attribution}</p> : null}
                      {activeCard ? <p className="pack-meta">{getStatusMeta(activeCard).badge}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="pack-button secondary"
                      onClick={() => onSetPackCardHidden(libraryPack.id, entry.promptText, !hidden)}
                    >
                      {hidden ? "Restore card" : "Hide card"}
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        ) : null}

        {interruptionPack ? (
          <>
            <div className="field">
              <span>{interruptionPack.name}</span>
              <p className="pack-editor-copy">{interruptionPack.description}</p>
              <p className="pack-meta">{interruptionPack.cards.length} {interruptionPack.cards.length === 1 ? "message" : "messages"}</p>
            </div>
            <button type="button" className="pack-button" onClick={startNewInterruptionCard}>
              Add card
            </button>
            {editingCard ? (
              <form className="custom-pack-message-grid" onSubmit={saveInterruptionDraft}>
                <label className="field">
                  <span>{editingCard.id ? "Edit card" : "New card"}</span>
                  <textarea
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    rows={3}
                    placeholder="Do you really want to open this app right now?"
                  />
                </label>
                <button type="submit" className="save-button">
                  Save card
                </button>
              </form>
            ) : null}
            <div className="custom-pack-message-grid">
              {interruptionPack.cards.map((card) => (
                <article key={card.id} className="home-screen-version-card pack-manager-card">
                  <div className="home-screen-version-copy pack-manager-copy">
                    <div className="home-screen-version-title">
                      <strong>{card.text}</strong>
                      <span>{card.readOnly ? "Read-only" : "Editable"}{card.hidden ? " · hidden" : ""}</span>
                    </div>
                  </div>
                  <div className="home-screen-version-actions">
                    {card.readOnly ? (
                      <button
                        type="button"
                        className="pack-button secondary"
                        onClick={() => onSetPackCardHidden(interruptionPack.id, card.text, !card.hidden)}
                      >
                        {card.hidden ? "Restore card" : "Hide card"}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="pack-button secondary" onClick={() => startEditInterruptionCard(card)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="pack-button secondary danger-soft-button"
                          onClick={() => onDeleteInterruptionCard(interruptionPack.targetApp, card.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SyncConnectionScreen(props) {
  return (
    <ContentEditProvider
      initialContent={authContent}
      storageKey="mybishbash.authContentDraft.v1"
      saveEndpoint="/__save-auth-content"
      saveLabel="src/content/authContent.js"
      isContentCompatible={(value) => Boolean(value?.titles?.signup && value?.form?.email)}
    >
      <SyncConnectionScreenContent {...props} />
      <EditPanel />
    </ContentEditProvider>
  );
}

function SyncConnectionScreenContent({ mode, error, onSignUp, onLogIn, onPasswordReset, onClearError, onOpenLegalModal, launcherName = "" }) {
  const { content } = useContentEdit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetStatus, setResetStatus] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [isLogin, setIsLogin] = useState(() => {
    if (typeof window === "undefined") return true;
    return new URLSearchParams(window.location.search).get("signup") !== "1";
  });
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const hasSignupHandoff = Boolean(getSignupHandoffReference());
  const isDemoMode = isDemoModeEnabled();

  const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone);
  const isLauncherLogin = mode === "launcher";
  const isAccessDenied = mode === "access-denied";
  const isSignupBlocked = !isLogin && !hasSignupHandoff && !isDemoMode;
  const isStandaloneSignupRecovery = isSignupBlocked && isStandalone;
  const titlePath = isLauncherLogin
    ? "titles.launcher"
    : isAccessDenied || (isSignupBlocked && !isStandaloneSignupRecovery)
      ? "titles.inviteOnly"
      : isLogin
        ? "titles.login"
        : "titles.signup";
  const title = isLauncherLogin
    ? content.titles.launcher
    : isAccessDenied
      ? content.titles.inviteOnly
    : isSignupBlocked && !isStandaloneSignupRecovery
      ? content.titles.inviteOnly
    : isLogin
      ? content.titles.login
      : content.titles.signup;
  const loginCopy = isLauncherLogin
    ? `${content.copy.launcherPrefix} ${launcherName || "app"} ${content.copy.launcherSuffix}`
    : content.copy.login;
  function switchMode(nextIsLogin) {
    setIsLogin(nextIsLogin);
    setShowPassword(false);
    setResetStatus("");
    setResetError("");
    onClearError?.();
  }

  function submitExisting(event) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (!isLogin && !agreedToLegal) {
      alert(content.status.legalRequired);
      return;
    }
    if (isLogin) {
      onLogIn(email, password);
    } else {
      onSignUp(email, password);
    }
  }

  async function submitPasswordReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || resetPending) return;
    setResetPending(true);
    setResetStatus("");
    setResetError("");
    onClearError?.();
    try {
      await onPasswordReset?.(trimmedEmail);
      setResetStatus(content.status.passwordResetSent);
    } catch (resetRequestError) {
      setResetError(getSyncErrorMessage(resetRequestError, content.status.passwordResetError));
    } finally {
      setResetPending(false);
    }
  }

  return (
    <main className="sync-screen" data-testid="sync-screen">
      <section className="sync-card">
        <span className="sync-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h1><EditableText path={titlePath}>{title}</EditableText></h1>
        {mode === "loading" ? (
          <EditableText as="p" path="copy.loading" />
        ) : (
          <>
            <p>
              {isAccessDenied
                ? content.copy.accessDenied
                : isStandaloneSignupRecovery
                ? content.copy.signupRecoveryStandalone
                : isSignupBlocked
                ? content.copy.signupBlocked
                : isLogin
                ? loginCopy
                : content.copy.signup}
            </p>
            {isLogin && isStandalone ? <EditableText as="p" className="sync-note" path="copy.standalone" /> : null}
            {error ? <p className="sync-error">{error}</p> : null}

            {isSignupBlocked ? (
              <div className="sync-form">
                {isStandaloneSignupRecovery ? (
                  <a className="save-button" href={`${BASE_PATH}/home`}>
                    <EditableText path="actions.loginSwitch" />
                  </a>
                ) : (
                  <a className="save-button" href={`${BASE_PATH}/invite`}><EditableText path="actions.getMyBishBash" /></a>
                )}
                <div className="sync-auth-switch">
                  <EditableText path="actions.alreadyHaveAccount" />
                  <button type="button" className="text-button sync-secondary-link" onClick={() => switchMode(true)}>
                    <EditableText path="actions.loginSwitch" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <form className="sync-form" onSubmit={submitExisting}>
                  <div className="field">
                    <label htmlFor="sync-email"><EditableText path="form.email" /></label>
                    <input
                      id="sync-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className="settings-input"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={content.form.emailPlaceholder}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sync-password"><EditableText path="form.password" /></label>
                    <span className="password-field">
                      <input
                        id="sync-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        className="settings-input"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={content.form.passwordPlaceholder}
                        required
                      />
                      <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)}>
                        {showPassword ? content.form.hidePassword : content.form.showPassword}
                      </button>
                    </span>
                    {isLogin ? (
                      <button
                        type="button"
                        className="text-button sync-forgot-password"
                        onClick={submitPasswordReset}
                        disabled={!email.trim() || resetPending}
                      >
                        {resetPending ? content.form.sending : <EditableText path="form.forgotPassword" />}
                      </button>
                    ) : null}
                  </div>
                  {resetStatus ? <p className="sync-success">{resetStatus}</p> : null}
                  {resetError ? <p className="sync-error">{resetError}</p> : null}
                  {!isLogin ? (
                    <>
                      <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px", marginTop: "12px", marginBottom: "16px", cursor: "pointer", fontSize: "14px", fontWeight: "normal", opacity: 0.9 }}>
                        <input
                          type="checkbox"
                          checked={agreedToLegal}
                          onChange={(e) => setAgreedToLegal(e.target.checked)}
                          style={{ width: "auto", margin: 0 }}
                        />
                        <span style={{ lineHeight: "1.4" }}>
                          <EditableText path="form.legalPrefix" /> <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegalModal?.("terms"); }} style={{ textDecoration: "underline" }}><EditableText path="form.terms" /></a> <EditableText path="form.legalMiddle" /> <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegalModal?.("privacy"); }} style={{ textDecoration: "underline" }}><EditableText path="form.privacy" /></a><EditableText path="form.legalSuffix" />
                        </span>
                      </label>
                    </>
                  ) : null}
                  <button type="submit" className="save-button">
                    {isLogin ? content.form.loginSubmit : content.form.signupSubmit}
                  </button>
                </form>

                <div className="sync-auth-switch">
                  <span>{isLogin ? content.actions.needAccount : content.actions.alreadyHaveAccount}</span>
                  <button type="button" className="text-button sync-secondary-link" onClick={() => switchMode(!isLogin)}>
                    {isLogin ? content.actions.signupSwitch : content.actions.loginSwitch}
                  </button>
                </div>
              </>
            )}
            {!isStandalone && !isStandaloneSignupRecovery ? (
              <p className="sync-waitlist-line">
                <EditableText path="actions.noInvite" /> <a className="text-button sync-secondary-link" href={`${BASE_PATH}/early-access`}><EditableText path="actions.joinWaitlist" /></a>
              </p>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function LegalModal({ docType, onClose }) {
  const docUrl = `${BASE_PATH}/${docType === 'terms' ? 'terms-of-use.md' : 'privacy-policy.md'}`;
  const title = docType === 'terms' ? 'Terms of Use' : 'Privacy Policy';
  const [content, setContent] = useState("Loading...");

  useEffect(() => {
    fetch(docUrl)
      .then((res) => res.text())
      .then((text) => {
        const parsed = text
          .replace(/^# (.*$)/gim, "<h1>$1</h1>")
          .replace(/^## (.*$)/gim, "<h2>$1</h2>")
          .replace(/^### (.*$)/gim, "<h3>$1</h3>")
          .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
          .replace(/^- (.*$)/gim, "<li>$1</li>")
          .replace(/^---$/gim, "<hr />");

        const lines = parsed.split("\n");
        let inList = false;
        const formatted = lines
          .map((line) => {
            if (line.startsWith("<li>")) {
              if (!inList) {
                inList = true;
                return "<ul>" + line;
              }
              return line;
            } else {
              let out = line;
              if (inList) {
                inList = false;
                out = "</ul>" + line;
              }
              if (!line.startsWith("<h") && !line.startsWith("<u") && !line.startsWith("<hr") && line.trim().length > 0) {
                return "<p>" + out + "</p>";
              }
              return out;
            }
          })
          .join("");

        setContent(formatted + (inList ? "</ul>" : ""));
      })
      .catch(() => setContent("<p>Failed to load document.</p>"));
  }, [docUrl]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer pack-editor" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="composer-heading" style={{ flexShrink: 0 }}>
          <p className="eyebrow">{title}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 24px 24px' }}>
          <div className="legal-content" style={{ lineHeight: "1.6", color: "var(--charcoal)", fontSize: "16px" }} dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: "\n" +
        "  .legal-content h1 { font-size: 24px; font-weight: bold; margin-bottom: 16px; margin-top: 0; }\n" +
        "  .legal-content h1:first-child { margin-top: 0; }\n" +
        "  .legal-content h2 { font-size: 20px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content h3 { font-size: 16px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content p { margin-bottom: 16px; }\n" +
        "  .legal-content ul { margin-bottom: 16px; padding-left: 20px; list-style-type: disc; }\n" +
        "  .legal-content li { margin-bottom: 8px; }\n" +
        "  .legal-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 32px 0; }\n"
      }} />
    </div>
  );
}

/** Convert a stored hour integer (0-23) to an HH:00 string for <input type="time">. */
function hourToTimeString(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

/** Parse an HH:MM string back to an integer hour (0-23), or null on failure. */
function timeStringToHour(s) {
  const m = typeof s === "string" && s.match(/^(\d{1,2}):\d{2}$/);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

/** Check that four defs form a valid, gap-free 24-hour partition. */
function validateWindowDefsGapFree(defs) {
  if (!isValidWindowDefs(defs)) return { valid: false, error: "Each window needs a valid start and end time." };
  // Check contiguity: each window's end must equal the next window's start.
  for (let i = 0; i < defs.length; i++) {
    const next = defs[(i + 1) % defs.length];
    if (defs[i].end !== next.start) {
      return {
        valid: false,
        error: `"${defs[i].label || defs[i].id}" ends at ${hourToTimeString(defs[i].end)} but "${next.label || next.id}" starts at ${hourToTimeString(next.start)}. Windows must connect without gaps.`,
      };
    }
  }
  return { valid: true, error: null };
}

function AppsPanel({
  protectedAppStatuses,
  pendingOnboardingShortcuts = [],
  onSaveVersionBehavior,
  onUpdateHomeScreenIcon,
  onOpenDestinationApp,
  onProtectedLaunch,
  onManageApp,
  onBackToApps,
  onOpenPremiumOptions,
  onPauseApp,
  onClearAppPause,
  onLogLauncherEvent,
  onClaimAccessCode,
  onOpenInstallGuide,
  selectedVersionId = null,
  appPauseRevision = 0,
  isTester = false,
  isShellContext = false,
  canUseMultipleApps = false,
  onOpenMyBishBash,
}) {
  const [showOptions, setShowOptions] = useState(false);
  const [showAccessScreen, setShowAccessScreen] = useState(false);
  const [showCodeScreen, setShowCodeScreen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
  }, [appPauseRevision]);

  const liveProtectedAppStatuses = useMemo(
    () => protectedAppStatuses.map((status) => {
      const pauseExpiryTime = status.pauseExpiry ? new Date(status.pauseExpiry).getTime() : 0;
      const paused = pauseExpiryTime > nowMs;
      return {
        ...status,
        paused,
        pauseRemaining: paused ? formatPauseRemaining(status.pauseExpiry, nowMs) : "",
      };
    }),
    [protectedAppStatuses, nowMs],
  );

  const selectedStatus = selectedVersionId
    ? liveProtectedAppStatuses.find((status) => status.version.id === selectedVersionId) ?? null
    : null;
  const enabledStatuses = liveProtectedAppStatuses.filter((status) => status.protectedOn);
  const canAddAnotherApp = canUseMultipleApps || enabledStatuses.length < 1;

  if (showCodeScreen) {
    return (
      <section className="panel-section" data-testid="apps-panel">
        <AppsCodeScreen
          onClaimAccessCode={onClaimAccessCode}
          onBack={() => setShowCodeScreen(false)}
          onContinue={() => {
            setShowCodeScreen(false);
            setShowAccessScreen(false);
            onBackToApps?.();
          }}
          onOpenInstallGuide={onOpenInstallGuide}
        />
      </section>
    );
  }

  if (selectedStatus) {
    if (!selectedStatus.protectedOn && !canAddAnotherApp) {
      return (
        <section className="panel-section" data-testid="apps-panel">
          <AppsAccessScreen
            onUnlock={onOpenPremiumOptions}
            onHaveCode={() => setShowCodeScreen(true)}
            onBack={onBackToApps}
          />
        </section>
      );
    }
    return (
      <section className="panel-section" data-testid="apps-panel">
        <AppManagementScreen
          status={selectedStatus}
          onBack={onBackToApps}
          onSaveVersionBehavior={onSaveVersionBehavior}
          onUpdateHomeScreenIcon={onUpdateHomeScreenIcon}
          onProtectedLaunch={onProtectedLaunch}
          onOpenDestinationApp={onOpenDestinationApp}
          onPauseApp={onPauseApp}
          onClearAppPause={onClearAppPause}
          onLogLauncherEvent={onLogLauncherEvent}
          isTester={isTester}
          isShellContext={isShellContext}
          onOpenMyBishBash={onOpenMyBishBash}
          nowMs={nowMs}
        />
      </section>
    );
  }

  if (showAccessScreen) {
    return (
      <section className="panel-section" data-testid="apps-panel">
        <AppsAccessScreen
          onUnlock={onOpenPremiumOptions}
          onHaveCode={() => {
            setShowAccessScreen(false);
            setShowCodeScreen(true);
          }}
          onBack={() => setShowAccessScreen(false)}
        />
      </section>
    );
  }

  return (
    <section className="panel-section" data-testid="apps-panel">
      <div className="section-heading solo">
        <div>
          <h2>Apps</h2>
          <p>Where MyBishBash is currently helping you.</p>
        </div>
      </div>

      {pendingOnboardingShortcuts.length > 0 ? (
        <div className="settings-card" data-testid="apps-shortcut-setup-reminder">
          <div className="settings-version-heading">
            <p>Apps ready to add</p>
            <span>Turn on MyBishBash when you are ready.</span>
          </div>
          <div className="home-screen-version-list">
            {pendingOnboardingShortcuts.map((app) => (
              <article className="home-screen-version-card" key={`pending-shortcut:${app.id}`}>
                {app.iconSrc ? (
                  <img src={app.iconSrc} alt="" className="home-screen-version-icon" />
                ) : (
                  <span className="home-screen-version-icon" aria-hidden="true" />
                )}
                <div className="home-screen-version-copy">
                  <strong>{app.label}</strong>
                  <p>Ready when you want to finish adding it.</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="settings-card" data-testid="apps-list">
        <div className="settings-version-heading">
          <p>Enabled Apps</p>
        </div>
        {enabledStatuses.length === 0 ? (
          <p className="tiny-note">No enabled apps yet.</p>
        ) : (
          <div className="home-screen-version-list">
            {enabledStatuses.map((status) => (
              <EnabledAppRow
                key={status.version.id}
                status={status}
                onManageApp={onManageApp}
                onPauseApp={onPauseApp}
                onClearAppPause={onClearAppPause}
              />
            ))}
          </div>
        )}
      </div>

      <div className="settings-card" data-testid="apps-add-more">
        {showOptions ? (
          <MoreAppsOptions
            protectedAppStatuses={liveProtectedAppStatuses}
            canAddAnotherApp={canAddAnotherApp}
            onBack={() => setShowOptions(false)}
            onManageApp={onManageApp}
            onShowAccess={() => setShowAccessScreen(true)}
            onHaveCode={() => setShowCodeScreen(true)}
          />
        ) : (
          <>
            <div className="settings-version-heading">
              <p>Add Another App</p>
              <span>Bring MyBishBash to more of the apps you use.</span>
            </div>
            <button type="button" className="pack-button" onClick={() => setShowOptions(true)}>
              See Options
            </button>
            <button type="button" className="text-button apps-code-link" onClick={() => setShowCodeScreen(true)}>
              Have a code?
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function EnabledAppRow({ status, onManageApp, onPauseApp, onClearAppPause }) {
  const { version, paused, pauseExpiry } = status;
  const appName = version.realAppLabel ?? version.name ?? version.displayName ?? version.id;
  const [showPauseModal, setShowPauseModal] = useState(false);
  const pauseButtonRef = useRef(null);
  const pauseUntil = formatPauseUntil(pauseExpiry);

  return (
    <article className="home-screen-version-card apps-enabled-row" data-testid={`protected-app-${version.id}`}>
      <img
        src={resolveLauncherIconSrc(version)}
        alt={`${appName} icon`}
        className="home-screen-version-icon"
      />
      <div className="home-screen-version-copy">
        <div className="home-screen-version-title">
          <strong>{appName}</strong>
          <span data-testid={`apps-pause-status-${version.id}`}>
            {paused ? `Paused until ${pauseUntil || "soon"}` : "✓ Enabled"}
          </span>
        </div>
        <div className="home-screen-version-actions apps-row-actions">
          <button type="button" className="pack-button apps-settings-button" onClick={() => onManageApp?.(version.id)}>
            Settings
          </button>
          {paused ? (
            <button
              type="button"
              className="pack-button secondary apps-pause-row-button"
              data-testid={`apps-end-pause-${version.id}`}
              onClick={() => onClearAppPause(version.id)}
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              className="pack-button secondary apps-pause-row-button"
              ref={pauseButtonRef}
              onClick={() => setShowPauseModal(true)}
            >
              Pause
            </button>
          )}
        </div>
      </div>
      {showPauseModal && onPauseApp ? (
        <AppPauseModal
          appName={appName}
          triggerRef={pauseButtonRef}
          openAfterPause={false}
          onClose={() => setShowPauseModal(false)}
          onPause={(mins) => {
            setShowPauseModal(false);
            onPauseApp(version.id, mins);
          }}
        />
      ) : null}
    </article>
  );
}

function MoreAppsOptions({ protectedAppStatuses, canAddAnotherApp, onBack, onManageApp, onShowAccess, onHaveCode }) {
  const statusById = new Map(protectedAppStatuses.map((status) => [status.version.id, status]));
  const availableOptionIds = APPS_OPTION_IDS.filter((id) => !statusById.get(id)?.protectedOn);
  return (
    <div className="apps-more-options" data-testid="apps-more-options">
      <div className="settings-version-heading">
        <p>Add Another App</p>
        <span>Bring MyBishBash to more of the apps you use.</span>
      </div>
      <div className="home-screen-version-list">
        {availableOptionIds.length === 0 ? (
          <p className="tiny-note">All available apps are enabled.</p>
        ) : null}
        {availableOptionIds.map((id) => {
          const status = statusById.get(id);
          const version = status?.version ?? DEFAULT_HOME_SCREEN_VERSIONS[id] ?? getLauncherConfig(id);
          if (!version) return null;
          const appName = version.realAppLabel ?? version.name ?? version.displayName ?? id;
          return (
            <article className="home-screen-version-card apps-enabled-row" key={id} data-testid={`apps-option-${id}`}>
              <img src={resolveLauncherIconSrc(version)} alt={`${appName} icon`} className="home-screen-version-icon" />
              <div className="home-screen-version-copy">
                <div className="home-screen-version-title">
                  <strong>{appName}</strong>
                  <span>Available</span>
                </div>
                <div className="home-screen-version-actions apps-row-actions">
                  <button
                    type="button"
                    className="pack-button secondary"
                    data-testid={`apps-option-action-${id}`}
                    onClick={() => {
                      if (!status?.protectedOn && !canAddAnotherApp) {
                        onShowAccess?.();
                        return;
                      }
                      onManageApp?.(id);
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="apps-more-actions">
        <button type="button" className="text-button apps-code-link" onClick={onHaveCode}>
          Have a code?
        </button>
        <button type="button" className="text-button apps-code-link" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function AppsAccessScreen({ onUnlock, onHaveCode, onBack }) {
  return (
    <div className="apps-manage-screen" data-testid="apps-access-screen">
      <button type="button" className="text-button apps-back-button" data-testid="apps-access-back" onClick={onBack}>
        ← Apps
      </button>
      <div className="settings-card apps-manage-hero">
        <div className="settings-version-heading">
          <p>Add MyBishBash to more apps</p>
          <span>Use MyBishBash with more of the apps you open every day.</span>
        </div>
      </div>
      <div className="settings-card settings-compact">
        <button type="button" className="pack-button" onClick={onUnlock}>
          Unlock More Apps
        </button>
        <button type="button" className="text-button apps-code-link" onClick={onHaveCode}>
          Have a code?
        </button>
      </div>
    </div>
  );
}

function AppsCodeScreen({ onClaimAccessCode, onBack, onContinue, onOpenInstallGuide }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("entry");
  const [error, setError] = useState("");
  const isChecking = status === "checking";
  const isSuccess = status === "success";

  async function submitCode(event) {
    event.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Enter your code to continue.");
      return;
    }
    setStatus("checking");
    setError("");
    const claimed = await onClaimAccessCode?.(trimmedCode);
    if (claimed) {
      setStatus("success");
      return;
    }
    setStatus("entry");
    setError("That code did not work. Please check it and try again.");
  }

  return (
    <div className="apps-manage-screen" data-testid="apps-code-screen">
      {!isSuccess ? (
        <button type="button" className="text-button apps-back-button" data-testid="apps-code-back" onClick={onBack}>
          ← Apps
        </button>
      ) : null}
      <div className="settings-card apps-manage-hero">
        <div className="settings-version-heading">
          <p>{isSuccess ? "You now have access to more apps." : "Have a code?"}</p>
          <span>
            {isSuccess
              ? "You can add MyBishBash to more of the apps you use."
              : "Enter your access code to add MyBishBash to more apps."}
          </span>
        </div>
      </div>

      {isSuccess ? (
        <div className="settings-card apps-code-actions" data-testid="apps-code-success">
          <button type="button" className="pack-button apps-settings-button" onClick={onContinue}>
            Continue to Apps
          </button>
          <button type="button" className="pack-button secondary" onClick={onOpenInstallGuide}>
            Add MyBishBash to your Home Screen
          </button>
        </div>
      ) : (
        <form className="settings-card apps-code-form" onSubmit={submitCode}>
          <label htmlFor="apps-access-code">Access code</label>
          <input
            id="apps-access-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError("");
            }}
            placeholder="Enter access code"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            disabled={isChecking}
          />
          {error ? <p className="download-access-error" role="alert">{error}</p> : null}
          <button type="submit" className="pack-button apps-settings-button" disabled={isChecking}>
            {isChecking ? "Checking..." : "Continue"}
          </button>
        </form>
      )}
    </div>
  );
}

function getDefaultAppPrompt(versionId, appName) {
  const prompts = {
    safari: "Why are you opening Safari right now?",
    instagram: "Why are you opening Instagram right now?",
    whatsapp: "Who are you hoping to contact?",
    youtube: "What are you hoping to watch?",
  };
  return prompts[versionId] ?? `Why are you opening ${appName} right now?`;
}

function AppManagementScreen({
  status,
  onBack,
  onSaveVersionBehavior,
  onUpdateHomeScreenIcon,
  onProtectedLaunch,
  onOpenDestinationApp,
  onPauseApp,
  onClearAppPause,
  onLogLauncherEvent,
  isTester = false,
  isShellContext = false,
  onOpenMyBishBash,
  nowMs = Date.now(),
}) {
  const { version, protectedOn, promptsOn, paused, pauseRemaining } = status;
  const appName = version.realAppLabel ?? version.name ?? version.displayName ?? version.id;
  const promptPreview = getDefaultAppPrompt(version.id, appName);
  const pauseUntil = formatPauseUntil(status.pauseExpiry, nowMs);
  const enabledStatus = protectedOn
    ? "MyBishBash enabled"
    : `MyBishBash is not enabled for ${appName} yet`;
  const pauseStatus = protectedOn && paused
    ? `Paused until ${pauseUntil || pauseRemaining || "soon"}`
    : enabledStatus;

  return (
    <div className="apps-manage-screen" data-testid={`protected-app-${version.id}`}>
      {!isShellContext ? (
        <button type="button" className="text-button apps-back-button" data-testid="apps-back-button" onClick={onBack}>
          ← Apps
        </button>
      ) : null}
      <div className="settings-card apps-manage-hero">
        <img src={resolveLauncherIconSrc(version)} alt={`${appName} icon`} className="home-screen-version-icon" />
        <div className="settings-version-heading">
          <p>{appName}</p>
          <span data-testid={`apps-pause-status-${version.id}`}>{pauseStatus}</span>
        </div>
      </div>
      {!protectedOn ? (
        <div className="settings-card">
          <div className="settings-version-heading">
            <p>Add MyBishBash to {appName}</p>
            <span>Turn on App Prompts and pause controls for this app.</span>
          </div>
          <button
            type="button"
            className="pack-button"
            data-testid={`apps-enable-${version.id}`}
            onClick={() => onSaveVersionBehavior(version.id, { appEnabled: true, useInterruptionPack: true })}
          >
            Enable {appName}
          </button>
        </div>
      ) : null}
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>App Prompts</p>
        </div>
        <label className="timing-option settings-checkbox-row" style={{ marginBottom: "8px" }}>
          <input
            type="checkbox"
            checked={promptsOn}
            data-testid={`apps-interruptions-toggle-${version.id}`}
            onChange={(event) => onSaveVersionBehavior(version.id, { useInterruptionPack: event.target.checked })}
          />
          <span>{promptsOn ? "On" : "Off"}</span>
        </label>
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Example prompt</p>
          <span>“{promptPreview}”</span>
        </div>
      </div>
      {protectedOn ? (
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Pause MyBishBash</p>
          <span>Pause only affects {appName}.</span>
        </div>
        {paused ? (
          <button
            type="button"
            className="pack-button"
            data-testid={`apps-end-pause-inline-${version.id}`}
            onClick={() => onClearAppPause(version.id)}
          >
            Resume
          </button>
        ) : (
          <div className="apps-pause-buttons">
            {[30, 60, 180].map((minutes) => (
              <button
                key={minutes}
                type="button"
                className="pack-button secondary"
                onClick={() => onPauseApp?.(version.id, minutes)}
              >
                Pause for {minutes === 30 ? "30 minutes" : minutes === 60 ? "1 hour" : "3 hours"}
              </button>
            ))}
          </div>
        )}
      </div>
      ) : null}
      {!isShellContext ? (
      <div className="settings-card settings-compact">
        <button
          type="button"
          className="pack-button secondary"
          onClick={() => {
            onSaveVersionBehavior(version.id, { appEnabled: false, useInterruptionPack: false });
            onClearAppPause(version.id);
            onBack?.();
          }}
        >
          Remove App
        </button>
      </div>
      ) : null}
      {isShellContext ? (
        <div className="settings-card settings-compact">
          <button type="button" className="pack-button" onClick={onOpenMyBishBash}>
            Open MyBishBash
          </button>
        </div>
      ) : null}
      {isTester && !isShellContext ? (
        <div className="settings-card">
          <div className="settings-version-heading">
            <p>Test controls</p>
            <span>Only visible in tester mode.</span>
          </div>
          <div className="home-screen-version-actions">
            <button
              type="button"
              className="pack-button secondary"
              data-testid={`apps-test-shortcut-${version.id}`}
              onClick={() => onProtectedLaunch(version.id)}
            >
              Test Shortcut
            </button>
            <button
              type="button"
              className="pack-button secondary"
              data-testid={`apps-direct-open-${version.id}`}
              onClick={() => onOpenDestinationApp(version.id)}
            >
              Open {appName}
            </button>
            <label className="icon-upload-button">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      onUpdateHomeScreenIcon(version.id, reader.result);
                    }
                  };
                  reader.readAsDataURL(file);
                  event.target.value = "";
                }}
              />
              Replace icon
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SettingsPanel({
  mood,
  onSelectMood,
  homeScreenVersions,
  launcherBehaviorSettings,
  onUpdateHomeScreenIcon,
  onSaveVersionBehavior,
  globalInterruptionMode,
  onSetGlobalInterruptionMode,
  session,
  onLogOut,
  onRefreshSession,
  onRefreshAppShell,
  onResetSharedState,
  isTester = false,
  notificationSettings,
  notificationStatus,
  onEnableNotifications,
  onDisableNotifications,
  onUpdateNotificationsPerDay,
  actionCards,
  onRestoreActionCards,
  interruptionPacks,
  onOpenInterruptionPack,
  launcherContext,
  onLogLauncherEvent,
  morningSummaryDebug,
  onShowMorningSummaryNow,
  onGenerateMorningSummaryForToday,
  onGenerateMorningSummaryForYesterday,
  onFakeLauncherLaunch,
  timingWindowsPrefs = DEFAULT_WINDOW_DEFS,
  onSaveTimingWindowsPrefs,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftWindowDefs, setDraftWindowDefs] = useState(timingWindowsPrefs);
  const [windowSaveStatus, setWindowSaveStatus] = useState(null); // null | "saved" | { error: string }
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState("mybishbash");

  const isInsideFakeLauncher =
    launcherContext &&
    isKnownLauncher(launcherContext);

  const isSelectedCurrentLauncher =
    isInsideFakeLauncher && previewVersionId === launcherContext;
  const shortcutContexts = {
    safari: "Reminders during everyday phone use",
    instagram: "Pause before social scrolling",
    youtube: "Pause before video scrolling",
    chrome: "Pause before open-ended browsing",
    reddit: "Pause before thread-hopping",
    linkedin: "Pause before professional comparison",
    whatsapp: "Pause before reactive messaging",
    "bbc-news": "Pause before checking the news",
    duolingo: "Pause before streak-checking",
    mybishbash: "Main MyBishBash home",
  };
  const settingsTesterStatus = { is_tester: isTester };
  const supportedShortcutNames = getAvailableLaunchersForUser({
    launchers: Object.values(homeScreenVersions).filter((version) => version.id !== "mybishbash"),
    testerStatus: settingsTesterStatus,
    context: LAUNCHER_CONTEXTS.SETTINGS,
  })
    .map((version) => version.name ?? version.displayName ?? version.id)
    .join(", ");
  const installableHomeScreenVersions = Object.values(homeScreenVersions).filter(
    (version) =>
      version.id === "mybishbash" ||
      isLauncherVisibleInContext(version, { testerStatus: settingsTesterStatus, context: LAUNCHER_CONTEXTS.SETTINGS }),
  );
  const selectedPreviewVersion = installableHomeScreenVersions.some((version) => version.id === previewVersionId)
    ? previewVersionId
    : "mybishbash";

  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Settings</h2>
          <p>Personal touches and a quick peek at how MyBishBash works.</p>
        </div>
      </div>
      <div className="settings-card settings-compact">
        <button
          type="button"
          className="settings-toggle"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
        >
          <span>How it works</span>
          <span>{isOpen ? "−" : "+"}</span>
        </button>
        {isOpen ? (
          <div className="settings-dropdown">
            <p>Each time the app opens, it picks one random eligible MyBishBash from everything you&apos;ve created or activated.</p>
            <ul className="settings-list">
              <li>it is not paused</li>
              <li>it has not already been marked done</li>
              <li>it is not cooling down from Not done or I&apos;ll do it now</li>
              <li>the current time matches its selected windows</li>
            </ul>
          </div>
        ) : null}
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Mood</p>
          <span>Choose the overall feeling of MyBishBash.</span>
        </div>
        <div className="theme-showcase settings-theme-showcase" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              className={`theme-showcase-card theme-${getThemeClass(theme)} ${mood === theme ? "selected-mood" : ""}`}
              onClick={() => onSelectMood(theme)}
              style={{ textAlign: "left", cursor: "pointer", padding: "16px", border: mood === theme ? "2px solid currentColor" : "none", borderRadius: "16px" }}
            >
              <strong style={{ display: "block", fontSize: "1.1em", marginBottom: "4px" }}>{theme}</strong>
              <span style={{ fontSize: "0.9em", opacity: 0.9 }}>have you stretched?</span>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-card" data-testid="timing-windows-settings-card">
        <div className="settings-version-heading">
          <p>Time windows</p>
          <span>Adjust when each part of the day begins. Cards only show during their chosen windows.</span>
        </div>
        <div className="tw-rows">
          {draftWindowDefs.map((def, idx) => {
            const isNightWrapping = def.start > def.end || (def.id === "night" && def.start >= 22);
            return (
              <div key={def.id} className="tw-row" data-testid={`tw-row-${def.id}`}>
                <span className="tw-label">{def.label || def.id}</span>
                <label className="tw-time-label">
                  <span className="tw-time-hint">from</span>
                  <input
                    type="time"
                    step="3600"
                    className="tw-time-input settings-input"
                    value={hourToTimeString(def.start)}
                    data-testid={`tw-start-${def.id}`}
                    onChange={(e) => {
                      const h = timeStringToHour(e.target.value);
                      if (h === null) return;
                      const next = draftWindowDefs.map((d, i) =>
                        i === idx ? { ...d, start: h } : d,
                      );
                      setDraftWindowDefs(next);
                      setWindowSaveStatus(null);
                    }}
                  />
                </label>
                <label className="tw-time-label">
                  <span className="tw-time-hint">to</span>
                  <input
                    type="time"
                    step="3600"
                    className="tw-time-input settings-input"
                    value={hourToTimeString(def.end)}
                    data-testid={`tw-end-${def.id}`}
                    onChange={(e) => {
                      const h = timeStringToHour(e.target.value);
                      if (h === null) return;
                      const next = draftWindowDefs.map((d, i) =>
                        i === idx ? { ...d, end: h } : d,
                      );
                      setDraftWindowDefs(next);
                      setWindowSaveStatus(null);
                    }}
                  />
                </label>
                {isNightWrapping && (
                  <span className="tw-wraps-hint">wraps midnight</span>
                )}
              </div>
            );
          })}
        </div>
        {windowSaveStatus && typeof windowSaveStatus === "object" && windowSaveStatus.error ? (
          <p className="tw-error" role="alert" data-testid="tw-error">{windowSaveStatus.error}</p>
        ) : null}
        {windowSaveStatus === "saved" ? (
          <p className="tw-saved" data-testid="tw-saved">Saved.</p>
        ) : null}
        <div className="tw-actions">
          <button
            type="button"
            className="settings-save-btn"
            data-testid="tw-save-btn"
            onClick={() => {
              const { valid, error } = validateWindowDefsGapFree(draftWindowDefs);
              if (!valid) {
                setWindowSaveStatus({ error });
                return;
              }
              onSaveTimingWindowsPrefs?.(draftWindowDefs);
              setWindowSaveStatus("saved");
              setTimeout(() => setWindowSaveStatus(null), 2500);
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="tw-reset-btn"
            data-testid="tw-reset-btn"
            onClick={() => {
              setDraftWindowDefs(DEFAULT_WINDOW_DEFS);
              setWindowSaveStatus(null);
            }}
          >
            Reset to defaults
          </button>
        </div>
      </div>
      <div className="settings-card settings-compact">
        <div className="settings-version-heading">
          <p>Account</p>
          <span>Logged in as {session?.user?.email ?? "Unknown"}</span>
        </div>
        <div className="sync-profile-row">
          <button type="button" className="pack-button secondary" onClick={onLogOut}>
            Log out
          </button>
          <button type="button" className="pack-button secondary" onClick={onRefreshSession}>
            Refresh login session
          </button>
        </div>
        <AuthDiagnostics session={session} />
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Notifications</p>
          <span>Small MyBishBash nudges from your saved cards.</span>
        </div>
        <label className="timing-option settings-checkbox-row" style={{ marginBottom: "12px" }}>
          <input
            type="checkbox"
            checked={Boolean(notificationSettings?.enabled)}
            onChange={(event) => {
              if (event.target.checked) {
                void onEnableNotifications();
              } else {
                void onDisableNotifications();
              }
            }}
          />
          <span>{notificationSettings?.enabled ? "On" : "Off"}</span>
        </label>
        <label className="field" style={{ marginBottom: "12px" }}>
          <span>Per day</span>
          <input
            type="number"
            min="1"
            max="6"
            className="settings-input"
            value={notificationSettings?.notificationsPerDay ?? 3}
            onChange={(event) => void onUpdateNotificationsPerDay(event.target.value)}
          />
        </label>
        <p className="tiny-note" style={{ margin: 0 }}>
          Status: {notificationStatus || "unknown"}
        </p>
      </div>
      {isTester && (
        <div className="settings-card">
          <div className="settings-version-heading">
            <p>Morning Summary debug</p>
            <span>Force yesterday’s reflection and inspect the raw events used by the summary.</span>
          </div>
          <div className="sync-profile-row morning-summary-debug-actions">
            <button type="button" className="pack-button secondary" onClick={onShowMorningSummaryNow}>
              Show Morning Summary Now
            </button>
            <button type="button" className="pack-button secondary" onClick={onGenerateMorningSummaryForToday}>
              Generate Summary for Today
            </button>
            <button type="button" className="pack-button secondary" onClick={onGenerateMorningSummaryForYesterday}>
              Generate Summary for Yesterday
            </button>
          </div>
          <MorningSummaryDebugLog summary={morningSummaryDebug} />
        </div>
      )}
      <div className="settings-card settings-compact">
        <div className="settings-version-heading">
          <p>Refresh MyBishBash</p>
          <span>Reload the latest app without deleting login, cards, preferences, or logs.</span>
        </div>
        <button type="button" className="pack-button secondary" onClick={onRefreshAppShell}>
          Refresh MyBishBash
        </button>
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Restore deleted actions</p>
          <span>Bring back action cards you previously deleted.</span>
        </div>
        <button type="button" className="pack-button secondary" onClick={() => setIsRestoreModalOpen(true)}>
          View deleted cards
        </button>
      </div>
      {isTester && (
        <div className="settings-card">
          <div className="settings-version-heading">
            <p>Clear device data</p>
            <span>Removes all cards, packs, settings and history from this device. Your cloud account is not deleted.</span>
          </div>
          <button type="button" className="pack-button secondary danger-soft-button" onClick={onResetSharedState}>
            Clear all data from this device
          </button>
        </div>
      )}

      {isRestoreModalOpen ? (
        <RestoreActionCardsModal
          actionCards={actionCards}
          onRestore={onRestoreActionCards}
          onClose={() => setIsRestoreModalOpen(false)}
        />
      ) : null}
    </section>
  );
}

function MorningSummaryDebugLog({ summary }) {
  const events = summary?.debugEvents ?? [];

  return (
    <div className="morning-summary-debug-log" data-testid="morning-summary-debug-log">
      <div className="morning-summary-debug-header">
        <strong>Raw summary/debug log</strong>
        <span>{summary?.dateKey ?? "No date"} · {events.length} events</span>
      </div>
      {events.length === 0 ? (
        <p className="tiny-note">No summary events found for this date yet.</p>
      ) : (
        <div className="morning-summary-debug-list">
          {events.map((event) => (
            <div key={`${event.id}:${event.type}:${event.at}`} className="morning-summary-debug-row">
              <span>{formatTwentyFourHourTime(event.at)}</span>
              <strong>{event.label}</strong>
              <p>{[event.card, event.app, event.action].filter(Boolean).join(" · ")}</p>
              <code>{event.type}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MorningSummaryModal({ summary, onClose }) {
  const sections = [];
  const personal = summary.personal ?? {};
  const commitments = summary.commitments ?? {};
  const interruptions = summary.interruptions ?? {};
  const plural = (count, singular, pluralLabel = `${singular}s`) => `${count} ${count === 1 ? singular : pluralLabel}`;

  if (personal.completedCount > 0 || personal.availableCount > 0) {
    const completionCopy = personal.availableCount > 0
      ? `Yesterday, you completed ${personal.completedCount} of your ${plural(personal.availableCount, "personal card")}.`
      : `Yesterday, you completed ${plural(personal.completedCount, "personal card")}.`;
    sections.push({
      id: "personal",
      title: "Personal Cards",
      body: completionCopy,
      details: personal.isCompletionPercentageReliable && personal.completionPercentage != null
        ? [`That is ${personal.completionPercentage}% of the personal cards shown yesterday.`]
        : [],
    });
  }

  if (
    commitments.madeCount > 0 ||
    commitments.declinedCount > 0 ||
    commitments.checkInGeneratedCount > 0 ||
    commitments.checkInCompletedCount > 0
  ) {
    const details = [];
    const commitmentBody = commitments.madeCount > 0
      ? `You made ${plural(commitments.madeCount, "commitment")} yesterday.`
      : commitments.declinedCount > 0
        ? `You chose not this time for ${plural(commitments.declinedCount, "commitment")} yesterday.`
        : "Your commitment check-ins were active yesterday.";
    if (commitments.declinedCount > 0) details.push(`${commitments.declinedCount} not this time`);
    if (commitments.checkInGeneratedCount > 0) details.push(`${commitments.checkInGeneratedCount} check-in shown`);
    if (commitments.checkInCompletedCount > 0) details.push(`${commitments.checkInCompletedCount} check-in answered`);
    if (commitments.outcomes?.goingPerfectly) details.push(`${commitments.outcomes.goingPerfectly} going perfectly`);
    if (commitments.outcomes?.couldBeBetter) details.push(`${commitments.outcomes.couldBeBetter} could be better`);
    if (commitments.outcomes?.notGoingWell) details.push(`${commitments.outcomes.notGoingWell} not going well`);
    sections.push({
      id: "commitments",
      title: "Commitments",
      body: commitmentBody,
      details,
    });
  }

  if (interruptions.interruptedCount > 0 || interruptions.continueToAppCount > 0 || interruptions.choseAlternativeCount > 0) {
    const topApp = interruptions.byApp?.[0];
    const body = topApp
      ? `${topApp.appName} was interrupted ${topApp.count} times. You chose something else ${interruptions.choseAlternativeCount} times.`
      : `Your app shortcuts were interrupted ${plural(interruptions.interruptedCount, "time")}. You chose something else ${plural(interruptions.choseAlternativeCount, "time")}.`;
    sections.push({
      id: "interruptions",
      title: "Interruptions",
      body: topApp
        ? `${topApp.appName} was interrupted ${plural(topApp.count, "time")}. You chose something else ${plural(interruptions.choseAlternativeCount, "time")}.`
        : body,
      details: [
        interruptions.continueToAppCount > 0 ? `${plural(interruptions.continueToAppCount, "time")} continued to app` : null,
        ...(interruptions.byApp ?? []).slice(1, 4).map((row) => `${row.appName}: ${row.count}`),
      ].filter(Boolean),
    });
  }

  return (
    <div className="modal-backdrop morning-summary-backdrop" onClick={onClose}>
      <div className="composer morning-summary-card" data-testid="morning-summary" onClick={(event) => event.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">Morning Summary</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="morning-summary-hero">
          <span className="morning-summary-icon" aria-hidden="true"><HeartGlyph /></span>
          <h2>Yesterday’s reflection</h2>
          <p>{summary.dateKey}</p>
        </div>
        {sections.length === 0 ? (
          <div className="morning-summary-section">
            <h3>A quiet day in the log.</h3>
            <p>There is not much to reflect back from yesterday yet. You can just keep going gently today.</p>
          </div>
        ) : (
          <div className="morning-summary-sections">
            {sections.map((section) => (
              <section key={section.id} className="morning-summary-section">
                <h3>{section.title}</h3>
                <p>{section.body}</p>
                {section.details.length > 0 ? (
                  <div className="morning-summary-detail-list">
                    {section.details.map((detail) => (
                      <span key={detail}>{detail}</span>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
        <button type="button" className="save-button morning-summary-cta" onClick={onClose}>
          Continue to MyBishBash
        </button>
      </div>
    </div>
  );
}

function RestoreActionCardsModal({ actionCards, onRestore, onClose }) {
  const deletedUserCards = actionCards.filter((card) => card.source === "user" && card.deletedAt);
  const [selectedIds, setSelectedIds] = useState(new Set());

  function handleToggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRestore() {
    onRestore(Array.from(selectedIds));
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer pack-editor" onClick={(e) => e.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">Restore deleted actions</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        {deletedUserCards.length === 0 ? (
          <div className="field">
            <p className="pack-editor-copy">No deleted action cards to restore.</p>
          </div>
        ) : (
          <div className="custom-pack-message-grid">
            {deletedUserCards.map((card) => (
              <label key={card.id} className="timing-option settings-checkbox-row" style={{ alignItems: "flex-start", padding: "12px", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "12px" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(card.id)}
                  onChange={() => handleToggle(card.id)}
                  style={{ marginTop: "4px" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <strong>{card.title}</strong>
                  <span style={{ fontSize: "14px", opacity: 0.7 }}>{card.body}</span>
                  {card.category ? <span className="tiny-note">{card.category}</span> : null}
                </div>
              </label>
            ))}
          </div>
        )}
        {deletedUserCards.length > 0 ? (
          <button type="button" className="save-button" style={{ marginTop: "16px" }} onClick={handleRestore} disabled={selectedIds.size === 0}>
            Restore selected
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ActiveProtectedAppShortcut({ version, onOpen }) {
  if (!version?.id) return null;
  const label = version.realAppLabel ?? version.displayName ?? version.name ?? "App";

  return (
    <button
      type="button"
      className="active-protected-app-shortcut"
      data-testid="active-protected-app-bypass"
      onClick={onOpen}
      aria-label={`Continue to ${label}`}
      title={`Continue to ${label}`}
    >
      <img
        src={resolveLauncherIconSrc(version)}
        alt=""
        aria-hidden="true"
      />
      <span>Continue to {label}</span>
    </button>
  );
}

// GrowthFlower, EventDetailModal, describeLogEvent, getLogEventDisplayLabel → moved to src/components/LogPanel.jsx

function Overlay({
  overlay,
  card,
  route,
  launchSession,
  version,
  timezone,
  onClose,
  onDashboard,
  onAction,
  onCommitmentAction,
  onCommitmentCheckInAction,
  onCommitmentEncouragementAction,
  onCommitmentReviewAction,
  onCreateCard,
  onPackContinue,
  onPackLike,
  onChooseElse,
  onLogEvent,
  onLogLauncherEvent,
  actionCards,
  onAcceptActionCard,
  onCreateActionCard,
  fakeLauncherVersions,
  onFakeLauncherLaunch,
  onContinueToApp,
  onPauseApp,
  onManageApp,
  isOffline = false,
  onRetryConnection,
}) {
  // Identify the active launcher app for the pause button.
  // Only surfaces the button when we're inside a fake-launcher flow.
  const launcherAppId = (overlay.launchSource === "fake_launcher" && overlay.versionId) ? overlay.versionId : null;
  const launcherAppName = launcherAppId ? (version?.displayName ?? version?.name ?? launcherAppId) : null;
  const onPauseCurrentApp = (launcherAppId && onPauseApp)
    ? (mins) => onPauseApp(launcherAppId, mins)
    : null;
  const [showLauncherPreparingFallback, setShowLauncherPreparingFallback] = useState(false);
  const launcherPreparingPaintedRef = useRef(false);
  const launcherInterceptionClass = overlay?.launchSource === "fake_launcher" || overlay?.versionId
    ? "launcher-interception-card"
    : "";
  const cardOverlayKey = getCardOverlayRenderKey(overlay, card?.id);
  const directLauncherVersions = useMemo(
    () =>
      (fakeLauncherVersions ?? []).map((launcherVersion) => ({
        ...launcherVersion,
        href: getBrowserSafeDestinationHref(getVersionOpenHref(launcherVersion, { preferDirectAppDestination: true })),
      })),
    [fakeLauncherVersions],
  );
  const handleDirectLauncherLaunch = (versionId, event) => {
    const handled = onContinueToApp?.(versionId, {
      source: "in_card_app_button",
      reason: "user_pressed_real_app_button",
      allowDefaultNavigation: true,
      preferDirectAppDestination: true,
    });
    if (handled !== false) event?.preventDefault?.();
  };

  useEffect(() => {
    if (overlay.type !== "launcher-preparing") {
      setShowLauncherPreparingFallback(false);
      launcherPreparingPaintedRef.current = false;
      return undefined;
    }

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    launcherPreparingPaintedRef.current = false;
    setShowLauncherPreparingFallback(false);
    debugLaunch("[LAUNCHER_PREPARING_DELAY_STARTED]", {
      currentPath: typeof window === "undefined" ? route?.path : window.location.pathname,
      routeKind: route?.kind,
      routePath: route?.path,
      versionId: overlay.versionId,
      launcherContext: overlay.versionId,
      overlayTypeBefore: overlay.type,
      delayMs: LAUNCHER_PREPARING_VISIBLE_DELAY_MS,
      basePath: BASE_PATH,
    });

    const timeoutId = window.setTimeout(() => {
      launcherPreparingPaintedRef.current = true;
      setShowLauncherPreparingFallback(true);
      const elapsedMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
      debugLaunch("[LAUNCHER_PREPARING_PAINTED]", {
        currentPath: window.location.pathname,
        routeKind: route?.kind,
        routePath: route?.path,
        versionId: overlay.versionId,
        launcherContext: overlay.versionId,
        overlayTypeAfter: overlay.type,
        elapsedMs,
        basePath: BASE_PATH,
      });
    }, LAUNCHER_PREPARING_VISIBLE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (!launcherPreparingPaintedRef.current) {
        const elapsedMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
        debugLaunch("[LAUNCHER_PREPARING_CANCELLED_BEFORE_PAINT]", {
          currentPath: typeof window === "undefined" ? route?.path : window.location.pathname,
          routeKind: route?.kind,
          routePath: route?.path,
          versionId: overlay.versionId,
          launcherContext: overlay.versionId,
          elapsedMs,
          basePath: BASE_PATH,
        });
      }
    };
  }, [overlay?.activationKey, overlay.type, overlay.versionId, route?.kind, route?.path]);

  if (overlay.type === "launcher-preparing") {
    if (!showLauncherPreparingFallback) return null;
    return (
      <div
        aria-hidden="true"
        className={`launcher-preparing-placeholder ${launcherInterceptionClass}`.trim()}
        data-testid="launcher-preparing-placeholder"
      />
    );
  }

  if (overlay.type === "continue-to-app") {
    const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true }));
    const canGoBackHome = normalizeLaunchSession(launchSession).allowBackHome;
    const handleContinue = (event) => {
      const handled = onContinueToApp?.(version?.id, {
        source: "continue_card",
        reason: "user_pressed_continue",
        allowDefaultNavigation: Boolean(continueHref),
        preferDirectAppDestination: true,
      });
      if (handled !== false) event?.preventDefault?.();
    };

    const handleBack = () => {
      void onLogEvent?.({
        event_type: "intercept_continue_to_app_cancelled",
        source_type: "continue_card",
        card_source: "continue_card",
        app_id: version?.id,
        app_name: version?.name,
        launcher_context: version?.id,
        action_taken: "cancelled_continue",
      });
      onClose();
    };

    return (
      <ContinueToAppCard
        appName={version?.name ?? "App"}
        appIcon={resolveLauncherIconSrc(version ?? {})}
        href={continueHref}
        onContinue={handleContinue}
        onBack={canGoBackHome ? handleBack : null}
        onDashboard={onDashboard}
        onManageApp={onManageApp}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseApp}
        className={launcherInterceptionClass}
      />
    );
  }

  if (overlay.type === "empty") {
    const isIntercept = !!overlay.versionId;
    const interceptVersion = isIntercept ? version : null;
    const appName = interceptVersion?.name ?? "App";

    // ── Offline fallback ──────────────────────────────────────────────────────
    // When the device has no network and no eligible cards could be fetched,
    // show a calm offline screen rather than a confusing "all caught up" message.
    if (isOffline) {
      const offlineActions = [
        {
          label: "Try again",
          variant: "primary",
          onClick: () => {
            if (typeof navigator !== "undefined" && navigator.onLine) {
              onRetryConnection?.();
            } else {
              // Trigger a hard reload so the app re-checks connectivity.
              window.location.reload();
            }
          },
        },
      ];
      if (isIntercept && interceptVersion) {
        const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(interceptVersion, { preferDirectAppDestination: true }));
        offlineActions.push({
          label: `Open ${appName} anyway`,
          variant: "secondary",
          href: continueHref,
          onClick: (event) => {
            const handled = onContinueToApp?.(interceptVersion.id, {
              source: "offline_empty_card",
              reason: "user_pressed_open_anyway_offline",
              allowDefaultNavigation: Boolean(continueHref),
              preferDirectAppDestination: true,
            });
            if (handled !== false) event?.preventDefault?.();
          },
        });
      }
      offlineActions.push({
        label: "Back to MyBishBash",
        variant: "secondary",
        onClick: onClose,
      });
      return (
        <PremiumCardScreen
          type="offline"
          greeting={isIntercept ? (interceptVersion?.name ?? "MyBishBash") : "MyBishBash"}
          icon="heart"
          headline="You appear to be offline."
          subtitle="Cards can't load right now. Take a breath before you open another app."
          actions={offlineActions}
          onDashboard={onDashboard}
          cardOverlayKey={cardOverlayKey}
          className={launcherInterceptionClass}
          launcherAppId={launcherAppId}
          launcherAppName={launcherAppName}
          onManageApp={onManageApp}
        />
      );
    }
    // ── end offline fallback ──────────────────────────────────────────────────
    const canGoBackHome = normalizeLaunchSession(launchSession).allowBackHome;

    const actions = [];
    if (isIntercept && interceptVersion) {
      const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(interceptVersion, { preferDirectAppDestination: true }));
      actions.push({
        label: `Continue to ${appName}`,
              testId: "card-action-continue-to-app",
        variant: "primary",
        href: continueHref,
        onClick: (event) => {
          const handled = onContinueToApp?.(interceptVersion.id, {
            source: "empty_card",
            reason: "user_pressed_continue_after_no_eligible_cards",
            allowDefaultNavigation: Boolean(continueHref),
            preferDirectAppDestination: true,
          });
          if (handled !== false) event?.preventDefault?.();
        }
      });
      if (canGoBackHome) {
        actions.push({
          label: "Back to MyBishBash",
          variant: "secondary",
          onClick: onClose
        });
      }
    } else {
      if (canGoBackHome) {
        actions.push({ label: "Back home", variant: "primary", onClick: onClose });
      }
    }

    return (
      <PremiumCardScreen
        type="empty"
        greeting={isIntercept ? interceptVersion?.name || "MyBishBash" : "MyBishBash"}
        icon="heart"
        headline={isIntercept ? "You're all caught up." : "You're all caught up for now."}
        subtitle={isIntercept ? "See you later." : ""}
      actions={actions}
      launcherVersions={isIntercept ? [] : directLauncherVersions}
      onLauncherLaunch={handleDirectLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={launcherInterceptionClass}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onManageApp={onManageApp}
    />
    );
  }

  if (overlay.type === "intercept-pack") {
    return (
      <InterceptionOverlay
        overlay={overlay}
        version={version}
        onChooseElse={onChooseElse}
        onLogEvent={onLogEvent}
        onLogLauncherEvent={onLogLauncherEvent}
        onContinueToApp={onContinueToApp}
        onFakeLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (overlay.type === "custom-pack-preview") {
    return <CustomPackOverlay overlay={overlay} onClose={onClose} onDashboard={onDashboard} />;
  }

  if (overlay.type === "action-card") {
    return (
      <ActionCardOverlay
        overlay={overlay}
        actionCards={actionCards}
        onAccept={onAcceptActionCard}
        onClose={onClose}
        onLogEvent={onLogEvent}
        fakeLauncherVersions={directLauncherVersions}
        onFakeLauncherLaunch={handleDirectLauncherLaunch}
        allowBackHome={normalizeLaunchSession(launchSession).allowBackHome}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    );
  }

  if (overlay.type === "action-card-empty") {
    return (
      <ActionCardEmptyOverlay
        overlay={overlay}
        version={version}
        onClose={onClose}
        onLogEvent={onLogEvent}
        onCreateActionCard={onCreateActionCard}
        onContinueToApp={onContinueToApp}
        fakeLauncherVersions={directLauncherVersions}
        onFakeLauncherLaunch={handleDirectLauncherLaunch}
        allowBackHome={normalizeLaunchSession(launchSession).allowBackHome}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    );
  }

  if (overlay.type === "action-success") {
    return (
      <ActionSuccessOverlay
        onClose={onClose}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
      />
    );
  }

  if (overlay.type === "flow-confirmation") {
    return (
      <FlowConfirmationOverlay
        overlay={overlay}
        version={version}
        onClose={onClose}
        onContinueToApp={onContinueToApp}
        onChooseElse={onChooseElse}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    );
  }

  if (!card) return null;
  const cardType = card.sourcePackId ? "pack" : "personal";

  if (overlay.type === "commitment-motivation" && isCommitmentCard(card)) {
    return (
      <CommitmentMotivationOverlay
        card={card}
        onCommitmentAction={onCommitmentAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentEncouragementCard(card)) {
    return (
      <CommitmentEncouragementOverlay
        card={card}
        onContinue={onCommitmentEncouragementAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentReviewCard(card)) {
    return (
      <CommitmentReviewOverlay
        card={card}
        onReviewAction={onCommitmentReviewAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentCheckInCard(card)) {
    return (
      <CommitmentCheckInOverlay
        card={card}
        onCheckInAction={onCommitmentCheckInAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentCard(card)) {
    return (
      <CommitmentCardOverlay
        card={card}
        timezone={timezone}
        onCommitmentAction={onCommitmentAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  const cardActionConfig = getLauncherCardActions({ launchSession, cardType });
  const resolvedActions = cardActionConfig.actions.map((action) => {
    if (action.id === "really_like_pack_card") return { ...action, onClick: onPackLike };
    if (action.id === LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP || action.id === LAUNCH_PRIMARY_ACTIONS.BACK_TO_HOME) {
      return { ...action, onClick: onPackContinue };
    }
    if (action.id === "not_done") return { ...action, onClick: () => onAction("later") };
    if (action.id === "do_now") return { ...action, onClick: () => onAction("now") };
    if (action.id === "done") return { ...action, onClick: () => onAction("done") };
    return action;
  });

  return (
    <PremiumCardScreen
      type={cardType}
      greeting={getGreeting(new Date(), timezone)}
      icon="heart"
      headline={card.promptText}
      subtitle={
        card.sourcePackId
          ? card.attribution || card.sourceTitle || "A card from your pack."
          : "A gentle nudge from the version of you that cares."
      }
      actions={resolvedActions}
      launcherVersions={directLauncherVersions}
      onLauncherLaunch={handleDirectLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseCurrentApp}
      onManageApp={onManageApp}
    />
  );
}

function PremiumCardScreen({
  type = "personal",
  greeting,
  icon = "heart",
  headline,
  subtitle,
  actions = [],
  launcherVersions = [],
  onLauncherLaunch,
  showDashboardShortcut = true,
  dashboardHref,
  onDashboard,
  onCreateCard,
  children,
  className = "",
  cardOverlayKey = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
}) {
  return (
    <CardRevealTemplate
      cardOverlayKey={cardOverlayKey}
      variant={type}
      greeting={greeting}
      icon={icon}
      message={headline}
      subtitle={subtitle}
      launchers={launcherVersions}
      actions={actions}
      onLauncherLaunch={onLauncherLaunch}
      showDashboardShortcut={showDashboardShortcut}
      dashboardHref={dashboardHref}
      onDashboard={onDashboard}
      onManageApp={onManageApp}
      onCreateCard={onCreateCard}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
    >
      {children}
    </CardRevealTemplate>
  );
}

function CommitmentCardOverlay({
  card,
  timezone,
  onCommitmentAction,
  launcherVersions = [],
  onLauncherLaunch,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
  showDashboardShortcut = true,
}) {
  const shownRef = useRef(false);
  const commitmentText = stripCommitmentPrefix(card.promptText);

  useEffect(() => {
    if (!card || shownRef.current) return;
    shownRef.current = true;
    logCommitmentDebug("commitment card shown", {
      cardId: card.id,
      commitmentText: card.promptText,
      commitmentTimingMode: card.commitmentTimingMode ?? card.commitmentStartWindow ?? getCommitmentStartWindow(card.timingWindows),
      commitmentCustomStartTime: card.commitmentCustomStartTime ?? "",
      commitmentCustomEndTime: card.commitmentCustomEndTime ?? "",
      timingWindows: card.timingWindows,
    });
  }, [card]);

  return (
    <PremiumCardScreen
      type="personal"
      greeting="TODAY’S COMMITMENT"
      icon="heart"
      headline={`I will ${commitmentText}`}
      subtitle=""
      actions={[
        { label: "I will commit to this", variant: "primary", onClick: () => onCommitmentAction("commit") },
        {
          label: "Not this time",
          variant: "secondary",
          onClick: () => {
            logCommitmentDebug("user declined from first screen", {
              cardId: card.id,
              commitmentText: card.promptText,
            });
            onCommitmentAction("decline");
          },
        },
      ]}
      launcherVersions={launcherVersions}
      onLauncherLaunch={onLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
      onManageApp={onManageApp}
      showDashboardShortcut={showDashboardShortcut}
    />
  );
}

function CommitmentMotivationOverlay({
  card,
  onCommitmentAction,
  launcherVersions = [],
  onLauncherLaunch,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
  showDashboardShortcut = true,
}) {
  const commitmentText = stripCommitmentPrefix(card.commitmentText ?? card.promptText ?? "");
  return (
    <CardRevealTemplate
      variant="personal"
      greeting="MESSAGE FROM YOURSELF"
      icon="heart"
      message=""
      subtitle=""
      launchers={launcherVersions}
      actions={[
        { label: "I’ll commit after all", variant: "primary", onClick: () => onCommitmentAction("commit_after_all") },
        { label: "Not this time", variant: "secondary", onClick: () => onCommitmentAction("decline_after_motivation") },
      ]}
      onLauncherLaunch={onLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
      onManageApp={onManageApp}
      showDashboardShortcut={showDashboardShortcut}
    >
      <div className="commitment-motivation-copy">
        <p className="commitment-motivation-intro">Before you decide...</p>
        {commitmentText ? <CardRevealMessage className="commitment-motivation-commitment" message={`I will ${commitmentText}`} /> : null}
        <p className="commitment-motivation-subline">You wrote this to yourself:</p>
        <CardRevealMessage className="commitment-motivation-reason" message={card.commitmentReason} />
      </div>
    </CardRevealTemplate>
  );
}

function CommitmentCheckInOverlay({
  card,
  onCheckInAction,
  launcherVersions = [],
  onLauncherLaunch,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
  showDashboardShortcut = true,
}) {
  return (
      <PremiumCardScreen
      type="personal"
      greeting="How’s it going?"
      icon="heart"
      headline={card.promptText}
      subtitle=""
      actions={[
        { label: "I’m on track", variant: "primary", onClick: () => onCheckInAction("on_track") },
        { label: "I’m somewhat on track", variant: "secondary", onClick: () => onCheckInAction("somewhat_on_track") },
        { label: "Let’s leave this for another day", variant: "secondary", onClick: () => onCheckInAction("closed_early") },
      ]}
      launcherVersions={launcherVersions}
      onLauncherLaunch={onLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
      onManageApp={onManageApp}
      showDashboardShortcut={showDashboardShortcut}
    />
  );
}

function CommitmentEncouragementOverlay({
  card,
  onContinue,
  launcherVersions = [],
  onLauncherLaunch,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
  showDashboardShortcut = true,
}) {
  const commitmentText = stripCommitmentPrefix(card.commitmentText ?? card.promptText ?? "");
  return (
    <PremiumCardScreen
      type="personal"
      greeting="Reminder"
      icon="heart"
      headline={commitmentText ? `I will ${commitmentText}` : card.promptText}
      subtitle={commitmentText ? card.promptText : "Keep going with what you said mattered."}
      actions={[
        { label: "Continue", variant: "primary", onClick: onContinue },
      ]}
      launcherVersions={launcherVersions}
      onLauncherLaunch={onLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
      onManageApp={onManageApp}
      showDashboardShortcut={showDashboardShortcut}
    />
  );
}

function CommitmentReviewOverlay({
  card,
  onReviewAction,
  launcherVersions = [],
  onLauncherLaunch,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
  onManageApp = null,
  showDashboardShortcut = true,
}) {
  return (
    <PremiumCardScreen
      type="personal"
      greeting=""
      icon="heart"
      headline={card.promptText}
      subtitle="How did it go?"
      actions={[
        { label: "I did it", variant: "primary", onClick: () => onReviewAction("did_it") },
        { label: "I nearly did it", variant: "secondary", onClick: () => onReviewAction("nearly_did_it") },
        { label: "I didn’t do it", variant: "secondary", onClick: () => onReviewAction("didnt_do_it") },
      ]}
      launcherVersions={launcherVersions}
      onLauncherLaunch={onLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseApp}
      onManageApp={onManageApp}
      showDashboardShortcut={showDashboardShortcut}
    />
  );
}

function CardRevealTemplate({
  greeting,
  icon = "heart",
  message,
  subtitle,
  launchers = [],
  actions = [],
  variant = "personal",
  onLauncherLaunch,
  showDashboardShortcut = true,
  dashboardHref,
  onDashboard,
  onManageApp,
  onCreateCard,
  children,
  className = "",
  cardOverlayKey = "",
  launcherAppId = null,
  launcherAppName = null,
  onPauseApp = null,
}) {
  const hasLaunchers = launchers?.length > 0;
  const hasActions = actions?.length > 0;
  const hasCtaContent = hasLaunchers || hasActions;
  const [showPauseModal, setShowPauseModal] = useState(false);
  useEffect(() => {
    setShowPauseModal(false);
  }, [cardOverlayKey]);
  const pauseButtonRef = useRef(null);
  const shouldManageLauncherApp = Boolean(launcherAppId && onManageApp);
  const dashboardLabel = shouldManageLauncherApp ? "Open app settings" : "Open dashboard";
  const dashboardTitle = shouldManageLauncherApp ? "App settings" : "Dashboard";
  const handleDashboardShortcut = (event) => {
    if (shouldManageLauncherApp) {
      event?.preventDefault?.();
      onManageApp(launcherAppId);
      return;
    }
    onDashboard?.(event);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__MYBISHBASH_CARD_OVERLAY_MOUNTS = [
      ...(window.__MYBISHBASH_CARD_OVERLAY_MOUNTS ?? []),
      {
        variant,
        cardOverlayKey,
        at: new Date().toISOString(),
        route: window.location.pathname + window.location.search,
      },
    ];
  }, [cardOverlayKey, variant]);

  return (
    <div className={`premium-card-screen premium-card-${variant} ${className}`.trim()} data-testid={`card-overlay-${variant}`}>
      {showDashboardShortcut ? (
        <PremiumDashboardShortcut
          href={shouldManageLauncherApp ? undefined : dashboardHref}
          onClick={handleDashboardShortcut}
          label={dashboardLabel}
          title={dashboardTitle}
        />
      ) : null}
      {onCreateCard ? <PremiumCreateShortcut onClick={onCreateCard} /> : null}
      {launcherAppId && onPauseApp ? (
        <PremiumPauseShortcut
          ref={pauseButtonRef}
          onClick={() => setShowPauseModal(true)}
        />
      ) : null}
      {showPauseModal && launcherAppId && onPauseApp ? (
        <AppPauseModal
          appName={launcherAppName ?? launcherAppId}
          triggerRef={pauseButtonRef}
          onClose={() => setShowPauseModal(false)}
          onPause={(mins) => {
            setShowPauseModal(false);
            onPauseApp(mins);
          }}
        />
      ) : null}
      <main className="premium-card-main" aria-live="polite">
        <section className="premium-card-header">
          {greeting ? <p className="premium-greeting">{greeting}</p> : null}
          <PremiumCardIcon icon={icon} />
        </section>
        <section className="premium-card-message-section">
          {message ? <CardRevealMessage message={message} /> : null}
          <span className="premium-divider" aria-hidden="true" />
          {subtitle ? <p className="premium-subtitle">{subtitle}</p> : null}
          {children}
        </section>
        <section className={`premium-card-cta ${hasLaunchers ? "has-launchers" : "no-launchers"} ${hasCtaContent ? "" : "is-empty"}`.trim()}>
            {hasLaunchers ? (
              <div className="premium-card-launchers">
                <FakeAppLauncherBar
                  versions={launchers}
                  onLaunch={onLauncherLaunch}
                  raised={false}
                />
              </div>
            ) : null}
            <PremiumActionStack actions={actions} />
        </section>
      </main>
    </div>
  );
}

function getMessageBaseSize(value) {
  const text = String(value ?? "").trim();
  const characterCount = text.length;
  const manualLines = text ? text.split(/\r\n|\r|\n/).length : 1;
  const estimatedLines = Math.max(manualLines, Math.ceil(characterCount / 20));

  if (estimatedLines <= 1 && characterCount <= 14) return 56;
  if (estimatedLines <= 2 && characterCount <= 24) return 48;
  if (estimatedLines <= 3 && characterCount <= 48) return 42;
  return 34;
}

function CardRevealMessage({ message, className = "" }) {
  const baseSize = getMessageBaseSize(message);
  const commitmentMatch = String(message ?? "").match(/^I will\r?\n([\s\S]+)$/);

  return (
    <div className={`premium-title-box ${className}`.trim()}>
      <h2
        className={`premium-headline ${commitmentMatch ? "commitment-headline" : ""}`.trim()}
        style={{ "--message-font-size": `${baseSize}px` }}
      >
        {commitmentMatch ? (
          <>
            <span className="commitment-headline-prefix">I will</span>
            <span className="commitment-headline-text">{commitmentMatch[1]}</span>
          </>
        ) : message}
      </h2>
    </div>
  );
}

function PremiumCardIcon({ icon }) {
  if (!icon || icon === "none") return null;

  if (typeof icon !== "string") {
    return <span className="premium-card-icon premium-card-icon-custom" aria-hidden="true">{icon}</span>;
  }

  return (
    <span className={`premium-card-icon premium-card-icon-${icon}`} aria-hidden="true">
      {icon === "spark" ? <SparkGlyph /> : <HeartGlyph />}
    </span>
  );
}

function PremiumDashboardShortcut({ href, onClick, label = "Open dashboard", title = "Dashboard" }) {
  const content = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.75" y="4.75" width="5.75" height="5.75" rx="1.25" />
        <rect x="13.5" y="4.75" width="5.75" height="5.75" rx="1.25" />
        <rect x="4.75" y="13.5" width="5.75" height="5.75" rx="1.25" />
        <rect x="13.5" y="13.5" width="5.75" height="5.75" rx="1.25" />
      </svg>
      <span className="sr-only">{label}</span>
    </>
  );

  const dashboardHref = href ?? `${BASE_PATH}/home`;

  if (href || !onClick) {
    return (
      <a className="premium-dashboard-shortcut" href={dashboardHref} onClick={(event) => onClick?.(event)} aria-label={label} title={title} data-testid="dashboard-shortcut">
        {content}
      </a>
    );
  }

  return (
    <button type="button" className="premium-dashboard-shortcut" onClick={(event) => onClick?.(event)} aria-label={label} title={title} data-testid="dashboard-shortcut">
      {content}
    </button>
  );
}

function PremiumCreateShortcut({ onClick }) {
  return (
    <button
      type="button"
      className="premium-dashboard-shortcut premium-create-shortcut"
      onClick={(event) => onClick?.(event)}
      aria-label="Create a MyBishBash"
      title="Create"
      data-testid="overlay-create-card-button"
    >
      <span aria-hidden="true">+</span>
      <span className="sr-only">Create a MyBishBash</span>
    </button>
  );
}

// ─── PremiumPauseShortcut ────────────────────────────────────────────────────
// White circular button with a two-bar pause icon.
// Appears only during fake-launcher / protected-app flows (when launcherAppId is set).
// Positioned below the dashboard (grid) shortcut on the top-right.

const PremiumPauseShortcut = React.forwardRef(function PremiumPauseShortcut({ onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className="premium-dashboard-shortcut premium-pause-shortcut"
      onClick={onClick}
      aria-label="Pause MyBishBash for this app"
      title="Pause MyBishBash"
      data-testid="pause-app-button"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <rect x="6" y="5" width="4" height="14" rx="1.5" />
        <rect x="14" y="5" width="4" height="14" rx="1.5" />
      </svg>
    </button>
  );
});

// ─── AppPauseModal ────────────────────────────────────────────────────────────
// Bottom sheet asking the user how long to pause MyBishBash for the current app.

const PAUSE_DURATION_OPTIONS = [
  { label: "30 minutes",  minutes: 30 },
  { label: "1 hour",   minutes: 60 },
  { label: "3 hours",  minutes: 180 },
];

function AppPauseModal({ appName, onClose, onPause, triggerRef = null, openAfterPause = true }) {
  const [confirmedLabel, setConfirmedLabel] = useState(null);
  const sheetRef = useRef(null);

  // Move focus into the dialog on mount; restore to the trigger button on close.
  useEffect(() => {
    const prev = document.activeElement;
    sheetRef.current?.focus();
    return () => {
      (triggerRef?.current ?? prev)?.focus();
    };
  }, [triggerRef]);

  function handleSelect(label, minutes) {
    setConfirmedLabel(label);
    // pauseApp write is deferred to match the confirmation delay so the
    // localStorage write and the navigation happen atomically.
    setTimeout(() => onPause(minutes), 1400);
  }

  return (
    <div className="modal-backdrop app-pause-backdrop" onClick={confirmedLabel ? undefined : onClose}>
      <div
        ref={sheetRef}
        className="app-pause-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {confirmedLabel ? (
          <div className="app-pause-confirmed" aria-live="polite">
            <span className="app-pause-confirmed-icon" aria-hidden="true">✓</span>
            <p className="app-pause-sheet-title">Paused for {confirmedLabel}</p>
            <p className="app-pause-sheet-body">{openAfterPause ? `Opening ${appName}…` : `${appName} will be active again automatically.`}</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="app-pause-close-btn"
              aria-label="Close without pausing"
              data-testid="pause-modal-close"
              onClick={onClose}
            >
              ×
            </button>
            <p className="app-pause-sheet-title" id="pause-sheet-title">
              Pause MyBishBash?
            </p>
            <p className="app-pause-sheet-body">
              For a short time, {appName} will open directly without showing App Prompts.
            </p>
            <div className="app-pause-options">
              {PAUSE_DURATION_OPTIONS.map(({ label, minutes }) => (
                <button
                  key={minutes}
                  type="button"
                  className="app-pause-option"
                  onClick={() => handleSelect(label, minutes)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PremiumActionStack({ actions = [] }) {
  if (!actions.length) return null;

  return (
    <div className="premium-action-stack">
      {actions.map((action) => (
        <PremiumActionButton
            key={action.key || action.testId || action.label}
          label={action.label}
          variant={action.variant}
          onClick={action.onClick}
          href={action.href}
            testId={action.testId}
        />
      ))}
    </div>
  );
}

function PremiumActionButton({ label, variant = "secondary", onClick, href, testId }) {
  const className = `premium-action-button premium-action-button-${variant === "primary" ? "primary" : "secondary"}`;
  const derivedTestId = `card-action-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  const resolvedTestId = testId || derivedTestId;

  if (href) {
    return (
      <a className={className} href={href} data-testid={resolvedTestId} onClick={(event) => onClick?.(event)}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" className={className} data-testid={resolvedTestId} onClick={(event) => onClick?.(event)}>
      {label}
    </button>
  );
}

function ActionCardOverlay({
  overlay,
  actionCards,
  onAccept,
  onClose,
  onLogEvent,
  fakeLauncherVersions,
  onFakeLauncherLaunch,
  allowBackHome = false,
  onDashboard,
  onCreateCard,
  cardOverlayKey = "",
  className = "",
  launcherAppId = null,
  launcherAppName = null,
  onManageApp = null,
}) {
  console.log("[ACTION CARDS] Overlay rendered");

  const available = useMemo(
    () => actionCards.filter((c) => !c.hidden && !c.deletedAt),
    [actionCards]
  );

  const [recentlyShown, setRecentlyShown] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const maxCardsPerSession = Math.min(3, available.length);
  const canShowAnotherIdea = maxCardsPerSession > 1 && recentlyShown.length < maxCardsPerSession;

  useEffect(() => {
    if (currentCard || available.length === 0) return;

    const nextCard = available[Math.floor(Math.random() * available.length)];
    setCurrentCard(nextCard);
    setRecentlyShown([nextCard.id]);
    logActionCardViewed(nextCard);
  }, [available, currentCard]);

  useEffect(() => {
    if (!currentCard) return;
    if (available.some((card) => card.id === currentCard.id)) return;
    console.log("[ACTION CARDS] Current card is no longer visible; rotating.");
    setCurrentCard(null);
  }, [available, currentCard]);

  function logActionCardViewed(card) {
    if (!card) return;
    void onLogEvent({
      event_type: "action_card_viewed",
      source_type: "action_card",
      card_source: "action_card",
      card_id: card.id,
      card_title: card.title,
      action_taken: "viewed",
    });
  }

  function pickNext() {
    if (!canShowAnotherIdea) return;

    if (currentCard) {
      void onLogEvent({
        event_type: "action_card_skipped",
        source_type: "action_card",
        card_source: "action_card",
        card_id: currentCard.id,
        card_title: currentCard.title,
        action_taken: "skipped",
      });
    }

    let pool = available.filter((c) => !recentlyShown.includes(c.id));

    if (pool.length === 0) {
      const fallbackPool = available.filter((c) =>
        currentCard ? c.id !== currentCard.id : true
      );
      pool = fallbackPool.length > 0 ? fallbackPool : available;
    }

    if (pool.length === 0) return;

    const nextCard = pool[Math.floor(Math.random() * pool.length)];

    console.log("[ACTION CARDS] Rotating action card", {
      from: currentCard?.id,
      to: nextCard.id,
    });
    setCurrentCard(nextCard);

    setRecentlyShown((prev) => {
      const updated = [nextCard.id, ...prev.filter((id) => id !== nextCard.id)];
      return updated.slice(0, 3);
    });

    logActionCardViewed(nextCard);
  }

  function handleAccept() {
    if (currentCard) {
      void onLogEvent({
        event_type: "action_card_completed",
        source_type: "action_card",
        card_source: "action_card",
        card_id: currentCard.id,
        card_title: currentCard.title,
        action_taken: "completed",
      });
      onAccept(currentCard);
    }
  }

  if (!currentCard) return null;

  return (
    <div className="premium-overlay-with-launchers">
      <PremiumCardScreen
        type="action"
        greeting={currentCard.category || "Action"}
        icon="spark"
        headline={currentCard.title}
        subtitle={currentCard.body || "An alternative to scrolling."}
        actions={[
          ...(canShowAnotherIdea ? [{ label: "Another idea", variant: "secondary", onClick: pickNext }] : []),
          { label: "I'll do this", variant: "primary", onClick: handleAccept },
        ]}
        launcherVersions={fakeLauncherVersions}
        onLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={`${cardOverlayKey}:${currentCard.id}`}
        className={className}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    </div>
  );
}

function ActionCardEmptyOverlay({ overlay, version, onClose, onLogEvent, onCreateActionCard, onContinueToApp, fakeLauncherVersions, onFakeLauncherLaunch, allowBackHome = false, onDashboard, onCreateCard, cardOverlayKey = "", className = "", launcherAppId = null, launcherAppName = null, onManageApp = null }) {
  const continueHref = version ? getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true })) : "";

  function handleContinueToApp(event) {
    if (!version) return;

    void onLogEvent({
      event_type: "intercept_continue_to_app",
      source_type: "action_card_empty",
      card_source: "action_card_empty",
      app_id: version.id,
      app_name: version.name,
      launcher_context: version.id,
      action_taken: "continued_to_app",
    });
    const handled = onContinueToApp?.(version.id, {
      source: "action_card_empty",
      reason: "user_pressed_continue",
      allowDefaultNavigation: Boolean(continueHref),
      preferDirectAppDestination: true,
    });
    if (handled !== false) event?.preventDefault?.();
  }

  return (
    <div className="premium-overlay-with-launchers">
      <PremiumCardScreen
        type="empty"
        greeting="Action Cards"
        icon="spark"
        headline="No action ideas yet."
        subtitle="Make one for yourself."
        actions={[
          ...(allowBackHome ? [{ label: "Back home", variant: "secondary", onClick: onClose }] : []),
          ...(version ? [{ label: `Continue to ${version.name}`, variant: "secondary", href: continueHref, onClick: handleContinueToApp }] : []),
          { label: "Create action card", variant: "primary", onClick: onCreateActionCard },
        ]}
        launcherVersions={fakeLauncherVersions}
        onLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={className}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    </div>
  );
}

function ActionSuccessOverlay({ onClose, onDashboard, onCreateCard, cardOverlayKey = "", className = "" }) {
  const actions = [
    { label: "Back home", variant: "primary", onClick: onClose },
  ];

  return (
    <PremiumCardScreen
      type="action"
      greeting="Action"
      icon="heart"
      headline="Nice choice."
      subtitle="Take all the time you need."
      actions={actions}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
    />
  );
}

function FlowConfirmationOverlay({ overlay, version, onClose, onContinueToApp, onChooseElse, onDashboard, onCreateCard, cardOverlayKey = "", className = "", launcherAppId = null, launcherAppName = null, onManageApp = null }) {
  const continueHref = version ? getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true })) : "";
  const actionLabel = overlay.actionLabel || "Continue";
  const actions = version
    ? [
        {
          label: actionLabel,
          variant: "primary",
          href: continueHref,
          onClick: (event) => {
            const handled = onContinueToApp?.(version.id, {
              source: "flow_confirmation",
              reason: "user_pressed_continue_after_confirmation",
              allowDefaultNavigation: Boolean(continueHref),
              preferDirectAppDestination: true,
            });
            if (handled !== false) event?.preventDefault?.();
          },
        },
        { label: "Do something else", variant: "secondary", onClick: onChooseElse },
      ]
    : [{ label: actionLabel, variant: "primary", onClick: onClose }];

  return (
    <PremiumCardScreen
      type="personal"
      greeting="MyBishBash"
      icon="heart"
      headline={overlay.message || "Thanks for the update."}
      subtitle=""
      actions={actions}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={className}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onManageApp={onManageApp}
    />
  );
}

function CustomPackOverlay({ overlay, onClose, onDashboard }) {
  const [activeIndex, setActiveIndex] = useState(overlay.activeIndex ?? 0);
  const touchStartX = useRef(null);
  const messages = overlay.messages ?? [];

  useEffect(() => {
    setActiveIndex(overlay.activeIndex ?? 0);
  }, [overlay.activeIndex, overlay.packId]);

  function move(delta) {
    if (messages.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next >= messages.length) return messages.length - 1;
      return next;
    });
  }

  return (
    <div
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current == null) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
        const delta = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 36) return;
        move(delta < 0 ? 1 : -1);
      }}
    >
      <PremiumCardScreen
        type="pack"
        greeting={overlay.name}
        icon="heart"
        headline={messages[activeIndex] ?? "Your pack is ready."}
        subtitle="Swipe through these little interruptions."
        onDashboard={onDashboard}
      >
        {messages.length > 1 ? (
          <div className="premium-card-pagination">
            {messages.map((message, index) => (
              <button
                key={`${overlay.packId}-dot-${index}`}
                type="button"
                className={`pagination-dot ${index === activeIndex ? "active" : ""}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Show card ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </PremiumCardScreen>
    </div>
  );
}

function InterceptionOverlay({ overlay, version, onChooseElse, onLogEvent, onLogLauncherEvent, onContinueToApp, onFakeLauncherLaunch, onDashboard, onCreateCard, cardOverlayKey = "", launcherAppId = null, launcherAppName = null, onPauseApp = null, onManageApp = null }) {
  const [activeIndex, setActiveIndex] = useState(overlay.activeIndex ?? 0);
  const [showFallbackLink, setShowFallbackLink] = useState(false);
  const touchStartX = useRef(null);
  const fallbackTimerRef = useRef(null);
  const viewedCardRef = useRef("");
  const messages = useMemo(() => overlay.messages ?? [], [overlay.messages]);
  const cards = useMemo(
    () =>
      overlay.cards ?? messages.map((message, index) => ({
        id: `${overlay.packId}:${index}`,
        title: message,
        text: message,
      })),
    [messages, overlay.cards, overlay.packId],
  );

  useEffect(() => {
    setActiveIndex(overlay.activeIndex ?? 0);
    setShowFallbackLink(false);
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
    }
    return () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, [overlay.activeIndex, overlay.packId]);

  useEffect(() => {
    const activeMessage = messages[activeIndex];
    if (!activeMessage || !version) return;

    const viewKey = `${overlay.packId}:${cards[activeIndex]?.id ?? activeIndex}`;
    if (viewedCardRef.current === viewKey) return;
    viewedCardRef.current = viewKey;

    void onLogEvent({
      event_type: "first_interruption_seen",
      source_type: "interruption",
      card_source: "interruption",
      card_id: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
      card_title: activeMessage,
      card_text: activeMessage,
      app_id: version.id,
      app_name: version.name,
      launcher_context: version.id,
      target_app: overlay.targetApp ?? version.id,
      pack_id: overlay.packId,
      message_id: `${overlay.packId}:${activeIndex}`,
      action_taken: "viewed",
      metadata: {
        packTitle: overlay.name,
        message: activeMessage,
      },
    });
    console.log("[INTERCEPT] viewed event logged", {
      versionId: version.id,
      packId: overlay.packId,
      cardId: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
      messageId: `${overlay.packId}:${activeIndex}`,
      cardIndex: activeIndex,
    });
    void onLogLauncherEvent?.("first_interruption_seen", version.id, {
      card_id: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
      card_index: activeIndex,
      pack_id: overlay.packId,
    });
  }, [activeIndex, cards, messages, onLogEvent, onLogLauncherEvent, overlay.name, overlay.packId, overlay.targetApp, version]);

  function move(delta) {
    if (messages.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next >= messages.length) return messages.length - 1;
      return next;
    });
  }

  const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true }));

  function handleContinueToApp(event) {
    if (!version) return;
    const handled = onContinueToApp?.(version.id, {
      source: "interruption_card",
      reason: "user_pressed_continue",
      allowDefaultNavigation: Boolean(continueHref),
      preferDirectAppDestination: true,
    });
    if (handled !== false) event?.preventDefault?.();
  }

  const activeMessage = messages[activeIndex] ?? "Pause for a second.";
  const hasMultipleMessages = messages.length > 1;

  return (
    <div
      className="premium-interception-frame"
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current == null) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
        const delta = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 36) return;
        move(delta < 0 ? 1 : -1);
      }}
    >
      <PremiumCardScreen
        type="interruption"
        greeting={overlay.name || version?.name || "Before you open"}
        icon="heart"
        headline={activeMessage}
        subtitle="A little pause before the app opens."
        actions={[
          {
            label: `Continue to ${version?.name ?? "App"}`,
            variant: "primary",
            href: continueHref,
            onClick: (event) => {
              event?.stopPropagation?.();
              handleContinueToApp(event);
            },
          },
          {
            label: "Do something else",
            variant: "secondary",
            onClick: (event) => {
              event?.stopPropagation?.();
              onChooseElse();
            },
          },
        ]}
        launcherVersions={[]}
        onLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={`${cardOverlayKey}:${cards[activeIndex]?.id ?? activeIndex}`}
        className="launcher-interception-card"
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseApp}
        onManageApp={onManageApp}
      >
        {hasMultipleMessages ? (
          <div className="premium-card-pagination">
            {messages.map((message, index) => (
              <button
                key={`${overlay.packId}-dot-${index}`}
                type="button"
                className={`pagination-dot ${index === activeIndex ? "active" : ""}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Show card ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </PremiumCardScreen>
      {showFallbackLink && version?.manualUrl ? (
        <p className="manual-open-copy premium-manual-open-copy">
          App didn&apos;t open?{" "}
          <a className="link-button" href={continueHref} onClick={handleContinueToApp}>
            Open {version.name} manually
          </a>
        </p>
      ) : null}
    </div>
  );
}

function ActionButton({ label, onClick, tone = "ghost", href }) {
  return (
    <PremiumActionButton
      label={label}
      variant={tone === "solid" ? "primary" : "secondary"}
      onClick={onClick}
      href={href}
    />
  );
}

function ChevronRightGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="check-glyph" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7.4" />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="spark-glyph" aria-hidden="true">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="plus-glyph" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="close-glyph" aria-hidden="true">
      <path d="M7 7l10 10" />
      <path d="M17 7L7 17" />
    </svg>
  );
}

function CardIcon({ icon = "heart", sourcePackId }) {
  if (sourcePackId === "encouraging-bible-verses" || icon === "book") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M12 16h18c6 0 10 4 10 10v24H22c-6 0-10-4-10-10V16z" />
        <path d="M52 16H34c-6 0-10 4-10 10v24h18c6 0 10-4 10-10V16z" />
        <path d="M24 20h12" />
        <path d="M28 28h8" />
      </svg>
    );
  }

  if (sourcePackId === "motivational-quotes" || icon === "quote") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M20 24c0 8-4 14-12 18 1-6 3-10 7-13-5-1-8-4-8-9 0-5 4-9 9-9 5 0 9 4 9 13z" />
        <path d="M48 24c0 8-4 14-12 18 1-6 3-10 7-13-5-1-8-4-8-9 0-5 4-9 9-9 5 0 9 4 9 13z" />
      </svg>
    );
  }

  if (icon === "water") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M22 18h20l-3 32H25l-3-32z" />
        <path d="M24 30c2-2 5-3 8-3s6 1 8 3" />
        <path d="M28 13c0-3 2-5 4-5s4 2 4 5" />
      </svg>
    );
  }

  if (icon === "moon") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M37 10c-9 3-15 12-15 22 0 14 11 24 25 24 4 0 7-1 10-2-4 4-10 6-16 6-14 0-26-11-26-26 0-11 7-21 17-24 2-1 4-1 5 0z" />
        <path d="M46 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
        <path d="M52 27l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </svg>
    );
  }

  if (icon === "leaf") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration earthy" aria-hidden="true">
        <path d="M32 50V23" />
        <path d="M32 31c-7 0-12-4-12-11 7 0 12 4 12 11z" />
        <path d="M32 36c7 0 12-4 12-11-7 0-12 4-12 11z" />
        <path d="M32 44c-5 0-9 4-9 9 5 0 9-4 9-9z" />
      </svg>
    );
  }

  if (icon === "flower") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration bloom" aria-hidden="true">
        <circle cx="32" cy="28" r="4" />
        <path d="M32 51V32" />
        <path d="M32 24c0-7 5-12 12-12 0 7-5 12-12 12z" />
        <path d="M32 24c0-7-5-12-12-12 0 7 5 12 12 12z" />
        <path d="M28 28c-7 0-12-5-12-12 7 0 12 5 12 12z" />
        <path d="M36 28c7 0 12-5 12-12-7 0-12 5-12 12z" />
        <path d="M32 42c-5 0-9 4-9 9 5 0 9-4 9-9z" />
        <path d="M32 42c5 0 9 4 9 9-5 0-9-4-9-9z" />
      </svg>
    );
  }

  if (icon === "star") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M32 10l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" />
      </svg>
    );
  }

  if (icon === "heart") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M20 18c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16s-12-6-12-16z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
      <path d="M20 18c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16s-12-6-12-16z" />
    </svg>
  );
}

// HeartGlyph → imported from ./components/Glyphs

function EnvelopeGlyph() {
  return (
    <svg viewBox="0 0 120 120" className="envelope-glyph" aria-hidden="true">
      <path d="M20 36h80v52c0 6-4 10-10 10H30c-6 0-10-4-10-10V36z" />
      <path d="M20 40l40 30 40-30" />
      <path d="M28 94l21-23" />
      <path d="M92 94L71 71" />
      <path d="M60 29c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16S60 39 60 29z" />
      <path d="M16 28l4 1 1 4 1-4 4-1-4-1-1-4-1 4z" />
      <path d="M98 24l3 1 1 3 1-3 3-1-3-1-1-3-1 3z" />
    </svg>
  );
}

function HomeGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M6 15l10-8 10 8" />
      <path d="M9 14v11h14V14" />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M8 7h8c3 0 5 2 5 5v13H13c-3 0-5-2-5-5V7z" />
      <path d="M24 7h-8c-3 0-5 2-5 5v13h8c3 0 5-2 5-5V7z" />
    </svg>
  );
}

// LogGlyph → imported from ./components/Glyphs

function PacksGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M7 10h18v6H7z" />
      <path d="M9 16h14v10H9z" />
      <path d="M14 7h4" />
    </svg>
  );
}

function AppsGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <rect x="7" y="7" width="7" height="7" rx="2" />
      <rect x="18" y="7" width="7" height="7" rx="2" />
      <rect x="7" y="18" width="7" height="7" rx="2" />
      <rect x="18" y="18" width="7" height="7" rx="2" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M16 10a6 6 0 100 12 6 6 0 000-12z" />
      <path d="M16 4v3" />
      <path d="M16 25v3" />
      <path d="M4 16h3" />
      <path d="M25 16h3" />
      <path d="M7.5 7.5l2.2 2.2" />
      <path d="M22.3 22.3l2.2 2.2" />
      <path d="M24.5 7.5l-2.2 2.2" />
      <path d="M9.7 22.3l-2.2 2.2" />
    </svg>
  );
}

function AuthDiagnostics({ session }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const configured = !!import.meta.env.VITE_SUPABASE_URL;
    const hasKey = typeof window !== "undefined" ? !!window.localStorage.getItem("mybishbash.supabase.auth.v1") : false;
    const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone);
    const route = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    
    setStatus({
      configured, hasKey, isStandalone, route
    });
  }, [session]);

  if (!status) return null;

  return (
    <div style={{ padding: "12px", background: "rgba(0,0,0,0.03)", borderRadius: "12px", fontSize: "12px", fontFamily: "monospace", color: "var(--charcoal)", border: "1px solid rgba(0,0,0,0.06)", marginTop: "12px" }}>
      <strong style={{ display: "block", marginBottom: 6 }}>Auth Diagnostics</strong>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Configured:</span> <span>{status.configured ? "True" : "False"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Session:</span> <span>{session ? "Present" : "Missing"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Email:</span> <span>{session?.user?.email || "N/A"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Storage Key:</span> <span>{status.hasKey ? "Present" : "Missing"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Expires:</span> <span>{session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : "N/A"}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Route:</span> <span>{status.route}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Standalone:</span> <span>{status.isStandalone ? "True" : "False"}</span></div>
    </div>
  );
}

function LegalPage({ title, docUrl }) {
  const [content, setContent] = useState("Loading...");

  useEffect(() => {
    fetch(docUrl)
      .then((res) => res.text())
      .then((text) => {
        const parsed = text
          .replace(/^# (.*$)/gim, "<h1>$1</h1>")
          .replace(/^## (.*$)/gim, "<h2>$1</h2>")
          .replace(/^### (.*$)/gim, "<h3>$1</h3>")
          .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
          .replace(/^- (.*$)/gim, "<li>$1</li>")
          .replace(/^---$/gim, "<hr />");

        const lines = parsed.split("\n");
        let inList = false;
        const formatted = lines
          .map((line) => {
            if (line.startsWith("<li>")) {
              if (!inList) {
                inList = true;
                return "<ul>" + line;
              }
              return line;
            } else {
              let out = line;
              if (inList) {
                inList = false;
                out = "</ul>" + line;
              }
              if (!line.startsWith("<h") && !line.startsWith("<u") && !line.startsWith("<hr") && line.trim().length > 0) {
                return "<p>" + out + "</p>";
              }
              return out;
            }
          })
          .join("");

        setContent(formatted + (inList ? "</ul>" : ""));
      })
      .catch(() => setContent("<p>Failed to load document.</p>"));
  }, [docUrl]);

  return (
    <div className="app-shell" style={{ backgroundColor: "#FAF7F2", minHeight: "100vh" }}>
      <div style={{ padding: "24px", maxWidth: "600px", margin: "0 auto", position: "relative", zIndex: 10 }}>
        <a href={BASE_PATH || "/"} style={{ display: "inline-block", marginBottom: "24px", textDecoration: "underline", color: "var(--charcoal)", fontWeight: "bold" }}>
          ← Back
        </a>
        <div className="legal-content" style={{ lineHeight: "1.6", color: "var(--charcoal)", fontSize: "16px" }} dangerouslySetInnerHTML={{ __html: content }} />
      </div>
      <style dangerouslySetInnerHTML={{__html: "\n" +
        "  .legal-content h1 { font-size: 24px; font-weight: bold; margin-bottom: 16px; margin-top: 32px; }\n" +
        "  .legal-content h2 { font-size: 20px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content h3 { font-size: 16px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content p { margin-bottom: 16px; }\n" +
        "  .legal-content ul { margin-bottom: 16px; padding-left: 20px; list-style-type: disc; }\n" +
        "  .legal-content li { margin-bottom: 8px; }\n" +
        "  .legal-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 32px 0; }\n"
      }} />
    </div>
  );
}

function ContinueToAppCard({ appName, appIcon, href, onContinue, onBack, onDashboard, onManageApp = null, launcherAppId = null, launcherAppName = null, onPauseApp = null, className = "" }) {
  const actions = [
    { label: `Continue to ${appName}`, variant: "primary", href, onClick: onContinue },
    ...(onBack ? [{ label: "Back to MyBishBash", variant: "secondary", onClick: onBack }] : []),
  ];
  const [showPauseModal, setShowPauseModal] = useState(false);
  const pauseButtonRef = useRef(null);
  const shouldManageLauncherApp = Boolean(launcherAppId && onManageApp);
  const dashboardLabel = shouldManageLauncherApp ? "Open app settings" : "Open dashboard";
  const dashboardTitle = shouldManageLauncherApp ? "App settings" : "Dashboard";
  const handleDashboardShortcut = (event) => {
    if (shouldManageLauncherApp) {
      event?.preventDefault?.();
      onManageApp(launcherAppId);
      return;
    }
    onDashboard?.(event);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__MYBISHBASH_CONTINUE_CARD_MOUNTS = [
      ...(window.__MYBISHBASH_CONTINUE_CARD_MOUNTS ?? []),
      {
        appName,
        href,
        at: new Date().toISOString(),
        route: window.location.pathname + window.location.search,
      },
    ];
  }, [appName, href]);

  return (
    <div className={`premium-card-screen premium-card-personal ${className}`.trim()} data-testid="continue-to-app-card">
      <PremiumDashboardShortcut onClick={handleDashboardShortcut} label={dashboardLabel} title={dashboardTitle} />
      {launcherAppId && onPauseApp ? (
        <PremiumPauseShortcut
          ref={pauseButtonRef}
          onClick={() => setShowPauseModal(true)}
        />
      ) : null}
      {showPauseModal && launcherAppId && onPauseApp ? (
        <AppPauseModal
          appName={launcherAppName ?? appName}
          triggerRef={pauseButtonRef}
          onClose={() => setShowPauseModal(false)}
          onPause={(mins) => {
            setShowPauseModal(false);
            onPauseApp(mins);
          }}
        />
      ) : null}
      <main className="premium-card-main" aria-live="polite">
        <section className="premium-card-header" />
        <section className="premium-card-message-section" style={{ alignItems: 'center', textAlign: 'center' }}>
          {appIcon ? (
            <img src={appIcon} alt={`${appName} icon`} style={{ width: 72, height: 72, borderRadius: 16, marginBottom: 32, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }} />
          ) : null}
          <h2 style={{ fontSize: '26px', fontWeight: 400, fontFamily: 'var(--font-serif, Georgia, serif)', color: 'var(--charcoal)', textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
            Continue to {appName}?
          </h2>
        </section>
        <section className="premium-card-cta no-launchers">
          <PremiumActionStack actions={actions} />
        </section>
      </main>
    </div>
  );
}

export default App;
