// Tests only the pure exports of eventLog.js. The storage/queue functions
// touch window.localStorage and Supabase and are covered by e2e flows.
import { describe, expect, it } from "vitest";
import { formatTwentyFourHourTime, getStartOfWeek, mergeEventsById } from "./eventLog.js";

function event(id, createdAt) {
  return { id, created_at: createdAt, event_type: "card_shown" };
}

describe("mergeEventsById", () => {
  it("merges by id with incoming events winning, newest first", () => {
    const local = [event("a", "2026-07-10T08:00:00Z"), event("b", "2026-07-10T07:00:00Z")];
    const incoming = [{ ...event("b", "2026-07-10T07:30:00Z"), edited: true }, event("c", "2026-07-10T09:00:00Z")];

    const merged = mergeEventsById(local, incoming);
    expect(merged.map((e) => e.id)).toEqual(["c", "a", "b"]);
    expect(merged.find((e) => e.id === "b").edited).toBe(true);
  });

  it("drops events without ids and tolerates non-array input", () => {
    expect(mergeEventsById([{ created_at: "2026-07-10T08:00:00Z" }, null], undefined)).toEqual([]);
    expect(mergeEventsById("nope", [event("a", "2026-07-10T08:00:00Z")])).toHaveLength(1);
  });

  it("caps the merged log at 500 newest events", () => {
    const many = Array.from({ length: 600 }, (_, i) =>
      event(`e${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()),
    );
    const merged = mergeEventsById(many, []);
    expect(merged).toHaveLength(500);
    // Newest (highest seconds) survive.
    expect(merged[0].id).toBe("e599");
    expect(merged.at(-1).id).toBe("e100");
  });

  it("sorts events with missing created_at to the end", () => {
    const merged = mergeEventsById([{ id: "undated" }], [event("dated", "2026-07-10T08:00:00Z")]);
    expect(merged.map((e) => e.id)).toEqual(["dated", "undated"]);
  });
});

describe("getStartOfWeek", () => {
  it("returns the Monday of the current week at local midnight", () => {
    // 2026-07-10 is a Friday; its week starts Monday 2026-07-06.
    const start = getStartOfWeek(new Date(2026, 6, 10, 15, 30));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(6);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // 2026-07-12 is a Sunday → week still starts Monday 2026-07-06.
    const start = getStartOfWeek(new Date(2026, 6, 12, 9, 0));
    expect(start.getDate()).toBe(6);
  });
});

describe("formatTwentyFourHourTime", () => {
  it("formats in 24-hour clock for the given timezone", () => {
    const timestamp = "2026-07-10T14:30:00Z";
    expect(formatTwentyFourHourTime(timestamp, "UTC")).toBe("14:30");
    // Europe/London is UTC+1 in July.
    expect(formatTwentyFourHourTime(timestamp, "Europe/London")).toBe("15:30");
  });
});
