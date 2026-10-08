import { describe, expect, it } from "vitest";
import { buildPsychologyModel } from "./HQPanel";

describe("buildPsychologyModel", () => {
  it("handles empty or missing events gracefully", () => {
    const result = buildPsychologyModel([]);
    expect(result).toEqual({
      totalDwellEvents: 0,
      avgDwellCompletedMs: 0,
      avgDwellIgnoredMs: 0,
      reflexSkips: 0,
      consideredSkips: 0,
      deepDwells: 0,
      reflexSkipPercentage: 0,
      consideredSkipPercentage: 0,
      spicedTotal: 0,
      spicedCompleted: 0,
      spicedRecoveryRate: 0,
      commitmentsMade: 0,
      seasonPauses: 0,
      launcherReflexBreakdown: [],
    });
  });

  it("calculates dwell averages and classifies reflex vs considered skips", () => {
    const events = [
      // Completed action with 3500ms dwell
      {
        event_type: "bash_done",
        action_taken: "completed",
        dwell_ms: 3500,
        dwell_bucket: "considered_skip",
      },
      // Reflex skip (800ms) on Instagram
      {
        event_type: "card_ignored",
        action_taken: "ignored",
        dwell_ms: 800,
        launcher_context: "instagram",
      },
      // Reflex skip (1200ms) on Instagram
      {
        event_type: "card_ignored",
        action_taken: "ignored",
        dwell_ms: 1200,
        launcher_context: "instagram",
      },
      // Considered skip (4000ms) on TikTok
      {
        event_type: "intercept_continue_to_app",
        action_taken: "continued_to_app",
        dwell_ms: 4000,
        target_app: "tiktok",
      },
      // Deep dwell (10000ms) on Safari
      {
        event_type: "action_card_skipped",
        action_taken: "dismissed",
        dwell_ms: 10000,
        app_id: "safari",
      },
    ];

    const model = buildPsychologyModel(events);

    expect(model.totalDwellEvents).toBe(5);
    expect(model.avgDwellCompletedMs).toBe(3500);
    // (800 + 1200 + 4000 + 10000) / 4 = 16000 / 4 = 4000
    expect(model.avgDwellIgnoredMs).toBe(4000);
    expect(model.reflexSkips).toBe(2);
    expect(model.consideredSkips).toBe(1);
    expect(model.deepDwells).toBe(1);
    // 2 reflex out of 4 ignored = 50%
    expect(model.reflexSkipPercentage).toBe(50);
    // 1 considered out of 4 ignored = 25%
    expect(model.consideredSkipPercentage).toBe(25);

    // Launcher breakdown
    expect(model.launcherReflexBreakdown).toHaveLength(3);
    const instagramRow = model.launcherReflexBreakdown.find((r) => r.launcher === "instagram");
    expect(instagramRow).toEqual({
      launcher: "instagram",
      total: 2,
      reflex: 2,
      considered: 0,
      reflexRate: 100,
    });
  });

  it("measures spiced card presentations and salience recovery rate", () => {
    const events = [
      {
        event_type: "bash_done",
        action_taken: "completed",
        is_spiced: true,
        dwell_ms: 2200,
      },
      {
        event_type: "card_ignored",
        action_taken: "ignored",
        metadata: { is_spiced: true },
        dwell_ms: 900,
      },
      {
        event_type: "bash_not_done",
        action_taken: "ignored",
        metadata: { spiced: true },
        dwell_ms: 1100,
      },
    ];

    const model = buildPsychologyModel(events);
    expect(model.spicedTotal).toBe(3);
    expect(model.spicedCompleted).toBe(1);
    // 1 / 3 = 33%
    expect(model.spicedRecoveryRate).toBe(33);
  });

  it("tallies coaching choices for commitments made vs seasonal pauses", () => {
    const events = [
      { event_type: "card_commitment_made", metadata: { commitmentMade: true } },
      { event_type: "card_commitment_made", metadata: { commitmentMade: true } },
      { event_type: "card_season_paused", metadata: { seasonPaused: true } },
    ];

    const model = buildPsychologyModel(events);
    expect(model.commitmentsMade).toBe(2);
    expect(model.seasonPauses).toBe(1);
  });
});
