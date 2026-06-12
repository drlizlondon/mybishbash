import { DEFAULT_HOME_SCREEN_VERSIONS } from "../storage";
import { LAUNCHER_IDS, isKnownLauncher } from "./launcherRegistry";

export const NORMAL_LAUNCHER_CONTEXT = "normal";
export const INTERRUPTION_LAUNCHER_CONTEXTS = LAUNCHER_IDS;
export const INTERRUPTION_CARD_COOLDOWN_MS = 10 * 60 * 1000;

export const DEFAULT_INTERRUPTION_PACKS = {
  safari: {
    id: "safari-interruption",
    type: "interruption",
    targetApp: "safari",
    active: true,
    name: "Safari Interruptions",
    linkedVersionId: "safari",
    messages: [
      "Do you want the internet, or a little pause first?",
      "What were you hoping to find online just now?",
      "Could your attention belong to real life for one more minute?",
    ],
  },
  instagram: {
    id: "instagram-interruption",
    type: "interruption",
    targetApp: "instagram",
    active: true,
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
    id: "youtube-interruption",
    type: "interruption",
    targetApp: "youtube",
    active: true,
    name: "YouTube Interruptions",
    linkedVersionId: "youtube",
    messages: [
      "Do you want YouTube, or do you want to disappear for a while?",
      "Would a short real break feel better than autoplay?",
      "What would actually help you more than another video?",
    ],
  },
  chrome: {
    id: "chrome-interruption",
    type: "interruption",
    targetApp: "chrome",
    active: true,
    name: "Chrome Interruptions",
    linkedVersionId: "chrome",
    messages: [
      "What were you hoping to find online just now?",
      "Is this search for something specific, or just a pull?",
      "What would count as enough before you open Chrome?",
    ],
  },
  reddit: {
    id: "reddit-interruption",
    type: "interruption",
    targetApp: "reddit",
    active: true,
    name: "Reddit Interruptions",
    linkedVersionId: "reddit",
    messages: [
      "Are you looking for an answer, or for another thread to disappear into?",
      "What question are you actually bringing to Reddit?",
      "Would one saved search be kinder than a long scroll?",
    ],
  },
  linkedin: {
    id: "linkedin-interruption",
    type: "interruption",
    targetApp: "linkedin",
    active: true,
    name: "LinkedIn Interruptions",
    linkedVersionId: "linkedin",
    messages: [
      "Are you checking something useful, or comparing lives?",
      "What would make this LinkedIn visit worth your attention?",
      "Could you do one real career action before opening the feed?",
    ],
  },
  whatsapp: {
    id: "whatsapp-interruption",
    type: "interruption",
    targetApp: "whatsapp",
    active: true,
    name: "WhatsApp Interruptions",
    linkedVersionId: "whatsapp",
    messages: [
      "Is there someone specific you want to message?",
      "Would replying with care take less energy than hovering?",
      "What conversation actually needs you right now?",
    ],
  },
  "bbc-news": {
    id: "bbc-news-interruption",
    type: "interruption",
    targetApp: "bbc-news",
    active: true,
    name: "BBC News Interruptions",
    linkedVersionId: "bbc-news",
    messages: [
      "Are you checking the news, or checking for certainty?",
      "What update would be enough for now?",
      "Could you read one story, then come back to your day?",
    ],
  },
  duolingo: {
    id: "duolingo-interruption",
    type: "interruption",
    targetApp: "duolingo",
    active: true,
    name: "Duolingo Interruptions",
    linkedVersionId: "duolingo",
    messages: [
      "Is this a lesson you want to do, or a streak you are anxious about?",
      "Could one focused lesson be enough?",
      "What language goal are you choosing right now?",
    ],
  },
};

export { resolveLauncherDestination, getVersionOpenHref } from "./launcherDestinations";

export function isInterruptionLauncherContext(value) {
  return isKnownLauncher(value);
}

export function getLauncherContextFromRoute(route) {
  return route.kind === "intercept" && isInterruptionLauncherContext(route.versionId)
    ? route.versionId
    : NORMAL_LAUNCHER_CONTEXT;
}

