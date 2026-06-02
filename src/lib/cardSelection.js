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

export function buildCardExposureLookup(cards = [], events = []) {
  const exposureByCardId = new Map();

  for (const event of events ?? []) {
    const cardId = getEventCardId(event);
    if (!cardId) continue;
    const timestamp = getEventTimestamp(event);
    if (timestamp <= 0) continue;
    const previous = exposureByCardId.get(cardId) ?? 0;
    if (timestamp > previous) exposureByCardId.set(cardId, timestamp);
  }

  for (const card of cards ?? []) {
    if (!card?.id || !card.lastShownAt) continue;
    const timestamp = new Date(card.lastShownAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
    const previous = exposureByCardId.get(card.id) ?? 0;
    if (timestamp > previous) exposureByCardId.set(card.id, timestamp);
  }

  return exposureByCardId;
}

function getLastCardExposure(card, exposureByCardId) {
  return exposureByCardId.get(card.id) ?? 0;
}

function isPackCardOutsideTimeout(card, exposureByCardId, nowMs, timeoutMs) {
  if (timeoutMs <= 0) return true;
  const lastExposure = getLastCardExposure(card, exposureByCardId);
  if (!lastExposure) return true;
  return lastExposure + timeoutMs <= nowMs;
}

function chooseLeastRecentlyExposedCard(cards, exposureByCardId, random) {
  if (cards.length === 0) return null;
  let oldestExposure = Infinity;
  let oldestCards = [];

  for (const card of cards) {
    const lastExposure = getLastCardExposure(card, exposureByCardId);
    if (lastExposure < oldestExposure) {
      oldestExposure = lastExposure;
      oldestCards = [card];
    } else if (lastExposure === oldestExposure) {
      oldestCards.push(card);
    }
  }

  return randomItem(oldestCards, random);
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
  const nowMs = now.getTime();
  const exposureByCardId = buildCardExposureLookup(normalized, events);

  const eligiblePersonalPool = [];
  const activePackPool = [];
  const eligiblePackPool = [];
  const activePackIds = new Set();
  const eligiblePackIds = new Set();

  for (const card of normalized) {
    if (excluded.has(card.id)) continue;

    if (isPackCardAvailable(card)) {
      activePackPool.push(card);
      activePackIds.add(card.sourcePackId);
      if (isPackCardOutsideTimeout(card, exposureByCardId, nowMs, config.packCardTimeoutMs)) {
        eligiblePackPool.push(card);
        eligiblePackIds.add(card.sourcePackId);
      }
      continue;
    }

    if (!card.sourcePackId && !card.deletedAt && isEligible(card, now, timezone)) {
      eligiblePersonalPool.push(card);
    }
  }

  let selectedSource = "none";
  if (eligiblePersonalPool.length > 0 && activePackPool.length === 0) {
    selectedSource = "personal";
  } else if (eligiblePersonalPool.length === 0 && activePackPool.length > 0) {
    selectedSource = "pack";
  } else if (eligiblePersonalPool.length > 0 && activePackPool.length > 0) {
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
      availablePackCount: activePackPool.length,
      eligiblePackCount: eligiblePackPool.length,
      availablePackGroupCount: activePackIds.size,
      eligiblePackGroupCount: eligiblePackIds.size,
    };
  }

  if (selectedSource === "pack") {
    const selected = eligiblePackPool.length > 0
      ? chooseLeastRecentlyExposedCard(eligiblePackPool, exposureByCardId, random)
      : chooseLeastRecentlyExposedCard(activePackPool, exposureByCardId, random);
    return {
      normalized,
      selected,
      selectedSource: selected ? "pack" : "none",
      selectedPackId: selected?.sourcePackId ?? null,
      weights: config,
      availablePersonalCount: eligiblePersonalPool.length,
      availablePackCount: activePackPool.length,
      eligiblePackCount: eligiblePackPool.length,
      availablePackGroupCount: activePackIds.size,
      eligiblePackGroupCount: eligiblePackIds.size,
    };
  }

  return {
    normalized,
    selected: null,
    selectedSource: "none",
    selectedPackId: null,
    weights: config,
    availablePersonalCount: eligiblePersonalPool.length,
    availablePackCount: activePackPool.length,
    eligiblePackCount: eligiblePackPool.length,
    availablePackGroupCount: activePackIds.size,
    eligiblePackGroupCount: eligiblePackIds.size,
  };
}
