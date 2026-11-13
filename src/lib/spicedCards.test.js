import { describe, expect, it } from "vitest";
import { buildDwellMetadata } from "./spicedCards";

describe("buildDwellMetadata", () => {
  it("adds words, expected_ms and read_verdict when the shown card is passed", () => {
    const card = { promptText: "one two three four five six seven eight nine" };
    expect(buildDwellMetadata(1000, false, card)).toMatchObject({
      dwell_ms: 1000,
      dwell_bucket: "reflex_skip",
      words: 9,
      expected_ms: 2750,
      read_verdict: "skimmed",
    });
    expect(buildDwellMetadata(3000, true, card).read_verdict).toBe("read");
  });

  it("keeps the old shape when no card is passed", () => {
    expect(buildDwellMetadata(1000)).toEqual({ dwell_ms: 1000, dwell_bucket: "reflex_skip" });
  });

  it("records nothing for null, negative or idle dwell", () => {
    expect(buildDwellMetadata(null, false, { promptText: "a b c" })).toEqual({});
    expect(buildDwellMetadata(undefined)).toEqual({});
    expect(buildDwellMetadata(-1)).toEqual({});
    expect(buildDwellMetadata(60001, false, { promptText: "a b c" })).toEqual({});
  });
});