export function getInterruptionFolderId(targetApp) {
  return `${targetApp}-interruption`;
}

export function getInterruptionCardText(card) {
  return typeof card === "string" ? card : card?.text ?? card?.promptText ?? card?.title ?? "";
}

export function normalizeInterruptionPack(pack, targetApp, version, behavior, { readOnly = false } = {}) {
  if (!pack) return null;
  const rawCards = Array.isArray(pack.cards)
    ? pack.cards
    : (pack.messages ?? []).map((message, index) => ({ id: `${pack.id}:${index}`, text: message, title: message }));
  const usePack = behavior?.useInterruptionPack ?? version?.useInterruptionPack ?? false;
  const cards = rawCards
    .map((card, index) => {
      const text = getInterruptionCardText(card).trim();
      if (!text) return null;
      return {
        id: typeof card === "string" ? `${pack.id}:${index}` : card.id ?? `${pack.id}:${index}`,
        title: typeof card === "string" ? text : card.title ?? text,
        text,
        readOnly: typeof card === "string" ? readOnly : card.readOnly ?? readOnly,
        createdAt: typeof card === "string" ? null : card.createdAt ?? null,
      };
    })
    .filter(Boolean);
  const active = typeof pack.active === "boolean" ? pack.active : Boolean(usePack);

  return {
    ...pack,
    type: "interruption",
    id: pack.id || getInterruptionFolderId(targetApp),
    targetApp: pack.targetApp || pack.linkedVersionId || targetApp,
    linkedVersionId: pack.linkedVersionId || pack.targetApp || targetApp,
    active,
    cards,
    messages: cards.map((card) => card.text),
  };
}

export function getStoredInterruptionPackForTarget(targetApp, customPacks, versions = {}, behaviors = {}) {
  const behavior = behaviors[targetApp] ?? {};
  const version = versions[targetApp] ?? DEFAULT_HOME_SCREEN_VERSIONS[targetApp];
  const selectedId = behavior.interruptionPackId || version?.interruptionPackId || version?.selectedPackId || "";
  return customPacks.find((pack) => (pack.targetApp ?? pack.linkedVersionId) === targetApp)
    ?? customPacks.find((pack) => pack.id === selectedId)
    ?? null;
}

export function getPackDislikeKey(card) {
  if (!card?.sourcePackId) return "";
  return `${card.sourcePackId}:${card.promptText ?? ""}`;
}

export function buildInterruptionFolder(targetApp, versions, behaviors, customPacks, { hiddenCardIds = [], globalEnabled = true, includeHidden = false } = {}) {
  if (!isInterruptionLauncherContext(targetApp)) return null;

  const behavior = behaviors[targetApp] ?? {};
  const version = resolveVersionConfig(versions[targetApp] ?? DEFAULT_HOME_SCREEN_VERSIONS[targetApp], behavior);
  const basePack = normalizeInterruptionPack(DEFAULT_INTERRUPTION_PACKS[targetApp], targetApp, version, behavior, {
    readOnly: true,
  });
  const storedPack = normalizeInterruptionPack(
    getStoredInterruptionPackForTarget(targetApp, customPacks, versions, behaviors),
    targetApp,
    version,
    behavior,
    { readOnly: false },
  );

  if (!basePack && !storedPack) return null;

  const folderId = getInterruptionFolderId(targetApp);
  const cards = [...(basePack?.cards ?? []), ...(storedPack?.cards ?? [])]
    .map((card) => ({
      ...card,
      hidden: hiddenCardIds.includes(getPackDislikeKey({ sourcePackId: folderId, promptText: card.text })),
    }))
    .filter((card) => includeHidden || !card.hidden);

  return {
    id: folderId,
    type: "interruption",
    targetApp,
    linkedVersionId: targetApp,
    active: Boolean(globalEnabled && version.useInterruptionPack),
    name: `${version.name} Interruptions`,
    description: `Shown before ${version.name} opens.`,
    editable: true,
    cards,
    messages: cards.map((card) => card.text),
    userPackId: storedPack?.id ?? null,
  };
}

