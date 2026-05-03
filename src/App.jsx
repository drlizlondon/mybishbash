import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_HOME_SCREEN_VERSIONS,
  loadCards,
  loadCardPacks,
  loadHomeScreenVersions,
  loadMood,
  loadProfile,
  loadSelectedHomeScreenVersion,
  loadSetupComplete,
  saveCards,
  saveCardPacks,
  saveHomeScreenVersions,
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
} from "./eventLog";
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
} from "./utils";

function resolveTheme(theme) {
  if (theme === "Paper Cut") return "Soft Bloom";
  return THEMES.includes(theme) ? theme : THEMES[0];
}

const BASE_PATH = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

const DEFAULT_INTERRUPTION_PACKS = {
  safari: {
    id: "default-safari-interruptions",
    name: "Safari Interruptions",
    linkedVersionId: "safari",
    messages: [
      "Do you want the internet, or a little pause first?",
      "What were you hoping to find online just now?",
      "Could your attention belong to real life for one more minute?",
    ],
  },
  instagram: {
    id: "default-instagram-interruptions",
    name: "Instagram Interruptions",
    linkedVersionId: "instagram",
    messages: [
      "Is Instagram the best use of your attention right now?",
      "Instagram is making money from your attention.",
      "What were you hoping Instagram would fix?",
      "Open your own life before opening everyone else's.",
    ],
  },
  youtube: {
    id: "default-youtube-interruptions",
    name: "YouTube Interruptions",
    linkedVersionId: "youtube",
    messages: [
      "Do you want YouTube, or do you want to disappear for a while?",
      "Would a short real break feel better than autoplay?",
      "What would actually help you more than another video?",
    ],
  },
};

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

function getAppLauncherConfig(selectedVersionId, versions) {
  if (selectedVersionId === "bishbash") {
    return {
      id: "safari",
      label: "Safari",
      type: "safari",
    };
  }

  const selected = versions[selectedVersionId];
  if (!selected?.realAppLabel) return null;

  return {
    id: selected.id,
    label: selected.realAppLabel,
    type: selected.id === "safari" ? "safari" : "native",
    appUrl: selected.appUrl,
  };
}

function openSafariEscape() {
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true);

  const safariHref = isStandalone
    ? "x-safari-https://www.google.com"
    : "https://www.google.com";

  if (isStandalone) {
    window.location.href = safariHref;
    return;
  }

  window.open(safariHref, "_blank", "noopener,noreferrer");
}

