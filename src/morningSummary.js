import { getTodayKey } from "./utils";

const SEEN_STORAGE_KEY = "mybishbash.morning-summary.seen.v1";
const MORNING_SUMMARY_START_HOUR = 7;

const PERSONAL_CARD_SHOWN_TYPES = new Set(["personal_card_shown", "card_shown"]);
const INTERRUPTED_TYPES = new Set(["first_interruption_seen", "intercept_card_viewed"]);
const COMMITMENT_CHECKIN_GENERATED_TYPES = new Set(["commitment_checkin_generated", "commitment_check_in_generated"]);
const COMMITMENT_CHECKIN_COMPLETED_TYPES = new Set([
  "commitment_checkin_completed",
  "commitment_check_in",
  "commitment_check_in_response",
]);

function safeParse(rawValue, fallback) {
  try {
    return JSON.parse(rawValue ?? "");
  } catch {
    return fallback;
  }
}

function getLocalDateParts(date = new Date(), timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

export function getPreviousDateKey(date = new Date(), timeZone) {
  const parts = getLocalDateParts(date, timeZone);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utcDate.setUTCDate(utcDate.getUTCDate() - 1);
  return [
    utcDate.getUTCFullYear(),
    String(utcDate.getUTCMonth() + 1).padStart(2, "0"),
    String(utcDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function getMorningSummarySeenMap() {
  if (typeof window === "undefined") return {};
  const parsed = safeParse(window.localStorage.getItem(SEEN_STORAGE_KEY), {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

export function hasSeenMorningSummary(dateKey) {
  return Boolean(getMorningSummarySeenMap()[dateKey]);
}

export function markMorningSummarySeen(dateKey) {
  if (typeof window === "undefined" || !dateKey) return;
  const seen = getMorningSummarySeenMap();
  window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify({ ...seen, [dateKey]: new Date().toISOString() }));
}

export function shouldAutoShowMorningSummary({ now = new Date(), timezone, seenDateKey } = {}) {
  const todayKey = getTodayKey(now, timezone);
  if (seenDateKey && todayKey !== seenDateKey) return false;
  const { hour } = getLocalDateParts(now, timezone);
  return hour >= MORNING_SUMMARY_START_HOUR && !hasSeenMorningSummary(todayKey);
}

function eventDateMatches(event, dateKey, timezone) {
  if (!event?.created_at) return false;
  return getTodayKey(new Date(event.created_at), timezone) === dateKey;
}

function getCardId(event) {
  return event?.card_id ?? event?.bash_id ?? event?.message_id ?? null;
}

function isPersonalCompletion(event) {
  if (event?.event_type !== "bash_done") return false;
  if (event?.pack_id || event?.source_type === "library" || event?.card_source === "library") return false;
  return event?.metadata?.cardKind !== "commitment" && event?.metadata?.cardKind !== "commitment_check_in";
}

function isPersonalShown(event) {
  if (!PERSONAL_CARD_SHOWN_TYPES.has(event?.event_type)) return false;
  if (event?.pack_id || event?.source_type === "library" || event?.card_source === "library") return false;
  return event?.metadata?.cardKind !== "commitment" && event?.metadata?.cardKind !== "commitment_check_in";
}

function getAppName(event) {
  return event?.app_name || event?.launcher_context || event?.target_app || event?.app_id || "App";
}

function countByApp(events) {
  const map = new Map();
  events.forEach((event) => {
    const appName = getAppName(event);
    map.set(appName, (map.get(appName) ?? 0) + 1);
  });
  return Array.from(map.entries())
    .map(([appName, count]) => ({ appName, count }))
    .sort((left, right) => right.count - left.count || left.appName.localeCompare(right.appName));
}

function buildDebugEvents(events, timezone) {
  const labels = {
    personal_card_shown: "Card shown",
    commitment_card_shown: "Card shown",
    card_shown: "Card shown",
    bash_done: "Card completed",
    commitment_made: "Commitment made",
    commitment_declined: "Commitment declined",
    commitment_check_in_generated: "Commitment check-in generated",
    commitment_check_in: "Commitment check-in answered",
    commitment_check_in_response: "Commitment check-in answered",
    first_interruption_seen: "Shell/app interrupted",
    intercept_card_viewed: "Shell/app interrupted",
    intercept_continue_to_app: "Continue to app pressed",
    intercept_do_something_else: "Alternative action/card chosen",
    action_card_completed: "Alternative action/card chosen",
  };

  return events
    .filter((event) => labels[event.event_type])
    .map((event) => ({
      id: event.id,
      type: event.event_type,
      label: labels[event.event_type],
      at: event.created_at,
      localDate: getTodayKey(new Date(event.created_at), timezone),
      card: event.card_title || event.card_text || event.bash_title || null,
      app: getAppName(event),
      action: event.action_taken ?? event.metadata?.response ?? null,
    }));
}

export function buildMorningSummary(events = [], { dateKey, timezone } = {}) {
  const targetDateKey = dateKey ?? getPreviousDateKey(new Date(), timezone);
  const dayEvents = (events ?? []).filter((event) => eventDateMatches(event, targetDateKey, timezone));

  const personalCompletedEvents = dayEvents.filter(isPersonalCompletion);
  const personalShownEvents = dayEvents.filter(isPersonalShown);
  const completedCardIds = new Set(personalCompletedEvents.map(getCardId).filter(Boolean));
  const shownCardIds = new Set(personalShownEvents.map(getCardId).filter(Boolean));
  const availableCount = Math.max(shownCardIds.size, completedCardIds.size);
  const completedCount = completedCardIds.size || personalCompletedEvents.length;
  const personal = {
    completedCount,
    availableCount,
    completionPercentage:
      shownCardIds.size > 0 && availableCount > 0 && completedCount <= availableCount
        ? Math.round((completedCount / availableCount) * 100)
        : null,
    isCompletionPercentageReliable: shownCardIds.size > 0 && availableCount > 0 && completedCount <= availableCount,
  };

  const checkIns = dayEvents.filter((event) => COMMITMENT_CHECKIN_COMPLETED_TYPES.has(event.event_type));
  const commitments = {
    madeCount: dayEvents.filter((event) => event.event_type === "commitment_made").length,
    declinedCount: dayEvents.filter((event) => event.event_type === "commitment_declined").length,
    checkInGeneratedCount: dayEvents.filter((event) => COMMITMENT_CHECKIN_GENERATED_TYPES.has(event.event_type)).length,
    checkInCompletedCount: checkIns.length,
    outcomes: {
      goingPerfectly: checkIns.filter((event) =>
        event.action_taken === "Going perfectly" ||
        event.metadata?.response === "Going perfectly"
      ).length,
      couldBeBetter: checkIns.filter((event) =>
        event.action_taken === "Could be better" ||
        event.metadata?.response === "Could be better"
      ).length,
      notGoingWell: checkIns.filter((event) =>
        event.action_taken === "Not going well" ||
        event.metadata?.response === "Not going well"
      ).length,
    },
  };

  const interruptionEvents = dayEvents.filter((event) => {
    if (!INTERRUPTED_TYPES.has(event.event_type)) return false;
    if (event.event_type === "first_interruption_seen" && event.card_source === "interruption") return false;
    return true;
  });
  const interruptions = {
    interruptedCount: interruptionEvents.length,
    byApp: countByApp(interruptionEvents),
    continueToAppCount: dayEvents.filter((event) =>
      event.event_type === "intercept_continue_to_app" && event.action_taken === "continued_to_app"
    ).length,
    choseAlternativeCount: dayEvents.filter((event) =>
      (event.event_type === "intercept_do_something_else" && event.action_taken === "chose_something_else") ||
      event.event_type === "action_card_completed"
    ).length,
  };

  const hasMeaningfulData =
    personal.completedCount > 0 ||
    personal.availableCount > 0 ||
    commitments.madeCount > 0 ||
    commitments.declinedCount > 0 ||
    commitments.checkInGeneratedCount > 0 ||
    commitments.checkInCompletedCount > 0 ||
    interruptions.interruptedCount > 0 ||
    interruptions.continueToAppCount > 0 ||
    interruptions.choseAlternativeCount > 0;

  return {
    dateKey: targetDateKey,
    generatedAt: new Date().toISOString(),
    hasMeaningfulData,
    personal,
    commitments,
    interruptions,
    debugEvents: buildDebugEvents(dayEvents, timezone),
  };
}
