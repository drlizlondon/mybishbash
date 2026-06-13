import assert from "node:assert/strict";
import {
  getCoverModel,
  getCoverTagline,
  splitTitleIntoLines,
} from "../src/lib/generatedCover.js";

function assertNoMidWordSplits(title) {
  const words = title.split(/\s+/).filter(Boolean);
  const lines = splitTitleIntoLines(title);
  const reconstructed = lines.join(" ");
  assert.equal(reconstructed, title.replace(/\s+/g, " ").trim(), "title lines preserve whole words");
  for (const line of lines) {
    assert.ok(words.includes(line) || line.split(" ").every((word) => words.includes(word)), `line keeps word boundaries: ${line}`);
  }
}

const longTitle = "A Practical Reset for Overwhelming Evenings After Long Days";
const longModel = getCoverModel({
  id: "long-evening-reset",
  title: longTitle,
  description: "Gentle cues for stopping the scroll and moving into a calmer evening.",
  entries: Array.from({ length: 45 }, (_, index) => ({ promptText: `Card ${index + 1}` })),
});

assert.equal(longModel.cardCountLabel, "45 CARDS", "card count badge uses uppercase cover label");
assert.equal(longModel.title, longTitle, "long titles are not truncated in the model");
assert.ok(["long", "extra-long"].includes(longModel.titleScale), "long titles reduce font scale before wrapping");
assert.ok(longModel.titleLines.length >= 2 && longModel.titleLines.length <= 5, "long title uses balanced natural lines");
assertNoMidWordSplits(longTitle);

const minimalModel = getCoverModel({
  title: "Bare Bones Pack",
  entries: [{ promptText: "Stand up and put the kettle on." }],
});

assert.equal(minimalModel.cardCountLabel, "1 CARD", "cover generation works with only title and cards");
assert.equal(minimalModel.tagline, "", "missing description does not fall back to card text inside cover artwork");

const weakTagline = getCoverTagline({
  title: "Tiny",
  entries: [{ promptText: "Go." }, { promptText: "" }],
});

assert.equal(weakTagline, "", "weak fallback copy is omitted");

const statusModel = getCoverModel({
  title: "Popular New Pack",
  cardCount: 12,
  isNew: true,
  isPopular: true,
  isInstalled: true,
});

assert.equal(statusModel.statusBadge, "INSTALLED", "only one status badge is shown with deterministic priority");

console.log("Generated pack cover guardrails passed.");
