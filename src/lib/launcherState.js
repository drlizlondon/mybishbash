import { DEFAULT_HOME_SCREEN_VERSIONS } from "../storage";
import { LAUNCHER_IDS, getLauncherConfig, isKnownLauncher } from "./launcherRegistry";

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
};

function getLauncherPlatform() {
  const ua = navigator.userAgent || navigator.vendor || "";
  const isAndroid = /android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isAndroid) return "android";
  if (isIOS) return "ios";
  return "desktop";
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

export function getVersionOpenHref(version) {
  if (!version) return "";

  const launcher = getLauncherConfig(version.id) ?? getLauncherConfig(version.type);
  const merged = { ...(launcher ?? {}), ...(version ?? {}) };
  const platform = getLauncherPlatform();

  let href = "";

  if (platform === "android") {
    href = firstNonEmpty(
      merged.androidIntentUrl,
      merged.androidWebFallbackUrl,
      merged.webFallbackUrl,
      merged.manualUrl
    );

    // Critical safety: never return iOS-only Safari scheme on Android.
    if (href.startsWith("x-safari-")) {
      href = href.replace(/^x-safari-/, "");
    }
    if (!href) href = "https://www.google.com";
  } else if (platform === "ios") {
    if (merged.id === "safari") {
      href = firstNonEmpty(merged.iosAppUrl, merged.manualUrl, merged.webFallbackUrl);
    } else {
      href = firstNonEmpty(
        merged.iosAppUrl,
        merged.appUrl,
        merged.nativeAppUrl,
        merged.iosWebFallbackUrl,
        merged.webFallbackUrl,
        merged.manualUrl
      );
    }
  } else {
    href = firstNonEmpty(
      merged.webFallbackUrl,
      merged.manualUrl,
      merged.androidWebFallbackUrl,
      merged.iosWebFallbackUrl
    );
  }

  console.log("[LAUNCHER_URL_RESOLVED]", {
    versionId: merged.id,
    platform,
    href,
  });

  return href;
}

export function openSafariEscape() {
  window.location.href = getVersionOpenHref({ id: "safari" }) || "https://www.google.com";
}

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
    description: `Cards shown only when launcherContext is "${targetApp}".`,
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
