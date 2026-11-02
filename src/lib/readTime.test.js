import { describe, expect, it } from "vitest";
import { countWords, expectedReadMs, readVerdict, getShownText } from "./readTime";

const NINE_WORDS = "one two three four five six seven eight nine";

describe("readTime", () => {
  it("counts the words on a card and expects 500 + 250 per word", () => {
    expect(countWords({ promptText: NINE_WORDS })).toBe(9);
    expect(expectedReadMs(9)).toBe(2750);
  });

  it("counts attribution only on library cards, where it is shown", () => {
    expect(countWords({ promptText: "a b", attribution: "x y z" })).toBe(2);
    expect(countWords({ promptText: "a b", sourcePackId: "p", attribution: "x y z" })).toBe(5);
    expect(getShownText("  hello   there ")).toBe("  hello   there ");
  });

  it("calls 1000 ms on nine words skimmed and 3000 ms read", () => {
    expect(readVerdict(1000, 9)).toBe("skimmed");
    expect(readVerdict(3000, 9)).toBe("read");
  });

  it("treats exactly half the expected time as read (the line is strictly below half)", () => {
    expect(readVerdict(1375, 9)).toBe("read");
    expect(readVerdict(1374, 9)).toBe("skimmed");
  });

  it("returns null for input it cannot judge", () => {
    expect(readVerdict(null, 9)).toBeNull();
    expect(readVerdict(undefined, 9)).toBeNull();
    expect(readVerdict(NaN, 9)).toBeNull();
    expect(readVerdict(-5, 9)).toBeNull();
    expect(readVerdict(1000, 0)).toBeNull();
    expect(readVerdict(1000, NaN)).toBeNull();
    expect(expectedReadMs(-1)).toBeNull();
    expect(countWords(null)).toBe(0);
    expect(countWords({ promptText: "   " })).toBe(0);
  });
});
