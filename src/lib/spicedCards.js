import { MAX_DWELL_MS, countWords, expectedReadMs, readVerdict } from "./readTime";

const COMPLETED_EVENT_TYPES = new Set([
  "bash_done",
  "card_completed",
  "action_card_completed",
]);

const IGNORED_EVENT_TYPES = new Set([
  "bash_not_done",
  "card_ignored",
  "intercept_continue_to_app",
]);

export function eventMatchesCard(event, card) {
  if (!event || !card) return false;
  if (event.card_id && event.card_id === card.id) return true;
  if (event.bash_id && event.bash_id === card.id) return true;
  if (event.metadata?.card_id && event.metadata.card_id === card.id) return true;

  const cardText = (card.promptText || card.card_title || "").trim();
  if (cardText) {
    if (event.card_text && event.card_text.trim() === cardText) return true;
    if (event.bash_title && event.bash_title.trim() === cardText) return true;
    if (event.card_title && event.card_title.trim() === cardText) return true;
  }

  return false;
}

/**
 * Skips in a row since the last completion, newest first. Only ignore events
 * count; shown, offer and other events neither add to the run nor break it.
 */
export function countConsecutiveSkips(card, events = []) {
  if (!card) return 0;
  const cardEvents = (Array.isArray(events) ? events : []).filter((e) => eventMatchesCard(e, card));
  const sorted = [...cardEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  let consecutiveSkips = 0;
  for (const ev of sorted) {
    const isCompleted = COMPLETED_EVENT_TYPES.has(ev.event_type) || ev.action_taken === "completed";
    const isIgnored = IGNORED_EVENT_TYPES.has(ev.event_type) || ev.action_taken === "ignored" || ev.action_taken === "dismissed";
    if (isCompleted) break;
    if (isIgnored) consecutiveSkips += 1;
  }
  return consecutiveSkips;
}

/**
 * Checks if a card has 3+ consecutive skips, qualifying for the "Spiced" visual salience test.
 */
export function checkCardIsSpiced(card, events = []) {
  return countConsecutiveSkips(card, events) >= 3;
}

export function getDwellBucket(dwellMs, isCompleted = false) {
  if (!Number.isFinite(dwellMs) || dwellMs < 0) return null;
  if (isCompleted) {
    return dwellMs < 2000 ? "quick_complete" : dwellMs <= 8000 ? "considered_complete" : "deep_complete";
  }
  return dwellMs < 1500 ? "reflex_skip" : dwellMs <= 8000 ? "considered_skip" : "pondered_skip";
}

/**
 * Dwell fields for an event's metadata. Pass the card (or the text shown) as
 * `shown` to also record words, expected_ms and read_verdict. A null or
 * idle (over MAX_DWELL_MS) dwell records nothing.
 */
export function buildDwellMetadata(dwellMs, isCompleted = false, shown = null) {
  if (dwellMs === null || dwellMs === undefined) return {};
  const numeric = Number(dwellMs);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > MAX_DWELL_MS) return {};
  const rounded = Math.round(numeric);
  const metadata = {
    dwell_ms: rounded,
    dwell_bucket: getDwellBucket(rounded, isCompleted),
  };
  if (shown !== null && shown !== undefined) {
    const words = countWords(shown);
    if (words > 0) {
      metadata.words = words;
      metadata.expected_ms = expectedReadMs(words);
      metadata.read_verdict = readVerdict(rounded, words);
    }
  }
  return metadata;
}
