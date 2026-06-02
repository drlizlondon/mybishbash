import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_HOME_SCREEN_VERSIONS,
  DEFAULT_ACTION_CARDS,
  clearSharedMyBishBashState,
  loadCards,
  loadCardPacks,
  loadDislikedPackCardIds,
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
  saveDislikedPackCardIds,
  saveGlobalInterruptionMode,
  saveHiddenLibraryPacks,
  saveHomeScreenVersions,
  saveLauncherBehaviorSettings,
  saveMood,
  saveNotificationSettings,
  saveProfile,
  saveActionCards,
  saveSetupComplete,
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
  INVITE_ONLY_ACCESS_ERROR,
  loadSharedState,
  saveSharedState,
  getSession,
  onAuthStateChange,
  signUp,
  logIn,
  logOut,
  hasAccessEntitlement,
  markNotificationOpened,
  saveLauncherEvent,
  saveNotificationPreferences,
  savePushSubscription,
  checkIsAdmin,
  fetchGlobalPacks,
  fetchLauncherConfigs,
  touchUserProfile,
} from "./lib/mybishbashSync";
import {
  PACKS,
  FREQUENCY_OPTIONS,
  ICON_OPTIONS,
  THEMES,
  TIME_WINDOWS,
  applyCardAction,
  buildCardsFromPack,
  createId,
  getGreeting,
  getHomeSortRank,
  getStatusMeta,
  getThemeClass,
  getCurrentWindow,
  isEligible,
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
  getPackDislikeKey,
  buildInterruptionFolder,
  getInterruptionPackForLauncher,
  resolveVersionConfig,
  buildCustomPackOverlay,
  buildInterruptionHomeItem,
  pickInterruptionCardIndex,
  getVersionOpenHref,
} from "./lib/launcherState";
import { getLauncherConfig, isKnownLauncher, mergeLauncherConfig } from "./lib/launcherRegistry";
import { getLauncherDecisionReadiness, LAUNCHER_DATA_WAIT_TIMEOUT_MS } from "./lib/launcherFlow";
import { buildLauncherEventPayload, getAppDisplayMode } from "./lib/launcherEvents";
import {
  DEFAULT_WEIGHTED_FLOW_SETTINGS,
  buildCardExposureLookup,
  getWeightedLauncherFlowGate,
  selectWeightedLauncherCard,
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
import { checkForAppUpdate, refreshMyBishBashAppShell } from "./appUpdate";

const HQPanel = lazy(() => import("./HQPanel"));
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
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";
const HQ_ADMIN_EMAILS = (import.meta.env.VITE_HQ_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const SIGNUP_ONBOARDING_PENDING_KEY = "mybishbash.signup-onboarding-pending.v1";

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

function isE2EModeEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(E2E_MODE_KEY) === "true";
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

function isSameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  if (normalized === "/packs") return { kind: "packs", path: normalized, tab: "packs" };
  if (normalized === "/library") return { kind: "library", path: normalized, tab: "library" };
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

function describeLogEvent(event) {
  if (event.event_type === "pack_card_liked") {
    return `Really liked: ${event.card_title || event.card_text || "a pack card"}`;
  }

  if (event.event_type === "intercept_do_something_else") {
    return `You chose something else instead of opening ${event.app_name || "that app"}.`;
  }

  if (event.event_type === "intercept_continue_to_app") {
    return `You continued to ${event.app_name || "the app"} after pausing.`;
  }

  if (event.event_type === "bash_done") {
    return `You completed: ${event.bash_title || "a MyBishBash"}`;
  }

  if (event.event_type === "bash_do_now") {
    return `You chose to do: ${event.bash_title || "a MyBishBash"}`;
  }

  if (event.event_type === "bash_not_done") {
    return `You left this MyBishBash for later: ${event.bash_title || "a MyBishBash"}`;
  }

  return "A little MyBishBash moment was recorded.";
}

function getLogEventDisplayLabel(event) {
  const labels = {
    pack_card_liked: "Really liked",
    pack_card_disliked: "Hidden card",
    pack_card_restored: "Restored card",
    intercept_card_disliked: "Hidden interruption card",
    intercept_card_restored: "Restored interruption card",
  };
  return labels[event.event_type] ?? event.event_type;
}

function isCompletionEvent(event) {
  return event.event_type === "bash_done";
}

function isInterruptionSummaryEvent(event) {
  return ["intercept_do_something_else", "intercept_continue_to_app"].includes(event.event_type);
}

function pickRandomHomeCardForDisplay(
  currentCards,
  timezone,
  launcherContext,
  versions,
  behaviors,
  customPacks,
  hiddenCardIds,
  globalInterruptionMode,
  events,
  options = {},
) {
  const excludedCardIds = new Set(options.excludeCardIds ?? []);
  const normalized = normalizeCards(currentCards, new Date(), timezone);
  const interruptionPack = getInterruptionPackForLauncher(launcherContext, versions, behaviors, customPacks, {
    hiddenCardIds,
    globalEnabled: globalInterruptionMode,
  });
  const singles = normalized
    .filter((card) => !excludedCardIds.has(card.id) && !card.sourcePackId && isEligible(card, new Date(), timezone))
    .map((card) => ({ type: "single", card }));

  const packMap = new Map();
  normalized.forEach((card) => {
    if (excludedCardIds.has(card.id)) return;
    if (!isPackCardAvailable(card)) return;
    if (!packMap.has(card.sourcePackId)) {
      packMap.set(card.sourcePackId, []);
    }
    packMap.get(card.sourcePackId).push(card);
  });

  const packs = Array.from(packMap.values()).map((packCards) => ({
    type: "pack",
    packCards,
  }));

  const candidates = [...singles];

  if (interruptionPack?.cards?.length > 0) {
    return {
      normalized,
      selected: null,
      interruption: {
        type: "interruption",
        pack: interruptionPack,
        versionId: launcherContext,
        activeIndex: pickInterruptionCardIndex(interruptionPack, events),
      },
    };
  }

  candidates.push(...packs);

  if (candidates.length === 0) {
    return { normalized, selected: null };
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  if (chosen.type === "single") {
    return { normalized, selected: chosen.card };
  }
  if (chosen.type === "interruption") {
    return { normalized, selected: null, interruption: chosen };
  }
  const selected = chosen.packCards[Math.floor(Math.random() * chosen.packCards.length)];
  return { normalized, selected };
}

function pickRandomPersonalCardForLauncher(currentCards, timezone, excludedCardIds = new Set()) {
  const normalized = normalizeCards(currentCards, new Date(), timezone);
  const candidates = normalized.filter((card) =>
    !excludedCardIds.has(card.id) &&
    !card.sourcePackId &&
    !card.deletedAt &&
    isEligible(card, new Date(), timezone)
  );
  if (candidates.length === 0) {
    return { normalized, selected: null };
  }
  return {
    normalized,
    selected: candidates[Math.floor(Math.random() * candidates.length)],
  };
}

function pickRandomGeneralCardForLauncher(currentCards, timezone, excludedCardIds = new Set()) {
  const normalized = normalizeCards(currentCards, new Date(), timezone);
  const singles = normalized
    .filter((card) =>
      !excludedCardIds.has(card.id) &&
      !card.sourcePackId &&
      !card.deletedAt &&
      isEligible(card, new Date(), timezone)
    )
    .map((card) => ({ type: "single", card }));

  const packMap = new Map();
  normalized.forEach((card) => {
    if (excludedCardIds.has(card.id)) return;
    if (!isPackCardAvailable(card)) return;
    if (!packMap.has(card.sourcePackId)) {
      packMap.set(card.sourcePackId, []);
    }
    packMap.get(card.sourcePackId).push(card);
  });

  const packs = Array.from(packMap.values()).map((packCards) => ({
    type: "pack",
    packCards,
  }));
  const candidates = [...singles, ...packs];

  if (candidates.length === 0) {
    return { normalized, selected: null, selectedSource: "none" };
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  if (chosen.type === "single") {
    return { normalized, selected: chosen.card, selectedSource: "personal" };
  }
  const selected = chosen.packCards[Math.floor(Math.random() * chosen.packCards.length)];
  return {
    normalized,
    selected,
    selectedSource: selected ? "pack" : "none",
    selectedPackId: selected?.sourcePackId ?? null,
  };
}

function getLauncherCardStats(currentCards, timezone, excludedCardIds = new Set()) {
  const normalized = normalizeCards(currentCards, new Date(), timezone);
  const activePackCards = normalized.filter((card) =>
    isPackCardAvailable(card) && !excludedCardIds.has(card.id)
  );
  const eligiblePersonalCards = normalized.filter((card) =>
    !card.sourcePackId && !card.deletedAt && !excludedCardIds.has(card.id) && isEligible(card, new Date(), timezone)
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
  return normalizeCards(currentCards, new Date(), timezone).filter((card) =>
    card.sourcePackId ? isPackCardAvailable(card) : isEligible(card, new Date(), timezone) && !card.deletedAt
  ).length;
}

function getBrowserSafeDestinationHref(href) {
  if (!href) return "";
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
  if (!isStandalone && href.startsWith("x-safari-")) {
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

function getLauncherEligibilityAudit(card, { date, timezone, excludedCardIds = new Set(), packCardTimeoutMs = 0, exposureByCardId = new Map() }) {
  const todayKey = getTodayKey(date, timezone);
  const currentWindow = getCurrentWindow(date, timezone);
  const isPack = Boolean(card.sourcePackId);
  const windows = card.timingWindows ?? ["morning", "day", "evening"];
  const lastExposure = exposureByCardId.get(card.id) ?? (card.lastShownAt ? new Date(card.lastShownAt).getTime() : 0);
  const activePack = isPackCardAvailable(card) && !excludedCardIds.has(card.id);
  const packOutsideTimeout = !isPack || packCardTimeoutMs <= 0 || !lastExposure || lastExposure + packCardTimeoutMs <= date.getTime();

  const checks = [
    { name: "excluded_by_launcher", pass: !excludedCardIds.has(card.id), appliesToPacks: true },
    { name: "not_deleted", pass: !card.deletedAt, appliesToPacks: true },
    { name: "not_paused", pass: !card.paused, appliesToPacks: true },
    { name: "not_disliked", pass: !card.disliked, appliesToPacks: true },
    { name: "not_hidden_pack_card", pass: !isPack || !card.hidden, appliesToPacks: true },
    { name: "not_done_today", pass: isPack || (card.doneDate !== todayKey && card.statusToday !== "doneToday"), appliesToPacks: false },
    { name: "personal_cooldown_expired", pass: isPack || !card.lastShownAt || new Date(card.lastShownAt).getTime() + 30 * 60 * 1000 <= date.getTime(), appliesToPacks: false },
    { name: "not_yet_expired", pass: isPack || !card.notYetUntil || new Date(card.notYetUntil).getTime() <= date.getTime(), appliesToPacks: false },
    { name: "timing_window_matches", pass: isPack || windows.includes(currentWindow), appliesToPacks: false },
    { name: "pack_timeout_expired", pass: packOutsideTimeout, appliesToPacks: true },
  ];
  const failed = checks.filter((check) => !check.pass);
  const legacyEligible = !isPack && !card.deletedAt && !excludedCardIds.has(card.id) && isEligible(card, date, timezone);
  const generalEligible = isPack ? activePack : legacyEligible;
  const weightedEligible = isPack ? activePack && packOutsideTimeout : legacyEligible;

  return {
    currentWindow,
    legacyEligible,
    generalEligible,
    weightedEligible,
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
  weightedFlowGate,
  interruptionPack,
  selected,
  plannedInterruption,
}) {
  if (!isLauncherAuditEnabled()) return;
  const date = new Date();
  const weights = fallbackDisplay.weights ?? DEFAULT_WEIGHTED_FLOW_SETTINGS;
  const normalized = normalizeCards(cards, date, timezone);
  const exposureByCardId = buildCardExposureLookup(normalized, events);
  const cardAudits = normalized.map((card) => {
    const eligibility = getLauncherEligibilityAudit(card, {
      date,
      timezone,
      excludedCardIds,
      packCardTimeoutMs: weights.packCardTimeoutMs,
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
    weightedFlowGate,
    summaryCounts: {
      eligiblePersonalCards: cardAudits.filter((card) => !card.sourcePackId && card.eligibility.generalEligible).length,
      eligiblePackCards: cardAudits.filter((card) => card.sourcePackId && card.eligibility.generalEligible).length,
      activePackCards: launcherStats.activePackCardsCount,
      activatedPacks: activatedPacks.size,
      totalCardsEnteringWeightedSelection: (fallbackDisplay.availablePersonalCount ?? 0) + (fallbackDisplay.availablePackCount ?? 0),
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
  dislikedPackCardIds,
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
    dislikedPackCardIds,
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
    dislikedPackCardIds: Array.isArray(source.dislikedPackCardIds)
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

function App() {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const routeParam = params.get("route");
    const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
    const normalizedPath = normalizeRoutePath(rawPath);
    const hasAppRouteParam = params.has("route");
    const isStandaloneMode = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone || !!window.Capacitor;

    if (normalizedPath === "/early-access") {
      return <EarlyAccessPage />;
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
    const dislikedPackCardIds = loadDislikedPackCardIds();
    const cards = base.cards.map((card) =>
      card.sourcePackId
        ? { ...card, disliked: dislikedPackCardIds.includes(getPackDislikeKey(card)) }
        : card,
    );
    return {
      ...base,
      cards,
      cardPacks: loadCardPacks(),
      dislikedPackCardIds,
      globalInterruptionMode: loadGlobalInterruptionMode(),
      homeScreenVersions: loadHomeScreenVersions(),
      launcherBehaviorSettings: loadLauncherBehaviorSettings(),
      hiddenLibraryPacks: loadHiddenLibraryPacks(),
      events: loadEventLog(),
      actionCards: loadActionCards(),
      notificationSettings: loadNotificationSettings(),
    };
  }, []);
  const e2eMode = isE2EModeEnabled();
  const [cards, setCards] = useState(initialState.cards);
  const [mood, setMood] = useState(initialState.mood);
  const [profile, setProfile] = useState(initialState.profile);
  const [homeScreenVersions, setHomeScreenVersions] = useState(initialState.homeScreenVersions);
  const [launcherBehaviorSettings, setLauncherBehaviorSettings] = useState(initialState.launcherBehaviorSettings);
  const [cardPacks, setCardPacks] = useState(initialState.cardPacks);
  const [dislikedPackCardIds, setDislikedPackCardIds] = useState(initialState.dislikedPackCardIds);
  const [globalInterruptionMode, setGlobalInterruptionMode] = useState(initialState.globalInterruptionMode);
  const [hiddenLibraryPacks, setHiddenLibraryPacks] = useState(initialState.hiddenLibraryPacks);
  const [events, setEvents] = useState(initialState.events);
  const [actionCards, setActionCards] = useState(initialState.actionCards);
  const [notificationSettings, setNotificationSettings] = useState(initialState.notificationSettings);
  const [notificationStatus, setNotificationStatus] = useState(() => getNotificationPermission());
  const [setupComplete, setSetupComplete] = useState(initialState.setupComplete);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncError, setSyncError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [testerStatus, setTesterStatus] = useState(() => {
    const e2eTesterMode = e2eMode && typeof window !== "undefined" && window.localStorage.getItem(E2E_TESTER_MODE_KEY) === "true";
    return e2eMode ? { is_tester: e2eTesterMode } : null;
  });
  const [testerReportsRefreshKey, setTesterReportsRefreshKey] = useState(0);
  const [globalPacks, setGlobalPacks] = useState([]);
  const [appUpdate, setAppUpdate] = useState({ checking: true, updateAvailable: false });
  const [screen, setScreen] = useState(initialState.setupComplete ? "library" : "onboarding");
  const [overlay, setOverlay] = useState(null);
  const [routePath, setRoutePath] = useState(() => getRouteFromLocation(initialState.setupComplete));
  const initialRoute = useMemo(() => parseRoute(routePath), []);
  const [launcherContext, setLauncherContext] = useState(() => getLauncherContextFromRoute(initialRoute));
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingPackId, setEditingPackId] = useState(null);
  const [editingCustomPackId, setEditingCustomPackId] = useState(null);
  const [isActionCardEditorOpen, setIsActionCardEditorOpen] = useState(false);
  const [selectedPackDetail, setSelectedPackDetail] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const transitionTimerRef = useRef(null);
  const loggedLauncherOpenRef = useRef("");
  const loggedOnboardingStartedRef = useRef(false);
  const signupOnboardingPendingRef = useRef(hasSignupOnboardingPending());
  const interceptActivationRef = useRef(null);
  const interceptActivationCounterRef = useRef(0);
  const launchAttemptCounterRef = useRef(0);
  const launchCompletedCardIdsRef = useRef(new Set());
  const isApplyingSharedStateRef = useRef(false);
  const cloudSaveTimerRef = useRef(null);
  const cardSaveTimerRef = useRef(null);
  const lastCloudStateStrRef = useRef(null);
  const localDirtyRef = useRef(false);
  const highestKnownCloudTimeRef = useRef(0);
  const activeLauncherOverlayRef = useRef(null);
  const route = useMemo(() => parseRoute(routePath), [routePath]);
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
        return version?.realAppLabel ? [version] : [];
      }

      // Normal MyBishBash app
      return INTERRUPTION_LAUNCHER_CONTEXTS
        .map((versionId) =>
          resolveVersionConfig(
            homeScreenVersions[versionId] ??
              DEFAULT_HOME_SCREEN_VERSIONS[versionId],
            launcherBehaviorSettings[versionId],
          ),
        )
        .filter((version) => Boolean(version?.realAppLabel));
    }, [
      launcherContext,
      homeScreenVersions,
      launcherBehaviorSettings,
    ]
  );
  const [logFilter, setLogFilter] = useState("all");
  const [shouldLaunchOverlay, setShouldLaunchOverlay] = useState(initialState.setupComplete && !initialState.suppressInitialHomeLaunch);
  const [resumeLaunchNonce, setResumeLaunchNonce] = useState(0);
  const [launcherDataWaitExpired, setLauncherDataWaitExpired] = useState(false);
  const hiddenSinceRef = useRef(null);
  const handledResumeLaunchNonceRef = useRef(0);
  const suppressNextHomeAutoLaunchRef = useRef(false);
  const suppressResumeHomeAutoLaunchRef = useRef(false);
  const visibleActionCards = useMemo(
    () => actionCards.filter((card) => !card.hidden && !card.deletedAt),
    [actionCards],
  );
  const isHomeRoute = route.kind === "home";
  const isAppTabRoute = ["home", "library", "log", "packs", "settings"].includes(route.kind);
  const isLaunchingHomeOverlay = isHomeRoute && shouldLaunchOverlay && overlay == null;
  const isPreparingIntercept = route.kind === "intercept" && overlay == null;
  const isPreparingSpecificCard = route.kind === "card" && overlay == null;
  const isPreparingCaughtUp = route.kind === "caught-up" && overlay == null;
  const hideAppShell = isLaunchingHomeOverlay || isPreparingIntercept || isPreparingSpecificCard || isPreparingCaughtUp;

  const currentSharedState = useCallback(
    () =>
      buildSharedState({
        cards,
        setupComplete,
        mood,
        profile,
        cardPacks,
        hiddenLibraryPacks,
        dislikedPackCardIds,
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
      dislikedPackCardIds,
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
      dislikedPackCardIds: initialState.dislikedPackCardIds,
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
        name: next.profile?.name ?? "",
        timezone: next.profile?.timezone ?? "Europe/London",
      };
      return isSameJsonValue(currentProfile, nextProfile) ? currentProfile : nextProfile;
    });
    setCardPacks((currentPacks) => {
      const merged = mergeEntitiesById(currentPacks, next.cardPacks);
      return isSameJsonValue(currentPacks, merged) ? currentPacks : merged;
    });
    setHiddenLibraryPacks((current) => (isSameJsonValue(current, next.hiddenLibraryPacks) ? current : next.hiddenLibraryPacks));
    setDislikedPackCardIds((current) => (isSameJsonValue(current, next.dislikedPackCardIds) ? current : next.dislikedPackCardIds));
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

    if (e2eMode) {
      setSession(buildE2ESession());
      setSyncStatus("ready");
      setSyncError("");
      setAuthReady(true);
      setShouldLaunchOverlay(false);
      return undefined;
    }

    getSession()
      .then((currentSession) => {
        console.log("[AUTH] Session check complete. Found:", !!currentSession);
        if (currentSession?.user?.email) console.log("[AUTH] Email:", currentSession.user.email);
        if (typeof window !== "undefined") console.log("[AUTH] Storage key present:", !!window.localStorage.getItem("mybishbash.supabase.auth.v1"));

        if (mounted) {
          setSession(currentSession);
          if (!currentSession) setSyncStatus("needs-connection");
        }
      })
      .catch(() => {
        if (mounted) setSyncStatus("needs-connection");
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    const { data: { subscription } } = onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        if (!newSession) setSyncStatus("needs-connection");
        setAuthReady(true);
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
      return undefined;
    }
    if (!session?.user?.id) {
      setTesterStatus({ is_tester: false });
      return undefined;
    }

    let cancelled = false;
    setTesterStatus(null);
    fetchTesterStatus(session.user.id)
      .then((status) => {
        if (!cancelled) setTesterStatus(status ?? { is_tester: false });
      })
      .catch((error) => {
        console.warn("Could not load tester status", error);
        if (!cancelled) setTesterStatus({ is_tester: false });
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
    if (e2eMode) return undefined;
    let cancelled = false;
    fetchLauncherConfigs()
      .then((configs) => {
        if (cancelled || configs.length === 0) return;
        setHomeScreenVersions((current) => {
          const next = { ...current };
          configs.forEach((config) => {
            const defaults = DEFAULT_HOME_SCREEN_VERSIONS[config.id];
            if (!defaults) return;
            next[config.id] = mergeLauncherConfig(defaults, {
              ...(current[config.id] ?? {}),
              ...config,
            });
          });
          return next;
        });
        setLauncherBehaviorSettings((current) => {
          const next = { ...current };
          configs.forEach((config) => {
            if (!DEFAULT_HOME_SCREEN_VERSIONS[config.id]) return;
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

  useEffect(() => {
    if (route.kind !== "intercept") return undefined;
    const routeInterruptionPack = route.kind === "intercept"
      ? getInterruptionPackForLauncher(route.versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
          hiddenCardIds: dislikedPackCardIds,
          globalEnabled: globalInterruptionMode,
        })
      : null;
    const normalizedCards = normalizeCards(cards, new Date(), profile.timezone);
    const hasUsableCachedLauncherState =
      normalizedCards.some((card) =>
        card.sourcePackId
          ? isPackCardAvailable(card)
          : !card.deletedAt && isEligible(card, new Date(), profile.timezone)
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
  }, [authReady, cardPacks, cards, dislikedPackCardIds, globalInterruptionMode, homeScreenVersions, launcherBehaviorSettings, launcherDataWaitExpired, profile.timezone, route.kind, route.versionId, session?.user?.id, syncStatus]);

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

    hasAccessEntitlement(session.user.id)
      .then((hasAccess) => {
        if (!hasAccess) {
          throw Object.assign(new Error(INVITE_ONLY_ACCESS_ERROR), { code: "MYBISHBASH_MISSING_ACCESS_ENTITLEMENT" });
        }

        return loadSharedState(session.user.id);
      })
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
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.code === "MYBISHBASH_MISSING_ACCESS_ENTITLEMENT") {
          void logOut().catch((err) => console.warn(err));
          setSession(null);
          setSyncError(INVITE_ONLY_ACCESS_ERROR);
          setSyncStatus("needs-connection");
          return;
        }

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
    saveDislikedPackCardIds(dislikedPackCardIds);
  }, [dislikedPackCardIds]);

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
        activationKey: overlay.activationKey,
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
    if (screen === "library" && activeTab === "home") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [screen, activeTab]);

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
        disliked: card.sourcePackId ? dislikedPackCardIds.includes(getPackDislikeKey(card)) : card.disliked ?? false,
      })),
    );
  }, [dislikedPackCardIds, profile.timezone]);

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
    const weightedFlowGate = getWeightedLauncherFlowGate({
      testerStatus,
      storage: typeof window === "undefined" ? null : window.localStorage,
    });
    const useWeightedFlow = weightedFlowGate.weightedFlowEnabled;
    debugLaunch("[LAUNCH_ATTEMPT] intercept started", {
      route: route.path,
      launcherContext: versionId,
      launchAttemptId: activationKey,
      source,
      weightedFlowEnabled: weightedFlowGate.weightedFlowEnabled,
      weightedFlowUsed: useWeightedFlow,
      testerStatusIsTester: weightedFlowGate.testerIsTester,
      devOverride: weightedFlowGate.devOverride,
      selectedPath: weightedFlowGate.selectedPath,
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
      hiddenCardIds: dislikedPackCardIds,
      globalEnabled: globalInterruptionMode,
    });
    const eligibleCardCount = interruptionPack?.cards?.length ?? 0;
    const interruption = eligibleCardCount > 0
      ? {
          type: "interruption",
          pack: interruptionPack,
          versionId,
          activeIndex: pickInterruptionCardIndex(interruptionPack, selectionEvents),
        }
      : null;

    const fallbackDisplay = useWeightedFlow
      ? selectWeightedLauncherCard({
          cards,
          timezone: profile.timezone,
          events: selectionEvents,
          excludedCardIds: launchCompletedCardIdsRef.current,
        })
      : pickRandomGeneralCardForLauncher(
          cards,
          profile.timezone,
          launchCompletedCardIdsRef.current,
        );
    const selected = fallbackDisplay.selected;
    const launcherStats = getLauncherCardStats(cards, profile.timezone, launchCompletedCardIdsRef.current);
    const plannedInterruption = interruption;
    const selectedSource = useWeightedFlow
      ? fallbackDisplay.selectedSource
      : selected?.sourcePackId ? "pack" : selected ? "personal" : interruption ? "interruption" : "none";

    const selectedCard = selected ?? plannedInterruption?.pack?.cards?.[plannedInterruption.activeIndex ?? 0] ?? null;
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
      weightedFlowGate,
      interruptionPack,
      selected,
      plannedInterruption,
    });
    debugLaunch("[LAUNCH_ATTEMPT] intercept resolved", {
      route: route.path,
      launcherContext: versionId,
      launchAttemptId: activationKey,
      versionId,
      source,
      eligibleCardCount,
      weightedFlowEnabled: weightedFlowGate.weightedFlowEnabled,
      weightedFlowUsed: useWeightedFlow,
      testerStatusIsTester: weightedFlowGate.testerIsTester,
      devOverride: weightedFlowGate.devOverride,
      selectedPath: weightedFlowGate.selectedPath,
      configuredWeights: fallbackDisplay.weights ?? null,
      selectedSource,
      availablePersonalCount: fallbackDisplay.availablePersonalCount ?? launcherStats.eligiblePersonalCardsCount,
      availablePackCount: fallbackDisplay.availablePackCount ?? launcherStats.eligiblePackCardsCount,
      overlayType: selected ? "reveal" : plannedInterruption ? "intercept-pack" : "empty",
      packId: selected?.sourcePackId ?? plannedInterruption?.pack?.id ?? null,
      cardId: selectedCard?.id ?? null,
      selectedCardId: selectedCard?.id ?? null,
      selectedCardSource: selected?.sourcePackId ? "library_pack" : selected ? "personal" : plannedInterruption ? "interruption" : null,
      activeIndex: plannedInterruption?.activeIndex ?? null,
      ...launcherStats,
      caughtUpReason: plannedInterruption ? null : "no eligible interrupter cards",
      fallbackReason: selected || plannedInterruption ? null : "no eligible personal, active pack, or interruption cards",
    });
    void logEvent({
      event_type: useWeightedFlow ? "launcher_weighted_session_started" : "launcher_session_started",
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
        weightedFlowEnabled: weightedFlowGate.weightedFlowEnabled,
        weightedFlowUsed: useWeightedFlow,
        testerStatusIsTester: weightedFlowGate.testerIsTester,
        devOverride: weightedFlowGate.devOverride,
        selectedPath: weightedFlowGate.selectedPath,
        selectedSource,
        configuredWeights: fallbackDisplay.weights ?? null,
        availablePersonalCount: fallbackDisplay.availablePersonalCount ?? launcherStats.eligiblePersonalCardsCount,
        availablePackCount: fallbackDisplay.availablePackCount ?? launcherStats.eligiblePackCardsCount,
        selectedCardId: selected?.id ?? null,
        selectedPackId: selected?.sourcePackId ?? null,
        interruptionShown: Boolean(plannedInterruption),
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
      weightedFlowUsed: useWeightedFlow,
      weightedFlowGate,
      weightedDecision: fallbackDisplay,
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
      void processEventQueue();
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

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
        interceptActivationRef.current = null;
        loggedLauncherOpenRef.current = "";
        suppressNextHomeAutoLaunchRef.current = false;
        setShouldLaunchOverlay(false);
        setLauncherContext(resumeRoute.versionId);
        setResumeLaunchNonce((current) => current + 1);
        debugLaunch("[LAUNCH_ATTEMPT] intercept resume", {
          route: resumeRoute.path,
          launcherContext: resumeRoute.versionId,
          launchAttemptId: `${resumeRoute.versionId}:${source}:${Date.now()}`,
          source,
          eligibleCardCount: null,
          selectedCardId: null,
          caughtUpReason: null,
          fallbackReason: null,
        });
        navigateTo(`/intercept/${resumeRoute.versionId}`, { replace: true });
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
    if (route.kind !== "intercept" && overlay?.launchSource !== "fake_launcher" && interceptActivationRef.current) {
      interceptActivationRef.current = null;
    }

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
      const isTestMode = Boolean(testerStatus?.is_tester);
      const isDemoMode = window.localStorage.getItem("MYBISHBASH_DEMO_MODE") === "true";
      const normalizedDiagCards = normalizeCards(cards, new Date(), profile.timezone);
      const eligiblePersonalCount = normalizedDiagCards.filter((c) => !c.sourcePackId && !c.deletedAt && isEligible(c, new Date(), profile.timezone)).length;
      const eligiblePackCount = normalizedDiagCards.filter(isPackCardAvailable).length;
      const routeInterruptionPack = getInterruptionPackForLauncher(route.versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
        hiddenCardIds: dislikedPackCardIds,
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
      const isResumeInterceptLaunch = resumeLaunchNonce !== handledResumeLaunchNonceRef.current;

      if (
        !isResumeInterceptLaunch &&
        ["action-card", "action-card-empty", "action-success"].includes(overlay?.type) &&
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
      const nextOverlay = { ...buildEmptyOverlay(), origin: "home" };
      debugLaunch("[CARD_ORIGIN] caught-up created", nextOverlay);
      setOverlay(nextOverlay);
      return;
    }

    setScreen("library");

    if (route.kind === "card") {
      if (overlay?.type === "reveal" && overlay.cardId === route.cardId) {
        return;
      }
      const nextOverlay = { ...buildRevealOverlay(route.cardId), origin: "home" };
      debugLaunch("[CARD_ORIGIN] home card created", nextOverlay);
      setOverlay(nextOverlay);
      return;
    }

    if (isHomeRoute && shouldLaunchOverlay) {
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
      const { selected } = pickRandomHomeCardForDisplay(
        cards,
        profile.timezone,
        NORMAL_LAUNCHER_CONTEXT,
        homeScreenVersions,
        launcherBehaviorSettings,
        cardPacks,
        dislikedPackCardIds,
        globalInterruptionMode,
        events,
      );

      const eligibleCount = countEligibleGeneralCards(cards, profile.timezone);
      debugLaunch("[ELIGIBLE_COUNTS]", {
        totalCards: cards.length,
        eligible: eligibleCount,
      });

      setShouldLaunchOverlay(false);

      debugLaunch("[SELECTED_CARD]", selected);
      debugLaunch("[EMPTY_REASON]", selected ? null : "No eligible cards found at launch check.");

      debugLaunch("[LAUNCH_ATTEMPT] personal resolved", {
        route: route.path,
        launcherContext: NORMAL_LAUNCHER_CONTEXT,
        launchAttemptId,
        eligibleCardCount: eligibleCount,
        selectedCardId: selected?.id ?? null,
        caughtUpReason: selected ? null : "no eligible general bash cards",
        fallbackReason: null,
      });
      if (selected) {
        debugLaunch("[LAUNCH_DIAG_DECISION]", "personal -> reveal");
        debugLaunch("[REVEAL_SELECTED_AFTER_SYNC] found eligible card", selected.id);
        debugLaunch("[LAUNCH_DECISION]", "personal -> reveal");
        debugLaunch("[REVEAL_SELECTED_AFTER_SYNC]", { cardId: selected.id });
        const nextOverlay = { ...buildRevealOverlay(selected.id), origin: "home" };
        debugLaunch("[CARD_ORIGIN] home reveal created", nextOverlay);
        setOverlay(nextOverlay);
        return;
      }

      debugLaunch("[LAUNCH_DIAG_DECISION]", "personal -> empty");
      debugLaunch("[LAUNCH_DECISION]", "personal -> empty");
      const nextOverlayEmpty = { ...buildEmptyOverlay(), origin: "home" };
      debugLaunch("[CARD_ORIGIN] home empty created", nextOverlayEmpty);
      setOverlay(nextOverlayEmpty);
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
  }, [route, setupComplete, homeScreenVersions, launcherBehaviorSettings, cardPacks, cards, profile.timezone, shouldLaunchOverlay, launcherContext, dislikedPackCardIds, globalInterruptionMode, events, authReady, session, syncStatus, resumeLaunchNonce, launcherDataWaitExpired, testerStatus?.is_tester, overlay?.type, overlay?.versionId, overlay?.cardId, overlay?.launchSource, logLauncherEvent, e2eMode]);

  function navigateTo(path, { replace = false } = {}) {
    const normalized = normalizeRoutePath(path);
    const url = `${BASE_PATH}${normalized === "/" ? "" : normalized}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoutePath(normalized);
  }

  function renderInterceptionDecision(versionId, activation, { source = "route" } = {}) {
    const { selected, interruption, activationKey } = activation;

    setScreen(selected ? "library" : "interception");

    if (selected) {
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

    if (interruption) {
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

    debugLaunch("[INTERCEPT] No eligible personal card or interruption; showing caught-up launcher state", {
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
    debugLaunch("[INTERCEPT] Starting interception flow", { versionId, source });
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

  function openDestinationApp(versionId, { source = "continue_card", reason = "user_pressed_continue", allowDefaultNavigation = false } = {}) {
    const version = resolveVersionConfig(
      homeScreenVersions[versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[versionId],
      launcherBehaviorSettings[versionId],
    );
    const preferFastDestination = reason === "fake_launcher_icon_clicked";
    const href = getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferFastDestination }));

    void logLauncherEvent("intercept_continue_to_app", versionId, {
      launched_from: source,
      reason,
      href,
    });
    void logLauncherEvent("fake_launcher_real_app_opened", versionId, {
      launched_from: source,
      reason,
      href,
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
        weightedFlowUsed: Boolean(interceptActivationRef.current?.weightedFlowUsed),
        activationKey: interceptActivationRef.current?.activationKey ?? null,
        destinationOpened: Boolean(href),
      },
    });

    if (href) {
      markHomeAutoLaunchSuppressedAfterDestination();
      suppressResumeHomeAutoLaunchRef.current = true;
      suppressNextHomeAutoLaunchRef.current = true;
      setShouldLaunchOverlay(false);
      console.log("[LAUNCHER] opening destination", { versionId, href, source, reason });
      const captureNavigation = window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION;
      if (typeof captureNavigation === "function") {
        const handled = captureNavigation(href, { versionId, source, reason });
        if (handled) return true;
      }
      if (allowDefaultNavigation) return false;
      window.location.assign(href);
      return true;
    }
    return true;
  }

  function openExternalActionUrl(url, { source = "action_card", cardId = null } = {}) {
    if (!url) return;
    console.log("[ACTION_CARD] opening external URL", { source, cardId, url });
    const captureNavigation = window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION;
    if (typeof captureNavigation === "function") {
      const handled = captureNavigation(url, { source, cardId });
      if (handled) return;
    }
    window.location.assign(url);
  }

  function handleOverlayFakeLauncherLaunch(versionId) {
    openDestinationApp(versionId, {
      source: "overlay_fake_launcher",
      reason: "fake_launcher_icon_clicked",
    });
  }

  function updateCards(updater) {
    setCards((current) =>
      normalizeCards(typeof updater === "function" ? updater(current) : updater, new Date(), profile.timezone),
    );
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

    const eligiblePackCards = packCards.filter(isPackCardAvailable);
    if (eligiblePackCards.length === 0) return;
    const source = eligiblePackCards;
    const selected = source[Math.floor(Math.random() * source.length)];
    openSpecificReveal(selected.id);
  }

  function handleRevealCompletion(options = {}) {
    if (overlay?.launchSource === "fake_launcher" && overlay?.versionId) {
      const versionId = overlay.versionId;
      const completedCardId = options.completedCardId ?? overlay.cardId ?? null;
      if (completedCardId) {
        launchCompletedCardIdsRef.current = new Set([...launchCompletedCardIdsRef.current, completedCardId]);
      }
      const excludedCardIds = launchCompletedCardIdsRef.current;
      const activation = interceptActivationRef.current;
      const activationKey = overlay.activationKey || activation?.activationKey || Date.now().toString();
      const cardsForDecision = options.cardsOverride ?? cards;
      const completedCard = completedCardId
        ? cardsForDecision.find((card) => card.id === completedCardId) ?? cards.find((card) => card.id === completedCardId)
        : null;
      if (overlay.type === "reveal") {
        if (activation?.interruption && activation.versionId === versionId && activation.activationKey === activationKey) {
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
            weightedFlowUsed: Boolean(activation?.weightedFlowUsed),
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
          weightedFlowUsed: Boolean(activation?.weightedFlowUsed),
        });
        navigateTo(`/intercept/${versionId}`, { replace: true });
        return;
      }
      const pack = getInterruptionPackForLauncher(versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
        hiddenCardIds: dislikedPackCardIds,
        globalEnabled: globalInterruptionMode,
      });
      const hasNextInterruptionPack = overlay.type !== "intercept-pack" && Boolean(pack && (pack.cards?.length > 0 || pack.messages?.length > 0));
      const launcherStats = getLauncherCardStats(cardsForDecision, profile.timezone, excludedCardIds);
      const fallbackDisplay = hasNextInterruptionPack || overlay.type === "reveal"
        ? { selected: null }
        : pickRandomPersonalCardForLauncher(cardsForDecision, profile.timezone, excludedCardIds);

      debugLaunch("[REVEAL COMPLETION DECISION]", {
        pathname: window.location.pathname,
        currentPathname: window.location.pathname,
        launchSource: overlay.launchSource,
        origin: overlay.origin,
        overlayTypeBeforeCompletion: overlay.type,
        versionId,
        routeKind: route.kind,
        overlayVersionId: overlay.versionId,
        selectedNextCardId: fallbackDisplay.selected?.id ?? null,
        selectedNextOverlayType: fallbackDisplay.selected ? "reveal" : hasNextInterruptionPack ? "intercept-pack" : "continue-to-app",
        continueReason: fallbackDisplay.selected || hasNextInterruptionPack
          ? null
          : "no eligible cards remain after hydration and launcher evaluation",
        ...launcherStats,
        hasInterruptionPack: hasNextInterruptionPack,
      });

      if (fallbackDisplay.selected) {
        setScreen("library");
        const nextOverlay = buildFakeLauncherRevealOverlay(fallbackDisplay.selected.id, versionId, activationKey);
        setOverlay(nextOverlay);
        debugLaunch("[LAUNCHSOURCE PRESERVED]", nextOverlay);
        debugLaunch("[CONTINUE_DECISION] intercept -> routing to next eligible card", nextOverlay);
        navigateTo(`/intercept/${versionId}`, { replace: true });
        return;
      }

      if (hasNextInterruptionPack) {
         setScreen("interception");
         const nextOverlay = {
           ...buildCustomPackOverlay(pack, pickInterruptionCardIndex(pack, events), "intercept-pack"),
           ...buildFakeLauncherOverlayContext(versionId, activationKey),
         };
         setOverlay(nextOverlay);
         debugLaunch("[LAUNCHSOURCE PRESERVED]", nextOverlay);
         debugLaunch("[CONTINUE_DECISION] intercept -> routing to interruption decision", nextOverlay);
         navigateTo(`/intercept/${versionId}`, { replace: true });
         return;
      }

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

    handleRevealCompletion({ cardsOverride: cardsAfterAction, completedCardId: activeCard.id });
    return;
  }

  function handleSaveCard(formData) {
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

      if (isFirstCard) {
        setSetupComplete(true);
        navigateTo("/home", { replace: true });
        return;
      }

      navigateTo("/home");
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
    setIsComposerOpen(false);

    if (isFirstCard) {
      setSetupComplete(true);
      navigateTo("/home", { replace: true });
      return;
    }

    navigateTo("/home");
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

        return {
          ...card,
          statusToday: "fresh",
          doneDate: null,
          notYetUntil: null,
          lastShownAt: null,
          paused: false,
          updatedAt: new Date().toISOString(),
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
    setIsComposerOpen(true);
    setMenuOpenId(null);
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

  function activatePack(packId) {
    const pack = visibleLibraryPacks.find((item) => item.id === packId);
    if (!pack || isPackActive(packId)) return;

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
    const dislikeKey = getPackDislikeKey({ sourcePackId: packId, promptText: text });
    if (!dislikeKey) return;
    setDislikedPackCardIds((current) => {
      if (hidden) {
        return current.includes(dislikeKey) ? current : [...current, dislikeKey];
      }
      return current.filter((item) => item !== dislikeKey);
    });
    const isInterruption = packId.endsWith("-interruption");
    void logEvent({
      event_type: isInterruption
        ? hidden ? "intercept_card_disliked" : "intercept_card_restored"
        : hidden ? "pack_card_disliked" : "pack_card_restored",
      source_type: isInterruption ? "interruption" : "library",
      card_source: isInterruption ? "interruption" : "library",
      card_id: dislikeKey,
      card_title: text,
      card_text: text,
      pack_id: packId,
      target_app: isInterruption ? packId.replace(/-interruption$/, "") : null,
      action_taken: hidden ? "disliked" : "restored",
    });
  }

  function dislikePackCard(cardId) {
    const card = cards.find((item) => item.id === cardId);
    const dislikeKey = getPackDislikeKey(card);
    if (!dislikeKey) return;
    setDislikedPackCardIds((current) => (current.includes(dislikeKey) ? current : [...current, dislikeKey]));
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

  function dislikeInterruptionPackCard(packId, card) {
    const dislikeKey = getPackDislikeKey({ sourcePackId: packId, promptText: card?.text });
    if (!dislikeKey) return;
    setDislikedPackCardIds((current) => (current.includes(dislikeKey) ? current : [...current, dislikeKey]));
    void logEvent({
      event_type: "intercept_card_disliked",
      source_type: "interruption",
      card_source: "interruption",
      card_id: card?.id ?? dislikeKey,
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
    setDislikedPackCardIds((current) => {
      const hiddenDefaultCards = defaultMessages.map((message) =>
        getPackDislikeKey({ sourcePackId: defaultPackId, promptText: message }),
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
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    setSetupComplete(true);
    setShouldLaunchOverlay(false);
  }

  function savePersonalOnboardingSetup({
    personalCards = DEFAULT_PERSONAL_CARD_TEXTS,
    launcherId = "safari",
    appContext = { id: "safari", label: "Safari", launcherId: "safari" },
  }) {
    const supportedLauncherId = isKnownLauncher(launcherId) ? launcherId : "safari";
    const cleanPersonalCards = personalCards.map((text) => text.trim()).filter(Boolean);
    const fallbackCards = cleanPersonalCards.length > 0 ? cleanPersonalCards : DEFAULT_PERSONAL_CARD_TEXTS;
    const now = new Date().toISOString();

    void logEvent({
      event_type: "onboarding_completed",
      source_type: "onboarding",
      card_source: "personal",
      target_app: supportedLauncherId,
      launcher_context: supportedLauncherId,
      action_taken: "completed",
      metadata: {
        route: "frequent_use_reminders",
        selected_personal_cards: fallbackCards.length,
        app_context: appContext,
      },
    });

    updateCards((current) => [
      ...fallbackCards.map((text) => ({
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
        useInterruptionPack: false,
        interruptionPaused: false,
      },
    }));

    setProfile((current) => ({
      ...current,
      onboardingAppContext: appContext,
      onboardingLauncherId: supportedLauncherId,
      onboardingRoute: "frequent_use_reminders",
    }));

    setOverlay(null);
    setMenuOpenId(null);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    setSetupComplete(true);
    setShouldLaunchOverlay(false);
  }

  function finishOnboarding(destination = "home", launcherId = profile.onboardingLauncherId ?? "instagram") {
    const supportedLauncherId = isKnownLauncher(launcherId) ? launcherId : "instagram";
    setScreen("library");
    setOverlay(null);
    setMenuOpenId(null);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    setSetupComplete(true);
    setShouldLaunchOverlay(destination === "try");
    navigateTo(destination === "try" ? `/intercept/${supportedLauncherId}` : "/home", { replace: true });
  }

  function skipInstagramOnboarding() {
    void logEvent({
      event_type: "onboarding_completed",
      source_type: "onboarding",
      card_source: "onboarding",
      action_taken: "skipped_instagram_setup",
    });
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
      hiddenCardIds: dislikedPackCardIds,
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

  function handleSetGlobalInterruptionMode(value) {
    setGlobalInterruptionMode(value);
    void logEvent({
      event_type: value ? "global_interruption_mode_enabled" : "global_interruption_mode_disabled",
      source_type: "settings",
      card_source: "settings",
      action_taken: value ? "enabled" : "disabled",
    });
  }

  async function handleResetSharedState() {
    const confirmed = window.confirm("Clear local development state on this launcher/device? This will log you out locally but not delete your cloud account.");
    if (!confirmed) return;

    try {
      await logOut();
    } catch (err) {
      console.warn(err);
    }

    setSession(null);
    setSyncStatus("needs-connection");
    setSyncError("");
    clearSharedMyBishBashState();
    setCards([]);
    setMood(resolveTheme("Minimal"));
    setProfile({ name: "", timezone: "Europe/London" });
    setHomeScreenVersions(loadHomeScreenVersions());
    setLauncherBehaviorSettings(loadLauncherBehaviorSettings());
    setCardPacks([]);
    setDislikedPackCardIds([]);
    setGlobalInterruptionMode(true);
    setHiddenLibraryPacks([]);
    setEvents([]);
    signupOnboardingPendingRef.current = false;
    setSignupOnboardingPending(false);
    setSetupComplete(false);
    setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
    setOverlay(null);
    setScreen("onboarding");
    navigateTo("/onboarding", { replace: true });
  }

  async function handleSignUp(email, password, accessCode) {
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
      const createdSession = await signUp(email, password, accessCode);
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
      setSyncError(error?.code === "MYBISHBASH_INVALID_ACCESS_CODE" ? INVITE_ONLY_ACCESS_ERROR : getSyncErrorMessage(error, "Could not sign up."));
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
    ? cards.find((card) => card.id === overlay.cardId)
    : null;
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
        hiddenCardIds: dislikedPackCardIds,
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
  }, [cards, profile.timezone, homeScreenVersions, launcherBehaviorSettings, cardPacks, launcherContext, dislikedPackCardIds, globalInterruptionMode]);
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
  const personalLibraryItems = useMemo(
    () =>
      cards
        .filter((card) => !card.sourcePackId && !card.deletedAt)
        .map((card) => ({
          type: "single",
          id: card.id,
          representative: card,
        }))
        .sort((left, right) => {
          const leftCreated = new Date(left.representative.createdAt ?? 0).getTime();
          const rightCreated = new Date(right.representative.createdAt ?? 0).getTime();
          return rightCreated - leftCreated;
        }),
    [cards],
  );
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
      INTERRUPTION_LAUNCHER_CONTEXTS.map((targetApp) =>
        buildInterruptionFolder(targetApp, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
          hiddenCardIds: dislikedPackCardIds,
          globalEnabled: globalInterruptionMode,
          includeHidden: true,
        }),
      ).filter(Boolean),
    [homeScreenVersions, launcherBehaviorSettings, cardPacks, dislikedPackCardIds, globalInterruptionMode],
  );
  const homeReminderItems = useMemo(() => homeItems, [homeItems]);

  const isFakeLauncherFlow = route.kind === "intercept" || overlay?.launchSource === "fake_launcher";

  if (!authReady && !isFakeLauncherFlow) {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (!session && !isFakeLauncherFlow) {
    return (
      <SyncConnectionScreen
        mode="connect"
        error={syncError}
        onSignUp={handleSignUp}
        onLogIn={handleLogIn}
        onClearError={() => setSyncError("")}
      />
    );
  }

  if (session && syncStatus === "loading" && !isFakeLauncherFlow) {
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
        appIcon="https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg"
        onContinue={() => openDestinationApp("instagram", { source: "preview_continue", reason: "user_pressed_continue" })}
        onBack={() => navigateTo("/home", { replace: true })}
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
      {screen === "library" && !hideAppShell ? (
      <div className={`app-shell app-mood theme-${getThemeClass(mood)}`} data-testid="app-shell">
          <div className="app-inner">
            <Masthead
              onCreate={() => {
                setEditingId(null);
                setIsComposerOpen(true);
              }}
            />

            <main className="content">
              {activeTab === "home" ? (
                <HomePanel
                  reminderItems={homeReminderItems}
                  timezone={profile.timezone}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  openSpecificReveal={openSpecificReveal}
                  openPackReveal={openPackReveal}
                  openInterruptionHomeReveal={openInterruptionHomeReveal}
                  openEditor={openEditor}
                  handleResetItem={handleResetItem}
                  handleTogglePause={handleTogglePause}
                  handleDeleteCard={handleDeleteCard}
                  handleDuplicateCard={handleDuplicateCard}
                  deactivatePack={deactivatePack}
                  onCreate={() => {
                    setEditingId(null);
                    setIsComposerOpen(true);
                  }}
                />
              ) : null}

              {activeTab === "library" ? (
                <StandardLibraryPanel
                  items={personalLibraryItems}
                  timezone={profile.timezone}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  openEditor={openEditor}
                  handleResetItem={handleResetItem}
                  handleTogglePause={handleTogglePause}
                  handleDeleteCard={handleDeleteCard}
                  handleDuplicateCard={handleDuplicateCard}
                  openSpecificReveal={openSpecificReveal}
                />
              ) : null}

              {activeTab === "log" ? (
                <LogPanel
                  events={logEventsForPanel}
                  timezone={profile.timezone}
                  weeklyShiftCount={getWeeklyShiftCount(events)}
                  filter={logFilter}
                />
              ) : null}

              {activeTab === "packs" ? (
                <PacksPanel
                  cards={cards}
                  actionCards={actionCards}
                  interruptionPacks={interruptionPacks}
                  libraryPacks={visibleLibraryPacks}
                  onActivateLibraryPack={activatePack}
                  onDeactivateLibraryPack={deactivatePack}
                  onOpenPack={setSelectedPackDetail}
                  onToggleActionCardHidden={handleToggleActionCardHidden}
                  onDeleteActionCard={handleDeleteActionCard}
                  onCreateActionCard={() => setIsActionCardEditorOpen(true)}
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
                  notificationSettings={notificationSettings}
                  notificationStatus={notificationStatus}
                  onEnableNotifications={enableNotifications}
                  onDisableNotifications={disableNotifications}
                  onUpdateNotificationsPerDay={updateNotificationsPerDay}
                  actionCards={actionCards}
                  onRestoreActionCards={handleRestoreActionCards}
                  interruptionPacks={interruptionPacks}
                  launcherContext={launcherContext}
                  onLogLauncherEvent={logLauncherEvent}
                  onFakeLauncherLaunch={(versionId) =>
                    openDestinationApp(versionId, {
                      source: "settings_fake_launcher",
                      reason: "fake_launcher_icon_clicked",
                    })
                  }
                />
              ) : null}
            </main>
          </div>

          <nav className="bottom-nav" aria-label="Primary">
            <button type="button" className={`nav-item ${activeTab === "home" ? "active" : ""}`} data-testid="bottom-nav-home" onClick={() => navigateTo("/home")}>
              <HomeGlyph />
              <span>Home</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "library" ? "active" : ""}`} data-testid="bottom-nav-library" onClick={() => navigateTo("/library")}>
              <BookGlyph />
              <span>Library</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "log" ? "active" : ""}`} data-testid="bottom-nav-log" onClick={() => navigateTo("/log")}>
              <LogGlyph />
              <span>Log</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "packs" ? "active" : ""}`} data-testid="bottom-nav-packs" onClick={() => navigateTo("/packs")}>
              <PacksGlyph />
              <span>Packs</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "settings" ? "active" : ""}`} data-testid="bottom-nav-settings" onClick={() => navigateTo("/settings")}>
              <SettingsGlyph />
              <span>Settings</span>
            </button>
          </nav>
        </div>
      ) : null}

      {screen === "onboarding" ? (
        <Onboarding
          onSkip={skipInstagramOnboarding}
          onSaveSetup={saveOnboardingSetup}
          onSavePersonalSetup={savePersonalOnboardingSetup}
          onTryLauncher={(launcherId) => finishOnboarding("try", launcherId)}
          onGoHome={() => finishOnboarding("home")}
        />
      ) : null}

      {isComposerOpen ? (
        <Composer
          key={editingId ?? "new"}
          initialCard={editingCard}
          onClose={() => {
            setEditingId(null);
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
          hiddenCardIds={dislikedPackCardIds}
          isPackActive={isPackActive}
          onActivateLibraryPack={activatePack}
          onDeactivateLibraryPack={deactivatePack}
          onSetPackCardHidden={setPackCardHidden}
          onSaveInterruptionCard={handleSaveInterruptionCard}
          onDeleteInterruptionCard={handleDeleteInterruptionCard}
          onClose={() => setSelectedPackDetail(null)}
        />
      ) : null}

      {overlay ? (
        <Overlay
          key={`${overlay.type}:${overlay.versionId ?? ""}:${overlay.cardId ?? ""}:${overlay.packId ?? ""}:${overlay.activationKey ?? ""}`}
          overlay={overlay}
          card={activeRevealCard}
          route={route}
          version={activeOverlayVersion}
          timezone={profile.timezone}
          onClose={() => {
            if (overlay.type === "custom-pack-preview") {
              setOverlay(null);
              return;
            }
            suppressNextHomeAutoLaunchRef.current = true;
            setShouldLaunchOverlay(false);
            setScreen("library");
            navigateTo("/home", { replace: true });
            setOverlay(null);
          }}
          onAction={handleAction}
          actionCards={actionCards}
          onAcceptActionCard={(card) => {
            const nextOverlay = {
              ...buildActionSuccessOverlay(overlay?.versionId),
              origin: overlay?.origin,
              activationKey: overlay?.activationKey,
              launchSource: overlay?.launchSource,
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
                weightedFlowUsed: Boolean(interceptActivationRef.current?.weightedFlowUsed),
                activationKey: overlay?.activationKey ?? interceptActivationRef.current?.activationKey ?? null,
                actionCardShown: visibleActionCards.length > 0,
              },
            });
            if (visibleActionCards.length === 0) {
              console.log("[ACTION CARDS] Opening empty fallback.");
              const nextOverlay = {
                ...buildActionCardEmptyOverlay(overlay?.versionId),
                origin: overlay?.origin || "home",
                activationKey: overlay?.activationKey,
                launchSource: overlay?.launchSource,
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
          fakeLauncherVersions={fakeLauncherVersions}
          onFakeLauncherLaunch={handleOverlayFakeLauncherLaunch}
        />
      ) : null}

      {session?.user?.id && setupComplete && fakeLauncherVersions.length > 0 && !overlay ? (
        <FakeAppLauncherBar
          versions={fakeLauncherVersions}
          raised={false}
          onLaunch={(versionId) =>
            openDestinationApp(versionId, {
              source: "home_fake_launcher_bar",
              reason: "fake_launcher_icon_clicked",
            })
          }
        />
      ) : null}

      {appUpdate.updateAvailable ? (
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

function Composer({ initialCard, onClose, onSave }) {
  const [promptText, setPromptText] = useState(initialCard?.promptText ?? "");
  const [bulkText, setBulkText] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [theme, setTheme] = useState(resolveTheme(initialCard?.theme));
  const [icon, setIcon] = useState(initialCard?.icon ?? "heart");
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);
  const [showValidation, setShowValidation] = useState(false);

  const bulkCardsCount = isBulkMode ? parseBulkCards(bulkText).length : 0;

  function handleSubmit(event) {
    event.preventDefault();
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
        {isBulkMode ? (
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

function Masthead({ onCreate }) {
  return (
    <header className="hero">
      <div className="hero-copy">
        <div className="hero-mark" aria-hidden="true">
          <HeartGlyph />
        </div>
      </div>
      <button
        type="button"
        className="add-button"
        data-testid="create-card-button"
        onClick={onCreate}
        aria-label="Create a MyBishBash"
      >
        +
      </button>
    </header>
  );
}

function HomePanel({
  reminderItems,
  timezone,
  menuOpenId,
  setMenuOpenId,
  openSpecificReveal,
  openPackReveal,
  openInterruptionHomeReveal,
  openEditor,
  handleResetItem,
  handleTogglePause,
  handleDeleteCard,
  handleDuplicateCard,
  deactivatePack,
  onCreate,
}) {
  return (
    <section className="library" data-testid="home-panel">
      <div className="section-heading solo">
        <div>
          <h2>Your MyBishBash list</h2>
          <p>Ready cards and actions for right now.</p>
        </div>
      </div>
      <div className="card-stack">
        {reminderItems.length === 0 ? (
          <article className="home-empty-card">
            <h3>No cards yet</h3>
            <p>Start by creating one small nudge</p>
            <button type="button" className="pack-button" data-testid="empty-create-card-button" onClick={onCreate}>
              Create card
            </button>
          </article>
        ) : null}
        {reminderItems.map((item) => {
          const status = getStatusMeta(item.representative, new Date(), timezone);
          function openItem() {
            if (item.type === "interruption-card" || item.type === "interruption-version") {
              openInterruptionHomeReveal(item.versionId, item.cardIndex ?? null);
              return;
            }
            if (item.type === "pack") {
              openPackReveal(item.id);
              return;
            }
            openSpecificReveal(item.id);
          }

          return (
            <article
              key={item.id}
              className={`library-card ${menuOpenId === item.id ? "menu-open" : ""} theme-${getThemeClass(item.representative.theme)}`}
              data-testid={`home-card-${item.id}`}
              onClick={openItem}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openItem();
                }
              }}
            >
              <div className="tile">
                <CardIcon icon={item.representative.icon} sourcePackId={item.representative.sourcePackId} />
              </div>
              <div className="card-copy">
                <h3>{item.representative.promptText}</h3>
              </div>
              <div className="card-status">
                <span className={`badge ${status.badge}`}>{status.badge}</span>
              </div>
              <div className="menu-wrap">
                <button
                  type="button"
                  className="menu-trigger"
                  data-testid={`card-menu-${item.id}`}
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
                      data-testid={`card-edit-${item.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.type === "interruption-card" || item.type === "interruption-version") {
                          openInterruptionHomeReveal(item.versionId, item.cardIndex ?? null);
                          return;
                        }
                        if (item.type === "pack") {
                          openPackReveal(item.id);
                          return;
                        }
                        openEditor(item.id);
                      }}
                    >
                      {item.type === "interruption-card" || item.type === "interruption-version" || item.type === "pack" ? "Open card" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.type === "interruption-card" || item.type === "interruption-version" || item.type === "pack") {
                          return;
                        }
                        handleDuplicateCard(item.id);
                      }}
                      disabled={item.type === "interruption-card" || item.type === "interruption-version" || item.type === "pack"}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.type === "interruption-card" || item.type === "interruption-version") {
                          return;
                        }
                        handleResetItem(item);
                      }}
                      disabled={item.type === "interruption-card" || item.type === "interruption-version"}
                    >
                      Reset for today
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.type === "interruption-card" || item.type === "interruption-version") {
                          return;
                        }
                        handleTogglePause(item);
                      }}
                      disabled={item.type === "interruption-card" || item.type === "interruption-version"}
                    >
                      {item.representative.paused ? "Unpause" : "Pause"}
                    </button>
                    <button
                      type="button"
                      className="danger-soft"
                      data-testid={`card-delete-${item.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.type === "interruption-card" || item.type === "interruption-version") {
                          return;
                        }
                        if (item.type === "pack") {
                          deactivatePack(item.id);
                          return;
                        }
                        handleDeleteCard(item.id);
                      }}
                      disabled={item.type === "interruption-card" || item.type === "interruption-version"}
                    >
                      {item.type === "pack" ? "Remove pack" : "Delete"}
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
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

function StandardLibraryPanel({
  items,
  timezone,
  menuOpenId,
  setMenuOpenId,
  openEditor,
  handleResetItem,
  handleTogglePause,
  handleDeleteCard,
  handleDuplicateCard,
  openSpecificReveal,
}) {
  return (
    <section className="library">
      <div className="section-heading solo">
        <div>
          <h2>Library</h2>
          <p>Your own MyBishBashes, gathered in one quiet place.</p>
        </div>
      </div>
      <div className="card-stack">
        {items.map((item) => {
          const status = getStatusMeta(item.representative, new Date(), timezone);
          return (
            <article
              key={item.id}
              className={`library-card ${menuOpenId === item.id ? "menu-open" : ""} theme-${getThemeClass(item.representative.theme)}`}
              onClick={() => openSpecificReveal(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openSpecificReveal(item.id);
                }
              }}
            >
              <div className="tile">
                <CardIcon icon={item.representative.icon} />
              </div>
              <div className="card-copy">
                <h3>{item.representative.promptText}</h3>
              </div>
              <div className="card-status">
                <span className={`badge ${status.badge}`}>{status.badge}</span>
              </div>
              <div className="menu-wrap">
                <button
                  type="button"
                  className="menu-trigger"
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
                        openEditor(item.id);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDuplicateCard(item.id);
                      }}
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
                        handleDeleteCard(item.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LogPanel({ events, timezone, weeklyShiftCount, filter }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const filledDots = Math.min(weeklyShiftCount, 14);

  return (
    <section className="log-screen">
      <header className="log-header">
        <span className="log-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h2>MyBishBash Log</h2>
        <p>{filter === "intercepts" ? "the little pauses before the pull." : "tiny choices. real change."}</p>
      </header>

      <article className="log-hero-card">
        {weeklyShiftCount > 0 ? (
          <>
            <h3>
              You chose <span>yourself</span> {weeklyShiftCount} {weeklyShiftCount === 1 ? "time" : "times"} this week.
            </h3>
            <div className="growth-visual">
              <GrowthFlower count={weeklyShiftCount} />
            </div>
            <div className="growth-dots" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, index) => (
                <span key={index} className={`growth-dot ${index < filledDots ? "filled" : ""}`} />
              ))}
            </div>
            <p className="growth-caption">Every little shift adds up.</p>
          </>
        ) : (
          <div className="log-empty-state">
            <h3>Your first little shift will appear here.</h3>
            <p>Every quiet choice begins somewhere.</p>
          </div>
        )}
      </article>

      <article className="recent-moments-card">
        <h3>Recent moments</h3>
        {events.length > 0 ? (
          <div className="recent-event-list">
            {events.map((event, index) => (
              <button
                key={event.id}
                type="button"
                className={`event-row ${index === events.length - 1 ? "last" : ""}`}
                onClick={() => setSelectedEvent(event)}
                aria-label={`Open details for ${describeLogEvent(event)}`}
              >
                <span className="event-icon-bubble" aria-hidden="true">
                  {event.event_type.startsWith("intercept_") ? <LogGlyph /> : <HeartGlyph />}
                </span>
                <span className="event-copy">{describeLogEvent(event)}</span>
                <span className="event-time">{formatTwentyFourHourTime(event.created_at, timezone)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="recent-empty-copy">Your recent moments will begin to gather here.</p>
        )}
      </article>

      {selectedEvent ? (
        <EventDetailModal event={selectedEvent} timezone={timezone} onClose={() => setSelectedEvent(null)} />
      ) : null}
    </section>
  );
}

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
          <p className="eyebrow">{initialPack ? "Edit interruption pack" : "Create interruption pack"}</p>
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
          Save interruption pack
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

function PacksPanel({
  cards,
  actionCards,
  interruptionPacks,
  libraryPacks,
  onActivateLibraryPack,
  onDeactivateLibraryPack,
  onOpenPack,
  onToggleActionCardHidden,
  onCreateActionCard,
}) {
  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Packs</h2>
          <p>Manage the card content MyBishBash can draw from.</p>
        </div>
      </div>

      <section className="packs-section">
        <div className="home-section-heading packs-heading">
          <div>
            <h2>Interruption Packs</h2>
            <p>Folders selected automatically by launcher context.</p>
          </div>
        </div>
        <div className="packs-list-card">
          {interruptionPacks.map((pack) => {
            return (
              <article key={pack.id} className="pack-row pack-row-interruption">
                <div className="pack-row-icon">
                  <CardIcon icon={pack.targetApp === "instagram" ? "heart" : pack.targetApp === "youtube" ? "star" : "book"} />
                </div>
                <div className="pack-row-copy">
                  <h3>{pack.name}</h3>
                </div>
                <button
                  type="button"
                  className="pack-row-indicator"
                  onClick={() => onOpenPack({ type: "interruption", id: pack.id, targetApp: pack.targetApp })}
                  aria-label={`Open ${pack.name}`}
                >
                  <ChevronRightGlyph />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="packs-section">
        <div className="home-section-heading packs-heading">
          <div>
            <h2>Active Actions</h2>
            <p>Things you can do instead of opening apps.</p>
          </div>
        </div>
        <div className="packs-list-card">
          {actionCards.filter((c) => !c.deletedAt).map((card) => (
            <article key={card.id} className="home-screen-version-card pack-manager-card">
              <div className="home-screen-version-copy pack-manager-copy">
                <div className="home-screen-version-title">
                  <strong>{card.title}</strong>
                  <span>{card.source === "starter" ? (card.hidden ? "Hidden" : "Visible") : "User created"}</span>
                </div>
                <p>{card.body}</p>
              </div>
              <div className="home-screen-version-actions">
                {card.source === "starter" ? (
                  <button type="button" className="pack-button secondary" onClick={() => onToggleActionCardHidden(card.id, !card.hidden)}>
                    {card.hidden ? "Restore" : "Hide"}
                  </button>
                ) : (
                  <button type="button" className="pack-button secondary danger-soft-button" onClick={() => onDeleteActionCard(card.id)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <button type="button" className="pack-button" style={{ marginTop: "16px" }} onClick={onCreateActionCard}>Create action card</button>
      </section>

      <section className="packs-section">
        <div className="home-section-heading packs-heading">
          <div>
            <h2>Library Packs</h2>
            <p>Ready-made MyBishBashes you can add into your day.</p>
          </div>
        </div>
        <div className="library-pack-stack">
          {libraryPacks.map((pack, index) => {
            const active = cards.some((card) => card.sourcePackId === pack.id && !card.deletedAt);
            const canActivate = Array.isArray(pack.entries) && pack.entries.length > 0;
            return (
              <article
                key={pack.id}
                className={`library-pack-card theme-${getThemeClass(pack.theme)} ${active ? "active" : ""} ${index === libraryPacks.length - 1 ? "last" : ""}`}
              >
                <div className="library-pack-copy">
                  <p className="eyebrow">{active ? "Active pack" : "Pack"}</p>
                  <h3>{pack.title}</h3>
                  <p>{pack.description}</p>
                </div>
                <div className="home-screen-version-actions">
                  <button
                    type="button"
                    className={`library-pack-button ${active ? "secondary" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (active) {
                        onDeactivateLibraryPack(pack.id);
                        return;
                      }
                      onActivateLibraryPack(pack.id);
                    }}
                    disabled={!canActivate}
                  >
                    {canActivate ? (active ? "Deactivate pack" : "Activate pack") : "Coming soon"}
                  </button>
                </div>
                {active ? <p className="pack-active-note">Active in your MyBishBashes</p> : null}
              </article>
            );
          })}
          {libraryPacks.length === 0 ? (
            <article className="pack-row pack-row-library last">
              <div className="pack-row-copy full">
                <p>Hidden pack suggestions will stay out of the way for now.</p>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </section>
  );
}

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
          <p className="eyebrow">{libraryPack ? "Library pack" : "Interruption folder"}</p>
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
              {active ? "Deactivate pack" : "Activate pack"}
            </button>
            <div className="custom-pack-message-grid">
              {libraryPack.entries.map((entry, index) => {
                const hidden = hiddenCardIds.includes(
                  getPackDislikeKey({ sourcePackId: libraryPack.id, promptText: entry.promptText }),
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
              <p className="pack-meta">{interruptionPack.cards.length} cards · launcherContext: {interruptionPack.targetApp}</p>
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

function SyncConnectionScreen({ mode, error, onSignUp, onLogIn, onClearError, onOpenLegalModal }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [agreedToLegal, setAgreedToLegal] = useState(false);

  const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone);
  const isInviteError = error === INVITE_ONLY_ACCESS_ERROR;
  const waitlistHref = `${import.meta.env.BASE_URL}early-access`;

  function switchMode(nextIsLogin) {
    setIsLogin(nextIsLogin);
    setShowPassword(false);
    onClearError?.();
  }

  function submitExisting(event) {
    event.preventDefault();
    if (!email.trim() || !password.trim() || (!isLogin && !accessCode.trim())) return;
    if (!isLogin && !agreedToLegal) {
      alert("Please agree to the Terms of Use and Privacy Policy to continue.");
      return;
    }
    if (isLogin) {
      onLogIn(email, password);
    } else {
      onSignUp(email, password, accessCode);
    }
  }

  return (
    <main className="sync-screen" data-testid="sync-screen">
      <section className="sync-card">
        <span className="sync-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h1>{isLogin ? "MyBishBash" : "Create your MyBishBash account"}</h1>
        {mode === "loading" ? (
          <p>Loading your shared MyBishBash...</p>
        ) : isInviteError ? (
          <>
            <p className="sync-error sync-invite-error">
              MyBishBash is currently invite-only.
              <br />
              Your access code was not recognised.
            </p>
            <div className="sync-actions">
              <button type="button" className="save-button" onClick={() => onClearError?.()}>
                Try Again
              </button>
              <a className="text-button sync-waitlist-link" href={waitlistHref}>
                Join Waitlist
              </a>
            </div>
          </>
        ) : (
          <>
            <p>
              {isLogin
                ? "Log in to sync this launcher with your MyBishBash profile."
                : "Enter your invite access code once. After that, you’ll only need to log in."}
            </p>
            {isLogin && isStandalone ? <p className="sync-note">iOS Home Screen apps require you to log in once per launcher.</p> : null}
            {error ? <p className="sync-error">{error}</p> : null}

            <form className="sync-form" onSubmit={submitExisting}>
              <div className="field">
                <label htmlFor="sync-email">Email</label>
                <input
                  id="sync-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="settings-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="sync-password">Password</label>
                <span className="password-field">
                  <input
                    id="sync-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    className="settings-input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </div>
              {!isLogin ? (
            <>
              <div className="field">
                  <label htmlFor="sync-access-code">Access code</label>
                  <input
                    id="sync-access-code"
                    type="text"
                    autoComplete="off"
                    className="settings-input"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    placeholder="Access code"
                    required
                  />
                </div>
              <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px", marginTop: "12px", marginBottom: "16px", cursor: "pointer", fontSize: "14px", fontWeight: "normal", opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={agreedToLegal}
                  onChange={(e) => setAgreedToLegal(e.target.checked)}
                  style={{ width: "auto", margin: 0 }}
                />
                <span style={{ lineHeight: "1.4" }}>
                  I agree to the <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegalModal("terms"); }} style={{ textDecoration: "underline" }}>Terms of Use</a> and <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegalModal("privacy"); }} style={{ textDecoration: "underline" }}>Privacy Policy</a>.
                </span>
              </label>
            </>
          ) : null}
              <button type="submit" className="save-button">
                {isLogin ? "Log In" : "Create Account"}
              </button>
            </form>

            <button type="button" className="text-button sync-secondary-link" onClick={() => switchMode(!isLogin)}>
              {isLogin ? "Need an account? Sign Up" : "Already have an account? Log In"}
            </button>
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
  notificationSettings,
  notificationStatus,
  onEnableNotifications,
  onDisableNotifications,
  onUpdateNotificationsPerDay,
  actionCards,
  onRestoreActionCards,
  interruptionPacks,
  launcherContext,
  onLogLauncherEvent,
  onFakeLauncherLaunch,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState("mybishbash");

  const isInsideFakeLauncher =
    launcherContext &&
    INTERRUPTION_LAUNCHER_CONTEXTS.includes(launcherContext);

  const isSelectedCurrentLauncher =
    isInsideFakeLauncher && previewVersionId === launcherContext;
  const shortcutContexts = {
    safari: "Reminders during everyday phone use",
    instagram: "Pause before social scrolling",
    youtube: "Pause before video scrolling",
    mybishbash: "Main MyBishBash home",
  };

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
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Home Screen Shortcuts</p>
          <span>Install separate home-screen shortcuts for Safari, Instagram and YouTube. Each shortcut shares your MyBishBash cards and settings.</span>
        </div>
        <div className="shortcut-context-grid">
          <div>
            <strong>Installed shortcuts</strong>
            <p>{isInsideFakeLauncher ? `${homeScreenVersions[launcherContext]?.name ?? launcherContext}: ${shortcutContexts[launcherContext] ?? "MyBishBash shortcut"}` : "Open a Home Screen shortcut to see it here."}</p>
          </div>
          <div>
            <strong>Available shortcuts</strong>
            <p>Safari: reminders during everyday phone use · Instagram: pause before social scrolling · YouTube: pause before video scrolling</p>
          </div>
        </div>
        <label className="field" style={{ marginBottom: "16px" }}>
          <select
            className="settings-input"
            value={previewVersionId}
            onChange={(e) => setPreviewVersionId(e.target.value)}
          >
            {Object.values(homeScreenVersions).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <div className="home-screen-version-list">
          {(() => {
            const version = homeScreenVersions[previewVersionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[previewVersionId] ?? DEFAULT_HOME_SCREEN_VERSIONS.mybishbash;
            const previewIcon = version.customIconSrc || version.iconSrc;
            const installUrl = getInstallUrl(version.installPath ?? `${BASE_PATH}/install/${version.id}/`);
            const resolvedVersion = resolveVersionConfig(version, launcherBehaviorSettings[version.id]);
            const pack = interruptionPacks?.find((p) => p.targetApp === version.id);
            const behavior = launcherBehaviorSettings[version.id] ?? {};
            const interruptionsOn = Boolean(behavior.useInterruptionPack);

            return (
              <article
                key={version.id}
                className="home-screen-version-card"
              >
                {version.id !== "mybishbash" ? (
                  <a
                    href={`${BASE_PATH}/intercept/${version.id}`}
                    className="home-screen-version-icon-link"
                    aria-label={`Open ${version.name} launcher`}
                    onClick={(event) => {
                      event.preventDefault();
                      onFakeLauncherLaunch?.(version.id);
                    }}
                  >
                    <img
                      src={previewIcon}
                      alt={`${version.name} cover icon`}
                      className="home-screen-version-icon"
                    />
                  </a>
                ) : (
                  <img
                    src={previewIcon}
                    alt={`${version.name} cover icon`}
                    className="home-screen-version-icon"
                  />
                )}
                <div className="home-screen-version-copy">
                  <div className="home-screen-version-title">
                    <strong>{version.name}</strong>
                  </div>
                  <p>
                    {shortcutContexts[version.id] ?? `Uses launcherContext "${version.id}" and shares the same MyBishBash state.`}
                  </p>
                    <a
                      href={installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="home-screen-install-link"
                      onClick={() => {
                        if (version.id !== "mybishbash") {
                          void onLogLauncherEvent?.("launcher_install_clicked", version.id);
                        }
                      }}
                    >
                      Open install screen
                    </a>
                </div>
                <div className="home-screen-version-actions">
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
                    Replace cover icon
                  </label>
                </div>
            {INTERRUPTION_LAUNCHER_CONTEXTS.includes(version.id) ? (
              <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                <div style={{ marginBottom: "12px" }}>
                  <strong style={{ display: "block" }}>Interruptions</strong>
                  <span style={{ fontSize: "14px", opacity: 0.8 }}>Pause before opening this app.</span>
                </div>
                <label className="timing-option settings-checkbox-row" style={{ marginBottom: "8px" }}>
                  <input
                    type="checkbox"
                    checked={interruptionsOn}
                    onChange={(e) => onSaveVersionBehavior(version.id, { useInterruptionPack: e.target.checked })}
                  />
                  <span>{interruptionsOn ? "On" : "Off"}</span>
                </label>
                <p className="tiny-note" style={{ margin: 0 }}>
                  {interruptionsOn
                    ? "You’ll see interruption cards before continuing."
                    : "You’ll see normal MyBishBash cards instead."}
                </p>
                {pack ? (
                  <p className="tiny-note" style={{ margin: 0 }}>
                    Linked pack: {pack.name}
                  </p>
                ) : null}
              </div>
            ) : null}
              </article>
            );
          })()}
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
      <div className="settings-card settings-compact">
        <div className="settings-version-heading">
          <p>Refresh MyBishBash</p>
          <span>Reload the latest app shell without deleting login, cards, preferences, or logs.</span>
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
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Development reset</p>
          <span>Clear local development state on this launcher/device. This does not delete the cloud profile.</span>
        </div>
        <button type="button" className="pack-button secondary danger-soft-button" onClick={onResetSharedState}>
          Clear local development state
        </button>
      </div>

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

function GrowthFlower({ count }) {
  const stage = count >= 15 ? "full" : count >= 10 ? "partial" : count >= 6 ? "stem" : count >= 3 ? "leaves" : "sprout";
  return (
    <svg viewBox="0 0 180 180" className={`growth-flower stage-${stage}`} aria-hidden="true">
      <defs>
        <linearGradient id="petalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F0A08E" />
          <stop offset="100%" stopColor="#E87661" />
        </linearGradient>
      </defs>
      <path d="M90 144c0-18 0-34 1-52" className="stem-path" />
      {stage !== "sprout" ? (
        <>
          <path d="M91 110c16-3 26-14 26-28-14 1-24 11-26 28z" className="leaf-path" />
          <path d="M89 122c-15-3-25-13-25-28 14 1 24 11 25 28z" className="leaf-path" />
        </>
      ) : null}
      {stage === "stem" || stage === "partial" || stage === "full" ? (
        <circle cx="91" cy="78" r="10" className="bud-core" />
      ) : null}
      {stage === "partial" || stage === "full" ? (
        <>
          <path d="M91 52c9 0 16 9 16 18-9 0-16-9-16-18z" className="petal-path" />
          <path d="M67 78c0-9 9-16 18-16 0 9-9 16-18 16z" className="petal-path" />
          <path d="M115 78c0-9-9-16-18-16 0 9 9 16 18 16z" className="petal-path" />
        </>
      ) : null}
      {stage === "full" ? (
        <>
          <path d="M91 102c-9 0-16-9-16-18 9 0 16 9 16 18z" className="petal-path" />
          <path d="M75 60c8-5 20-3 25 5-8 5-20 3-25-5z" className="petal-path" />
          <path d="M107 60c-8-5-20-3-25 5 8 5 20 3 25-5z" className="petal-path" />
        </>
      ) : null}
      {stage === "sprout" ? <path d="M90 124c6-12 14-18 22-21-2 12-10 20-22 21z" className="sprout-path" /> : null}
    </svg>
  );
}

function EventDetailModal({ event, timezone, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="composer event-detail-card" onClick={(eventClick) => eventClick.stopPropagation()}>
        <div className="composer-heading">
          <p className="eyebrow">Moment detail</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="event-detail-body">
          <h3>{describeLogEvent(event)}</h3>
          <dl className="event-detail-list">
            <div>
              <dt>Time</dt>
              <dd>{formatTwentyFourHourTime(event.created_at, timezone)}</dd>
            </div>
            {event.bash_title ? (
              <div>
                <dt>MyBishBash</dt>
                <dd>{event.bash_title}</dd>
              </div>
            ) : null}
            {event.app_name ? (
              <div>
                <dt>App source</dt>
                <dd>{event.app_name}</dd>
              </div>
            ) : null}
            <div>
              <dt>Launcher</dt>
              <dd>{event.launcher_context ?? "normal"}</dd>
            </div>
            {event.target_app ? (
              <div>
                <dt>Target app</dt>
                <dd>{event.target_app}</dd>
              </div>
            ) : null}
            {event.pack_id ? (
              <div>
                <dt>Pack</dt>
                <dd>{event.metadata?.packTitle ?? event.pack_id}</dd>
              </div>
            ) : null}
            <div>
              <dt>Event type</dt>
              <dd>{getLogEventDisplayLabel(event)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function Overlay({
  overlay,
  card,
  route,
  version,
  timezone,
  onClose,
  onAction,
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
}) {
  const launcherInterceptionClass = overlay?.launchSource === "fake_launcher" || overlay?.versionId
    ? "launcher-interception-card"
    : "";

  if (overlay.type === "launcher-preparing") {
    return (
      <PremiumCardScreen
        type="empty"
        greeting={version?.name ?? "MyBishBash"}
        icon="heart"
        headline="Getting your card ready..."
        subtitle="One moment."
        actions={[]}
        launcherVersions={[]}
        showHomeButton={false}
        className={launcherInterceptionClass}
      />
    );
  }

  if (overlay.type === "continue-to-app") {
    const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(version));
    const handleContinue = (event) => {
      const handled = onContinueToApp?.(version?.id, {
        source: "continue_card",
        reason: "user_pressed_continue",
        allowDefaultNavigation: Boolean(continueHref),
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
        appIcon={version?.customIconSrc || version?.iconSrc}
        href={continueHref}
        onContinue={handleContinue}
        onBack={handleBack}
        className={launcherInterceptionClass}
      />
    );
  }

  if (overlay.type === "empty") {
    const isIntercept = !!overlay.versionId;
    const interceptVersion = isIntercept ? version : null;
    const appName = interceptVersion?.name ?? "App";

    const actions = [];
    if (isIntercept && interceptVersion) {
      const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(interceptVersion));
      actions.push({
        label: "Continue to App",
        variant: "primary",
        href: continueHref,
        onClick: (event) => {
          const handled = onContinueToApp?.(interceptVersion.id, {
            source: "empty_card",
            reason: "user_pressed_continue_after_no_eligible_cards",
            allowDefaultNavigation: Boolean(continueHref),
          });
          if (handled !== false) event?.preventDefault?.();
        }
      });
      actions.push({
        label: "Back to MyBishBash",
        variant: "secondary",
        onClick: onClose
      });
    } else {
      actions.push({ label: "Back home", variant: "primary", onClick: onClose });
    }

    return (
      <PremiumCardScreen
        type="empty"
        greeting={isIntercept ? interceptVersion?.name || "MyBishBash" : "MyBishBash"}
        icon="heart"
        headline={isIntercept ? "You're all caught up." : "You're all caught up for now."}
        subtitle="See you later."
        actions={actions}
        launcherVersions={isIntercept ? [] : fakeLauncherVersions}
        onLauncherLaunch={onFakeLauncherLaunch}
        showHomeButton={!isIntercept}
        onHome={onClose}
        className={launcherInterceptionClass}
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
      />
    );
  }

  if (overlay.type === "custom-pack-preview") {
    return <CustomPackOverlay overlay={overlay} onClose={onClose} />;
  }

  if (overlay.type === "action-card") {
    return (
      <ActionCardOverlay
        overlay={overlay}
        actionCards={actionCards}
        onAccept={onAcceptActionCard}
        onClose={onClose}
        onLogEvent={onLogEvent}
        fakeLauncherVersions={fakeLauncherVersions}
        onFakeLauncherLaunch={onFakeLauncherLaunch}
        className={launcherInterceptionClass}
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
        fakeLauncherVersions={fakeLauncherVersions}
        onFakeLauncherLaunch={onFakeLauncherLaunch}
        className={launcherInterceptionClass}
      />
    );
  }

  if (overlay.type === "action-success") {
    return (
      <ActionSuccessOverlay
        overlay={overlay}
        version={version}
        onClose={onClose}
        onContinueToApp={onContinueToApp}
        className={launcherInterceptionClass}
      />
    );
  }

  if (!card) return null;
  const packNeutralActionLabel = overlay?.launchSource === "fake_launcher" || overlay?.versionId || route?.kind === "intercept"
    ? "Continue"
    : "Back to home";

  return (
    <PremiumCardScreen
      type={card.sourcePackId ? "pack" : "personal"}
      greeting={getGreeting(new Date(), timezone)}
      icon="heart"
      headline={card.promptText}
      subtitle={
        card.sourcePackId
          ? card.attribution || card.sourceTitle || "A card from your pack."
          : "A gentle nudge from the version of you that cares."
      }
      actions={
        card.sourcePackId
          ? [
              { label: "I really like this one", variant: "secondary", onClick: onPackLike },
              { label: packNeutralActionLabel, variant: "primary", onClick: onPackContinue },
            ]
          : [
              { label: "Not done", variant: "secondary", onClick: () => onAction("later") },
              { label: "I’ll do it now", variant: "secondary", onClick: () => onAction("now") },
              { label: "Done", variant: "primary", onClick: () => onAction("done") },
            ]
      }
      launcherVersions={fakeLauncherVersions}
      onLauncherLaunch={onFakeLauncherLaunch}
      showHomeButton={true}
      onHome={onClose}
      className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
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
  showHomeButton = false,
  homeHref,
  onHome,
  children,
  className = "",
}) {
  return (
    <CardRevealTemplate
      variant={type}
      greeting={greeting}
      icon={icon}
      message={headline}
      subtitle={subtitle}
      launchers={launcherVersions}
      actions={actions}
      onLauncherLaunch={onLauncherLaunch}
      showHomeButton={showHomeButton}
      homeHref={homeHref}
      onHome={onHome}
      className={className}
    >
      {children}
    </CardRevealTemplate>
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
  showHomeButton = false,
  homeHref,
  onHome,
  children,
  className = "",
}) {
  const hasLaunchers = launchers?.length > 0;
  const hasActions = actions?.length > 0;

  return (
    <div className={`premium-card-screen premium-card-${variant} ${className}`.trim()} data-testid={`card-overlay-${variant}`}>
      {showHomeButton ? <PremiumHomeButton href={homeHref} onClick={onHome} /> : null}
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
        {hasLaunchers || hasActions ? (
          <section className={`premium-card-cta ${hasLaunchers ? "has-launchers" : "no-launchers"}`}>
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
        ) : null}
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

function CardRevealMessage({ message }) {
  const frameRef = useRef(null);
  const headlineRef = useRef(null);
  const baseSize = getMessageBaseSize(message);
  const [fontSize, setFontSize] = useState(baseSize);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const headline = headlineRef.current;
    if (!frame || !headline) return undefined;

    let frameId;

    function fit() {
      const minSize = 16;
      let nextSize = baseSize;
      headline.style.fontSize = `${nextSize}px`;

      while (
        nextSize > minSize &&
        headline.scrollWidth > frame.clientWidth
      ) {
        nextSize -= 1;
        headline.style.fontSize = `${nextSize}px`;
      }

      setFontSize(nextSize);
    }

    frameId = window.requestAnimationFrame(fit);
    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frameId);
    }

    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(fit);
    });
    observer.observe(frame);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [baseSize, message]);

  return (
    <div className="premium-title-box" ref={frameRef}>
      <h2
        className="premium-headline"
        ref={headlineRef}
        style={{ "--message-font-size": `${fontSize}px` }}
      >
        {message}
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

function PremiumHomeButton({ href, onClick }) {
  const content = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.75 10.5 12 4.25l7.25 6.25" />
        <path d="M6.75 9.25v9.5h10.5v-9.5" />
        <path d="M10 18.75v-5.5h4v5.5" />
      </svg>
      <span className="sr-only">Go home</span>
    </>
  );

  if (href) {
    return (
      <a className="premium-home-button" href={href} onClick={(event) => onClick?.(event)} aria-label="Go home">
        {content}
      </a>
    );
  }

  return (
    <button type="button" className="premium-home-button" onClick={(event) => onClick?.(event)} aria-label="Go home">
      {content}
    </button>
  );
}

function PremiumActionStack({ actions = [] }) {
  if (!actions.length) return null;

  return (
    <div className="premium-action-stack">
      {actions.map((action) => (
        <PremiumActionButton
          key={action.key || action.label}
          label={action.label}
          variant={action.variant}
          onClick={action.onClick}
          href={action.href}
        />
      ))}
    </div>
  );
}

function PremiumActionButton({ label, variant = "secondary", onClick, href }) {
  const className = `premium-action-button premium-action-button-${variant === "primary" ? "primary" : "secondary"}`;
  const testId = `card-action-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

  if (href) {
    return (
      <a className={className} href={href} data-testid={testId} onClick={(event) => onClick?.(event)}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" className={className} data-testid={testId} onClick={(event) => onClick?.(event)}>
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
  className = "",
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
        showHomeButton={true}
        onHome={onClose}
        className={className}
      />
    </div>
  );
}

function ActionCardEmptyOverlay({ overlay, version, onClose, onLogEvent, onCreateActionCard, onContinueToApp, fakeLauncherVersions, onFakeLauncherLaunch, className = "" }) {
  function handleContinueToApp() {
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
    onContinueToApp?.(version.id, { source: "action_card_empty", reason: "user_pressed_continue" });
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
          { label: "Back home", variant: "secondary", onClick: onClose },
          ...(version ? [{ label: "Continue to App", variant: "secondary", onClick: handleContinueToApp }] : []),
          { label: "Create action card", variant: "primary", onClick: onCreateActionCard },
        ]}
        launcherVersions={fakeLauncherVersions}
        onLauncherLaunch={onFakeLauncherLaunch}
        showHomeButton={true}
        onHome={onClose}
        className={className}
      />
    </div>
  );
}

function ActionSuccessOverlay({ version, onClose, onContinueToApp, className = "" }) {
  const actions = version
    ? [
        { label: "Continue to App", variant: "primary", onClick: () => onContinueToApp?.(version.id, { source: "action_card_success", reason: "user_pressed_continue" }) },
        { label: "Back home", variant: "secondary", onClick: onClose },
      ]
    : [{ label: "Back home", variant: "primary", onClick: onClose }];

  return (
    <PremiumCardScreen
      type="action"
      greeting="Action"
      icon="heart"
      headline="Nice choice."
      subtitle="Take all the time you need."
      actions={actions}
      showHomeButton={true}
      onHome={onClose}
      className={className}
    />
  );
}

function CustomPackOverlay({ overlay, onClose }) {
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
        showHomeButton={true}
        onHome={onClose}
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

function InterceptionOverlay({ overlay, version, onChooseElse, onLogEvent, onLogLauncherEvent, onContinueToApp, onFakeLauncherLaunch }) {
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

  const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(version));

  function handleContinueToApp(event) {
    if (!version) return;
    const handled = onContinueToApp?.(version.id, {
      source: "interruption_card",
      reason: "user_pressed_continue",
      allowDefaultNavigation: Boolean(continueHref),
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
        showHomeButton={false}
        className="launcher-interception-card"
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

function HeartGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="heart-glyph" aria-hidden="true">
      <path d="M16 27s-9-6-12-11c-3-5 0-11 6-11 3 0 5 1 6 4 1-3 3-4 6-4 6 0 9 6 6 11-3 5-12 11-12 11z" />
    </svg>
  );
}

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

function LogGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M16 24V12" />
      <path d="M16 12c4 0 7-3 7-7-4 0-7 3-7 7z" />
      <path d="M16 15c-4 0-7 3-7 7 4 0 7-3 7-7z" />
      <path d="M16 18c4 0 7 3 7 7-4 0-7-3-7-7z" />
    </svg>
  );
}

function PacksGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M7 10h18v6H7z" />
      <path d="M9 16h14v10H9z" />
      <path d="M14 7h4" />
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

function ContinueToAppCard({ appName, appIcon, href, onContinue, onBack, className = "" }) {
  return (
    <div className={`premium-card-screen premium-card-personal ${className}`.trim()} data-testid="continue-to-app-card">
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
          <PremiumActionStack actions={[
            { label: `Continue to ${appName}`, variant: "primary", href, onClick: onContinue },
            { label: "Back to MyBishBash", variant: "secondary", onClick: onBack }
          ]} />
        </section>
      </main>
    </div>
  );
}

export default App;
