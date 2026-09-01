import {
  buildEligibleCommitmentCheckInCards,
  getTodayKey,
  isEligible,
  isPackCardAvailable,
  normalizeCards,
} from "../utils.js";

export const LAUNCHER_TESTER_FEATURE_LOCAL_STORAGE_KEY = "mybishbash.launcherTesterFeatures.enabled";
export const DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS = {
  packCardTimeoutMs: 30 * 60 * 1000,
  personalCardCooldownMs: 30 * 60 * 1000,
};

export const PRIMARY_CARD_PRIORITIES = new Set(["primary", "partner_primary"]);
export const CARD_SELECTION_SURFACES = {
  HOME: "home",
  SHELL: "shell",
  NOTIFICATION_FUTURE: "notification_future",
  LOCKSCREEN_WIDGET_FUTURE: "lockscreen_widget_future",
  HOMESCREEN_WIDGET_FUTURE: "homescreen_widget_future",
  NATIVE_FUTURE: "native_future",
};
export const CARD_EVENT_TYPES = {
  SHOWN: "card_shown",
  COMPLETED: "card_completed",
  IGNORED: "card_ignored",
};

const COMPLETED_CARD_EVENT_TYPES = new Set([CARD_EVENT_TYPES.COMPLETED, "bash_done"]);

function toNonNegativeWholeNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

export function normalizePersonalFirstFallbackSettings(settings = {}) {
  return {
    packCardTimeoutMs: toNonNegativeWholeNumber(
      settings.packCardTimeoutMs,
      DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS.packCardTimeoutMs,
    ),
    personalCardCooldownMs: toNonNegativeWholeNumber(
      settings.personalCardCooldownMs,
      DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS.personalCardCooldownMs,
    ),
  };
}

export function getTesterLauncherFeatureGate({ testerStatus, storage, env = import.meta.env } = {}) {
  const testerIsTester = testerStatus?.is_tester === true;
  let devOverride = false;

  try {
    devOverride = env?.DEV === true && storage?.getItem?.(LAUNCHER_TESTER_FEATURE_LOCAL_STORAGE_KEY) === "true";
  } catch {
    devOverride = false;
  }

  const enabled = testerIsTester || devOverride;
  return {
    enabled,
    testerIsTester,
    devOverride,
    selectedPath: enabled ? "tester_features" : "stable",
  };
}

