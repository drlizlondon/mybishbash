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
  loadSelectedHomeScreenVersion,
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
  saveSelectedHomeScreenVersion,
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
  clearConnectedProfileForTesting,
  connectProfileBySyncCode,
  createNewProfileWithState,
  getConnectedProfile,
  getSyncErrorMessage,
  loadSharedState,
  saveSharedState,
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
  launcherBehaviorSettings,
  cardPacks,
  hiddenLibraryPacks,
  dislikedPackCardIds,
  globalInterruptionMode,
  events,
}) {
  return {
    version: 1,
    cards,
    setupComplete,
    mood,
    profile,
    launcherBehaviorSettings,
    cardPacks,
    hiddenLibraryPacks,
    dislikedPackCardIds,
    globalInterruptionMode,
    events,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSharedState(state, fallback) {
  const source = state && typeof state === "object" ? state : {};

  let normalizedBehavior = fallback.launcherBehaviorSettings;
  if (source.launcherBehaviorSettings && typeof source.launcherBehaviorSettings === "object") {
    normalizedBehavior = source.launcherBehaviorSettings;
  } else if (source.homeScreenVersions && typeof source.homeScreenVersions === "object") {
    normalizedBehavior = {};
    for (const [id, version] of Object.entries(source.homeScreenVersions)) {
      normalizedBehavior[id] = {
        useInterruptionPack: version.useInterruptionPack,
        interruptionPaused: version.interruptionPaused,
        interruptionPackId: version.interruptionPackId,
      };
    }
  }

  return {
    cards: Array.isArray(source.cards) ? source.cards : fallback.cards,
    setupComplete: typeof source.setupComplete === "boolean" ? source.setupComplete : fallback.setupComplete,
    mood: resolveTheme(source.mood ?? fallback.mood),
    profile: source.profile && typeof source.profile === "object" ? source.profile : fallback.profile,
    launcherBehaviorSettings: normalizedBehavior,
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
  };
}

function mergeEntitiesById(local = [], incoming = []) {
  const map = new Map();

  if (Array.isArray(incoming)) {
    incoming.forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
  }

  if (Array.isArray(local)) {
    local.forEach((item) => {
      if (item?.id) {
        const existing = map.get(item.id);
        if (existing) {
          const incomingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
          const localTime = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;

          if (incomingTime > localTime && incomingTime > 0) {
            // Keep incoming (already in map)
          } else {
            // Prefer local for conflicts to avoid losing offline edits
            map.set(item.id, item);
          }
        } else {
          map.set(item.id, item);
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
  const packCards = cards.filter((card) => card.sourcePackId === packId);
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
    };
  }, []);
  const [cards, setCards] = useState(initialState.cards);
  const [mood, setMood] = useState(initialState.mood);
  const [profile, setProfile] = useState(initialState.profile);
  const [homeScreenVersions, setHomeScreenVersions] = useState(initialState.homeScreenVersions);
  const [selectedHomeScreenVersion, setSelectedHomeScreenVersion] = useState(() => loadSelectedHomeScreenVersion());
  const [launcherBehaviorSettings, setLauncherBehaviorSettings] = useState(initialState.launcherBehaviorSettings);
  const [cardPacks, setCardPacks] = useState(initialState.cardPacks);
  const [dislikedPackCardIds, setDislikedPackCardIds] = useState(initialState.dislikedPackCardIds);
  const [globalInterruptionMode, setGlobalInterruptionMode] = useState(initialState.globalInterruptionMode);
  const [hiddenLibraryPacks, setHiddenLibraryPacks] = useState(initialState.hiddenLibraryPacks);
  const [events, setEvents] = useState(initialState.events);
  const [setupComplete, setSetupComplete] = useState(initialState.setupComplete);
  const [syncConnection, setSyncConnection] = useState(() => getConnectedProfile());
  const [syncStatus, setSyncStatus] = useState(() => (getConnectedProfile() ? "loading" : "needs-connection"));
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
  const [selectedPackDetail, setSelectedPackDetail] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const transitionTimerRef = useRef(null);
  const isApplyingSharedStateRef = useRef(false);
  const cloudSaveTimerRef = useRef(null);
  const lastCloudStateStrRef = useRef(null);
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
      if (launcherContext === NORMAL_LAUNCHER_CONTEXT) return [];
      const version = resolveVersionConfig(
        homeScreenVersions[launcherContext] ?? DEFAULT_HOME_SCREEN_VERSIONS[launcherContext],
        launcherBehaviorSettings[launcherContext]
      );
      return version?.realAppLabel ? [version] : [];
    },
    [homeScreenVersions, launcherBehaviorSettings, launcherContext],
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
        launcherBehaviorSettings,
        cardPacks,
        hiddenLibraryPacks,
        dislikedPackCardIds,
        globalInterruptionMode,
        events,
      }),
    [
      cards,
      setupComplete,
      mood,
      profile,
      launcherBehaviorSettings,
      cardPacks,
      hiddenLibraryPacks,
      dislikedPackCardIds,
      globalInterruptionMode,
      events,
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
      launcherBehaviorSettings: initialState.launcherBehaviorSettings,
      cardPacks: initialState.cardPacks,
      hiddenLibraryPacks: initialState.hiddenLibraryPacks,
      dislikedPackCardIds: initialState.dislikedPackCardIds,
      globalInterruptionMode: initialState.globalInterruptionMode,
      events: initialState.events,
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
    setLauncherBehaviorSettings(next.launcherBehaviorSettings);
    setCardPacks((currentPacks) => mergeEntitiesById(currentPacks, next.cardPacks));
    setHiddenLibraryPacks(next.hiddenLibraryPacks);
    setDislikedPackCardIds(next.dislikedPackCardIds);
    setGlobalInterruptionMode(next.globalInterruptionMode);

    // Merge incoming cloud events with current local events to prevent data loss.
    // This ensures offline actions survive sync.
    setEvents((currentEvents) => mergeEventsById(currentEvents, next.events));

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
    if (!syncConnection?.profileId) return;

    let cancelled = false;
    setSyncStatus("loading");
    setSyncError("");

    loadSharedState(syncConnection.profileId)
      .then((sharedState) => {
        if (cancelled) return;
        applySharedState(sharedState);
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
  }, [syncConnection?.profileId, applySharedState]);

  useEffect(() => {
    if (syncStatus !== "ready" || !syncConnection?.profileId || isApplyingSharedStateRef.current) return undefined;

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
    }

    cloudSaveTimerRef.current = window.setTimeout(() => {
      if (isApplyingSharedStateRef.current) return;

      const stateToSave = currentSharedState();
      const { updatedAt, ...stateContent } = stateToSave;
      const stateStr = JSON.stringify(stateContent);

      if (stateStr === lastCloudStateStrRef.current) {
        return;
      }

      saveSharedState(syncConnection.profileId, stateToSave)
        .then(() => {
          lastCloudStateStrRef.current = stateStr;
        })
        .catch((error) => {
          // TODO: queue offline saves instead of only preserving the local mirror.
          console.warn("Could not save BishBash shared state", error);
        });
    }, 500);

    return () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    };
  }, [syncStatus, syncConnection?.profileId, currentSharedState]);

  useEffect(() => {
    if (syncStatus !== "ready" || !syncConnection?.profileId) return undefined;

    const pollInterval = window.setInterval(() => {
      loadSharedState(syncConnection.profileId)
        .then((sharedState) => {
          if (!sharedState) return;

          const { updatedAt, ...incomingStateContent } = sharedState;
          const incomingStateStr = JSON.stringify(incomingStateContent);

          if (incomingStateStr === lastCloudStateStrRef.current) {
            return;
          }

          applySharedState(sharedState);
        })
        .catch((error) => {
          console.warn("Could not periodically sync BishBash profile", error);
        });
    }, 5000);

    return () => window.clearInterval(pollInterval);
  }, [syncStatus, syncConnection?.profileId, applySharedState]);

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
    saveSelectedHomeScreenVersion(selectedHomeScreenVersion);
  }, [selectedHomeScreenVersion]);

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
  }, [cards, profile.timezone, route.kind, setupComplete]);

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

    if (route.kind === "intercept") {
      setLauncherContext(route.versionId);
      const version = resolveVersionConfig(
        homeScreenVersions[route.versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[route.versionId],
        launcherBehaviorSettings[route.versionId]
      );
      const pack = getInterruptionPackForLauncher(route.versionId, homeScreenVersions, launcherBehaviorSettings, cardPacks, {
        hiddenCardIds: dislikedPackCardIds,
        globalEnabled: globalInterruptionMode,
      });
      if (!pack) {
        setScreen("library");
        setShouldLaunchOverlay(true);
        navigateTo("/home", { replace: true });
        return;
      }

      setScreen("interception");
      setOverlay(
        pack?.messages?.length
          ? { ...buildCustomPackOverlay(pack, pickInterruptionCardIndex(pack, events), "intercept-pack"), versionId: route.versionId }
          : { type: "empty", message: "No interruption cards available." },
      );
      return;
    }

    if (route.kind === "caught-up") {
      setScreen("library");
      setOverlay({ type: "empty" });
      return;
    }

    setScreen("library");

    if (route.kind === "card") {
      if (overlay?.type === "reveal" && overlay.cardId === route.cardId) {
        return;
      }
      setOverlay({
        type: "reveal",
        cardId: route.cardId,
      });
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
        setOverlay({
          type: "reveal",
          cardId: selected.id,
        });
        return;
      }

      setOverlay({ type: "empty" });
      return;
    }

    if (route.kind === "home") {
      return;
    }

    setOverlay((current) => (current?.type === "custom-pack-preview" ? current : null));
  }, [route, setupComplete, homeScreenVersions, launcherBehaviorSettings, cardPacks, cards, profile.timezone, shouldLaunchOverlay, launcherContext, dislikedPackCardIds, globalInterruptionMode, events]);

  function navigateTo(path, { replace = false } = {}) {
    const normalized = normalizeRoutePath(path);
    const url = `${BASE_PATH}${normalized === "/" ? "" : normalized}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoutePath(normalized);
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
          ? { ...card, lastShownAt: new Date().toISOString() }
          : card,
      ),
    );
    navigateTo(`/card/${encodeURIComponent(cardId)}`);
  }

  function openPackReveal(packId) {
    const packCards = cards.filter((card) => card.sourcePackId === packId);
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
          lastShownAt: null,
          notYetUntil: null,
          doneDate: null,
          frequency: formData.frequency,
          timingWindows: formData.timingWindows,
          paused: false,
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
    updateCards((current) => current.filter((card) => card.id !== cardId && card.sourcePackId !== cardId));
    setMenuOpenId(null);
  }

  function handleResetItem(item) {
    updateCards((current) =>
      current.map((card) => {
        const matches =
          item.type === "pack"
            ? card.sourcePackId === item.id
            : card.id === item.id;

        if (!matches) return card;

        return {
          ...card,
          statusToday: "fresh",
          doneDate: null,
          notYetUntil: null,
          lastShownAt: null,
          paused: false,
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
            ? card.sourcePackId === item.id
            : card.id === item.id;

        if (!matches) return card;

        return {
          ...card,
          paused: !card.paused,
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
        card.sourcePackId === packId
          ? {
              ...card,
              frequency: formData.frequency,
              timingWindows: formData.timingWindows,
            }
          : card,
      ),
    );
    setEditingPackId(null);
  }

  function isPackActive(packId) {
    return cards.some((card) => card.sourcePackId === packId);
  }

  function activatePack(packId) {
    const pack = PACKS.find((item) => item.id === packId);
    if (!pack || isPackActive(packId)) return;

    updateCards((current) => [...buildCardsFromPack(pack), ...current]);
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
    updateCards((current) => current.filter((card) => card.sourcePackId !== packId));
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

  function handleSelectHomeScreenVersion(versionId) {
    setSelectedHomeScreenVersion(versionId);
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

  function handleResetSharedState() {
    const confirmed = window.confirm("Clear local development state on this launcher/device? This will not delete the cloud profile.");
    if (!confirmed) return;

    clearConnectedProfileForTesting();
    setSyncConnection(null);
    setSyncStatus("needs-connection");
    setSyncError("");
    clearSharedBishBashState();
    setCards([]);
    setMood(resolveTheme("Minimal"));
    setProfile({ name: "", timezone: "Europe/London" });
    setHomeScreenVersions(loadHomeScreenVersions());
    setSelectedHomeScreenVersion("bishbash");
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

  async function handleStartNewSyncProfile() {
    setSyncStatus("loading");
    setSyncError("");
    try {
      const created = await createNewProfileWithState(currentSharedState());
      setSyncConnection({ profileId: created.profileId, syncCode: created.syncCode });
      setSyncStatus("ready");
    } catch (error) {
      setSyncError(getSyncErrorMessage(error, "Could not create a new BishBash profile."));
      setSyncStatus("needs-connection");
    }
  }

  async function handleConnectSyncProfile(syncCode) {
    setSyncStatus("loading");
    setSyncError("");
    try {
      const connected = await connectProfileBySyncCode(syncCode);
      setSyncConnection({ profileId: connected.profileId, syncCode: connected.syncCode });
      applySharedState(connected.state);
      setSyncStatus("ready");
    } catch (error) {
      setSyncError(getSyncErrorMessage(error, "Could not connect that BishBash profile."));
      setSyncStatus("needs-connection");
    }
  }

  function handleDisconnectSyncProfile() {
    const confirmed = window.confirm("Disconnect this launcher/device from the current BishBash profile?");
    if (!confirmed) return;
    clearConnectedProfileForTesting();
    setSyncConnection(null);
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
      overlay?.type === "intercept-pack" && overlay?.versionId
        ? resolveVersionConfig(
            homeScreenVersions[overlay.versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[overlay.versionId],
            launcherBehaviorSettings[overlay.versionId]
          )
        : activeInterceptionVersion,
    [activeInterceptionVersion, homeScreenVersions, launcherBehaviorSettings, overlay?.type, overlay?.versionId],
  );

  const homeItems = useMemo(() => {
    const items = cards
      .filter((card) => !card.sourcePackId && !card.disliked)
      .map((card) => ({
        type: "single",
        id: card.id,
        representative: card,
      }));

    const packMap = new Map();
    cards.forEach((card) => {
      if (!card.sourcePackId || !isEligible(card, new Date(), profile.timezone)) return;
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
        .filter((card) => !card.sourcePackId)
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

  if (syncStatus === "loading") {
    return <SyncConnectionScreen mode="loading" error={syncError} />;
  }

  if (syncStatus === "error") {
    return (
      <SyncConnectionScreen
        mode="error"
        error={syncError}
        onStartNew={handleStartNewSyncProfile}
        onConnect={handleConnectSyncProfile}
      />
    );
  }

  if (syncStatus === "needs-connection") {
    return (
      <SyncConnectionScreen
        mode="connect"
        error={syncError}
        onStartNew={handleStartNewSyncProfile}
        onConnect={handleConnectSyncProfile}
      />
    );
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
                  interruptionPacks={interruptionPacks}
                  libraryPacks={visibleLibraryPacks}
                  onActivateLibraryPack={activatePack}
                  onDeactivateLibraryPack={deactivatePack}
                  onOpenPack={setSelectedPackDetail}
                />
              ) : null}
              {activeTab === "settings" ? (
                <SettingsPanel
                  mood={mood}
                  onSelectMood={setMood}
                  homeScreenVersions={homeScreenVersions}
                  selectedHomeScreenVersion={selectedHomeScreenVersion}
                  onSelectHomeScreenVersion={handleSelectHomeScreenVersion}
                  onUpdateHomeScreenIcon={handleUpdateHomeScreenIcon}
                  globalInterruptionMode={globalInterruptionMode}
                  onSetGlobalInterruptionMode={handleSetGlobalInterruptionMode}
                  syncConnection={syncConnection}
                  onDisconnectSyncProfile={handleDisconnectSyncProfile}
                  onResetSharedState={handleResetSharedState}
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
            suppressNextHomeAutoLaunchRef.current = true;
            setShouldLaunchOverlay(false);
            setOverlay(null);
            navigateTo("/home", { replace: true });
          }}
          onLogEvent={logEvent}
        />
      ) : null}

      {screen !== "onboarding" && fakeLauncherVersions.length > 0 ? (
        <FakeAppLauncherBar
          versions={fakeLauncherVersions}
          raised={Boolean(overlay) && overlay.type !== "custom-pack-preview" && overlay.type !== "intercept-pack"}
        />
      ) : null}
    </>
  );
}

function Composer({ initialCard, onClose, onSave }) {
  const [promptText, setPromptText] = useState(initialCard?.promptText ?? "");
  const [theme, setTheme] = useState(resolveTheme(initialCard?.theme));
  const [icon, setIcon] = useState(initialCard?.icon ?? "heart");
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);
  const [showValidation, setShowValidation] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = promptText.trim();
    if (!trimmed) {
      setShowValidation(true);
      return;
    }

    onSave({ promptText: trimmed, theme, icon, frequency, timingWindows });
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
                        handleDeleteCard(item.id);
                      }}
                      disabled={item.type === "interruption-card" || item.type === "interruption-version"}
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

function PacksPanel({
  cards,
  interruptionPacks,
  libraryPacks,
  onActivateLibraryPack,
  onDeactivateLibraryPack,
  onOpenPack,
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
            <h2>Library Packs</h2>
            <p>Ready-made BishBashes you can add into your day.</p>
          </div>
        </div>
        <div className="library-pack-stack">
          {libraryPacks.map((pack, index) => {
            const active = cards.some((card) => card.sourcePackId === pack.id);
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
                    onClick={() => {
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
                  (card) => card.sourcePackId === libraryPack.id && card.promptText === entry.promptText,
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

function SyncConnectionScreen({ mode, error, onStartNew, onConnect }) {
  const [syncCode, setSyncCode] = useState("");
  const [showConnect, setShowConnect] = useState(false);

  function submitExisting(event) {
    event.preventDefault();
    if (!syncCode.trim()) return;
    onConnect(syncCode);
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
            <p>Connect this launcher to your shared BishBash profile.</p>
            {error ? <p className="sync-error">{error}</p> : null}
            <button type="button" className="pack-button" onClick={onStartNew}>
              Start new BishBash
            </button>
            <button type="button" className="pack-button secondary" onClick={() => setShowConnect((current) => !current)}>
              I already have a BishBash
            </button>
            {showConnect || mode === "error" ? (
              <form className="sync-form" onSubmit={submitExisting}>
                <label className="field">
                  <span>Sync code</span>
                  <input
                    className="settings-input"
                    value={syncCode}
                    onChange={(event) => setSyncCode(event.target.value.toUpperCase())}
                    placeholder="BISH-7K2M-PQ9A"
                  />
                </label>
                <button type="submit" className="save-button">
                  Connect BishBash
                </button>
              </form>
            ) : null}
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
  selectedHomeScreenVersion,
  onSelectHomeScreenVersion,
  onUpdateHomeScreenIcon,
  globalInterruptionMode,
  onSetGlobalInterruptionMode,
  syncConnection,
  onDisconnectSyncProfile,
  onResetSharedState,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState(selectedHomeScreenVersion || "bishbash");

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
      <div className="settings-card settings-compact">
        <div className="settings-version-heading">
          <p>Interruption mode</p>
          <span>When on, supported launcher contexts can show their matching interruption cards.</span>
        </div>
        <label className="timing-option settings-checkbox-row">
          <input
            type="checkbox"
            checked={globalInterruptionMode}
            onChange={(event) => onSetGlobalInterruptionMode(event.target.checked)}
          />
          <span>{globalInterruptionMode ? "Interruption mode is ON" : "Interruption mode is OFF"}</span>
        </label>
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
          <p>Home Screen versions</p>
          <span>Choose how this appears on your Home Screen.</span>
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
            const version = homeScreenVersions[previewVersionId] || homeScreenVersions["bishbash"];
            const previewIcon = version.customIconSrc || version.iconSrc;
            const installPath = DEFAULT_HOME_SCREEN_VERSIONS[version.id]?.installPath || version.installPath;
            const installUrl = getInstallUrl(installPath);
            const isStandardVersion = version.id === "bishbash";

            return (
              <article
                key={version.id}
                className={`home-screen-version-card ${selectedHomeScreenVersion === version.id ? "selected-version-card" : ""}`}
              >
                <img
                  src={previewIcon}
                  alt={`${version.name} cover icon`}
                  className="home-screen-version-icon"
                />
                <div className="home-screen-version-copy">
                  <div className="home-screen-version-title">
                    <strong>{version.name}</strong>
                    {selectedHomeScreenVersion === version.id ? <span>Selected</span> : null}
                  </div>
                  <p>
                    {isStandardVersion
                      ? "Launches straight into your standard BishBash home."
                      : `Uses launcherContext "${version.id}" and shares the same BishBash state.`}
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
                  <button
                    type="button"
                    className={`pack-button ${selectedHomeScreenVersion === version.id ? "secondary" : ""}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelectHomeScreenVersion(version.id);
                    }}
                  >
                    {selectedHomeScreenVersion === version.id ? "Using this version" : "Use this version"}
                  </button>
                  <p className="pack-meta">{isStandardVersion ? "launcherContext: normal" : `launcherContext: ${version.id}`}</p>
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
              </article>
            );
          })()}
        </div>
      </div>
      <div className="settings-card settings-compact">
        <div className="settings-version-heading">
          <p>Sync profile</p>
          <span>Use this code to connect another home-screen version or another device.</span>
        </div>
        <div className="sync-profile-row">
          <strong>{syncConnection?.syncCode ?? "Not connected"}</strong>
          <button
            type="button"
            className="pack-button secondary"
            onClick={() => {
              if (syncConnection?.syncCode) {
                void navigator.clipboard?.writeText(syncConnection.syncCode);
              }
            }}
            disabled={!syncConnection?.syncCode}
          >
            Copy sync code
          </button>
          <button type="button" className="pack-button secondary" onClick={onDisconnectSyncProfile}>
            Connect another BishBash
          </button>
        </div>
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
    </section>
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
}) {
  if (overlay.type === "empty" && route.kind === "intercept") {
    return (
      <div className="overlay-screen empty-state interception-screen" onClick={onClose}>
        <div className="floating floating-heart" />
        <p className="eyebrow">BishBash</p>
        <h2>No interruption pack is linked yet.</h2>
        <p>Open Settings and connect one to this Home Screen version.</p>
      </div>
    );
  }

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

function Onboarding({ onCreate }) {
  const slides = [
    {
      id: "future-self",
      message: "Your earlier self left a quiet note for right now.",
      support: "BishBash lets a clearer version of you cut through the noise.",
    },
    {
      id: "tiny-actions",
      message: "Small caring actions are easier to hear than big promises.",
      support: "Drink water. Stretch. Read your Bible. Tiny nudges still count.",
    },
    {
      id: "one-at-a-time",
      message: "One gentle interruption. One moment of attention.",
      support: "Every time BishBash opens, it shows one soft message instead of a pile.",
    },
    {
      id: "private-ritual",
      message: "Private, synced, and just for future-you.",
      support: "Use your sync code to connect every launcher, browser, and device to the same BishBash.",
    },
  ];
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef(null);

  function goToSlide(index) {
    const total = slides.length;
    setActiveSlide((index + total) % total);
  }

  function handleTouchStart(event) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event) {
    if (touchStartX.current == null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(delta) < 36) return;
    if (delta < 0) {
      goToSlide(activeSlide + 1);
      return;
    }
    goToSlide(activeSlide - 1);
  }

  return (
    <div className="overlay-screen onboarding-screen">
      <div className="onboarding-shell">
        <header className="onboarding-brand">
          <span className="onboarding-heart" aria-hidden="true">
            <HeartGlyph />
          </span>
          <h1>BishBash</h1>
          <p>private little messages from your earlier self</p>
        </header>

        <div
          className="onboarding-carousel"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            className="onboarding-arrow onboarding-arrow-left"
            onClick={() => goToSlide(activeSlide - 1)}
            aria-label="Show previous welcome card"
          >
            <ChevronLeftGlyph />
          </button>
          <div
            className="onboarding-track"
            style={{ transform: `translateX(-${activeSlide * 100}%)` }}
          >
            {slides.map((slide) => (
              <article className="onboarding-feature-card" key={slide.id}>
                <span className="feature-mini-heart" aria-hidden="true">
                  <HeartGlyph />
                </span>
                <h2>{slide.message}</h2>
                <p className="feature-support">{slide.support}</p>
                <div className="feature-scene" aria-hidden="true">
                  <span className="feature-star feature-star-one" />
                  <span className="feature-star feature-star-two" />
                  <span className="feature-star feature-star-three" />
                  <span className="feature-sun" />
                  <span className="feature-horizon" />
                  <span className="feature-reflection" />
                  <span className="feature-stone" />
                </div>
              </article>
            ))}
          </div>
          <button
            type="button"
            className="onboarding-arrow onboarding-arrow-right"
            onClick={() => goToSlide(activeSlide + 1)}
            aria-label="Show next welcome card"
          >
            <ChevronRightGlyph />
          </button>
        </div>

        <div className="onboarding-pagination">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`pagination-dot ${index === activeSlide ? "active" : ""}`}
              aria-label={`Show onboarding card ${index + 1}`}
              aria-pressed={index === activeSlide}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="save-button" onClick={onCreate}>
            Make your first BishBash
          </button>
        </div>
      </div>
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

function ChevronLeftGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
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
