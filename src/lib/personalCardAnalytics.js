/**
 * Personal Card Analytics & 30-Day Trends
 *
 * Computes card-by-card performance, 30-day activity dot trails,
 * streak tracking, and identify frequently ignored cards (The "Honest Mirror")
 * with empathetic, zero-guilt coaching.
 */

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

/**
 * Generates an array of date metadata for the past N days.
 */
function generateDaysWindow(days = 30, referenceDate = new Date(), timezone = "Europe/London") {
  const windowDays = [];
  const ref = new Date(referenceDate);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setDate(d.getDate() - i);
    const dateKey = getDateKey(d, timezone);
    const shortLabel = d.toLocaleDateString("en-GB", { timeZone: timezone, day: "numeric", month: "short" });
    const dayLabel = d.toLocaleDateString("en-GB", { timeZone: timezone, weekday: "short" });
    const isToday = i === 0;

    windowDays.push({
      dateKey,
      shortLabel,
      dayLabel,
      isToday,
      rawDate: d,
    });
  }

  return windowDays;
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
 * Calculates current and best streaks over the 30-day timeline.
 */
function calculateStreaks(dailyEntries) {
  let currentStreak = 0;
  let bestStreak = 0;
  let runningStreak = 0;

  for (let i = 0; i < dailyEntries.length; i++) {
    if (dailyEntries[i].completedCount > 0) {
      runningStreak += 1;
      if (runningStreak > bestStreak) {
        bestStreak = runningStreak;
      }
    } else {
      runningStreak = 0;
    }
  }

  // Current streak calculation:
  // Starts from today (last element) or yesterday if today has no completions yet.
  const lastIndex = dailyEntries.length - 1;
  if (lastIndex >= 0) {
    if (dailyEntries[lastIndex].completedCount > 0) {
      for (let i = lastIndex; i >= 0; i--) {
        if (dailyEntries[i].completedCount > 0) {
          currentStreak += 1;
        } else {
          break;
        }
      }
    } else if (lastIndex >= 1 && dailyEntries[lastIndex - 1].completedCount > 0) {
      for (let i = lastIndex - 1; i >= 0; i--) {
        if (dailyEntries[i].completedCount > 0) {
          currentStreak += 1;
        } else {
          break;
        }
      }
    }
  }

  return { currentStreak, bestStreak };
}

/**
 * Checks if a card has 3+ consecutive skips, qualifying for the "Spiced" visual salience test.
 */
