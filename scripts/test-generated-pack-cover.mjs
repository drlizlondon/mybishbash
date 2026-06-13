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

assert.equal(longModel.cardCountLabel, "", "grid covers omit card-count labels");
assert.equal(longModel.title, longTitle, "long titles are not truncated in the model");
assert.ok(["long", "extra-long"].includes(longModel.titleScale), "long titles reduce font scale before wrapping");
assert.ok(longModel.titleLines.length >= 2 && longModel.titleLines.length <= 5, "long title uses balanced natural lines");
assertNoMidWordSplits(longTitle);

const minimalModel = getCoverModel({
  title: "Bare Bones Pack",
  entries: [{ promptText: "Stand up and put the kettle on." }],
});

assert.equal(minimalModel.cardCountLabel, "", "grid covers do not duplicate card counts shown below the cover");
assert.equal(minimalModel.tagline, "", "missing description does not fall back to card text inside cover artwork");

const detailModel = getCoverModel({
  title: "Bare Bones Pack",
  entries: [{ promptText: "Stand up and put the kettle on." }],
}, { variant: "detail" });

assert.equal(detailModel.cardCountLabel, "1 CARD", "detail covers may show compact card-count context");

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

assert.equal(statusModel.statusBadge, "✓ Added", "installed state uses the compact Added badge");

const addModel = getCoverModel({ title: "Fresh Pack", cardCount: 8 });
assert.equal(addModel.statusBadge, "+ Add", "non-installed state uses the compact Add badge");

const templateA = getCoverModel({ id: "template-source", title: "Template Source", entries: [] });
const templateB = getCoverModel({ id: "template-source", title: "Template Source", entries: [] });
assert.equal(templateA.template, templateB.template, "template choice is deterministic");
assert.ok(templateA.template >= 0 && templateA.template <= 5, "template choice uses the approved template range");

const defensiveCases = [
  { label: "undefined pack", pack: undefined, expectedTitle: "Untitled Pack" },
  { label: "minimal pack", pack: {}, expectedTitle: "Untitled Pack" },
  { label: "missing title", pack: { id: "missing-title", entries: [] }, expectedTitle: "Untitled Pack" },
  { label: "empty entries and cards", pack: { id: "empty-pack", title: "Empty Pack", entries: [], cards: [] }, expectedTitle: "Empty Pack" },
];

for (const { label, pack, expectedTitle } of defensiveCases) {
  const model = getCoverModel(pack);
  assert.equal(model.title, expectedTitle, `${label} uses safe title`);
  assert.ok(model.palette?.name, `${label} uses safe palette`);
  assert.ok(Array.isArray(model.titleLines) && model.titleLines.length > 0, `${label} has title lines`);
  assert.doesNotThrow(() => getCoverModel(pack), `${label} model generation does not throw`);
}

console.log("Generated pack cover guardrails passed.");