export function getInterruptionPackForLauncher(
  launcherContext,
  versions,
  behaviors,
  customPacks,
  { includeInactive = false, hiddenCardIds = [], globalEnabled = true } = {},
) {
  if (!isInterruptionLauncherContext(launcherContext)) return null;
  const folder = buildInterruptionFolder(launcherContext, versions, behaviors, customPacks, {
    hiddenCardIds,
    globalEnabled,
  });
  if (!folder) return null;
  if (!includeInactive && !folder.active) return null;
  return folder;
}

export function resolveVersionConfig(version, behavior = {}) {
  return {
    launchPath: "/home",
    interruptionPackId: "",
    ...version,
    useInterruptionPack: behavior.useInterruptionPack ?? version?.useInterruptionPack ?? false,
    interruptionPaused: behavior.interruptionPaused ?? version?.interruptionPaused ?? false,
    interruptionPackId: behavior.interruptionPackId ?? version?.interruptionPackId ?? "",
  };
}

export function buildCustomPackOverlay(pack, activeIndex = 0, type = "custom-pack-preview") {
  const normalizedPack = normalizeInterruptionPack(pack, pack.targetApp ?? pack.linkedVersionId ?? "", {}, {});
  return {
    type,
    packId: normalizedPack.id,
    name: normalizedPack.name,
    targetApp: normalizedPack.targetApp,
    cards: normalizedPack.cards,
    messages: normalizedPack.messages,
    activeIndex,
  };
}

export function buildInterruptionHomeItem(version, pack, behavior) {
  const icon = version.id === "instagram" ? "heart" : version.id === "youtube" ? "star" : "book";
  const isPaused = behavior?.interruptionPaused ?? version.interruptionPaused ?? false;
  return {
    type: "interruption-version",
    id: `interruption:${version.id}`,
    versionId: version.id,
    pack,
    representative: {
      id: `interruption:${version.id}`,
      dashboardTitle: pack.name,
      promptText: pack.name ?? `${version.name} interruptions`,
      theme: "Minimal",
      icon,
      paused: Boolean(isPaused),
      timingWindows: ["morning", "day", "evening", "night"],
      frequency: "multi_daily",
      createdAt: "",
    },
  };
}

export function buildInterruptionCardHomeItem(version, pack, card, index) {
  const icon = version.id === "instagram" ? "heart" : version.id === "youtube" ? "star" : "book";
  return {
    type: "interruption-card",
    id: `${pack.id}:${card.id}`,
    versionId: version.id,
    packId: pack.id,
    cardIndex: index,
    representative: {
      id: card.id,
      dashboardTitle: card.text,
      promptText: card.text,
      theme: "Minimal",
      icon,
      paused: false,
      timingWindows: ["morning", "day", "evening"],
      frequency: "multi_daily",
      createdAt: card.createdAt ?? "",
    },
  };
}

export function getRecentInterruptionCardKeys(events, packId, date = new Date()) {
  const cutoff = date.getTime() - INTERRUPTION_CARD_COOLDOWN_MS;
  return new Set(
    events
      .filter((event) => {
        if (event.pack_id !== packId) return false;
        if (event.card_source !== "interruption" && event.source_type !== "interruption") return false;
        return new Date(event.created_at).getTime() > cutoff;
      })
      .flatMap((event) => [event.card_id, event.message_id].filter(Boolean)),
  );
}

export function pickInterruptionCardIndex(pack, events, date = new Date()) {
  const cards = pack?.cards ?? [];
  if (cards.length === 0) return 0;

  const recentKeys = getRecentInterruptionCardKeys(events, pack.id, date);
  const available = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => !recentKeys.has(card.id) && !recentKeys.has(`${pack.id}:${index}`));
  const candidates = available.length > 0 ? available : cards.map((card, index) => ({ card, index }));
  return candidates[Math.floor(Math.random() * candidates.length)]?.index ?? 0;
}
