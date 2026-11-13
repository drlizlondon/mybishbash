/**
 * Personal Card Analytics & Trends
 *
 * Computes card-by-card performance, activity trails (daily for 14/30 days,
 * weekly for 90 days and all time), streak tracking, per-card trends, and
 * identifies frequently ignored cards (The "Honest Mirror") with empathetic,
 * zero-guilt coaching. Covers the user's own cards AND their commitments;
 * library (pack) cards are never included.
 */

import { EVENT_LOG_MAX } from "./eventLogLimits.js";

const COMPLETED_EVENT_TYPES = new Set([
  "bash_done",
  "card_completed",
  "action_card_completed",
]);

const IGNORED_EVENT_TYPES = new Set([
  "bash_not_done",
  "card_ignored",
  "intercept_continue_to_app",
]);

// Product choices from MBB-24 (named so they can be changed in one place).
export const TREND_WINDOW_DAYS = 14; // compare the last 14 days with the 14 before
export const TREND_MIN_EVENTS = 3; // each window needs at least 3 surfaced events
export const TREND_SAME_POINTS = 10; // under 10 percentage points counts as "about the same"
export const USUAL_DAY_MIN_COMPLETIONS = 5; // "Usually done on" needs 5+ completions
export const USUAL_DAY_MIN_SHARE = 0.4; // ...and one weekday holding 40%+ of them

export const ALL_TIME = "all";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Commitment check-in responses, from CommitmentCheckInOverlay.jsx.
// Dot / legend colours: on_track = completed, somewhat_on_track = partial,
// closed_early and any unknown response = closed ("left for another day").
const CHECK_IN_STATUS = {
  on_track: "onTrack",
  somewhat_on_track: "partial",
  closed_early: "closed",
};

/**
 * Format date to YYYY-MM-DD in user's timezone.
 */
