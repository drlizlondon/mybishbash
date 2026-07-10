import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS,
  buildCardExposureLookup,
  buildCompletedTodayCardIds,
  getLauncherCardPriority,
  normalizePersonalFirstFallbackSettings,
  selectEligibleCard,
} from "./cardSelection.js";

// 09:00 UTC on a fixed date; all selection calls pass timezone "UTC" so the
// suite is independent of the machine's local zone.
const NOW = new Date("2026-07-10T09:00:00Z");
const TZ = "UTC";
const FIRST = () => 0; // deterministic "random": always pick the first candidate

function personalCard(overrides = {}) {
  return {
    id: "personal-1",
    promptText: "Stretch for two minutes",
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening", "night"],
    statusToday: "fresh",
    sourcePackId: null,
    ...overrides,
  };
}

function packCard(overrides = {}) {
  return {
    id: "pack-card-1",
    promptText: "A thought from your pack",
    sourcePackId: "pack-1",
    ...overrides,
  };
}

describe("normalizePersonalFirstFallbackSettings", () => {
  it("returns the 30-minute defaults for missing or invalid values", () => {
    expect(normalizePersonalFirstFallbackSettings()).toEqual(DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS);
    expect(normalizePersonalFirstFallbackSettings({ packCardTimeoutMs: -5 })).toEqual(
      DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS,
    );
    expect(normalizePersonalFirstFallbackSettings({ packCardTimeoutMs: "nope" })).toEqual(
      DEFAULT_PERSONAL_FIRST_FALLBACK_SETTINGS,
    );
  });

  it("floors numeric values and accepts zero (= no cooldown)", () => {
    expect(
      normalizePersonalFirstFallbackSettings({ packCardTimeoutMs: 1500.9, personalCardCooldownMs: 0 }),
    ).toEqual({ packCardTimeoutMs: 1500, personalCardCooldownMs: 0 });
  });
});

describe("exposure and completion lookups", () => {
  it("tracks the most recent exposure per card from events and lastShownAt", () => {
    const lookup = buildCardExposureLookup(
      [{ id: "a", lastShownAt: "2026-07-10T08:00:00Z" }],
      [
        { card_id: "a", created_at: "2026-07-10T07:00:00Z" },
        { card_id: "b", created_at: "2026-07-10T06:00:00Z" },
      ],
    );
    expect(lookup.get("a")).toBe(new Date("2026-07-10T08:00:00Z").getTime());
    expect(lookup.get("b")).toBe(new Date("2026-07-10T06:00:00Z").getTime());
  });

  it("collects card ids completed today (including legacy bash_done), scoped to today", () => {
    const completed = buildCompletedTodayCardIds(
      [
        { event_type: "card_completed", card_id: "a", created_at: "2026-07-10T08:00:00Z" },
        { event_type: "bash_done", bash_id: "b", created_at: "2026-07-10T07:00:00Z" },
        { event_type: "card_completed", card_id: "c", created_at: "2026-07-09T08:00:00Z" },
        { event_type: "card_shown", card_id: "d", created_at: "2026-07-10T08:00:00Z" },
      ],
      NOW,
      TZ,
    );
    expect(completed).toEqual(new Set(["a", "b"]));
  });
});

describe("getLauncherCardPriority", () => {
  it("pack cards are always fallback; personal cards default to primary", () => {
    expect(getLauncherCardPriority(packCard())).toBe("fallback");
    expect(getLauncherCardPriority(personalCard())).toBe("primary");
    expect(getLauncherCardPriority(personalCard({ launcherPriority: "partner_primary" }))).toBe("primary");
    expect(getLauncherCardPriority(personalCard({ launcherPriority: "background" }))).toBe("fallback");
    expect(getLauncherCardPriority(null)).toBe("none");
  });
});

describe("selectEligibleCard", () => {
  it("returns a null selection when there are no cards", () => {
    const result = selectEligibleCard({ cards: [], timezone: TZ, now: NOW, random: FIRST });
    expect(result.selected).toBeNull();
    expect(result.selectedPriority).toBe("none");
    expect(result.selectionReason).toBe("no_eligible_primary_or_fallback_cards");
  });

  it("prefers an eligible personal card over pack cards", () => {
    const result = selectEligibleCard({
      cards: [packCard(), personalCard()],
      timezone: TZ,
      now: NOW,
      random: FIRST,
    });
    expect(result.selected.id).toBe("personal-1");
    expect(result.selectedPriority).toBe("primary");
    expect(result.selectedSource).toBe("personal");
    expect(result.selectionReason).toBe("eligible_primary_cards_available");
  });

  it("falls back to pack cards when no personal card is eligible", () => {
    const result = selectEligibleCard({
      cards: [packCard(), personalCard({ doneDate: "2026-07-10", statusToday: "doneToday" })],
      timezone: TZ,
      now: NOW,
      random: FIRST,
    });
    expect(result.selected.id).toBe("pack-card-1");
    expect(result.selectedPriority).toBe("fallback");
    expect(result.selectedSource).toBe("pack");
    expect(result.selectedPackId).toBe("pack-1");
    expect(result.selectionReason).toBe("no_eligible_primary_cards");
  });

  it("skips personal cards completed today according to the event log", () => {
    const result = selectEligibleCard({
      cards: [personalCard(), packCard()],
      events: [{ event_type: "card_completed", card_id: "personal-1", created_at: "2026-07-10T08:00:00Z" }],
      timezone: TZ,
      now: NOW,
      random: FIRST,
    });
    expect(result.selected.id).toBe("pack-card-1");
  });

  it("respects excludedCardIds for both pools", () => {
    const result = selectEligibleCard({
      cards: [personalCard(), packCard()],
      excludedCardIds: new Set(["personal-1", "pack-card-1"]),
      timezone: TZ,
      now: NOW,
      random: FIRST,
    });
    expect(result.selected).toBeNull();
  });

  it("prefers the least recently exposed pack card", () => {
    const stale = packCard({ id: "stale", lastShownAt: "2026-07-01T00:00:00Z" });
    const fresh = packCard({ id: "fresh", lastShownAt: "2026-07-10T08:50:00Z" });
    const result = selectEligibleCard({
      cards: [fresh, stale],
      timezone: TZ,
      now: NOW,
      random: FIRST,
      // Zero timeout disables the pack cooldown so both stay eligible.
      settings: { packCardTimeoutMs: 0, personalCardCooldownMs: 0 },
    });
    expect(result.selected.id).toBe("stale");
  });

  it("applies the personal-card cooldown from recent exposure", () => {
    const result = selectEligibleCard({
      cards: [personalCard({ lastShownAt: "2026-07-10T08:50:00Z" }), packCard()],
      timezone: TZ,
      now: NOW,
      random: FIRST,
    });
    // 10 minutes since exposure < 30-minute cooldown → falls back to the pack.
    expect(result.selected.id).toBe("pack-card-1");
  });

  it("reports pool counts for the selection audit log", () => {
    const result = selectEligibleCard({
      cards: [personalCard(), packCard(), packCard({ id: "pack-card-2", sourcePackId: "pack-2" })],
      timezone: TZ,
      now: NOW,
      random: FIRST,
    });
    expect(result.eligiblePrimaryCount).toBe(1);
    expect(result.availablePackCount).toBe(2);
    expect(result.availablePackGroupCount).toBe(2);
  });
});
