/**
 * Reading time for a card: how long the words on it need, and whether the
 * person stayed long enough to have read them.
 *
 * Source row R1 (MBB-23 spec): silent reading of non-fiction is about 238
 * words a minute (Brysbaert 2019, Journal of Memory and Language 109),
 * rounded here to 4 words a second = 250 ms a word.
 * ORIENTATION_MS and SKIM_RATIO are product choices, not research figures.
 */

/** Time to take in that a new card has appeared, before any reading starts. Product choice. */
export const ORIENTATION_MS = 500;

/** Milliseconds per word. 4 words a second, rounded from about 238 a minute (R1). */
export const MS_PER_WORD = 250;

/** Longer than this on one card is idle time, not reading. Recorded as null. Product choice. */
export const MAX_DWELL_MS = 60000;

/** A view shorter than this share of the expected read time counts as skimmed. Product choice. */
export const SKIM_RATIO = 0.5;

/**
 * The text a card actually shows. Pass a card object or a plain string.
 * Library cards also show their attribution line; the generic fallback line
 * the reveal screen uses when a library card has none is not counted.
 */
export function getShownText(card) {
  if (typeof card === "string") return card;
  if (!card || typeof card !== "object") return "";
  const parts = [card.promptText ?? card.title ?? "", card.body ?? ""];
  if (card.sourcePackId) parts.push(card.attribution || card.sourceTitle || "");
  return parts.filter((part) => typeof part === "string" && part.trim()).join(" ");
}

export function countWords(card) {
  const text = getShownText(card).trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function expectedReadMs(words) {
  const count = Number(words);
  if (!Number.isFinite(count) || count < 0) return null;
  return ORIENTATION_MS + Math.round(count) * MS_PER_WORD;
}

/** "skimmed", "read", or null when the dwell or the word count is not usable. */
export function readVerdict(dwellMs, words) {
  if (dwellMs === null || dwellMs === undefined) return null;
  const dwell = Number(dwellMs);
  const count = Number(words);
  if (!Number.isFinite(dwell) || dwell < 0) return null;
  if (!Number.isFinite(count) || count <= 0) return null;
  return dwell < SKIM_RATIO * expectedReadMs(count) ? "skimmed" : "read";
}
