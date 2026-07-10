import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_DEFS,
  buildCommitmentCheckInCard,
  buildEligibleCommitmentCheckInCards,
  getCurrentWindow,
  getGreeting,
  getTodayKey,
  getWindowDefs,
  isCommitmentCheckInEligible,
  isCommitmentLikeCard,
  isEligible,
  isPackCardAvailable,
  isValidWindowDefs,
  normalizeCards,
  parseTimeStringToMinutes,
  setWindowDefs,
} from "./utils.js";

// All date assertions pass an explicit timeZone so tests are independent of
// the machine's local zone (CI runs in UTC, dev machines in Europe/London).
const TZ = "UTC";
const MORNING = new Date("2026-07-10T09:00:00Z"); // 09:00 UTC → morning window
const TODAY_KEY = "2026-07-10";

// utils.js keeps the active window defs in a module-level singleton; reset it
// so test order can never leak custom defs between cases.
beforeEach(() => {
  setWindowDefs(DEFAULT_WINDOW_DEFS);
});

function baseCard(overrides = {}) {
  return {
    id: "card-1",
    promptText: "Drink some water",
    frequency: "once_daily",
    timingWindows: ["morning", "day", "evening", "night"],
    statusToday: "fresh",
    paused: false,
    disliked: false,
    deletedAt: null,
    lastShownAt: null,
    notYetUntil: null,
    doneDate: null,
    sourcePackId: null,
    ...overrides,
  };
}

describe("window definitions", () => {
  it("accepts the default defs and rejects malformed ones", () => {
    expect(isValidWindowDefs(DEFAULT_WINDOW_DEFS)).toBe(true);
    expect(isValidWindowDefs(null)).toBe(false);
    expect(isValidWindowDefs(DEFAULT_WINDOW_DEFS.slice(0, 3))).toBe(false);
    // Wrong id order is rejected.
    expect(isValidWindowDefs([...DEFAULT_WINDOW_DEFS].reverse())).toBe(false);
    // start === end is rejected.
    const clashing = DEFAULT_WINDOW_DEFS.map((d, i) => (i === 0 ? { ...d, start: 6, end: 6 } : d));
    expect(isValidWindowDefs(clashing)).toBe(false);
  });

  it("setWindowDefs falls back to defaults on invalid input", () => {
    setWindowDefs("garbage");
    expect(getWindowDefs()).toEqual(DEFAULT_WINDOW_DEFS);
  });

  it("getCurrentWindow follows the configured boundaries, including the midnight wrap", () => {
    expect(getCurrentWindow(new Date("2026-07-10T06:00:00Z"), TZ)).toBe("morning");
    expect(getCurrentWindow(new Date("2026-07-10T13:00:00Z"), TZ)).toBe("day");
    expect(getCurrentWindow(new Date("2026-07-10T19:00:00Z"), TZ)).toBe("evening");
    expect(getCurrentWindow(new Date("2026-07-10T23:30:00Z"), TZ)).toBe("night");
    expect(getCurrentWindow(new Date("2026-07-10T02:00:00Z"), TZ)).toBe("night");
  });
});

describe("date helpers", () => {
  it("getTodayKey respects the timezone", () => {
    const nearMidnightUtc = new Date("2026-07-10T02:00:00Z");
    expect(getTodayKey(nearMidnightUtc, "UTC")).toBe("2026-07-10");
    expect(getTodayKey(nearMidnightUtc, "America/Los_Angeles")).toBe("2026-07-09");
  });

  it("getGreeting maps hours to day parts", () => {
    expect(getGreeting(new Date("2026-07-10T06:00:00Z"), TZ)).toBe("Good morning");
    expect(getGreeting(new Date("2026-07-10T13:00:00Z"), TZ)).toBe("Good afternoon");
    expect(getGreeting(new Date("2026-07-10T19:00:00Z"), TZ)).toBe("Good evening");
    expect(getGreeting(new Date("2026-07-10T03:00:00Z"), TZ)).toBe("Still awake?");
  });

  it("parseTimeStringToMinutes parses HH:MM and rejects everything else", () => {
    expect(parseTimeStringToMinutes("08:30")).toBe(510);
    expect(parseTimeStringToMinutes("23:59")).toBe(1439);
    expect(parseTimeStringToMinutes("24:00")).toBeNull();
    expect(parseTimeStringToMinutes("8.30")).toBeNull();
    expect(parseTimeStringToMinutes(830)).toBeNull();
  });
});

