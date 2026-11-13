import { describe, expect, it } from "vitest";
import {
  computePersonalCardAnalytics,
  formatCheckInSummary,
  formatSinceDate,
} from "./personalCardAnalytics.js";
import { EVENT_LOG_MAX } from "./eventLogLimits.js";

describe("computePersonalCardAnalytics", () => {
  const refDate = new Date("2026-09-30T12:00:00Z");

  it("handles empty cards and empty events safely", () => {
    const result = computePersonalCardAnalytics([], [], "Europe/London", { referenceDate: refDate });
    expect(result.totalPersonalCards).toBe(0);
    expect(result.totalCompletions30d).toBe(0);
    expect(result.totalIgnored30d).toBe(0);
    expect(result.overallCompletionRate).toBeNull();
    expect(result.windowDays).toHaveLength(30);
    expect(result.cards).toHaveLength(0);
    expect(result.avoidedCards).toHaveLength(0);
    expect(result.superstarCards).toHaveLength(0);
  });

  it("filters out library cards and deleted cards, keeps own cards and commitments, drops lifecycle cards", () => {
    const cards = [
      { id: "personal-1", promptText: "Water the plant" },
      { id: "pack-card-1", promptText: "Pack card", sourcePackId: "growth-pack" },
      { id: "deleted-1", promptText: "Deleted card", deletedAt: "2026-09-20T00:00:00Z" },
      { id: "commit-1", promptText: "Commitment card", cardKind: "commitment" },
      { id: "checkin-1", promptText: "Check-in", cardKind: "commitment_check_in", parentCommitmentCardId: "commit-1" },
    ];
    const result = computePersonalCardAnalytics(cards, [], "Europe/London", { referenceDate: refDate });
    expect(result.totalPersonalCards).toBe(2);
    expect(result.cards.map((c) => c.cardId)).toEqual(["personal-1", "commit-1"]);
  });

  it("calculates completions, ignores, win rate, and doorway metrics correctly", () => {
    const cards = [
      { id: "c1", promptText: "Water plant 🪴" },
      { id: "c2", promptText: "Stretch 2 mins 🧘" },
    ];

    const events = [
      // c1: 3 completions, 1 ignore
      { card_id: "c1", event_type: "bash_done", action_taken: "completed", app_name: "Instagram", created_at: "2026-09-30T10:00:00Z" },
      { card_id: "c1", event_type: "card_completed", action_taken: "completed", app_name: "Instagram", created_at: "2026-09-29T10:00:00Z" },
      { card_id: "c1", event_type: "bash_done", action_taken: "completed", app_name: "Safari", created_at: "2026-09-28T10:00:00Z" },
      { card_id: "c1", event_type: "card_ignored", action_taken: "ignored", created_at: "2026-09-27T10:00:00Z" },

      // c2: 1 completion, 4 ignores (heavily avoided)
      { card_id: "c2", event_type: "card_completed", action_taken: "completed", created_at: "2026-09-30T11:00:00Z" },
      { card_id: "c2", event_type: "bash_not_done", action_taken: "ignored", created_at: "2026-09-29T11:00:00Z" },
      { card_id: "c2", event_type: "intercept_continue_to_app", action_taken: "ignored", created_at: "2026-09-28T11:00:00Z" },
      { card_id: "c2", event_type: "card_ignored", action_taken: "ignored", created_at: "2026-09-27T11:00:00Z" },
      { card_id: "c2", event_type: "card_ignored", action_taken: "ignored", created_at: "2026-09-26T11:00:00Z" },
    ];

    const result = computePersonalCardAnalytics(cards, events, "Europe/London", { referenceDate: refDate });

    expect(result.totalCompletions30d).toBe(4);
    expect(result.totalIgnored30d).toBe(5);
    expect(result.overallCompletionRate).toBe(44); // 4 / 9 = 44.4% -> 44%
    expect(result.doorwaySwitchesCount).toBe(3); // 3 events had app_name
    expect(result.estimatedMinutesSaved).toBe(15);

    const c1Stats = result.cards.find((c) => c.cardId === "c1");
    expect(c1Stats.totalCompleted).toBe(3);
    expect(c1Stats.totalIgnored).toBe(1);
    expect(c1Stats.completionRate).toBe(75); // 3/4
    expect(c1Stats.ignoreRate).toBe(25);
    expect(c1Stats.topDoorway).toBe("Instagram");
    expect(c1Stats.statusTag).toBe("superstar");

    const c2Stats = result.cards.find((c) => c.cardId === "c2");
    expect(c2Stats.totalCompleted).toBe(1);
    expect(c2Stats.totalIgnored).toBe(4);
    expect(c2Stats.completionRate).toBe(20); // 1/5
    expect(c2Stats.ignoreRate).toBe(80);
    expect(c2Stats.statusTag).toBe("avoided");

    // Check Honest Mirror and Superstars collections
    expect(result.avoidedCards.map((c) => c.cardId)).toContain("c2");
    expect(result.superstarCards.map((c) => c.cardId)).toContain("c1");
  });

  it("accurately computes streaks across the 30-day timeline", () => {
    const cards = [{ id: "streak-card", promptText: "Daily meditation" }];
    const events = [
      { card_id: "streak-card", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-30T09:00:00Z" }, // today
      { card_id: "streak-card", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-29T09:00:00Z" }, // yesterday
      { card_id: "streak-card", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-28T09:00:00Z" }, // 2 days ago
      // gap on 2026-09-27
      { card_id: "streak-card", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-26T09:00:00Z" },
      { card_id: "streak-card", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-25T09:00:00Z" },
      { card_id: "streak-card", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-24T09:00:00Z" },
      { card_id: "streak-card", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-23T09:00:00Z" },
    ];

    const result = computePersonalCardAnalytics(cards, events, "Europe/London", { referenceDate: refDate });
    const stats = result.cards[0];
    expect(stats.currentStreak).toBe(3); // 28, 29, 30
    expect(stats.bestStreak).toBe(4); // 23, 24, 25, 26
  });

  it("falls back to card text or bash_title when card_id is missing in legacy events", () => {
    const cards = [{ id: "legacy-c1", promptText: "Water plant" }];
    const events = [
      { bash_title: "Water plant", event_type: "bash_done", action_taken: "completed", created_at: "2026-09-30T08:00:00Z" },
    ];
    const result = computePersonalCardAnalytics(cards, events, "Europe/London", { referenceDate: refDate });
    expect(result.cards[0].totalCompleted).toBe(1);
    expect(result.cards[0].completionRate).toBe(100);
  });

  it("calculates retention dwell time, reflex vs considered skips, and consecutive skips", () => {
    const cards = [
      { id: "c-dwell", promptText: "Deep breathing 2 mins" },
    ];
    const events = [
      // Latest: reflex skip (800ms)
      { card_id: "c-dwell", event_type: "bash_not_done", action_taken: "ignored", dwell_ms: 800, created_at: "2026-09-30T10:00:00Z" },
      // 2nd latest: reflex skip (1200ms)
      { card_id: "c-dwell", event_type: "bash_not_done", action_taken: "ignored", dwell_ms: 1200, created_at: "2026-09-29T10:00:00Z" },
      // 3rd latest: considered skip (3400ms)
      { card_id: "c-dwell", event_type: "bash_not_done", action_taken: "ignored", dwell_ms: 3400, created_at: "2026-09-28T10:00:00Z" },
      // 4th: completed with 4500ms dwell
      { card_id: "c-dwell", event_type: "bash_done", action_taken: "completed", dwell_ms: 4500, created_at: "2026-09-27T10:00:00Z" },
    ];

    const result = computePersonalCardAnalytics(cards, events, "Europe/London", { referenceDate: refDate });
    const card = result.cards[0];

    expect(card.consecutiveSkips).toBe(3);
    expect(card.isSpiced).toBe(true);
    expect(card.reflexSkips).toBe(2); // 800ms and 1200ms
    expect(card.consideredSkips).toBe(1); // 3400ms
    expect(card.avgDwellCompletedMs).toBe(4500);
    expect(card.avgDwellIgnoredMs).toBe(Math.round((800 + 1200 + 3400) / 3)); // 1800ms

    expect(result.totalReflexSkips).toBe(2);
    expect(result.totalConsideredSkips).toBe(1);
    expect(result.reflexSkipPercentage).toBe(67); // 2/3 = 66.67% -> 67%
    expect(result.spicedCardsCount).toBe(1);
  });

  it("counts read-properly views from the last 7 days using canonical card events only", () => {
    const cards = [{ id: "p1", promptText: "Water the plant" }];
    const ev = (type, day, verdict) => ({
      event_type: type,
      card_id: "p1",
      created_at: `2026-09-${day}T10:00:00Z`,
      metadata: verdict ? { read_verdict: verdict } : {},
    });
    const events = [
      ev("card_ignored", "29", "skimmed"),
      ev("card_ignored", "28", "read"),
      ev("card_completed", "27", "read"),
      ev("bash_not_done", "29", "skimmed"), // legacy twin: must not double count
      ev("card_ignored", "20", "read"), // older than 7 days
      ev("card_ignored", "26", null), // no verdict recorded
    ];
    const result = computePersonalCardAnalytics(cards, events, "Europe/London", { referenceDate: refDate });
    expect(result.readProperlyThisWeek).toEqual({ read: 2, total: 3 });
  });
});

// ---- MBB-24: commitments, longer history, trends ----

const LONDON = "Europe/London";

// Mirrors useCommitmentActions.handleCommitmentCheckInAction: each check-in
// logs a commitment_check_in event and a card_completed twin.
function checkInPair(parentId, response, createdAt, n = 1) {
  return [
    {
      id: `ci-${parentId}-${n}`,
      event_type: "commitment_check_in",
      bash_id: parentId,
      card_id: `checkin-card-${parentId}`,
      action_taken: response,
      created_at: createdAt,
      metadata: { cardKind: "commitment_check_in", parentCommitmentCardId: parentId, response },
    },
    {
      id: `ci-twin-${parentId}-${n}`,
      event_type: "card_completed",
      bash_id: parentId,
      card_id: `checkin-card-${parentId}`,
      action_taken: response,
      created_at: createdAt,
      metadata: {
        legacyEventType: "commitment_check_in",
        cardKind: "commitment_check_in",
        parentCommitmentCardId: parentId,
        response,
      },
    },
  ];
}

describe("MBB-24 commitments", () => {
  const refDate = new Date("2026-10-30T12:00:00Z");
  const commitment = { id: "commit-1", promptText: "No Instagram before lunch", cardKind: "commitment" };

  it("C1: a commitment with 3 check-ins (2 on track, 1 partly) is one row and each pair counts once", () => {
    const events = [
      ...checkInPair("commit-1", "on_track", "2026-10-28T09:00:00Z", 1),
      ...checkInPair("commit-1", "on_track", "2026-10-29T09:00:00Z", 2),
      ...checkInPair("commit-1", "somewhat_on_track", "2026-10-30T09:00:00Z", 3),
    ];
    const result = computePersonalCardAnalytics([commitment], events, LONDON, { referenceDate: refDate });
    expect(result.cards).toHaveLength(1);
    const row = result.cards[0];
    expect(row.isCommitment).toBe(true);
    expect(row.checkIns).toMatchObject({ onTrack: 2, partial: 1, closed: 0, total: 3 });
    expect(row.checkInSummary).toBe("On track 2 · Partly 1");
    // the card_completed twins are not done moments
    expect(row.totalCompleted).toBe(0);
    expect(result.totalCompletions30d).toBe(0);
    expect(row.dailyEntries.find((d) => d.dateKey === "2026-10-28").status).toBe("completed");
    expect(row.dailyEntries.find((d) => d.dateKey === "2026-10-30").status).toBe("partial");
  });

  it("maps closed_early and unknown responses to 'Left for another day'", () => {
    const events = [
      ...checkInPair("commit-1", "closed_early", "2026-10-28T09:00:00Z", 1),
      ...checkInPair("commit-1", "something_new", "2026-10-29T09:00:00Z", 2),
    ];
    const row = computePersonalCardAnalytics([commitment], events, LONDON, { referenceDate: refDate }).cards[0];
    expect(row.checkInSummary).toBe("Left for another day 2");
    expect(row.dailyEntries.find((d) => d.dateKey === "2026-10-28").status).toBe("closed");
  });

  it("formatCheckInSummary leaves out zero counts and is empty with no check-ins", () => {
    expect(formatCheckInSummary({ onTrack: 0, partial: 0, closed: 0 })).toBe("");
    expect(formatCheckInSummary({ onTrack: 1, partial: 0, closed: 0 })).toBe("On track 1");
  });

  it("C2/M1: a library card with events never appears", () => {
    const cards = [
      { id: "lib-1", promptText: "Library card", sourcePackId: "growth-pack" },
      { id: "mine-1", promptText: "Mine" },
    ];
    const events = [
      { card_id: "lib-1", event_type: "card_completed", action_taken: "completed", created_at: "2026-10-30T09:00:00Z" },
      { card_id: "mine-1", event_type: "card_completed", action_taken: "completed", created_at: "2026-10-30T09:00:00Z" },
    ];
    const result = computePersonalCardAnalytics(cards, events, LONDON, { referenceDate: refDate });
    expect(result.cards.map((c) => c.cardId)).toEqual(["mine-1"]);
    expect(result.totalCompletions30d).toBe(1);
  });

  it("C3: a card converted to a commitment keeps its pre-conversion events in its one row", () => {
    const converted = { id: "walk-1", promptText: "Go for a walk", cardKind: "commitment" };
    const events = [
      { card_id: "walk-1", event_type: "card_completed", action_taken: "completed", created_at: "2026-10-20T09:00:00Z" },
      { card_id: "walk-1", event_type: "card_ignored", action_taken: "ignored", created_at: "2026-10-21T09:00:00Z" },
      // after conversion: the decision pair is not a done moment
      {
        card_id: "walk-1",
        bash_id: "walk-1",
        event_type: "commitment_made",
        action_taken: "committed",
        created_at: "2026-10-22T09:00:00Z",
        metadata: { cardKind: "commitment" },
      },
      {
        card_id: "walk-1",
        bash_id: "walk-1",
        event_type: "card_completed",
        action_taken: "committed",
        created_at: "2026-10-22T09:00:00Z",
        metadata: { legacyEventType: "commitment_made", cardKind: "commitment" },
      },
      ...checkInPair("walk-1", "on_track", "2026-10-23T09:00:00Z"),
    ];
    const result = computePersonalCardAnalytics([converted], events, LONDON, { referenceDate: refDate });
    expect(result.cards).toHaveLength(1);
    const row = result.cards[0];
    expect(row.totalCompleted).toBe(1);
    expect(row.totalIgnored).toBe(1);
    expect(row.checkIns.onTrack).toBe(1);
  });

  it("commitments are not offered in the Honest Mirror or Superstars", () => {
    const events = [
      { card_id: "commit-1", event_type: "card_ignored", action_taken: "ignored", created_at: "2026-10-29T09:00:00Z" },
      { card_id: "commit-1", event_type: "card_ignored", action_taken: "ignored", created_at: "2026-10-30T09:00:00Z" },
    ];
    const result = computePersonalCardAnalytics([commitment], events, LONDON, { referenceDate: refDate });
    expect(result.avoidedCards).toHaveLength(0);
    expect(result.superstarCards).toHaveLength(0);
  });

  it("G1: no cards and no events gives empty text fields", () => {
    const result = computePersonalCardAnalytics([commitment], [], LONDON, { referenceDate: refDate });
    const row = result.cards[0];
    expect(row.checkInSummary).toBe("");
    expect(row.usuallyDoneOn).toBeNull();
    expect(formatSinceDate(null)).toBe("");
    expect(result.oldestEventAt).toBeNull();
  });
});

describe("MBB-24 longer history", () => {
  it("C4: 90 days gives weekly columns, Monday start, empty weeks present, London time across the BST end", () => {
    // BST ended 2026-10-25 01:00 UTC. Reference: Sunday 25 Oct 2026.
    const refDate = new Date("2026-10-25T12:00:00Z");
    const cards = [{ id: "c1", promptText: "Stretch" }];
    const events = [
      // 23:30 UTC Sunday 18 Oct is 00:30 BST Monday 19 Oct in London: week of 19 Oct
      { card_id: "c1", event_type: "card_completed", action_taken: "completed", created_at: "2026-10-18T23:30:00Z" },
      // 23:30 UTC Sunday 25 Oct is still Sunday in London (GMT): week of 19 Oct
      { card_id: "c1", event_type: "card_completed", action_taken: "completed", created_at: "2026-10-25T23:30:00Z" },
      { card_id: "c1", event_type: "card_ignored", action_taken: "ignored", created_at: "2026-09-02T09:00:00Z" },
    ];
    const result = computePersonalCardAnalytics(cards, events, LONDON, { referenceDate: refDate, days: 90 });
    expect(result.granularity).toBe("weekly");
    const weeks = result.cards[0].weeklyEntries;
    expect(weeks.length === 13 || weeks.length === 14).toBe(true);
    expect(weeks).toHaveLength(13);
    // Monday start, 7 days apart, nothing omitted
    weeks.forEach((w, i) => {
      expect(new Date(`${w.weekStartKey}T00:00:00Z`).getUTCDay()).toBe(1);
      if (i > 0) {
        const gap = (Date.parse(w.weekStartKey) - Date.parse(weeks[i - 1].weekStartKey)) / 86400000;
        expect(gap).toBe(7);
      }
    });
    expect(weeks[weeks.length - 1].weekStartKey).toBe("2026-10-19");
    expect(weeks[weeks.length - 1].isCurrent).toBe(true);
    const lastWeek = weeks[weeks.length - 1];
    // the 18 Oct 23:30Z event is Monday 19 Oct in London, so both land in the last week
    expect(lastWeek.completedCount).toBe(2);
    expect(weeks.find((w) => w.weekStartKey === "2026-10-12").total).toBe(0);
    expect(weeks.find((w) => w.weekStartKey === "2026-08-31").ignoredCount).toBe(1);
    expect(weeks.filter((w) => w.total === 0).length).toBeGreaterThan(5);
  });

  it("14 and 30 days keep the daily track", () => {
    const refDate = new Date("2026-10-25T12:00:00Z");
    const r14 = computePersonalCardAnalytics([{ id: "c1", promptText: "x" }], [], LONDON, { referenceDate: refDate, days: 14 });
    expect(r14.granularity).toBe("daily");
    expect(r14.cards[0].dailyEntries).toHaveLength(14);
    expect(r14.cards[0].weeklyEntries).toHaveLength(0);
  });

  it("all time starts at the card's earliest event and includes events older than 90 days", () => {
    const refDate = new Date("2026-10-25T12:00:00Z");
    const events = [
      { card_id: "c1", event_type: "card_completed", action_taken: "completed", created_at: "2026-03-02T09:00:00Z" },
      { card_id: "c1", event_type: "card_completed", action_taken: "completed", created_at: "2026-10-20T09:00:00Z" },
    ];
    const cards = [{ id: "c1", promptText: "x" }, { id: "c2", promptText: "never surfaced" }];
    const result = computePersonalCardAnalytics(cards, events, LONDON, { referenceDate: refDate, days: "all" });
    const row = result.cards[0];
    expect(row.weeklyEntries[0].weekStartKey).toBe("2026-03-02");
    expect(row.weeklyEntries[row.weeklyEntries.length - 1].weekStartKey).toBe("2026-10-19");
    expect(row.totalCompleted).toBe(2);
    expect(result.cards[1].weeklyEntries).toHaveLength(0);
    expect(result.oldestEventAt).toBe("2026-03-02T09:00:00Z");
    expect(result.eventLogCapped).toBe(false);
    expect(formatSinceDate(result.oldestEventAt, LONDON)).toBe("2 Mar 2026");
  });

  it("reports a capped event log when the log is full", () => {
    const refDate = new Date("2026-10-25T12:00:00Z");
    const events = Array.from({ length: EVENT_LOG_MAX }, (_, i) => ({
      id: `e${i}`,
      card_id: "c1",
      event_type: "card_completed",
      action_taken: "completed",
      created_at: "2026-10-20T09:00:00Z",
    }));
    const result = computePersonalCardAnalytics([{ id: "c1", promptText: "x" }], events, LONDON, { referenceDate: refDate, days: "all" });
    expect(result.eventLogCapped).toBe(true);
  });
});

describe("MBB-24 trends", () => {
  const refDate = new Date("2026-10-30T12:00:00Z");
  const cards = [{ id: "c1", promptText: "Stretch" }];
  const done = (iso) => ({ card_id: "c1", event_type: "card_completed", action_taken: "completed", created_at: iso });
  const skip = (iso) => ({ card_id: "c1", event_type: "card_ignored", action_taken: "ignored", created_at: iso });

  it("C5: 2/5 then 4/5 gives 'Up from 40% to 80%'", () => {
    const events = [
      // previous window (17-30 Oct is recent; 3-16 Oct is previous): 2 of 5
      done("2026-10-05T09:00:00Z"), done("2026-10-06T09:00:00Z"),
      skip("2026-10-07T09:00:00Z"), skip("2026-10-08T09:00:00Z"), skip("2026-10-09T09:00:00Z"),
      // recent window: 4 of 5
      done("2026-10-20T09:00:00Z"), done("2026-10-21T09:00:00Z"), done("2026-10-22T09:00:00Z"), done("2026-10-23T09:00:00Z"),
      skip("2026-10-24T09:00:00Z"),
    ];
    const row = computePersonalCardAnalytics(cards, events, LONDON, { referenceDate: refDate }).cards[0];
    expect(row.trend.label).toBe("Up from 40% to 80%");
  });

  it("C5: Down and About the same", () => {
    const down = [
      done("2026-10-05T09:00:00Z"), done("2026-10-06T09:00:00Z"), done("2026-10-07T09:00:00Z"), done("2026-10-08T09:00:00Z"), skip("2026-10-09T09:00:00Z"),
      done("2026-10-20T09:00:00Z"), done("2026-10-21T09:00:00Z"), skip("2026-10-22T09:00:00Z"), skip("2026-10-23T09:00:00Z"), skip("2026-10-24T09:00:00Z"),
    ];
    expect(computePersonalCardAnalytics(cards, down, LONDON, { referenceDate: refDate }).cards[0].trend.label).toBe("Down from 80% to 40%");
    const same = [
      done("2026-10-05T09:00:00Z"), done("2026-10-06T09:00:00Z"), skip("2026-10-07T09:00:00Z"), skip("2026-10-08T09:00:00Z"),
      done("2026-10-20T09:00:00Z"), done("2026-10-21T09:00:00Z"), skip("2026-10-22T09:00:00Z"), skip("2026-10-23T09:00:00Z"),
    ];
    expect(computePersonalCardAnalytics(cards, same, LONDON, { referenceDate: refDate }).cards[0].trend.label).toBe("About the same (50%)");
  });

  it("C5: only 2 surfaced in a window gives 'Not enough yet'", () => {
    const events = [
      done("2026-10-05T09:00:00Z"), skip("2026-10-06T09:00:00Z"),
      done("2026-10-20T09:00:00Z"), done("2026-10-21T09:00:00Z"), done("2026-10-22T09:00:00Z"), done("2026-10-23T09:00:00Z"), done("2026-10-24T09:00:00Z"),
    ];
    const row = computePersonalCardAnalytics(cards, events, LONDON, { referenceDate: refDate }).cards[0];
    expect(row.trend.state).toBe("not_enough");
    expect(row.trend.label).toBe("Not enough yet to show a trend");
  });

  it("commitment trend uses on-track check-ins over all check-ins", () => {
    const commitment = { id: "commit-1", promptText: "x", cardKind: "commitment" };
    const events = [
      ...checkInPair("commit-1", "somewhat_on_track", "2026-10-05T09:00:00Z", 1),
      ...checkInPair("commit-1", "somewhat_on_track", "2026-10-06T09:00:00Z", 2),
      ...checkInPair("commit-1", "on_track", "2026-10-07T09:00:00Z", 3),
      ...checkInPair("commit-1", "on_track", "2026-10-20T09:00:00Z", 4),
      ...checkInPair("commit-1", "on_track", "2026-10-21T09:00:00Z", 5),
      ...checkInPair("commit-1", "on_track", "2026-10-22T09:00:00Z", 6),
    ];
    const row = computePersonalCardAnalytics([commitment], events, LONDON, { referenceDate: refDate }).cards[0];
    expect(row.trend.label).toBe("Up from 33% to 100%");
  });

  it("C6: 'Usually done on' needs 5+ completions and a 40%+ weekday", () => {
    // 2026-10-26, 10-19, 10-12 are Mondays; 10-27 Tuesday; 10-28 Wednesday
    const monday3 = [done("2026-10-26T09:00:00Z"), done("2026-10-19T09:00:00Z"), done("2026-10-12T09:00:00Z")];
    const fiveWith3Mondays = [...monday3, done("2026-10-27T09:00:00Z"), done("2026-10-28T09:00:00Z")];
    const r = (events) => computePersonalCardAnalytics(cards, events, LONDON, { referenceDate: refDate }).cards[0].usuallyDoneOn;
    expect(r(fiveWith3Mondays)).toBe("Monday");
    // only 4 completions: nothing
    expect(r([...monday3, done("2026-10-27T09:00:00Z")])).toBeNull();
    // 5 completions spread over 5 weekdays: 20% each, nothing
    expect(r([done("2026-10-26T09:00:00Z"), done("2026-10-27T09:00:00Z"), done("2026-10-28T09:00:00Z"), done("2026-10-29T09:00:00Z"), done("2026-10-30T09:00:00Z")])).toBeNull();
    // 5 completions, top weekday holds 2 of 5 (exactly 40%), unique top: shown
    expect(r([done("2026-10-26T09:00:00Z"), done("2026-10-19T09:00:00Z"), done("2026-10-27T09:00:00Z"), done("2026-10-28T09:00:00Z"), done("2026-10-29T09:00:00Z")])).toBe("Monday");
    // skipped events never count as completions
    expect(r([skip("2026-10-26T09:00:00Z"), skip("2026-10-19T09:00:00Z"), skip("2026-10-12T09:00:00Z"), skip("2026-10-05T09:00:00Z"), skip("2026-10-27T09:00:00Z")])).toBeNull();
  });
});
