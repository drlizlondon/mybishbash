import { describe, expect, it } from "vitest";
import { computePersonalCardAnalytics } from "./personalCardAnalytics.js";

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

  it("filters out pack cards, deleted cards, and commitments", () => {
    const cards = [
      { id: "personal-1", promptText: "Water the plant" },
      { id: "pack-card-1", promptText: "Pack card", sourcePackId: "growth-pack" },
      { id: "deleted-1", promptText: "Deleted card", deletedAt: "2026-09-20T00:00:00Z" },
      { id: "commit-1", promptText: "Commitment card", cardKind: "commitment" },
    ];
    const result = computePersonalCardAnalytics(cards, [], "Europe/London", { referenceDate: refDate });
    expect(result.totalPersonalCards).toBe(1);
    expect(result.cards[0].cardId).toBe("personal-1");
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
});