export function checkCardIsSpiced(card, events = []) {
  if (!card) return false;
  const cardEvents = (Array.isArray(events) ? events : []).filter((e) => eventMatchesCard(e, card));
  const sorted = [...cardEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  let consecutiveSkips = 0;
  for (const ev of sorted) {
    const isCompleted = COMPLETED_EVENT_TYPES.has(ev.event_type) || ev.action_taken === "completed";
    const isIgnored = IGNORED_EVENT_TYPES.has(ev.event_type) || ev.action_taken === "ignored" || ev.action_taken === "dismissed";
    if (isCompleted) break;
    if (isIgnored) consecutiveSkips += 1;
  }
  return consecutiveSkips >= 3;
}

/**
 * Main analytics computation function.
 */
export function computePersonalCardAnalytics(
  cards = [],
  events = [],
  timezone = "Europe/London",
  options = {}
) {
  const daysCount = options.days ?? 30;
  const referenceDate = options.referenceDate ?? new Date();

  // 1. Identify non-deleted personal cards
  const personalCards = (Array.isArray(cards) ? cards : []).filter(
    (card) => card && !card.sourcePackId && !card.deletedAt && card.cardKind !== "commitment"
  );

  const windowDays = generateDaysWindow(daysCount, referenceDate, timezone);
  const dateKeyMap = new Map(windowDays.map((d, index) => [d.dateKey, index]));
  const earliestDateKey = windowDays[0].dateKey;

  // Filter events within window
  const recentEvents = (Array.isArray(events) ? events : []).filter((event) => {
    if (!event || !event.created_at) return false;
    const key = getDateKey(event.created_at, timezone);
    return key >= earliestDateKey;
  });

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

  // 2. Process each card
  const cardAnalytics = personalCards.map((card) => {
    // Initialize day buckets
    const dailyEntries = windowDays.map((d) => ({
      dateKey: d.dateKey,
      shortLabel: d.shortLabel,
      dayLabel: d.dayLabel,
      isToday: d.isToday,
      completedCount: 0,
      ignoredCount: 0,
      status: "idle", // "completed" | "ignored" | "idle"
    }));

    const cardEvents = recentEvents.filter((event) => eventMatchesCard(event, card));
    const doorwayCounts = new Map();

    let totalCompleted = 0;
    let totalIgnored = 0;
    let cardDwellCompletedSum = 0;
    let cardDwellCompletedCount = 0;
    let cardDwellIgnoredSum = 0;
    let cardDwellIgnoredCount = 0;
    let cardReflexSkips = 0;
    let cardConsideredSkips = 0;

    for (const event of cardEvents) {
      const dateKey = getDateKey(event.created_at, timezone);
      const dayIndex = dateKeyMap.get(dateKey);

      const isCompleted =
        COMPLETED_EVENT_TYPES.has(event.event_type) ||
        event.action_taken === "completed";

      const isIgnored =
        IGNORED_EVENT_TYPES.has(event.event_type) ||
        event.action_taken === "ignored" ||
        event.action_taken === "dismissed";

      const dwellMs = Number(event.dwell_ms ?? event.metadata?.dwell_ms);
      const hasValidDwell = Number.isFinite(dwellMs) && dwellMs >= 0;

      if (isCompleted) {
        totalCompleted += 1;
        totalCompletions30d += 1;
        if (dayIndex !== undefined) {
          dailyEntries[dayIndex].completedCount += 1;
        }
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
        if (dayIndex !== undefined) {
          dailyEntries[dayIndex].ignoredCount += 1;
        }
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

    // Determine final status for each day dot
    dailyEntries.forEach((entry) => {
      if (entry.completedCount > 0) {
        entry.status = "completed";
      } else if (entry.ignoredCount > 0) {
        entry.status = "ignored";
      } else {
        entry.status = "idle";
      }
    });

    const totalSurfaced = totalCompleted + totalIgnored;
    const completionRate =
      totalSurfaced > 0 ? Math.round((totalCompleted / totalSurfaced) * 100) : null;
    const ignoreRate =
      totalSurfaced > 0 ? Math.round((totalIgnored / totalSurfaced) * 100) : 0;

    const { currentStreak, bestStreak } = calculateStreaks(dailyEntries);

    // Consecutive skips calculation (ordered latest to oldest)
    const sortedCardEventsDesc = [...cardEvents].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    let consecutiveSkips = 0;
    for (const ev of sortedCardEventsDesc) {
      const isComp = COMPLETED_EVENT_TYPES.has(ev.event_type) || ev.action_taken === "completed";
      const isIgn = IGNORED_EVENT_TYPES.has(ev.event_type) || ev.action_taken === "ignored" || ev.action_taken === "dismissed";
      if (isComp) break;
      if (isIgn) consecutiveSkips += 1;
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

    // Categorization
    let statusTag = "steady";
    let statusLabel = "Building momentum 🌱";

    if (totalSurfaced === 0) {
      statusTag = "unseen";
      statusLabel = "Not surfaced yet";
    } else if (totalSurfaced >= 2 && ignoreRate >= 50) {
      statusTag = "avoided";
      statusLabel = "Frequently bypassed 🙈";
    } else if (totalSurfaced >= 3 && (completionRate ?? 0) >= 70) {
      statusTag = "superstar";
      statusLabel = "Second nature ⭐";
    }

    const activeDaysCount = dailyEntries.filter((d) => d.completedCount > 0).length;

    return {
      cardId: card.id,
      promptText: card.promptText || card.dashboardTitle || "Untitled Card",
      dashboardTitle: card.dashboardTitle || card.promptText || "Untitled Card",
      theme: card.theme,
      frequency: card.frequency || "once_daily",
      timingWindows: card.timingWindows || ["morning", "day", "evening"],
      dailyEntries,
      totalCompleted,
      totalIgnored,
      totalSurfaced,
      completionRate,
      ignoreRate,
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

  // 3. Separate Honest Mirror (avoided) and Superstars
  const avoidedCards = cardAnalytics
    .filter((c) => c.statusTag === "avoided" || (c.totalIgnored > 0 && c.ignoreRate >= 40))
    .sort((a, b) => b.totalIgnored - a.totalIgnored);

  const superstarCards = cardAnalytics
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
  const spicedCardsCount = cardAnalytics.filter((c) => c.isSpiced).length;

  return {
    cards: cardAnalytics,
    windowDays,
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
  };
}
