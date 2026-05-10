import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_HOME_SCREEN_VERSIONS,
  clearSharedBishBashState,
  loadCards,
  loadCardPacks,
  loadDislikedPackCardIds,
  loadGlobalInterruptionMode,
  loadHiddenLibraryPacks,
  loadHomeScreenVersions,
  loadLauncherBehaviorSettings,
  loadMood,
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
} from "./eventLog";
import {
  getSyncErrorMessage,
  loadSharedState,
  saveSharedState,
  getSession,
  onAuthStateChange,
  signUp,
  logIn,
  logOut,
} from "./lib/bishbashSync";
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
  isEligible,
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
import Onboarding from "./Onboarding";
import FakeAppLauncherBar from "./lib/FakeLauncherBar";

function resolveTheme(theme) {
  if (theme === "Paper Cut") return "Soft Bloom";
  return THEMES.includes(theme) ? theme : THEMES[0];
}

const BASE_PATH = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function normalizeRoutePath(path) {
  if (!path) return "/";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function getRouteFromLocation(setupComplete) {
  if (typeof window === "undefined") {
    return setupComplete ? "/home" : "/onboarding";
  }

  const params = new URLSearchParams(window.location.search);
  const routeParam = params.get("route");
  const disguiseParam = params.get("disguise");
  const disguisedVersion = /^(instagram|youtube|safari)$/.test(disguiseParam ?? "")
    ? disguiseParam
    : null;
  if (disguisedVersion) {
    return `/intercept/${disguisedVersion}`;
  }

  const rawPath = routeParam || window.location.pathname.replace(BASE_PATH || "", "") || "/";
  const normalized = normalizeRoutePath(rawPath);

  if (routeParam) {
    window.history.replaceState({}, "", `${BASE_PATH}${normalized}`);
  }

  if (normalized === "/" || normalized === "/index.html") {
    return setupComplete ? "/home" : "/onboarding";
  }

  if (
    !setupComplete &&
    normalized !== "/onboarding" &&
    !/^\/intercept\/(instagram|youtube|safari)$/.test(normalized)
  ) {
    return "/onboarding";
  }

  return normalized;
}

function parseRoute(path) {
  const normalized = normalizeRoutePath(path);

  if (normalized === "/onboarding") {
    return { kind: "onboarding", path: normalized, tab: "home" };
  }

  const interceptMatch = normalized.match(/^\/intercept\/(instagram|youtube|safari)$/);
  if (interceptMatch) {
    return {
      kind: "intercept",
      path: normalized,
      tab: null,
      versionId: interceptMatch[1],
    };
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
  if (normalized === "/log") return { kind: "log", path: normalized, tab: "log" };
  if (normalized === "/packs") return { kind: "packs", path: normalized, tab: "packs" };
  if (normalized === "/library") return { kind: "library", path: normalized, tab: "library" };
  if (normalized === "/mood") return { kind: "settings", path: "/settings", tab: "settings" };
  if (normalized === "/settings") return { kind: "settings", path: normalized, tab: "settings" };
  return { kind: "home", path: "/home", tab: "home" };
}

function getInstallUrl(path) {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function openNativeApp(appUrl) {
  if (!appUrl) return;
  window.location.href = appUrl;
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
  if (event.event_type === "intercept_do_something_else") {
    return `You chose something else instead of opening ${event.app_name || "that app"}.`;
  }

  if (event.event_type === "intercept_continue_to_app") {
    return `You continued to ${event.app_name || "the app"} after pausing.`;
  }

  if (event.event_type === "bash_done") {
    return `You completed: ${event.bash_title || "a BishBash"}`;
  }

  if (event.event_type === "bash_do_now") {
    return `You chose to do: ${event.bash_title || "a BishBash"}`;
  }

  if (event.event_type === "bash_not_done") {
    return `You left this BishBash for later: ${event.bash_title || "a BishBash"}`;
  }

  return "A little BishBash moment was recorded.";
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
) {
  const normalized = normalizeCards(currentCards, new Date(), timezone);
  const interruptionPack = getInterruptionPackForLauncher(launcherContext, versions, behaviors, customPacks, {
    hiddenCardIds,
    globalEnabled: globalInterruptionMode,
  });
  const singles = normalized
    .filter((card) => !card.sourcePackId && isEligible(card, new Date(), timezone))
    .map((card) => ({ type: "single", card }));

  const packMap = new Map();
  normalized.forEach((card) => {
    if (!card.sourcePackId || !isEligible(card, new Date(), timezone)) return;
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

  if (interruptionPack) {
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

function buildInitialState() {
  const profile = loadProfile();
  const setupComplete = loadSetupComplete();
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
    };
  }

  return {
    cards,
    mood,
    profile,
    setupComplete,
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

function buildLibraryPackHomeItem(packId, packCards) {
  const representative = packCards[0];
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
  const initialState = useMemo(() => {
    const base = buildInitialState();
    return {
      ...base,
      cardPacks: loadCardPacks(),
      dislikedPackCardIds: loadDislikedPackCardIds(),
      globalInterruptionMode: loadGlobalInterruptionMode(),
      homeScreenVersions: loadHomeScreenVersions(),
      launcherBehaviorSettings: loadLauncherBehaviorSettings(),
      hiddenLibraryPacks: loadHiddenLibraryPacks(),
      events: loadEventLog(),
      actionCards: loadActionCards(),
    };
  }, []);
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
  const [setupComplete, setSetupComplete] = useState(initialState.setupComplete);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [syncError, setSyncError] = useState("");
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
  const isApplyingSharedStateRef = useRef(false);
  const cloudSaveTimerRef = useRef(null);
  const lastCloudStateStrRef = useRef(null);
  const localDirtyRef = useRef(false);
  const highestKnownCloudTimeRef = useRef(0);
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

      // Normal BishBash app
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
  const [shouldLaunchOverlay, setShouldLaunchOverlay] = useState(initialState.setupComplete);
  const hiddenSinceRef = useRef(null);
  const suppressNextHomeAutoLaunchRef = useRef(false);
  const isLaunchingHomeOverlay =
    screen === "library" && route.kind === "home" && shouldLaunchOverlay && overlay == null;

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

  const applySharedState = useCallback((incomingState) => {
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

    isApplyingSharedStateRef.current = true;

    setCards((currentCards) => {
      const merged = mergeEntitiesById(currentCards, next.cards);
      return normalizeCards(merged, new Date(), next.profile.timezone).map((card) => ({
        ...card,
        theme: resolveTheme(card.theme),
      }));
    });
    setSetupComplete(next.setupComplete);
    setMood(resolveTheme(next.mood));
    setProfile({
      name: next.profile?.name ?? "",
      timezone: next.profile?.timezone ?? "Europe/London",
    });
    setCardPacks((currentPacks) => mergeEntitiesById(currentPacks, next.cardPacks));
    setHiddenLibraryPacks(next.hiddenLibraryPacks);
    setDislikedPackCardIds(next.dislikedPackCardIds);
    setGlobalInterruptionMode(next.globalInterruptionMode);

    // Merge incoming cloud events with current local events to prevent data loss.
    // This ensures offline actions survive sync.
    setEvents((currentEvents) => mergeEventsById(currentEvents, next.events));
    setActionCards((current) => mergeEntitiesById(current, next.actionCards));

    setScreen(next.setupComplete ? "library" : "onboarding");
    setRoutePath(getRouteFromLocation(next.setupComplete));

    window.setTimeout(() => {
      isApplyingSharedStateRef.current = false;
    }, 0);
  }, [initialState]);

  useEffect(() => {
    saveCards(cards);
  }, [cards, homeScreenVersions, cardPacks]);

  useEffect(() => {
    let mounted = true;

    getSession()
      .then((currentSession) => {
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
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return undefined;

    let cancelled = false;
    setSyncStatus("loading");
    setSyncError("");

    console.log("SESSION USER", session.user.id);

    loadSharedState(session.user.id)
      .then((sharedState) => {
        if (cancelled) return;
        console.log("LOADED CLOUD STATE", sharedState);
        if (sharedState) {
          const incomingTime = new Date(sharedState.updatedAt).getTime();
          if (!isNaN(incomingTime)) highestKnownCloudTimeRef.current = incomingTime;
          applySharedState(sharedState);
        }
        setSyncStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setSyncError(getSyncErrorMessage(error, "Could not load your BishBash profile."));
        setSyncStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, applySharedState]);

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

      console.log("SAVING CLOUD STATE", stateToSave);

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
          console.warn("Could not save BishBash shared state", error);
        });
    }, 500);

    return () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    };
  }, [syncStatus, session?.user?.id, currentSharedState]);

  useEffect(() => {
    if (syncStatus !== "ready" || !session?.user?.id) return undefined;

    const pollInterval = window.setInterval(() => {
      if (localDirtyRef.current) {
        console.log("[POLLING] Skipped: Local state has unsynced changes.");
        return;
      }

      loadSharedState(session.user.id)
        .then((sharedState) => {
          if (!sharedState) return;
          if (localDirtyRef.current) {
            console.log("[POLLING] Aborted: Local state changed during fetch.");
            return;
          }

          const incomingTime = new Date(sharedState.updatedAt).getTime();
          if (!isNaN(incomingTime) && incomingTime < highestKnownCloudTimeRef.current) {
            console.log("[POLLING] Skipped: Cloud state is older than local known state (stale read).");
            return;
          }

          console.log("POLLING LOADED STATE", sharedState);

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
          console.warn("Could not periodically sync BishBash profile", error);
        });
    }, 5000);

    return () => window.clearInterval(pollInterval);
  }, [syncStatus, session?.user?.id, applySharedState]);

  useEffect(() => {
    saveSetupComplete(setupComplete);
  }, [setupComplete]);

  useEffect(() => {
    saveMood(mood);
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

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        const hiddenFor = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
        hiddenSinceRef.current = null;
        if (hiddenFor > 1000 && route.kind === "home" && setupComplete) {
          setShouldLaunchOverlay(true);
          navigateTo("/home", { replace: true });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [cards, profile.timezone, route.kind, setupComplete, authReady, session, syncStatus]);

  useEffect(() => {
    if (!authReady || !session) return;
    if (syncStatus === "loading") return;

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

    if (route.kind === "intercept") {
      setLauncherContext(route.versionId);
      const { selected, interruption } = pickRandomHomeCardForDisplay(
        cards,
        profile.timezone,
        route.versionId,
        homeScreenVersions,
        launcherBehaviorSettings,
        cardPacks,
        dislikedPackCardIds,
        globalInterruptionMode,
        events,
      );

      if (interruption) {
        setScreen("interception");
        setOverlay({
          ...buildCustomPackOverlay(interruption.pack, interruption.activeIndex ?? 0, "intercept-pack"),
          versionId: interruption.versionId,
        });
        return;
      }

      setScreen("library");
      if (selected) {
        setOverlay(buildRevealOverlay(selected.id, route.versionId));
        return;
      }

      setOverlay(buildEmptyOverlay(route.versionId));
      return;
    }

    if (route.kind === "caught-up") {
      setScreen("library");
      setOverlay(buildEmptyOverlay());
      return;
    }

    setScreen("library");

    if (route.kind === "card") {
      if (overlay?.type === "reveal" && overlay.cardId === route.cardId) {
        return;
      }
      setOverlay(buildRevealOverlay(route.cardId));
      return;
    }

    if (route.kind === "home" && shouldLaunchOverlay) {
      if (suppressNextHomeAutoLaunchRef.current) {
        suppressNextHomeAutoLaunchRef.current = false;
        setShouldLaunchOverlay(false);
        setOverlay((current) => (current?.type === "custom-pack-preview" ? current : null));
        return;
      }

      const { selected, interruption } = pickRandomHomeCardForDisplay(
        cards,
        profile.timezone,
        launcherContext,
        homeScreenVersions,
        launcherBehaviorSettings,
        cardPacks,
        dislikedPackCardIds,
        globalInterruptionMode,
        events,
      );
      setShouldLaunchOverlay(false);
      if (interruption) {
        setOverlay({
          ...buildCustomPackOverlay(interruption.pack, interruption.activeIndex ?? 0, "intercept-pack"),
          versionId: interruption.versionId,
        });
        return;
      }
      if (selected) {
        setOverlay(buildRevealOverlay(selected.id));
        return;
      }

      setOverlay(buildEmptyOverlay());
      return;
    }

    if (route.kind === "home") {
      return;
    }

    setOverlay((current) => (current?.type === "custom-pack-preview" ? current : null));
  }, [route, setupComplete, homeScreenVersions, launcherBehaviorSettings, cardPacks, cards, profile.timezone, shouldLaunchOverlay, launcherContext, dislikedPackCardIds, globalInterruptionMode, events, authReady, session, syncStatus]);

  function navigateTo(path, { replace = false } = {}) {
    const normalized = normalizeRoutePath(path);
    const url = `${BASE_PATH}${normalized === "/" ? "" : normalized}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoutePath(normalized);
  }

  function startInterceptionFlow(versionId) {
    suppressNextHomeAutoLaunchRef.current = false;
    setShouldLaunchOverlay(false);
    setLauncherContext(versionId);

    const { selected, interruption } = pickRandomHomeCardForDisplay(
      cards,
      profile.timezone,
      versionId,
      homeScreenVersions,
      launcherBehaviorSettings,
      cardPacks,
      dislikedPackCardIds,
      globalInterruptionMode,
      events,
    );

    if (interruption) {
      setScreen("interception");
      setOverlay({
        ...buildCustomPackOverlay(interruption.pack, interruption.activeIndex ?? 0, "intercept-pack"),
        versionId: interruption.versionId,
      });
      navigateTo(`/intercept/${versionId}`, { replace: true });
      return;
    }

    setScreen("library");
    if (selected) {
      setOverlay(buildRevealOverlay(selected.id, versionId));
    } else {
      setOverlay(buildEmptyOverlay(versionId));
    }
    navigateTo(`/intercept/${versionId}`, { replace: true });
  }

  function updateCards(updater) {
    setCards((current) =>
      normalizeCards(typeof updater === "function" ? updater(current) : updater, new Date(), profile.timezone),
    );
  }

  const logEvent = useCallback(async (input) => {
    const record = createEventRecord({
      launcher_context: launcherContext,
      ...input,
    });
    const next = await persistEventRecord(record);
    setEvents(next);
  }, [launcherContext]);

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

    const eligiblePackCards = packCards.filter((card) => isEligible(card, new Date(), profile.timezone));
    if (eligiblePackCards.length === 0) return;
    const source = eligiblePackCards;
    const selected = source[Math.floor(Math.random() * source.length)];
    openSpecificReveal(selected.id);
  }

  function handleAction(action) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard) {
      setOverlay(null);
      return;
    }

    const updatedCard = applyCardAction(activeCard, action, new Date(), profile.timezone);
    updateCards((current) =>
      current.map((card) => (card.id === updatedCard.id ? updatedCard : card)),
    );
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

    suppressNextHomeAutoLaunchRef.current = true;
    setShouldLaunchOverlay(false);
    navigateTo("/home", { replace: true });
    setOverlay(null);
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
    const pack = PACKS.find((item) => item.id === packId);
    if (!pack || isPackActive(packId)) return;

    updateCards((current) => {
      const hasOldCards = current.some((c) => c.sourcePackId === packId);
      if (hasOldCards) {
        return current.map((c) =>
          c.sourcePackId === packId ? { ...c, deletedAt: null, updatedAt: new Date().toISOString() } : c
        );
      }
      return [...buildCardsFromPack(pack), ...current];
    });
    setHiddenLibraryPacks((current) => current.filter((id) => id !== packId));
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
    updateCards((current) =>
      current.map((card) =>
        card.sourcePackId === packId && !card.deletedAt
          ? { ...card, deletedAt: now, updatedAt: now }
          : card
      )
    );
    const pack = PACKS.find((item) => item.id === packId);
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
    suppressNextHomeAutoLaunchRef.current = true;
    setShouldLaunchOverlay(false);
    setOverlay(null);
    navigateTo("/home");
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
    setOverlay({ ...buildCustomPackOverlay(pack, activeIndex, "intercept-pack"), versionId });
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
    clearSharedBishBashState();
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
    setSetupComplete(false);
    setLauncherContext(NORMAL_LAUNCHER_CONTEXT);
    setOverlay(null);
    setScreen("onboarding");
    navigateTo("/onboarding", { replace: true });
  }

  async function handleSignUp(email, password) {
    setSyncStatus("loading");
    setSyncError("");
    try {
      await signUp(email, password);
    } catch (error) {
      setSyncError(getSyncErrorMessage(error, "Could not sign up."));
      setSyncStatus("needs-connection");
    }
  }

  async function handleLogIn(email, password) {
    setSyncStatus("loading");
    setSyncError("");
    try {
      await logIn(email, password);
    } catch (error) {
      setSyncError(getSyncErrorMessage(error, "Could not log in."));
      setSyncStatus("needs-connection");
    }
  }

  async function handleLogOut() {
    const confirmed = window.confirm("Log out of this BishBash profile?");
    if (!confirmed) return;
    setSyncStatus("loading");
    try {
      await logOut();
    } catch (err) {
      console.warn(err);
    }
    setSession(null);
    setSyncStatus("needs-connection");
    setSyncError("");
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
    setOverlay(buildCustomPackOverlay(normalizedPack));
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
      if (!card.sourcePackId || !isEligible(card, new Date(), profile.timezone) || card.deletedAt) return;
      if (!packMap.has(card.sourcePackId)) {
        packMap.set(card.sourcePackId, []);
      }
      packMap.get(card.sourcePackId).push(card);
    });

    packMap.forEach((packCards, packId) => {
      items.push(buildLibraryPackHomeItem(packId, packCards));
    });

    Object.values(homeScreenVersions).forEach((version) => {
      if (version.id === "bishbash" || launcherContext === NORMAL_LAUNCHER_CONTEXT) return;
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
            isEligible(candidate, new Date(), profile.timezone),
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
    () => PACKS.filter((pack) => !hiddenLibraryPacks.includes(pack.id)),
    [hiddenLibraryPacks],
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

  if (!authReady) {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (!session) {
    return (
      <SyncConnectionScreen
        mode="connect"
        error={syncError}
        onSignUp={handleSignUp}
        onLogIn={handleLogIn}
      />
    );
  }

  if (syncStatus === "loading") {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  return (
    <>
      <div className="grain" />
      {screen === "library" && !isLaunchingHomeOverlay ? (
      <div className={`app-shell app-mood theme-${getThemeClass(mood)}`}>
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
                  onResetSharedState={handleResetSharedState}
                  actionCards={actionCards}
                  onRestoreActionCards={handleRestoreActionCards}
                  interruptionPacks={interruptionPacks}
                />
              ) : null}
            </main>
          </div>

          <nav className="bottom-nav" aria-label="Primary">
            <button type="button" className={`nav-item ${activeTab === "home" ? "active" : ""}`} onClick={() => navigateTo("/home")}>
              <HomeGlyph />
              <span>Home</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "library" ? "active" : ""}`} onClick={() => navigateTo("/library")}>
              <BookGlyph />
              <span>Library</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "log" ? "active" : ""}`} onClick={() => navigateTo("/log")}>
              <LogGlyph />
              <span>Log</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "packs" ? "active" : ""}`} onClick={() => navigateTo("/packs")}>
              <PacksGlyph />
              <span>Packs</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "settings" ? "active" : ""}`} onClick={() => navigateTo("/settings")}>
              <SettingsGlyph />
              <span>Settings</span>
            </button>
          </nav>
        </div>
      ) : null}

      {screen === "onboarding" ? (
        <Onboarding
          onCreate={() => {
            setOverlay(null);
            setMenuOpenId(null);
            setEditingId(null);
            setEditingPackId(null);
            setEditingCustomPackId(null);
            setIsComposerOpen(true);
          }}
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
            navigateTo("/home", { replace: true });
            setOverlay(null);
          }}
          onAction={handleAction}
          actionCards={actionCards}
          onAcceptActionCard={(card) => {
            setOverlay(buildActionSuccessOverlay(overlay?.versionId));
            if (card.launchUrl) {
              window.location.href = card.launchUrl;
            }
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
            suppressNextHomeAutoLaunchRef.current = true;
            setShouldLaunchOverlay(false);
            setOverlay(null);
            navigateTo("/home");
          }}
          onPackDislike={dislikePackCard}
          onChooseElse={() => {
            const available = actionCards.filter((c) => !c.hidden && !c.deletedAt);
            if (available.length === 0) {
              setOverlay(buildActionCardEmptyOverlay(overlay?.versionId));
            } else {
              setOverlay(buildActionCardOverlay(overlay?.versionId));
            }
          }}
          onLogEvent={logEvent}
          onCreateActionCard={() => {
            setOverlay(null);
            setIsActionCardEditorOpen(true);
          }}
          fakeLauncherVersions={fakeLauncherVersions}
          onFakeLauncherLaunch={startInterceptionFlow}
        />
      ) : null}

      {session?.user?.id && setupComplete && fakeLauncherVersions.length > 0 ? (
        <FakeAppLauncherBar
          versions={fakeLauncherVersions}
          raised={Boolean(overlay)}
          onLaunch={startInterceptionFlow}
        />
      ) : null}
    </>
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
      <form className="composer" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">{initialCard ? "Edit your BishBash" : "Make a BishBash"}</p>
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
                <span className="field-hint">Add at least one BishBash before saving.</span>
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
                <span className="field-hint">Add one gentle BishBash before saving.</span>
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
              <span>When should this BishBash appear?</span>
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
            >
              Save BishBash
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
        onClick={onCreate}
        aria-label="Create a BishBash"
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
    <section className="library">
      <div className="section-heading solo">
        <div>
          <h2>Your BishBash list</h2>
          <p>Ready cards and actions for right now.</p>
        </div>
      </div>
      <div className="card-stack">
        {reminderItems.length === 0 ? (
          <article className="home-empty-card">
            <h3>No cards yet</h3>
            <p>Start by creating one small nudge</p>
            <button type="button" className="pack-button" onClick={onCreate}>
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
          <p>Your own BishBashes, gathered in one quiet place.</p>
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
        <h2>BishBash Log</h2>
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
            {Object.values(versions).filter((version) => version.id !== "bishbash").map((version) => (
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
          <p>Manage the card content BishBash can draw from.</p>
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
            <p>Ready-made BishBashes you can add into your day.</p>
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
                {active ? <p className="pack-active-note">Active in your BishBashes</p> : null}
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

function SyncConnectionScreen({ mode, error, onSignUp, onLogIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  function submitExisting(event) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (isLogin) {
      onLogIn(email, password);
    } else {
      onSignUp(email, password);
    }
  }

  return (
    <main className="sync-screen">
      <section className="sync-card">
        <span className="sync-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h1>BishBash</h1>
        {mode === "loading" ? (
          <p>Loading your shared BishBash...</p>
        ) : (
          <>
            <p>Log in to sync this launcher with your BishBash profile.</p>
            {error ? <p className="sync-error">{error}</p> : null}

            <form className="sync-form" onSubmit={submitExisting}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  className="settings-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  className="settings-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  required
                />
              </label>
              <button type="submit" className="save-button">
                {isLogin ? "Log In" : "Sign Up"}
              </button>
            </form>

            <button type="button" className="text-button" style={{ marginTop: 16 }} onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Need an account? Sign Up" : "Already have an account? Log In"}
            </button>
          </>
        )}
      </section>
    </main>
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
  onResetSharedState,
  actionCards,
  onRestoreActionCards,
  interruptionPacks,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Settings</h2>
          <p>Personal touches and a quick peek at how BishBash works.</p>
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
            <p>Each time the app opens, it picks one random eligible BishBash from everything you&apos;ve created or activated.</p>
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
          <span>Choose the overall feeling of BishBash.</span>
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
          <p>Install launchers</p>
          <span>Install separate home-screen buttons for Safari, Instagram and YouTube. Each launcher shares your BishBash cards and settings, but opens in its own app disguise.</span>
        </div>
        <div className="home-screen-version-list">
          {Object.values(homeScreenVersions).map((version) => {
            const previewIcon = version.customIconSrc || version.iconSrc;
            const installUrl = getInstallUrl(`${BASE_PATH}/install/${version.id}/index.html`);
            const resolvedVersion = resolveVersionConfig(version, launcherBehaviorSettings[version.id]);
            const pack = interruptionPacks?.find((p) => p.targetApp === version.id);
            const behavior = launcherBehaviorSettings[version.id] ?? {};
            const interruptionsOn = Boolean(behavior.useInterruptionPack);

            return (
              <article
                key={version.id}
                className="home-screen-version-card"
              >
                <img
                  src={previewIcon}
                  alt={`${version.name} cover icon`}
                  className="home-screen-version-icon"
                />
                <div className="home-screen-version-copy">
                  <div className="home-screen-version-title">
                    <strong>{version.name}</strong>
                  </div>
                  <p>
                    Uses launcherContext "{version.id}" and shares the same BishBash state.
                  </p>
                    <a
                      href={installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="home-screen-install-link"
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
                    : "You’ll see normal BishBash cards instead."}
                </p>
                {pack ? (
                  <p className="tiny-note" style={{ margin: "4px 0 0 0" }}>
                    Linked pack: {pack.name}
                  </p>
                ) : null}
              </div>
            ) : null}
              </article>
            );
          })}
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
        </div>
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
                <dt>BishBash</dt>
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
              <dd>{event.event_type}</dd>
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
  onPackLike,
  onPackDislike,
  onChooseElse,
  onLogEvent,
  actionCards,
  onAcceptActionCard,
  onCreateActionCard,
  fakeLauncherVersions,
  onFakeLauncherLaunch,
}) {
  if (overlay.type === "empty") {
    return (
      <div className="overlay-screen empty-state">
        <div className="floating floating-heart" />
        <button
          type="button"
          className="overlay-library-button"
          onClick={onClose}
          aria-label="Open library"
        >
          <BookGlyph />
        </button>
        <div className="caught-up-content">
          <p className="eyebrow">BishBash</p>
          <h2>You&apos;re all caught up for now.</h2>
          <p className="caught-up-copy">see you later</p>
          <div className="caught-up-actions">
            <button
              type="button"
              className="action-button"
              onClick={onClose}
            >
              Back home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (overlay.type === "intercept-pack") {
    return (
      <InterceptionOverlay
        overlay={overlay}
        version={version}
        onChooseElse={onChooseElse}
        onLogEvent={onLogEvent}
      />
    );
  }

  if (overlay.type === "custom-pack-preview") {
    return <CustomPackOverlay overlay={overlay} onClose={onClose} />;
  }

  if (overlay.type === "action-card") {
    return <ActionCardOverlay overlay={overlay} actionCards={actionCards} onAccept={onAcceptActionCard} onClose={onClose} onLogEvent={onLogEvent} />;
  }

  if (overlay.type === "action-card-empty") {
    return <ActionCardEmptyOverlay overlay={overlay} version={version} onClose={onClose} onLogEvent={onLogEvent} onCreateActionCard={onCreateActionCard} />;
  }

  if (overlay.type === "action-success") {
    return <ActionSuccessOverlay onClose={onClose} />;
  }

  if (!card) return null;

  return (
    <div
      className={`overlay-screen reveal ${overlay.phase === "dissolving" ? "is-dissolving" : ""} theme-${getThemeClass(card.theme)}`}
    >
      <div className="floating floating-heart" />
      <div className="particle particle-a" />
      <button
        type="button"
        className="overlay-library-button"
        onClick={onClose}
        aria-label="Open library"
      >
        <BookGlyph />
      </button>
      <div className="reveal-copy">
        <p className="eyebrow">{getGreeting(new Date(), timezone)}</p>
        <span className="mini-glyph" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h2>{card.promptText}</h2>
        {card.attribution ? <p className="card-attribution">{card.attribution}</p> : null}
        <p className="tiny-note">a gentle nudge from the version of you that cares</p>
      </div>
      <div className="action-row">
        {card.sourcePackId ? (
          <>
            <ActionButton label="Dislike" onClick={() => onPackDislike(card.id)} />
            <ActionButton label="Like" tone="solid" onClick={onPackLike} />
          </>
        ) : (
          <>
            <ActionButton label="Not done" onClick={() => onAction("later")} />
            <ActionButton label="I'll do it now" onClick={() => onAction("now")} />
            <ActionButton label="Done" tone="solid" onClick={() => onAction("done")} />
          </>
        )}
      </div>
    </div>
  );
}

function ActionCardOverlay({ overlay, actionCards, onAccept, onClose, onLogEvent }) {
  const available = useMemo(() => actionCards.filter((c) => !c.hidden && !c.deletedAt), [actionCards]);
  const [recentlyShown, setRecentlyShown] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);

  useEffect(() => {
    if (currentCard || available.length === 0) return;

    const nextCard = available[Math.floor(Math.random() * available.length)];
    setCurrentCard(nextCard);
    setRecentlyShown([nextCard.id]);
    logActionCardViewed(nextCard);
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
        event_type: "action_card_accepted",
        source_type: "action_card",
        card_source: "action_card",
        card_id: currentCard.id,
        card_title: currentCard.title,
        action_taken: "accepted",
      });
      onAccept(currentCard);
    }
  }

  if (!currentCard) return null;

  return (
    <div className="overlay-screen reveal">
      <div className="floating floating-heart" />
      <button type="button" className="overlay-library-button" onClick={onClose} aria-label="Close">
        <CloseGlyph />
      </button>
      <div className="reveal-copy">
        <p className="eyebrow">{currentCard.category || "Action"}</p>
        <span className="mini-glyph" aria-hidden="true">
          <SparkGlyph />
        </span>
        <h2>{currentCard.title}</h2>
        {currentCard.body ? <p className="card-attribution">{currentCard.body}</p> : null}
        <p className="tiny-note">an alternative to scrolling</p>
      </div>
      <div className="action-row">
        <ActionButton label="Another idea" onClick={pickNext} />
        <ActionButton label="I'll do this" tone="solid" onClick={handleAccept} />
      </div>
    </div>
  );
}

function ActionCardEmptyOverlay({ overlay, version, onClose, onLogEvent, onCreateActionCard }) {
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

    const href = getVersionOpenHref(version);
    if (href) {
      window.location.href = href;
    }
  }

  return (
    <div className="overlay-screen empty-state">
      <div className="floating floating-heart" />
      <button type="button" className="overlay-library-button" onClick={onClose} aria-label="Close">
        <BookGlyph />
      </button>
      <div className="caught-up-content">
        <p className="eyebrow">Action Cards</p>
        <h2>No action ideas yet.</h2>
        <p className="caught-up-copy">Make one for yourself.</p>
        <div className="caught-up-actions" style={{ flexDirection: "column", gap: "12px", display: "flex", alignItems: "center" }}>
          <ActionButton label="Create action card" tone="solid" onClick={onCreateActionCard} />
          <ActionButton label="Back home" onClick={onClose} />
          {version ? (
            <ActionButton label={`Continue to ${version.name}`} onClick={handleContinueToApp} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionSuccessOverlay({ onClose }) {
  return (
    <div className="overlay-screen empty-state">
      <div className="floating floating-heart" />
      <button type="button" className="overlay-library-button" onClick={onClose}><BookGlyph /></button>
      <div className="caught-up-content">
        <p className="eyebrow">Redirect</p>
        <h2>Nice choice.</h2>
        <p className="caught-up-copy">take all the time you need</p>
        <div className="caught-up-actions">
          <ActionButton label="Back home" tone="solid" onClick={onClose} />
        </div>
      </div>
    </div>
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
    <div className="overlay-screen custom-pack-screen">
      <button
        type="button"
        className="overlay-library-button"
        onClick={onClose}
        aria-label="Open library"
      >
        <BookGlyph />
      </button>
      <div
        className="custom-pack-carousel"
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
        <div className="custom-pack-track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {messages.map((message, index) => (
            <article key={`${overlay.packId}-${index}`} className="custom-pack-card">
              <p className="eyebrow">{overlay.name}</p>
              <span className="mini-glyph" aria-hidden="true">
                <HeartGlyph />
              </span>
              <h2>{message}</h2>
              <p className="tiny-note">Swipe through these little interruptions.</p>
            </article>
          ))}
        </div>
      </div>
      <div className="onboarding-pagination">
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
    </div>
  );
}

function InterceptionOverlay({ overlay, version, onChooseElse, onLogEvent }) {
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
      event_type: "intercept_card_viewed",
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
  }, [activeIndex, cards, messages, onLogEvent, overlay.name, overlay.packId, overlay.targetApp, version]);

  function move(delta) {
    if (messages.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next >= messages.length) return messages.length - 1;
      return next;
    });
  }

  function handleContinueToApp() {
    if (!version) return;
    setShowFallbackLink(false);
    void onLogEvent({
      event_type: "intercept_continue_to_app",
      source_type: "interruption",
      card_source: "interruption",
      card_id: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
      card_title: messages[activeIndex] ?? null,
      card_text: messages[activeIndex] ?? null,
      app_id: version.id,
      app_name: version.name,
      launcher_context: version.id,
      target_app: overlay.targetApp ?? version.id,
      pack_id: overlay.packId,
      message_id: `${overlay.packId}:${activeIndex}`,
      action_taken: "continued_to_app",
      metadata: {
        packTitle: overlay.name,
        message: messages[activeIndex] ?? null,
      },
    });

    fallbackTimerRef.current = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        setShowFallbackLink(true);
      }
    }, 3200);
  }

  return (
    <div className="overlay-screen interception-screen">
      <div
        className="custom-pack-carousel interception-carousel"
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
        <div className="custom-pack-track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {messages.map((message, index) => (
            <article key={`${overlay.packId}-${index}`} className="custom-pack-card interception-card">
              <p className="eyebrow">{overlay.name}</p>
              <span className="mini-glyph" aria-hidden="true">
                <HeartGlyph />
              </span>
              <h2>{message}</h2>
              <p className="tiny-note">A little pause before the app opens.</p>
            </article>
          ))}
        </div>
      </div>
      <div className="onboarding-pagination">
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
      <div className="interception-actions">
        <ActionButton
          label="I'll do something else"
          tone="solid"
          onClick={() => {
            void onLogEvent({
              event_type: "intercept_do_something_else",
              source_type: "interruption",
              card_source: "interruption",
              card_id: cards[activeIndex]?.id ?? `${overlay.packId}:${activeIndex}`,
              card_title: messages[activeIndex] ?? null,
              card_text: messages[activeIndex] ?? null,
              app_id: version?.id ?? null,
              app_name: version?.name ?? null,
              launcher_context: version?.id ?? NORMAL_LAUNCHER_CONTEXT,
              target_app: overlay.targetApp ?? version?.id ?? null,
              pack_id: overlay.packId,
              message_id: `${overlay.packId}:${activeIndex}`,
              action_taken: "chose_something_else",
              metadata: {
                packTitle: overlay.name,
                message: messages[activeIndex] ?? null,
              },
            });
            onChooseElse();
          }}
        />
        <ActionButton
          label={`Continue to ${version?.name ?? "app"}`}
          href={getVersionOpenHref(version)}
          onClick={handleContinueToApp}
        />
      </div>
      {showFallbackLink && version?.manualUrl ? (
        <p className="manual-open-copy">
          App didn&apos;t open?{" "}
          <a href={version.manualUrl} target="_blank" rel="noopener noreferrer">
            Open {version.name} manually
          </a>
        </p>
      ) : null}
    </div>
  );
}

function ActionButton({ label, onClick, tone = "ghost", href }) {
  const className = `action-button ${tone}`;

  if (href) {
    return (
      <a className={className} href={href} onClick={onClick}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {label}
    </button>
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

export default App;
