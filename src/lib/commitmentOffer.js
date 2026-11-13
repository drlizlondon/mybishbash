import { countConsecutiveSkips } from "./spicedCards";
import { isCommitmentLikeCard } from "../utils";

/** Skips in a row before the offer appears. Same rule as the spiced-card trigger. */
export const OFFER_SKIP_THRESHOLD = 3;

/** After "Not now", the offer stays away from that card for this long. */
export const OFFER_SUPPRESS_MS = 14 * 24 * 60 * 60 * 1000;

export const COMMITMENT_OFFER_EVENTS = {
  SHOWN: "commitment_offer_shown",
  ACCEPTED: "commitment_offer_accepted",
  PAUSED: "commitment_offer_paused",
  DECLINED: "commitment_offer_declined",
};

/**
 * The offer for a card the user wrote themselves and keeps skipping.
 * Returns { skipCount } when it should show, otherwise null.
 * Library cards never get it: they keep the colour shift.
 */
export function getCommitmentOffer(card, events = [], now = new Date()) {
  if (!card || card.sourcePackId || isCommitmentLikeCard(card)) return null;
  if (card.paused || card.deletedAt) return null;

  const skipCount = countConsecutiveSkips(card, events);
  if (skipCount < OFFER_SKIP_THRESHOLD) return null;

  const nowMs = new Date(now).getTime();
  const declinedRecently = (events ?? []).some(
    (event) =>
      event?.event_type === COMMITMENT_OFFER_EVENTS.DECLINED &&
      event.card_id === card.id &&
      nowMs - new Date(event.created_at).getTime() < OFFER_SUPPRESS_MS,
  );
  if (declinedRecently) return null;

  return { skipCount };
}

/** The line shown above the offer buttons, with the real count. */
export function getCommitmentOfferLine(skipCount) {
  return `You've skipped this card ${skipCount} times.`;
}

/**
 * Composer draft for turning a card into a commitment. The words are the
 * user's own card text; the reason is theirs to write, so it starts empty.
 */
export function buildCommitmentDraftFromCard(card) {
  return {
    cardKind: "commitment",
    promptText: card?.promptText ?? "",
    commitmentReason: "",
    theme: card?.theme,
    icon: card?.icon ?? "heart",
  };
}
