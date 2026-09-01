import assert from "node:assert/strict";
import { parseImportedCards, formatImportedCard } from "../src/lib/packImport.js";

// ── Basic pipe-delimited parsing ─────────────────────────────────────────────

const basic = parseImportedCards("Start where you are. | Arthur Ashe | A book | https://example.com");
assert.equal(basic.length, 1, "one line parses to one card");
assert.equal(basic[0].promptText, "Start where you are.");
assert.equal(basic[0].attribution, "Arthur Ashe");
assert.equal(basic[0].sourceTitle, "A book");
assert.equal(basic[0].sourceUrl, "https://example.com");
assert.equal(basic[0].isPreview, false, "plain lines are not preview cards");
assert.equal(basic[0].frequency, "once_daily");
assert.deepEqual(basic[0].timingWindows, ["morning", "day", "evening"]);

const sparse = parseImportedCards("Just the text");
assert.equal(sparse[0].promptText, "Just the text");
assert.equal(sparse[0].attribution, "");

// ── Preview marker: leading "*" ──────────────────────────────────────────────

const preview = parseImportedCards("* Someone less qualified is already doing it. | Courage");
assert.equal(preview[0].isPreview, true, "leading * marks a preview card");
assert.equal(preview[0].promptText, "Someone less qualified is already doing it.", "* is stripped from the text");
assert.equal(preview[0].attribution, "Courage");

const tight = parseImportedCards("*No space after the star");
assert.equal(tight[0].isPreview, true, "marker works without a space");
assert.equal(tight[0].promptText, "No space after the star");

// ── Blank/invalid lines drop out ─────────────────────────────────────────────

const mixed = parseImportedCards("First card\n\n   \n| only pipes |\nSecond card");
assert.deepEqual(mixed.map((card) => card.promptText), ["First card", "Second card"], "blank and textless lines are skipped");
assert.deepEqual(parseImportedCards(""), [], "empty input parses to no cards");
assert.deepEqual(parseImportedCards(null), [], "null input parses to no cards");

// ── Round trip: format → parse preserves content and preview flag ────────────

const original = [
  { promptText: "The embarrassment lasts a day.", attribution: "Courage", sourceTitle: "", sourceUrl: "", isPreview: true },
  { promptText: "Nobody is coming to give you permission.", attribution: "", sourceTitle: "Notes", sourceUrl: "https://example.com", isPreview: false },
];
const reparsed = parseImportedCards(original.map(formatImportedCard).join("\n"));
assert.equal(reparsed.length, 2);
original.forEach((entry, index) => {
  assert.equal(reparsed[index].promptText, entry.promptText, `round-trip text ${index}`);
  assert.equal(reparsed[index].attribution, entry.attribution, `round-trip attribution ${index}`);
  assert.equal(reparsed[index].sourceTitle, entry.sourceTitle, `round-trip source title ${index}`);
  assert.equal(reparsed[index].sourceUrl, entry.sourceUrl, `round-trip source URL ${index}`);
  assert.equal(reparsed[index].isPreview, entry.isPreview, `round-trip preview flag ${index}`);
});

console.log("test-pack-import: all assertions passed");