function getInterruptionPackForVersion(versionId, versions, customPacks) {
  const version = versions[versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[versionId];
  const selectedId = version?.interruptionPackId || version?.selectedPackId || "";
  const selectedCustomPack = customPacks.find(
    (pack) => pack.id === selectedId && Array.isArray(pack.messages) && pack.messages.length > 0,
  );

  if (selectedCustomPack) return selectedCustomPack;
  return DEFAULT_INTERRUPTION_PACKS[versionId] ?? null;
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

function pickRandomHomeCardForDisplay(currentCards, timezone) {
  const normalized = normalizeCards(currentCards, new Date(), timezone);
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

  // Prioritise personal (non-pack) cards over pack cards. Only if no personal cards are eligible do we fall back to pack cards.
  // First pick from singles if any exist.
  if (singles.length > 0) {
    const chosenSingle = singles[Math.floor(Math.random() * singles.length)];
    return { normalized, selected: chosenSingle.card };
  }
  // If no personal cards are available, pick from packs if any exist.
  if (packs.length > 0) {
    const chosenPack = packs[Math.floor(Math.random() * packs.length)];
    const selected = chosenPack.packCards[Math.floor(Math.random() * chosenPack.packCards.length)];
    return { normalized, selected };
  }
  // If neither singles nor packs are available, return null.
  return { normalized, selected: null };
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

function getHomeCardTitle(card) {
  return card.dashboardTitle ?? card.promptText?.trim() ?? "";
}

function getPackRepresentative(cards, packId) {
  const packCards = cards.filter((card) => card.sourcePackId === packId);
  return packCards.find((card) => !card.paused) ?? packCards[0] ?? null;
}

function resolveVersionConfig(version) {
  return {
    launchPath: "/home",
    interruptionPackId: "",
    ...version,
  };
}

function buildCustomPackOverlay(pack, activeIndex = 0, type = "custom-pack-preview") {
  return {
    type,
    packId: pack.id,
    name: pack.name,
    messages: pack.messages,
    activeIndex,
  };
}

function App() {
  const initialState = useMemo(() => {
    const base = buildInitialState();
    return {
      ...base,
      cardPacks: loadCardPacks(),
      homeScreenVersions: loadHomeScreenVersions(),
      events: loadEventLog(),
    };
  }, []);
  const [cards, setCards] = useState(initialState.cards);
  const [mood, setMood] = useState(initialState.mood);
  const [profile, setProfile] = useState(initialState.profile);
  const [homeScreenVersions, setHomeScreenVersions] = useState(initialState.homeScreenVersions);
  const [selectedHomeScreenVersion, setSelectedHomeScreenVersion] = useState(() => loadSelectedHomeScreenVersion());
  const [cardPacks, setCardPacks] = useState(initialState.cardPacks);
  const [events, setEvents] = useState(initialState.events);
  const [setupComplete, setSetupComplete] = useState(initialState.setupComplete);
  const [screen, setScreen] = useState(initialState.setupComplete ? "library" : "onboarding");
  const [overlay, setOverlay] = useState(null);
  const [routePath, setRoutePath] = useState(() => getRouteFromLocation(initialState.setupComplete));
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingPackId, setEditingPackId] = useState(null);
  const [editingCustomPackId, setEditingCustomPackId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const transitionTimerRef = useRef(null);
  const hasAutoLaunchedRef = useRef(false);
  const route = useMemo(() => parseRoute(routePath), [routePath]);
  const activeTab = route.tab ?? "home";
  const activeInterceptionVersion = route.kind === "intercept"
    ? resolveVersionConfig(homeScreenVersions[route.versionId] ?? DEFAULT_HOME_SCREEN_VERSIONS[route.versionId])
    : null;
  const appLauncher = useMemo(
    () => getAppLauncherConfig(selectedHomeScreenVersion, homeScreenVersions),
    [selectedHomeScreenVersion, homeScreenVersions],
  );

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

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
    saveCardPacks(cardPacks);
  }, [cardPacks]);

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
      const pack = getInterruptionPackForVersion(route.versionId, homeScreenVersions, cardPacks);
      setScreen("interception");
      setOverlay(
        pack
          ? buildCustomPackOverlay(pack, 0, "intercept-pack")
          : { type: "empty", message: "No interruption pack linked yet." },
      );
      return;
    }

setScreen("library");

if (route.kind === "card") {
  setOverlay({
    type: "reveal",
    cardId: route.cardId,
    phase: "visible",
  });
  return;
}

    setOverlay((current) => (current?.type === "custom-pack-preview" ? current : null));
  }, [route, setupComplete, homeScreenVersions, cardPacks]);
  useEffect(() => {
    if (hasAutoLaunchedRef.current) return;
    if (!setupComplete) return;
    if (route.kind !== "home") return;
    if (overlay) return;

    // Use the prioritised picker to select a card for auto-launch.
    const { selected } = pickRandomHomeCardForDisplay(cards, profile.timezone);

    // If there are no eligible cards (personal or pack), show the caught-up state.
 if (!selected) {
  hasAutoLaunchedRef.current = true;
  setScreen("library");
  setOverlay({ type: "empty" });
  return;
}

    hasAutoLaunchedRef.current = true;

   navigateTo(`/card/${encodeURIComponent(selected.id)}`, { replace: true });

    // Record the reveal time on the selected card.
    updateCards((current) =>
      current.map((card) =>
        card.id === selected.id
          ? {
              ...card,
              lastShownAt: new Date().toISOString(),
            }
          : card,
      ),
    );
  }, [
    setupComplete,
    route.kind,
    overlay,
    cards,
    profile.timezone,
  ]);
  


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
    const record = createEventRecord(input);
    const next = await persistEventRecord(record);
    setEvents(next);
  }, []);

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
      source_type: "standard_bishbash",
      bash_id: activeCard.id,
      bash_title: activeCard.promptText,
      metadata: {
        frequency: activeCard.frequency,
        timingWindows: activeCard.timingWindows,
      },
    });

    setOverlay((currentOverlay) =>
      currentOverlay ? { ...currentOverlay, phase: "dissolving", action } : currentOverlay,
    );

    transitionTimerRef.current = window.setTimeout(() => {
      setOverlay(null);
      navigateTo("/home");
    }, 720);
  }

  // Lightweight reaction handler for pack cards. Dislike pauses the specific pack card; like leaves it active.
  function handlePackReaction(reaction) {
    if (!overlay || overlay.type !== "reveal") return;
    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard) {
      setOverlay(null);
      return;
    }
    // If the user dislikes the card, mark it as paused so it won't be selected again.
    if (reaction === "dislike") {
      updateCards((current) =>
        current.map((card) =>
          card.id === activeCard.id
            ? {
                ...card,
                paused: true,
              }
            : card,
        ),
      );
    }
    // Dissolve the overlay and return home after a short delay.
    setOverlay((currentOverlay) =>
      currentOverlay ? { ...currentOverlay, phase: "dissolving", action: reaction } : currentOverlay,
    );
    transitionTimerRef.current = window.setTimeout(() => {
      setOverlay(null);
      navigateTo("/home");
    }, 720);
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
    updateCards((current) => current.filter((card) => card.id !== cardId));
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
    navigateTo("/home");
  }

  function deactivatePack(packId) {
    updateCards((current) => current.filter((card) => card.sourcePackId !== packId));
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
    setHomeScreenVersions((current) => ({
      ...current,
      [versionId]: {
        ...resolveVersionConfig(current[versionId]),
        ...updates,
      },
    }));
  }

  function handleSaveCustomPack(packData) {
    const nextPack = {
      id: packData.id ?? createId(),
      name: packData.name.trim(),
      linkedVersionId: packData.linkedVersionId ?? "",
      messages: packData.messages.map((item) => item.trim()).filter(Boolean),
    };

    if (!nextPack.name || nextPack.messages.length === 0) return null;

    if (nextPack.linkedVersionId) {
      setHomeScreenVersions((current) => ({
        ...current,
        [nextPack.linkedVersionId]: {
          ...resolveVersionConfig(current[nextPack.linkedVersionId]),
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
    setHomeScreenVersions((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, version]) => [
          id,
          (version.interruptionPackId === packId || version.selectedPackId === packId)
            ? { ...version, interruptionPackId: "" }
            : version,
        ]),
      ),
    );
  }

  function openCustomPackPreview(packId) {
    const pack = cardPacks.find((item) => item.id === packId);
    if (!pack || !pack.messages?.length) return;
    setOverlay(buildCustomPackOverlay(pack));
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

  const homeItems = useMemo(() => {
    const grouped = new Map();

    cards.forEach((card) => {
      if (card.sourcePackId) {
        if (!grouped.has(card.sourcePackId)) {
          const representative = getPackRepresentative(cards, card.sourcePackId);
          if (!representative) return;
          grouped.set(card.sourcePackId, {
            type: "pack",
            id: card.sourcePackId,
            representative,
          });
        }
        return;
      }

      grouped.set(card.id, {
        type: "single",
        id: card.id,
        representative: card,
      });
    });

    return Array.from(grouped.values()).sort((left, right) => {
      const leftRank = getHomeSortRank(left.representative);
      const rightRank = getHomeSortRank(right.representative);

      if (leftRank !== rightRank) return leftRank - rightRank;

      const leftCreated = new Date(left.representative.createdAt ?? 0).getTime();
      const rightCreated = new Date(right.representative.createdAt ?? 0).getTime();
      return rightCreated - leftCreated;
    });
  }, [cards]);
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
    () => homeItems.filter((item) => item.type === "single" && !item.representative.sourcePackId),
    [homeItems],
  );
  const recentMeaningfulEvents = useMemo(
    () => events.filter(isRecentMomentEvent).slice(0, 5),
    [events],
  );

return (
  <>
    <div className="grain" />

    {screen === "library" && !["reveal", "empty"].includes(overlay?.type) ? (
      <div className={`app-shell app-mood theme-${getThemeClass(mood)}`}>
          <div className="app-inner">
            <header className="hero">
              <div className="hero-copy">
                <div className="hero-mark" aria-hidden="true">
                  <HeartGlyph />
                </div>
                <p className="wordmark">BishBash</p>
                <h1>private little messages from your earlier self</h1>
                <span className="hero-dot" aria-hidden="true" />
              </div>
              <button
                type="button"
                className="add-button"
                onClick={() => {
                  setEditingId(null);
                  setIsComposerOpen(true);
                }}
                aria-label="Create a BishBash"
              >
                +
              </button>
            </header>

            <main className="content">
              {activeTab === "home" ? (
                <section className="library">
                <div className="section-heading">
                  <div>
                    <h2>Your BishBash list</h2>
                    <p>little notes waiting for future you</p>
                  </div>
                </div>

                <div className="card-stack">
                  {homeItems.map((item) => {
                    const status = getStatusMeta(item.representative, new Date(), profile.timezone);
                    return (
                      <article
                        key={item.id}
                        className={`library-card ${menuOpenId === item.id ? "menu-open" : ""} theme-${getThemeClass(item.representative.theme)}`}
                        onClick={() =>
                          item.type === "pack"
                            ? openPackReveal(item.id)
                            : openSpecificReveal(item.id)
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            if (item.type === "pack") {
                              openPackReveal(item.id);
                            } else {
                              openSpecificReveal(item.id);
                            }
                          }
                        }}
                      >
                        <div className="tile">
                          <CardIcon
                            theme={item.representative.theme}
                            icon={item.representative.icon}
                            sourcePackId={item.representative.sourcePackId}
                          />
                        </div>
                        <div className="card-copy">
                          <h3>{getHomeCardTitle(item.representative)}</h3>
                        </div>
                        <div className="card-status">
                          <span className="badge">{status.badge}</span>
                        </div>
                        <div className="menu-wrap">
                          <button
                            type="button"
                            className="menu-trigger"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpenId((current) => (current === item.id ? null : item.id))
                            }}
                            aria-label="Card menu"
                          >
                            •••
                          </button>
                          {menuOpenId === item.id ? (
                            <div className="menu">
                              <button type="button" onClick={(event) => {
                                event.stopPropagation();
                                if (item.type === "pack") {
                                  openPackEditor(item.id);
                                  return;
                                }
                                openEditor(item.id);
                              }}>
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
                      </article>
                    );
                  })}
                </div>
                </section>
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
                  events={recentMeaningfulEvents}
                  timezone={profile.timezone}
                  weeklyShiftCount={getWeeklyShiftCount(events)}
                  onCreateBishBash={() => {
                    setEditingId(null);
                    setIsComposerOpen(true);
                  }}
                />
              ) : null}

              {activeTab === "packs" ? (
                <PacksPanel
                  cards={cards}
                  onActivate={activatePack}
                  onDeactivate={deactivatePack}
                />
              ) : null}
              {activeTab === "settings" ? (
                <SettingsPanel
                  profile={profile}
                  onSaveProfile={setProfile}
                  mood={mood}
                  onSelectMood={setMood}
                  homeScreenVersions={homeScreenVersions}
                  selectedHomeScreenVersion={selectedHomeScreenVersion}
                  onSelectHomeScreenVersion={handleSelectHomeScreenVersion}
                  onUpdateHomeScreenIcon={handleUpdateHomeScreenIcon}
                  cardPacks={cardPacks}
                  onCreatePack={(versionId) => setEditingCustomPackId(`new:${versionId}`)}
                  onEditPack={(packId) => setEditingCustomPackId(packId)}
                  onDeletePack={handleDeleteCustomPack}
                  onPreviewPack={openCustomPackPreview}
                  onAssignPackToVersion={handleSaveVersionBehavior}
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
            setEditingId(null);
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

      {overlay ? (
        <Overlay
          overlay={overlay}
          card={activeRevealCard}
          route={route}
          version={activeInterceptionVersion}
          timezone={profile.timezone}
          onClose={() => {
            if (overlay.type === "custom-pack-preview") {
              setOverlay(null);
              return;
            }
            setOverlay(null);
            navigateTo("/home");
          }}
          onAction={handleAction}
          onChooseElse={() => navigateTo("/home")}
          onLogEvent={logEvent}
          onPackReaction={handlePackReaction}
        />
      ) : null}

      {screen !== "interception" && appLauncher ? (
        <AppLauncherButton version={appLauncher} />
      ) : null}
    </>
  );
}

function AppLauncherButton({ version }) {
  function handleOpen() {
    if (version.type === "safari") {
      openSafariEscape();
      return;
    }

    openNativeApp(version.appUrl);
  }

  return (
    <button
      type="button"
      className="continue-safari-button"
      onClick={handleOpen}
      aria-label={`Open ${version.label}`}
    >
      <SafariGlyph />
      <span>{version.label}</span>
    </button>
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
                <span className="badge">{status.badge}</span>
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

function LogPanel({ events, timezone, weeklyShiftCount, onCreateBishBash }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const filledDots = Math.min(weeklyShiftCount, 14);

  return (
    <section className="log-screen">
      <header className="log-header">
        <span className="log-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h2>BishBash Log</h2>
        <p>tiny choices. real change.</p>
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
            <button type="button" className="pack-button" onClick={onCreateBishBash} aria-label="Make a BishBash">
              Make a BishBash
            </button>
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
  const [messages, setMessages] = useState(initialPack?.messages ?? [""]);
  const [selectedVersion, setSelectedVersion] = useState(initialPack?.linkedVersionId ?? linkedVersionId ?? "");

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
            {Object.values(versions).map((version) => (
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

function PacksPanel({ cards, onActivate, onDeactivate }) {
  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Packs</h2>
          <p>Activate ready-made BishBash packs that can appear at random through the day.</p>
        </div>
      </div>
      <div className="theme-showcase">
        {PACKS.map((pack) => {
          const activeCount = cards.filter((card) => card.sourcePackId === pack.id).length;
          const active = activeCount > 0;

          return (
            <article key={pack.id} className={`theme-showcase-card theme-${getThemeClass(pack.theme)}`}>
              <p className="eyebrow">{active ? "Active pack" : "Pack"}</p>
              <h3>{pack.title}</h3>
              <p>{pack.description}</p>
              {pack.entries[0] ? (
                <>
                  <p className="pack-sample">{pack.entries[0].promptText}</p>
                  <p className="pack-meta">{pack.entries[0].attribution}</p>
                </>
              ) : (
                <p className="pack-meta">Source-first pack planned. Needs verified archival content.</p>
              )}
              <button
                type="button"
                className={`pack-button ${active ? "secondary" : ""}`}
                disabled={pack.comingSoon}
                onClick={() => (active ? onDeactivate(pack.id) : onActivate(pack.id))}
              >
                {pack.comingSoon ? "Coming soon" : active ? "Deactivate pack" : "Activate pack"}
              </button>
              {active ? <p className="pack-state">Active in your BishBashes</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SettingsPanel({
  profile,
  onSaveProfile,
  mood,
  onSelectMood,
  homeScreenVersions,
  selectedHomeScreenVersion,
  onSelectHomeScreenVersion,
  onUpdateHomeScreenIcon,
  cardPacks,
  onCreatePack,
  onEditPack,
  onDeletePack,
  onPreviewPack,
  onAssignPackToVersion,
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [timezone, setTimezone] = useState(profile.timezone ?? "Europe/London");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setName(profile.name ?? "");
    setTimezone(profile.timezone ?? "Europe/London");
  }, [profile]);

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
        <p>Personalisation</p>
        <div className="settings-form">
          <label className="field">
            <span>Name</span>
            <input
              className="settings-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <select
              className="settings-input"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              <option value="Europe/London">UK (Europe/London)</option>
              <option value="Europe/Dublin">Ireland (Europe/Dublin)</option>
              <option value="America/New_York">US East (America/New_York)</option>
              <option value="America/Los_Angeles">US West (America/Los_Angeles)</option>
            </select>
          </label>
          <button
            type="button"
            className="pack-button"
            onClick={() => onSaveProfile({ name, timezone })}
          >
            Save personalisation
          </button>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Mood</p>
          <span>Choose the overall feeling of BishBash.</span>
        </div>
        <div className="theme-showcase settings-theme-showcase">
          {THEMES.map((theme) => (
            <article
              key={theme}
              className={`theme-showcase-card theme-${getThemeClass(theme)} ${mood === theme ? "selected-mood" : ""}`}
            >
              <p className="eyebrow">{theme}</p>
              <h3>have you stretched today?</h3>
              <button
                type="button"
                className={`pack-button ${mood === theme ? "secondary" : ""}`}
                onClick={() => onSelectMood(theme)}
              >
                {mood === theme ? "Selected" : "Use this mood"}
              </button>
            </article>
          ))}
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Home Screen versions</p>
          <span>Choose how this appears on your Home Screen.</span>
        </div>
        <div className="home-screen-version-list">
          {Object.values(homeScreenVersions).map((version) => {
            const previewIcon = version.customIconSrc || version.iconSrc;
            const installUrl = getInstallUrl(version.installPath);
            const isStandardVersion = version.id === "bishbash";
            const assignablePacks = cardPacks.filter(
              (pack) => !pack.linkedVersionId || pack.linkedVersionId === version.id,
            );

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
                      : `Launches ${version.name} interception before opening the real app.`}
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
                  {!isStandardVersion ? (
                    <div className="field">
                      <span>Linked interruption pack</span>
                      <select
                        className="settings-input"
                        value={version.interruptionPackId ?? version.selectedPackId ?? ""}
                        onChange={(event) =>
                          onAssignPackToVersion(version.id, {
                            interruptionPackId: event.target.value,
                          })
                        }
                      >
                        <option value="">Use built-in {version.name} interruptions</option>
                        {assignablePacks.map((pack) => (
                          <option key={pack.id} value={pack.id}>
                            {pack.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`pack-button ${selectedHomeScreenVersion === version.id ? "secondary" : ""}`}
                    onClick={() => onSelectHomeScreenVersion(version.id)}
                  >
                    {selectedHomeScreenVersion === version.id ? "Using this version" : "Use this version"}
                  </button>
                  <button
                    type="button"
                    className="pack-button secondary"
                    onClick={() => onCreatePack(version.id)}
                    disabled={isStandardVersion}
                  >
                    {isStandardVersion ? "Standard launch route" : "Create interruption pack"}
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
                    Replace cover icon
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-version-heading">
          <p>Interruption Packs</p>
          <span>Write your own swipeable interruption decks for Instagram, YouTube, Safari, or any future version.</span>
        </div>
        <div className="home-screen-version-list">
          {cardPacks.length === 0 ? (
            <article className="home-screen-version-card pack-manager-card">
              <div className="home-screen-version-copy pack-manager-copy">
                <div className="home-screen-version-title">
                  <strong>No interruption packs yet</strong>
                </div>
                <p>Make a quiet swipeable deck for Instagram, YouTube, Safari, or any version you want to soften.</p>
              </div>
            </article>
          ) : null}
          {cardPacks.map((pack) => (
            <article key={pack.id} className="home-screen-version-card pack-manager-card">
              <div className="home-screen-version-copy pack-manager-copy">
                <div className="home-screen-version-title">
                  <strong>{pack.name}</strong>
                  {pack.linkedVersionId ? (
                    <span>{homeScreenVersions[pack.linkedVersionId]?.name ?? pack.linkedVersionId}</span>
                  ) : null}
                </div>
                <ul className="pack-message-list">
                  {pack.messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
              <div className="home-screen-version-actions">
                <button type="button" className="pack-button secondary" onClick={() => onEditPack(pack.id)}>
                  Edit pack
                </button>
                <button type="button" className="pack-button secondary" onClick={() => onPreviewPack(pack.id)}>
                  Preview cards
                </button>
                <button type="button" className="pack-button secondary" onClick={() => onEditPack(pack.id)}>
                  Add message
                </button>
                <button type="button" className="pack-button secondary danger-soft-button" onClick={() => onDeletePack(pack.id)}>
                  Delete pack
                </button>
              </div>
            </article>
          ))}
        </div>
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

function Overlay({ overlay, card, route, version, timezone, onClose, onAction, onChooseElse, onLogEvent, onPackReaction }) {
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
      <div className="overlay-screen empty-state" onClick={onClose}>
        <div className="floating floating-heart" />
        <button
          type="button"
          className="overlay-library-button"
          onClick={onClose}
          aria-label="Open library"
        >
          <BookGlyph />
        </button>
        <p className="eyebrow">BishBash</p>
        <h2>You&apos;re all caught up for now.</h2>
        <p>see you later</p>
      </div>
    );
  }

  if (overlay.type === "intercept-pack") {
    return <InterceptionOverlay overlay={overlay} version={version} onChooseElse={onChooseElse} onLogEvent={onLogEvent} />;
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
      {card.sourcePackId ? (
        <div className="action-row">
          <ActionButton label="Dislike" onClick={() => onPackReaction("dislike")} />
          <ActionButton label="Like" tone="solid" onClick={() => onPackReaction("like")} />
        </div>
      ) : (
        <div className="action-row">
          <ActionButton label="Not done" onClick={() => onAction("later")} />
          <ActionButton label="I'll do it now" onClick={() => onAction("now")} />
          <ActionButton label="Done" tone="solid" onClick={() => onAction("done")} />
        </div>
      )}
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
  const messages = overlay.messages ?? [];

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

    void onLogEvent({
      event_type: "intercept_card_viewed",
      source_type: "interception",
      app_id: version.id,
      app_name: version.name,
      pack_id: overlay.packId,
      message_id: `${overlay.packId}:${activeIndex}`,
      metadata: {
        packTitle: overlay.name,
        message: activeMessage,
      },
    });
  }, [activeIndex, messages, onLogEvent, overlay.name, overlay.packId, version]);

  function move(delta) {
    if (messages.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next >= messages.length) return messages.length - 1;
      return next;
    });
  }

  function continueToApp() {
    if (!version) return;
    setShowFallbackLink(false);
    void onLogEvent({
      event_type: "intercept_continue_to_app",
      source_type: "interception",
      app_id: version.id,
      app_name: version.name,
      pack_id: overlay.packId,
      message_id: `${overlay.packId}:${activeIndex}`,
      metadata: {
        packTitle: overlay.name,
        message: messages[activeIndex] ?? null,
      },
    });

    if (version.id === "safari") {
      openSafariEscape();
      return;
    }

    openNativeApp(version.appUrl);
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
              source_type: "interception",
              app_id: version?.id ?? null,
              app_name: version?.name ?? null,
              pack_id: overlay.packId,
              message_id: `${overlay.packId}:${activeIndex}`,
              metadata: {
                packTitle: overlay.name,
                message: messages[activeIndex] ?? null,
              },
            });
            onChooseElse();
          }}
        />
        <ActionButton label={`Continue to ${version?.name ?? "app"}`} onClick={continueToApp} />
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
      message: "Private, local, and just for future-you.",
      support: "No accounts. No cloud. Just your own little ritual waiting when you need it.",
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

function ActionButton({ label, onClick, tone = "ghost" }) {
  return (
    <button
      type="button"
      className={`action-button ${tone}`}
      onClick={onClick}
    >
      {label}
    </button>
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

function SafariGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="safari-glyph" aria-hidden="true">
      <circle cx="16" cy="16" r="10.5" />
      <path d="M16 10l3 7-7 3 4-10z" />
      <path d="M16 16l-3 7 7-3-4-4z" />
    </svg>
  );
}

export default App;