describe("isEligible", () => {
  it("accepts a fresh card inside its timing window", () => {
    expect(isEligible(baseCard(), MORNING, TZ)).toBe(true);
  });

  it("rejects paused, disliked and deleted cards", () => {
    expect(isEligible(baseCard({ paused: true }), MORNING, TZ)).toBe(false);
    expect(isEligible(baseCard({ disliked: true }), MORNING, TZ)).toBe(false);
    expect(isEligible(baseCard({ deletedAt: "2026-07-01T00:00:00Z" }), MORNING, TZ)).toBe(false);
  });

  it("rejects cards done today, but not cards done on earlier days", () => {
    expect(isEligible(baseCard({ doneDate: TODAY_KEY }), MORNING, TZ)).toBe(false);
    expect(isEligible(baseCard({ doneDate: "2026-07-09" }), MORNING, TZ)).toBe(true);
  });

  it("applies the 30-minute last-shown cooldown and notYetUntil snooze", () => {
    const tenMinutesAgo = new Date(MORNING.getTime() - 10 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(MORNING.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(isEligible(baseCard({ lastShownAt: tenMinutesAgo }), MORNING, TZ)).toBe(false);
    expect(isEligible(baseCard({ lastShownAt: twoHoursAgo }), MORNING, TZ)).toBe(true);

    const inAnHour = new Date(MORNING.getTime() + 60 * 60 * 1000).toISOString();
    expect(isEligible(baseCard({ notYetUntil: inAnHour }), MORNING, TZ)).toBe(false);
  });

  it("rejects cards outside their timing windows", () => {
    expect(isEligible(baseCard({ timingWindows: ["evening"] }), MORNING, TZ)).toBe(false);
  });
});

describe("pack cards", () => {
  it("isPackCardAvailable requires a pack source and no hiding flags", () => {
    expect(isPackCardAvailable({ id: "p", sourcePackId: "pack-1" })).toBe(true);
    expect(isPackCardAvailable({ id: "p", sourcePackId: "pack-1", disliked: true })).toBe(false);
    expect(isPackCardAvailable({ id: "p", sourcePackId: "pack-1", hidden: true })).toBe(false);
    expect(isPackCardAvailable(baseCard())).toBe(false);
  });
});

describe("commitment lifecycle", () => {
  function commitmentCard(overrides = {}) {
    return baseCard({
      id: "commit-1",
      cardKind: "commitment",
      commitmentStatusToday: "made",
      commitmentDecisionDate: TODAY_KEY,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: "08:00",
      ...overrides,
    });
  }

  it("recognises commitment-like cards, including legacy field-based ones", () => {
    expect(isCommitmentLikeCard({ cardKind: "commitment" })).toBe(true);
    expect(isCommitmentLikeCard({ commitmentReason: "why" })).toBe(true);
    expect(isCommitmentLikeCard({ cardKind: "commitment", sourcePackId: "pack-1" })).toBe(false);
    expect(isCommitmentLikeCard(baseCard())).toBe(false);
  });

  it("check-in becomes eligible only after the configured time, once, per made-day", () => {
    expect(isCommitmentCheckInEligible(commitmentCard(), MORNING, TZ)).toBe(true);
    // Before the check-in time.
    expect(
      isCommitmentCheckInEligible(commitmentCard({ commitmentCheckInTime: "11:00" }), MORNING, TZ),
    ).toBe(false);
    // No commitment made today.
    expect(
      isCommitmentCheckInEligible(commitmentCard({ commitmentDecisionDate: "2026-07-09" }), MORNING, TZ),
    ).toBe(false);
    // Already shown or answered today.
    expect(
      isCommitmentCheckInEligible(commitmentCard({ commitmentCheckInShownDate: TODAY_KEY }), MORNING, TZ),
    ).toBe(false);
    expect(
      isCommitmentCheckInEligible(commitmentCard({ commitmentCheckInResponseDate: TODAY_KEY }), MORNING, TZ),
    ).toBe(false);
  });

  it("builds a dated check-in card tied to its parent commitment", () => {
    const checkIn = buildCommitmentCheckInCard(commitmentCard(), MORNING, TZ);
    expect(checkIn.id).toBe(`checkin:commit-1:${TODAY_KEY}`);
    expect(checkIn.cardKind).toBe("commitment_check_in");
    expect(checkIn.parentCommitmentCardId).toBe("commit-1");
    expect(checkIn.sourcePackId).toBeNull();

    const built = buildEligibleCommitmentCheckInCards([commitmentCard()], MORNING, TZ);
    expect(built).toHaveLength(1);
    expect(built[0].id).toBe(checkIn.id);
  });
});

describe("normalizeCards", () => {
  it("fills defaults without mutating the input", () => {
    const sparse = { id: "n1", promptText: "hi" };
    const [normalized] = normalizeCards([sparse], MORNING, TZ);
    expect(normalized.timingWindows).toEqual(["morning", "day", "evening"]);
    expect(normalized.frequency).toBe("once_daily");
    expect(normalized.deletedAt).toBeNull();
    expect(sparse.timingWindows).toBeUndefined();
  });

  it("resets stale done status from a previous day", () => {
    const [normalized] = normalizeCards(
      [baseCard({ doneDate: "2026-07-09", statusToday: "doneToday" })],
      MORNING,
      TZ,
    );
    expect(normalized.statusToday).toBe("fresh");
  });

  it("converts the legacy deleted flag into deletedAt", () => {
    const [normalized] = normalizeCards(
      [baseCard({ deleted: true, updatedAt: "2026-07-01T00:00:00Z" })],
      MORNING,
      TZ,
    );
    expect(normalized.deletedAt).toBe("2026-07-01T00:00:00Z");
    expect("deleted" in normalized).toBe(false);
  });
});