function getDateKey(date, timezone) {
  try {
    return new Date(date).toLocaleDateString("en-CA", { timeZone: timezone });
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

// Calendar arithmetic on YYYY-MM-DD keys is done in UTC so a BST/GMT change
// can never skip or repeat a day.
function keyToUtcMs(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysToKey(key, days) {
  return utcMsToKey(keyToUtcMs(key) + days * 86400000);
}

function weekdayOfKey(key) {
  return new Date(keyToUtcMs(key)).getUTCDay();
}

// Weeks start on Monday.
function weekStartKey(key) {
  const day = weekdayOfKey(key);
  return addDaysToKey(key, day === 0 ? -6 : 1 - day);
}

function labelForKey(key, options) {
  return new Date(keyToUtcMs(key) + 12 * 3600000).toLocaleDateString("en-GB", { timeZone: "UTC", ...options });
}

/**
 * "2 Nov 2026" for the first-event label.
 */
export function formatSinceDate(isoDate, timezone = "Europe/London") {
  if (!isoDate) return "";
  return labelForKey(getDateKey(isoDate, timezone), { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Generates an array of date metadata for the past N days.
 */
function generateDaysWindow(days, referenceKey) {
  const windowDays = [];
  for (let i = days - 1; i >= 0; i--) {
    const dateKey = addDaysToKey(referenceKey, -i);
    windowDays.push({
      dateKey,
      shortLabel: labelForKey(dateKey, { day: "numeric", month: "short" }),
      dayLabel: labelForKey(dateKey, { weekday: "short" }),
      isToday: i === 0,
      rawDate: new Date(keyToUtcMs(dateKey) + 12 * 3600000),
    });
  }
  return windowDays;
}

function emptyCounts() {
  return { completedCount: 0, ignoredCount: 0, onTrackCount: 0, partialCount: 0, closedCount: 0 };
}

function addCounts(target, source) {
  for (const k of Object.keys(target)) target[k] += source[k] ?? 0;
}

function dayStatus(c) {
  if (c.completedCount > 0 || c.onTrackCount > 0) return "completed";
  if (c.partialCount > 0) return "partial";
  if (c.closedCount > 0) return "closed";
  if (c.ignoredCount > 0) return "ignored";
  return "idle";
}

/**
 * "On track 2 · Partly 1" (zero counts are left out).
 */
export function formatCheckInSummary(checkIns) {
  const parts = [];
  if (checkIns.onTrack > 0) parts.push(`On track ${checkIns.onTrack}`);
  if (checkIns.partial > 0) parts.push(`Partly ${checkIns.partial}`);
  if (checkIns.closed > 0) parts.push(`Left for another day ${checkIns.closed}`);
  return parts.join(" · ");
}

function isLifecycleCardKind(kind) {
  return typeof kind === "string" && kind.startsWith("commitment");
}

/**
 * Classifies one event for stats.
 * - "checkIn": the commitment_check_in event. Each check-in is logged as a pair
 *   (commitment_check_in + a card_completed twin); only the first counts.
 * - "skip": every other commitment lifecycle event (decision, encouragement,
 *   review, and the card_completed twins). They are not done or skipped moments.
 */
function classifyEvent(event) {
  if (event.event_type === "commitment_check_in") return "checkIn";
  if (isLifecycleCardKind(event.metadata?.cardKind)) return "skip";
  if (COMPLETED_EVENT_TYPES.has(event.event_type) || event.action_taken === "completed") return "done";
  if (
    IGNORED_EVENT_TYPES.has(event.event_type) ||
    event.action_taken === "ignored" ||
    event.action_taken === "dismissed"
  ) {
    return "ignored";
  }
  return "other";
}

function checkInResponse(event) {
  return event.action_taken ?? event.metadata?.response ?? null;
}

/**
 * Checks if an event belongs to a card or commitment.
 */
function eventBelongsToCard(event, card) {
  const parentId = event?.metadata?.parentCommitmentCardId;
  if (parentId) return parentId === card.id;
  return eventMatchesCard(event, card);
}

/**
 * Checks if an event belongs to a personal card.
 */
function eventMatchesCard(event, card) {
  if (!event || !card) return false;
  if (event.card_id && event.card_id === card.id) return true;
  if (event.bash_id && event.bash_id === card.id) return true;
  if (event.metadata?.card_id && event.metadata.card_id === card.id) return true;

  const cardText = (card.promptText || card.card_title || "").trim();
  if (cardText) {
    if (event.card_text && event.card_text.trim() === cardText) return true;
    if (event.bash_title && event.bash_title.trim() === cardText) return true;
    if (event.card_title && event.card_title.trim() === cardText) return true;
  }

  return false;
}

/**
 * Calculates current and best streaks from the set of days with a completion.
 * Current streak starts today, or yesterday if today has no completion yet.
 */
function calculateStreaks(completedKeys, referenceKey) {
  const sorted = [...completedKeys].sort();
  let bestStreak = 0;
  let running = 0;
  let previous = null;
  for (const key of sorted) {
    running = previous !== null && addDaysToKey(previous, 1) === key ? running + 1 : 1;
    if (running > bestStreak) bestStreak = running;
    previous = key;
  }

  const set = new Set(completedKeys);
  let cursor = set.has(referenceKey) ? referenceKey : addDaysToKey(referenceKey, -1);
  let currentStreak = 0;
  while (set.has(cursor)) {
    currentStreak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return { currentStreak, bestStreak };
}

function rateOf(good, total) {
  return total > 0 ? (good / total) * 100 : null;
}

/**
 * Last 14 days vs the 14 days before. `items` are { key, good } moments.
 */
function computeTrend(items, referenceKey) {
  const recentStart = addDaysToKey(referenceKey, -(TREND_WINDOW_DAYS - 1));
  const previousStart = addDaysToKey(referenceKey, -(TREND_WINDOW_DAYS * 2 - 1));
  let recentGood = 0;
  let recentTotal = 0;
  let previousGood = 0;
  let previousTotal = 0;
  for (const item of items) {
    if (item.key > referenceKey) continue;
    if (item.key >= recentStart) {
      recentTotal += 1;
      if (item.good) recentGood += 1;
    } else if (item.key >= previousStart) {
      previousTotal += 1;
      if (item.good) previousGood += 1;
    }
  }
  const notEnough = {
    state: "not_enough",
    label: "Not enough yet to show a trend",
  };
  if (
    recentTotal < TREND_MIN_EVENTS ||
    previousTotal < TREND_MIN_EVENTS ||
    recentTotal === 0 ||
    previousTotal === 0
  ) {
    return notEnough;
  }
  const from = rateOf(previousGood, previousTotal);
  const to = rateOf(recentGood, recentTotal);
  const fromRounded = Math.round(from);
  const toRounded = Math.round(to);
  const change = to - from;
  if (change >= TREND_SAME_POINTS) {
    return { state: "up", from: fromRounded, to: toRounded, label: `Up from ${fromRounded}% to ${toRounded}%` };
  }
  if (change <= -TREND_SAME_POINTS) {
    return { state: "down", from: fromRounded, to: toRounded, label: `Down from ${fromRounded}% to ${toRounded}%` };
  }
  return { state: "same", from: fromRounded, to: toRounded, label: `About the same (${toRounded}%)` };
}

/**
 * "Usually done on Tuesday": needs 5+ completions and one weekday holding 40%+
 * of them (a tie for the top weekday shows nothing).
 */
function computeUsualDay(completionKeys) {
  if (completionKeys.length < USUAL_DAY_MIN_COMPLETIONS) return null;
  const perDay = new Array(7).fill(0);
  for (const key of completionKeys) perDay[weekdayOfKey(key)] += 1;
  const top = Math.max(...perDay);
  if (top / completionKeys.length < USUAL_DAY_MIN_SHARE) return null;
  if (perDay.filter((n) => n === top).length !== 1) return null;
  return WEEKDAY_NAMES[perDay.indexOf(top)];
}

/**
 * Main analytics computation function.
 *
 * options.days: 14 | 30 | 90 | "all" (default 30)
 * options.referenceDate: "now" for the window (default new Date())
 */
export function computePersonalCardAnalytics(
  cards = [],
  events = [],
  timezone = "Europe/London",
  options = {}
) {
  const timeframe = options.days ?? 30;
  const isAllTime = timeframe === ALL_TIME;
  const referenceDate = options.referenceDate ?? new Date();
  const referenceKey = getDateKey(referenceDate, timezone);
  const useWeekly = isAllTime || timeframe > 30;

  // 1. Identify non-deleted own cards AND commitments. Library cards
  // (sourcePackId) stay out, and so do commitment lifecycle cards
  // (check-in, encouragement, review): their events count on the parent.
  const personalCards = (Array.isArray(cards) ? cards : []).filter(
    (card) =>
      card &&
      !card.sourcePackId &&
      !card.deletedAt &&
      (!isLifecycleCardKind(card.cardKind) || card.cardKind === "commitment")
  );

  const windowDays = isAllTime ? [] : generateDaysWindow(timeframe, referenceKey);
  const windowStartKey = isAllTime ? null : windowDays[0].dateKey;

  const allEventsList = (Array.isArray(events) ? events : []).filter((event) => event && event.created_at);
  const keyedEvents = allEventsList.map((event) => ({ event, key: getDateKey(event.created_at, timezone) }));

  // The local log keeps only the newest EVENT_LOG_MAX events, so "all time"
  // can only reach back as far as the oldest event still kept.
  let oldestEventAt = null;
  for (const { event } of keyedEvents) {
    if (oldestEventAt === null || new Date(event.created_at) < new Date(oldestEventAt)) {
      oldestEventAt = event.created_at;
    }
  }
  const eventLogCapped = (Array.isArray(events) ? events.length : 0) >= EVENT_LOG_MAX;

  let totalCompletions30d = 0;
  let totalIgnored30d = 0;
  let doorwaySwitchesCount = 0;

  // Dwell time aggregates
  let totalDwellCompletedSum = 0;
  let totalDwellCompletedCount = 0;
  let totalDwellIgnoredSum = 0;
  let totalDwellIgnoredCount = 0;
  let totalReflexSkips = 0;
  let totalConsideredSkips = 0;
  // "Read properly" this week: canonical card events only (the legacy bash_*
  // twin carries the same dwell and would count each view twice).
  const READ_WEEK_DAYS = 7;
  const readWeekStartKey = addDaysToKey(referenceKey, -(READ_WEEK_DAYS - 1));
  let weekViewsWithVerdict = 0;
  let weekViewsRead = 0;

  // 2. Process each card
  const cardAnalytics = personalCards.map((card) => {
    const isCommitment = card.cardKind === "commitment";

    const belongs = (item) => eventBelongsToCard(item.event, card);
    const allCardItems = keyedEvents
      .filter(belongs)
      .map((item) => ({ ...item, kind: classifyEvent(item.event) }))
      .filter((item) => item.kind !== "skip");
    const windowItems = allCardItems.filter(
      ({ key }) => windowStartKey === null || key >= windowStartKey
    );

    // Per-day counters for the selected window.
    const dayCounts = new Map();
    const countsFor = (key) => {
      if (!dayCounts.has(key)) dayCounts.set(key, emptyCounts());
      return dayCounts.get(key);
    };

    const doorwayCounts = new Map();
    const checkIns = { onTrack: 0, partial: 0, closed: 0, total: 0 };
    const completionKeys = []; // days of real completions, for "Usually done on"

    let totalCompleted = 0;
    let totalIgnored = 0;
    let cardDwellCompletedSum = 0;
    let cardDwellCompletedCount = 0;
    let cardDwellIgnoredSum = 0;
    let cardDwellIgnoredCount = 0;
    let cardReflexSkips = 0;
    let cardConsideredSkips = 0;

    const cardEventItems = [];
    for (const item of windowItems) {
      const { event, key: dateKey, kind } = item;

      if (kind === "checkIn") {
        const status = CHECK_IN_STATUS[checkInResponse(event)] ?? "closed";
        checkIns.total += 1;
        checkIns[status] += 1;
        const counts = countsFor(dateKey);
        if (status === "onTrack") {
          counts.onTrackCount += 1;
          completionKeys.push(dateKey);
        } else if (status === "partial") {
          counts.partialCount += 1;
        } else {
          counts.closedCount += 1;
        }
        continue;
      }
      if (kind === "other") continue;

      cardEventItems.push(item);
      const isCompleted = kind === "done";
      const isIgnored = kind === "ignored";

      const rawDwell = event.dwell_ms ?? event.metadata?.dwell_ms;
      const dwellMs = rawDwell === null || rawDwell === undefined ? NaN : Number(rawDwell);
      const hasValidDwell = Number.isFinite(dwellMs) && dwellMs >= 0;

      const verdict = event.metadata?.read_verdict;
      if (
        dateKey >= readWeekStartKey &&
        dateKey <= referenceKey &&
        (event.event_type === "card_completed" || event.event_type === "card_ignored") &&
        (verdict === "read" || verdict === "skimmed")
      ) {
        weekViewsWithVerdict += 1;
        if (verdict === "read") weekViewsRead += 1;
      }

      if (isCompleted) {
        totalCompleted += 1;
        totalCompletions30d += 1;
        countsFor(dateKey).completedCount += 1;
        completionKeys.push(dateKey);
        if (event.app_name || event.target_app) {
          doorwaySwitchesCount += 1;
        }
        if (hasValidDwell) {
          cardDwellCompletedSum += dwellMs;
          cardDwellCompletedCount += 1;
          totalDwellCompletedSum += dwellMs;
          totalDwellCompletedCount += 1;
        }
      } else if (isIgnored) {
        totalIgnored += 1;
        totalIgnored30d += 1;
        countsFor(dateKey).ignoredCount += 1;
        if (hasValidDwell) {
          cardDwellIgnoredSum += dwellMs;
          cardDwellIgnoredCount += 1;
          totalDwellIgnoredSum += dwellMs;
          totalDwellIgnoredCount += 1;

          if (dwellMs < 1500) {
            cardReflexSkips += 1;
            totalReflexSkips += 1;
          } else {
            cardConsideredSkips += 1;
            totalConsideredSkips += 1;
          }
        }
      }

      // Track doorway app frequency
      const appName = event.app_name || event.target_app;
      if (appName) {
        doorwayCounts.set(appName, (doorwayCounts.get(appName) || 0) + 1);
      }
    }

    // Daily dot trail (14 and 30 days).
    let dailyEntries = [];
    let weeklyEntries = [];
    if (!useWeekly) {
      dailyEntries = windowDays.map((d) => {
        const counts = dayCounts.get(d.dateKey) ?? emptyCounts();
        return {
          dateKey: d.dateKey,
          shortLabel: d.shortLabel,
          dayLabel: d.dayLabel,
          isToday: d.isToday,
          ...counts,
          // "completed" | "partial" | "closed" | "ignored" | "idle"
          status: dayStatus(counts),
        };
      });
    } else {
      // Weekly columns (90 days and all time), Monday start, empty weeks kept.
      const firstKey = isAllTime
        ? [...dayCounts.keys()].sort()[0] ?? null
        : windowStartKey;
      if (firstKey !== null) {
        const lastWeek = weekStartKey(referenceKey);
        const weekMap = new Map();
        for (const [key, counts] of dayCounts.entries()) {
          const wk = weekStartKey(key);
          if (!weekMap.has(wk)) weekMap.set(wk, emptyCounts());
          addCounts(weekMap.get(wk), counts);
        }
        for (let wk = weekStartKey(firstKey); wk <= lastWeek; wk = addDaysToKey(wk, 7)) {
          const counts = weekMap.get(wk) ?? emptyCounts();
          weeklyEntries.push({
            weekStartKey: wk,
            label: labelForKey(wk, { day: "numeric", month: "short" }),
            isCurrent: wk === lastWeek,
            ...counts,
            doneCount: counts.completedCount + counts.onTrackCount,
            total:
              counts.completedCount +
              counts.onTrackCount +
              counts.partialCount +
              counts.closedCount +
              counts.ignoredCount,
          });
        }
      }
    }

    const totalSurfaced = totalCompleted + totalIgnored;
    const completionRate =
      totalSurfaced > 0 ? Math.round((totalCompleted / totalSurfaced) * 100) : null;
    const ignoreRate =
      totalSurfaced > 0 ? Math.round((totalIgnored / totalSurfaced) * 100) : 0;

    const completedDayKeys = [...dayCounts.entries()]
      .filter(([, c]) => c.completedCount > 0 || c.onTrackCount > 0)
      .map(([key]) => key);
    const { currentStreak, bestStreak } = calculateStreaks(completedDayKeys, referenceKey);

    // Consecutive skips calculation (ordered latest to oldest)
    const sortedCardEventsDesc = [...cardEventItems].sort(
      (a, b) => new Date(b.event.created_at).getTime() - new Date(a.event.created_at).getTime()
    );
    let consecutiveSkips = 0;
    for (const item of sortedCardEventsDesc) {
      if (item.kind === "done") break;
      if (item.kind === "ignored") consecutiveSkips += 1;
    }

    // Card qualifies for spiced visual salience if bypassed 3+ times consecutively or high skip rate
    const isSpiced = consecutiveSkips >= 3 || (totalIgnored >= 3 && ignoreRate >= 60);

    // Dwell metrics per card
    const avgDwellCompletedMs = cardDwellCompletedCount > 0 ? Math.round(cardDwellCompletedSum / cardDwellCompletedCount) : null;
    const avgDwellIgnoredMs = cardDwellIgnoredCount > 0 ? Math.round(cardDwellIgnoredSum / cardDwellIgnoredCount) : null;
    const avgDwellMs = (cardDwellCompletedCount + cardDwellIgnoredCount) > 0
      ? Math.round((cardDwellCompletedSum + cardDwellIgnoredSum) / (cardDwellCompletedCount + cardDwellIgnoredCount))
      : null;

    // Find top doorway app
    let topDoorway = null;
    let maxDoorwayCount = 0;
    for (const [app, count] of doorwayCounts.entries()) {
      if (count > maxDoorwayCount) {
        topDoorway = app;
        maxDoorwayCount = count;
      }
    }

    // Trend: last 14 days vs the 14 before, from every event for this card
    // (not just the selected timeframe). Commitments use check-ins only.
    const trendItems = allCardItems
      .filter((item) => (isCommitment ? item.kind === "checkIn" : item.kind === "done" || item.kind === "ignored"))
      .map((item) => ({
        key: item.key,
        good: isCommitment
          ? CHECK_IN_STATUS[checkInResponse(item.event)] === "onTrack"
          : item.kind === "done",
      }));
    const trend = computeTrend(trendItems, referenceKey);
    const usuallyDoneOn = computeUsualDay(completionKeys);

    // Categorization
    let statusTag = "steady";
    let statusLabel = "Building momentum";

    if (isCommitment) {
      statusTag = "commitment";
      statusLabel = "Commitment";
    } else if (totalSurfaced === 0) {
      statusTag = "unseen";
      statusLabel = "Not surfaced yet";
    } else if (totalSurfaced >= 2 && ignoreRate >= 50) {
      statusTag = "avoided";
      statusLabel = "Frequently bypassed";
    } else if (totalSurfaced >= 3 && (completionRate ?? 0) >= 70) {
      statusTag = "superstar";
      statusLabel = "Second nature";
    }

    const activeDaysCount = completedDayKeys.length;

    return {
      cardId: card.id,
      promptText: card.promptText || card.dashboardTitle || "Untitled Card",
      dashboardTitle: card.dashboardTitle || card.promptText || "Untitled Card",
      theme: card.theme,
      frequency: card.frequency || "once_daily",
      timingWindows: card.timingWindows || ["morning", "day", "evening"],
      isCommitment,
      dailyEntries,
      weeklyEntries,
      totalCompleted,
      totalIgnored,
      totalSurfaced,
      completionRate,
      ignoreRate,
      checkIns: { ...checkIns },
      checkInSummary: formatCheckInSummary(checkIns),
      trend,
      usuallyDoneOn,
      currentStreak,
      bestStreak,
      activeDaysCount,
      consecutiveSkips,
      isSpiced,
      avgDwellCompletedMs,
      avgDwellIgnoredMs,
      avgDwellMs,
      reflexSkips: cardReflexSkips,
      consideredSkips: cardConsideredSkips,
      topDoorway,
      statusTag,
      statusLabel,
    };
  });

  // 3. Separate Honest Mirror (avoided) and Superstars. Commitments have
  // their own check-in story and are not offered "make it a commitment".
  const habitCards = cardAnalytics.filter((c) => !c.isCommitment);
  const avoidedCards = habitCards
    .filter((c) => c.statusTag === "avoided" || (c.totalIgnored > 0 && c.ignoreRate >= 40))
    .sort((a, b) => b.totalIgnored - a.totalIgnored);

  const superstarCards = habitCards
    .filter((c) => c.statusTag === "superstar")
    .sort((a, b) => (b.completionRate ?? 0) - (a.completionRate ?? 0));

  const totalSurfacedAll = totalCompletions30d + totalIgnored30d;
  const overallCompletionRate =
    totalSurfacedAll > 0
      ? Math.round((totalCompletions30d / totalSurfacedAll) * 100)
      : null;

  // Dwell aggregates
  const overallAvgDwellCompletedMs = totalDwellCompletedCount > 0 ? Math.round(totalDwellCompletedSum / totalDwellCompletedCount) : null;
  const overallAvgDwellIgnoredMs = totalDwellIgnoredCount > 0 ? Math.round(totalDwellIgnoredSum / totalDwellIgnoredCount) : null;
  const totalSkipsWithDwell = totalReflexSkips + totalConsideredSkips;
  const reflexSkipPercentage = totalSkipsWithDwell > 0 ? Math.round((totalReflexSkips / totalSkipsWithDwell) * 100) : null;
  const spicedCardsCount = habitCards.filter((c) => c.isSpiced).length;

  return {
    cards: cardAnalytics,
    windowDays,
    granularity: useWeekly ? "weekly" : "daily",
    oldestEventAt,
    eventLogCapped,
    avoidedCards,
    superstarCards,
    totalPersonalCards: personalCards.length,
    totalCompletions30d,
    totalIgnored30d,
    overallCompletionRate,
    doorwaySwitchesCount,
    // Roughly 5 minutes of saved screen time per doorway completion
    estimatedMinutesSaved: doorwaySwitchesCount * 5,
    // Retention & dwell metrics
    overallAvgDwellCompletedMs,
    overallAvgDwellIgnoredMs,
    totalReflexSkips,
    totalConsideredSkips,
    reflexSkipPercentage,
    spicedCardsCount,
    readProperlyThisWeek: { read: weekViewsRead, total: weekViewsWithVerdict },
  };
}
