import { isEligible, isPackCardAvailable, normalizeCards } from "../utils.js";

export const WEIGHTED_FLOW_LOCAL_STORAGE_KEY = "mybishbash.weightedFlow.enabled";
export const DEFAULT_WEIGHTED_FLOW_SETTINGS = {
  personalWeight: 70,
  packWeight: 30,
  packCardTimeoutMs: 30 * 60 * 1000,
};

function toWholeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.floor(number));
}

export function normalizeWeightedFlowSettings(settings = {}) {
  const personalWeight = toWholeNumber(settings.personalWeight);
  const packWeight = toWholeNumber(settings.packWeight);
  const total = (personalWeight ?? 0) + (packWeight ?? 0);
  const weights = total > 0
    ? { personalWeight, packWeight }
    : {
        personalWeight: DEFAULT_WEIGHTED_FLOW_SETTINGS.personalWeight,
        packWeight: DEFAULT_WEIGHTED_FLOW_SETTINGS.packWeight,
      };

  const timeout = Number(settings.packCardTimeoutMs);
  return {
    ...weights,
    packCardTimeoutMs: Number.isFinite(timeout) && timeout >= 0
      ? Math.floor(timeout)
      : DEFAULT_WEIGHTED_FLOW_SETTINGS.packCardTimeoutMs,
  };
}

export function getWeightedLauncherFlowGate({ testerStatus, storage, env = import.meta.env } = {}) {
  const testerIsTester = testerStatus?.is_tester === true;
  let devOverride = false;

  try {
    devOverride = env?.DEV === true && storage?.getItem?.(WEIGHTED_FLOW_LOCAL_STORAGE_KEY) === "true";
  } catch {
    devOverride = false;
  }

  const weightedFlowEnabled = testerIsTester || devOverride;
  return {
    weightedFlowEnabled,
    testerIsTester,
    devOverride,
    selectedPath: weightedFlowEnabled ? "weighted" : "legacy",
  };
}

export function isWeightedLauncherFlowEnabled(options = {}) {
  return getWeightedLauncherFlowGate(options).weightedFlowEnabled;
}

function randomItem(items, random) {
  if (!items.length) return null;
  return items[Math.floor(random() * items.length)];
}

function getEventCardId(event) {
  return event?.card_id ?? event?.bash_id ?? event?.message_id ?? null;
}

function getEventTimestamp(event) {
  const timestamp = new Date(event?.created_at ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLastCardExposure(card, events = []) {
  const eventTimestamp = events.reduce((latest, event) => {
    if (getEventCardId(event) !== card.id) return latest;
    return Math.max(latest, getEventTimestamp(event));
  }, 0);
  const lastShownTimestamp = new Date(card.lastShownAt ?? 0).getTime();
  return Math.max(
    eventTimestamp,
    Number.isFinite(lastShownTimestamp) ? lastShownTimestamp : 0,
  );
}

function isPackCardOutsideTimeout(card, events, now, timeoutMs) {
  if (timeoutMs <= 0) return true;
  const lastExposure = getLastCardExposure(card, events);
  if (!lastExposure) return true;
  return lastExposure + timeoutMs <= now.getTime();
}

function getLastPackExposure(packId, packCards, events = []) {
  const eventTimestamp = events.reduce((latest, event) => {
    if ((event?.pack_id ?? event?.sourcePackId) !== packId) return latest;
    return Math.max(latest, getEventTimestamp(event));
  }, 0);
  const cardTimestamp = packCards.reduce((latest, card) => {
    const timestamp = new Date(card.lastShownAt ?? 0).getTime();
    return Math.max(latest, Number.isFinite(timestamp) ? timestamp : 0);
  }, 0);
  return Math.max(eventTimestamp, cardTimestamp);
}

function groupPackCards(cards) {
  const map = new Map();
  cards.forEach((card) => {
    if (!map.has(card.sourcePackId)) map.set(card.sourcePackId, []);
    map.get(card.sourcePackId).push(card);
  });
  return Array.from(map.entries()).map(([packId, packCards]) => ({ packId, packCards }));
}

function choosePackGroup(packGroups, events, random) {
  if (packGroups.length === 0) return null;
  const withExposure = packGroups.map((group) => ({
    ...group,
    lastExposure: getLastPackExposure(group.packId, group.packCards, events),
  }));
  const hasHistory = withExposure.some((group) => group.lastExposure > 0);
  if (!hasHistory) return randomItem(withExposure, random);
  const oldestExposure = Math.min(...withExposure.map((group) => group.lastExposure));
  return randomItem(withExposure.filter((group) => group.lastExposure === oldestExposure), random);
}

export function selectWeightedLauncherCard({
  cards,
  timezone,
  events = [],
  excludedCardIds = new Set(),
  now = new Date(),
  settings,
  random = Math.random,
} = {}) {
  const normalized = normalizeCards(cards ?? [], now, timezone);
  const config = normalizeWeightedFlowSettings(settings);
  const excluded = new Set(excludedCardIds ?? []);

  const eligiblePersonalPool = normalized.filter((card) =>
    !excluded.has(card.id) &&
    !card.sourcePackId &&
    !card.deletedAt &&
    isEligible(card, now, timezone)
  );

  const eligiblePackPool = normalized.filter((card) =>
    !excluded.has(card.id) &&
    isPackCardAvailable(card) &&
    isPackCardOutsideTimeout(card, events, now, config.packCardTimeoutMs)
  );
  const packGroups = groupPackCards(eligiblePackPool);

  let selectedSource = "none";
  if (eligiblePersonalPool.length > 0 && eligiblePackPool.length === 0) {
    selectedSource = "personal";
  } else if (eligiblePersonalPool.length === 0 && eligiblePackPool.length > 0) {
    selectedSource = "pack";
  } else if (eligiblePersonalPool.length > 0 && eligiblePackPool.length > 0) {
    const total = config.personalWeight + config.packWeight;
    selectedSource = random() * total < config.personalWeight ? "personal" : "pack";
  }

  if (selectedSource === "personal") {
    const selected = randomItem(eligiblePersonalPool, random);
    return {
      normalized,
      selected,
      selectedSource,
      selectedPackId: null,
      weights: config,
      availablePersonalCount: eligiblePersonalPool.length,
      availablePackCount: eligiblePackPool.length,
      availablePackGroupCount: packGroups.length,
    };
  }

  if (selectedSource === "pack") {
    const selectedPack = choosePackGroup(packGroups, events, random);
    const selected = selectedPack ? randomItem(selectedPack.packCards, random) : null;
    return {
      normalized,
      selected,
      selectedSource: selected ? "pack" : "none",
      selectedPackId: selected?.sourcePackId ?? null,
      weights: config,
      availablePersonalCount: eligiblePersonalPool.length,
      availablePackCount: eligiblePackPool.length,
      availablePackGroupCount: packGroups.length,
    };
  }

  return {
    normalized,
    selected: null,
    selectedSource: "none",
    selectedPackId: null,
    weights: config,
    availablePersonalCount: eligiblePersonalPool.length,
    availablePackCount: eligiblePackPool.length,
    availablePackGroupCount: packGroups.length,
  };
}