export function areTesterLauncherFeaturesEnabled(options = {}) {
  return getTesterLauncherFeatureGate(options).enabled;
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

function isPersonalCardOutsideCooldown(card, exposureByCardId, nowMs, cooldownMs) {
  if (cooldownMs <= 0) return true;
  const lastExposure = getLastCardExposure(card, exposureByCardId);
  if (!lastExposure) return true;
  return lastExposure + cooldownMs <= nowMs;
}

export function buildCompletedTodayCardIds(events = [], now = new Date(), timezone) {
  const todayKey = getTodayKey(now, timezone);
  const completed = new Set();

  for (const event of events ?? []) {
    if (!COMPLETED_CARD_EVENT_TYPES.has(event?.event_type)) continue;
    const cardId = getEventCardId(event);
    if (!cardId) continue;
    const timestamp = getEventTimestamp(event);
    if (timestamp <= 0) continue;
    if (getTodayKey(new Date(timestamp), timezone) === todayKey) completed.add(cardId);
  }

  return completed;
}

export function getLauncherCardPriority(card) {
  if (!card) return "none";
  if (card.sourcePackId) return "fallback";
  const priority = String(card.launcherPriority ?? card.priority ?? card.cardPriority ?? "").trim();
  if (!priority || PRIMARY_CARD_PRIORITIES.has(priority)) return "primary";
  return "fallback";
}

function getPrimaryCardSource(card) {
  const priority = String(card?.launcherPriority ?? card?.priority ?? card?.cardPriority ?? "").trim();
  return priority === "partner_primary" ? "partner_primary" : "personal";
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

export function selectEligibleCard({
  cards,
  timezone,
  events = [],
  excludedCardIds = new Set(),
  now = new Date(),
  settings,
  random = Math.random,
} = {}) {
  const normalized = normalizeCards(cards ?? [], now, timezone);
  const config = normalizePersonalFirstFallbackSettings(settings);
  const excluded = new Set(excludedCardIds ?? []);
  const nowMs = now.getTime();
  const selectableCards = [
    ...normalized,
    ...buildEligibleCommitmentCheckInCards(normalized, now, timezone),
  ];
  const exposureByCardId = buildCardExposureLookup(selectableCards, events);
  const completedTodayCardIds = buildCompletedTodayCardIds(events, now, timezone);

  const eligiblePrimaryPool = [];
  const activePackPool = [];
  const eligiblePackPool = [];
  const activePackIds = new Set();
  const eligiblePackIds = new Set();

  for (const card of selectableCards) {
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

    if (
      getLauncherCardPriority(card) === "primary" &&
      !completedTodayCardIds.has(card.id) &&
      isEligible(card, now, timezone) &&
      isPersonalCardOutsideCooldown(card, exposureByCardId, nowMs, config.personalCardCooldownMs)
    ) {
      eligiblePrimaryPool.push(card);
    }
  }

  if (eligiblePrimaryPool.length > 0) {
    const selected = randomItem(eligiblePrimaryPool, random);
    return {
      normalized,
      selected,
      selectedPriority: "primary",
      selectedSource: getPrimaryCardSource(selected),
      selectedPackId: null,
      selectionReason: "eligible_primary_cards_available",
      settings: config,
      eligiblePrimaryCount: eligiblePrimaryPool.length,
      eligiblePersonalCount: eligiblePrimaryPool.length,
      eligiblePackCardCount: eligiblePackPool.length,
      availablePrimaryCount: eligiblePrimaryPool.length,
      availablePersonalCount: eligiblePrimaryPool.length,
      availablePackCount: activePackPool.length,
      eligiblePackCount: eligiblePackPool.length,
      availablePackGroupCount: activePackIds.size,
      eligiblePackGroupCount: eligiblePackIds.size,
    };
  }

  if (activePackPool.length > 0) {
    const selected = eligiblePackPool.length > 0
      ? chooseLeastRecentlyExposedCard(eligiblePackPool, exposureByCardId, random)
      : chooseLeastRecentlyExposedCard(activePackPool, exposureByCardId, random);
    return {
      normalized,
      selected,
      selectedPriority: selected ? "fallback" : "none",
      selectedSource: selected ? "pack" : "none",
      selectedPackId: selected?.sourcePackId ?? null,
      selectionReason: selected ? "no_eligible_primary_cards" : "no_eligible_primary_or_fallback_cards",
      settings: config,
      eligiblePrimaryCount: eligiblePrimaryPool.length,
      eligiblePersonalCount: eligiblePrimaryPool.length,
      eligiblePackCardCount: eligiblePackPool.length,
      availablePrimaryCount: eligiblePrimaryPool.length,
      availablePersonalCount: eligiblePrimaryPool.length,
      availablePackCount: activePackPool.length,
      eligiblePackCount: eligiblePackPool.length,
      availablePackGroupCount: activePackIds.size,
      eligiblePackGroupCount: eligiblePackIds.size,
    };
  }

  return {
    normalized,
    selected: null,
    selectedPriority: "none",
    selectedSource: "none",
    selectedPackId: null,
    selectionReason: "no_eligible_primary_or_fallback_cards",
    settings: config,
    eligiblePrimaryCount: eligiblePrimaryPool.length,
    eligiblePersonalCount: eligiblePrimaryPool.length,
    eligiblePackCardCount: eligiblePackPool.length,
    availablePrimaryCount: eligiblePrimaryPool.length,
    availablePersonalCount: eligiblePrimaryPool.length,
    availablePackCount: activePackPool.length,
    eligiblePackCount: eligiblePackPool.length,
    availablePackGroupCount: activePackIds.size,
    eligiblePackGroupCount: eligiblePackIds.size,
  };
}

export function selectPersonalFirstLauncherCard(options = {}) {
  return selectEligibleCard(options);
}
