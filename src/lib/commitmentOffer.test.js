import { describe, expect, it } from "vitest";
import {
  getCommitmentOffer,
  getCommitmentOfferLine,
  COMMITMENT_OFFER_EVENTS,
  OFFER_SUPPRESS_MS,
} from "./commitmentOffer";
import { checkCardIsSpiced } from "./spicedCards";

const NOW = new Date("2026-11-02T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();

function ignores(cardId, count) {
  return Array.from({ length: count }, (_, i) => ({
    event_type: "card_ignored",
    card_id: cardId,
    action_taken: "ignored",
    created_at: daysAgo(count - i + 20),
  }));
}

const ownCard = (overrides = {}) => ({ id: "own", cardKind: "personal", promptText: "write one line", sourcePackId: null, ...overrides });

describe("commitment offer trigger (B4)", () => {
  it("shows for your own card after 3 ignores, with the real count", () => {
    expect(getCommitmentOffer(ownCard(), ignores("own", 3), NOW)).toEqual({ skipCount: 3 });
    expect(getCommitmentOffer(ownCard(), ignores("own", 5), NOW)).toEqual({ skipCount: 5 });
    expect(getCommitmentOfferLine(5)).toBe("You've skipped this card 5 times.");
  });

  it("does not show for 2 ignores, or after a completion resets the run", () => {
    expect(getCommitmentOffer(ownCard(), ignores("own", 2), NOW)).toBeNull();
    const events = [
      ...ignores("own", 3),
      { event_type: "card_completed", card_id: "own", created_at: daysAgo(1) },
    ];
    expect(getCommitmentOffer(ownCard(), events, NOW)).toBeNull();
  });

  it("never shows for a library card, which still gets the colour shift rule", () => {
    const library = ownCard({ id: "lib", sourcePackId: "pack-1" });
    const events = ignores("lib", 3);
    expect(getCommitmentOffer(library, events, NOW)).toBeNull();
    expect(checkCardIsSpiced(library, events)).toBe(true);
  });

  it("never shows for a commitment card", () => {
    const commitment = ownCard({ id: "c", cardKind: "commitment" });
    expect(getCommitmentOffer(commitment, ignores("c", 4), NOW)).toBeNull();
  });

  it("does not show for a paused or deleted card", () => {
    expect(getCommitmentOffer(ownCard({ paused: true }), ignores("own", 3), NOW)).toBeNull();
    expect(getCommitmentOffer(ownCard({ deletedAt: daysAgo(1) }), ignores("own", 3), NOW)).toBeNull();
  });

  it("stays away for 14 days after Not now: declined 5 days ago hides it, 15 days ago does not", () => {
    const declined = (n) => ({
      event_type: COMMITMENT_OFFER_EVENTS.DECLINED,
      card_id: "own",
      created_at: daysAgo(n),
    });
    expect(OFFER_SUPPRESS_MS).toBe(14 * DAY);
    expect(getCommitmentOffer(ownCard(), [...ignores("own", 5), declined(5)], NOW)).toBeNull();
    expect(getCommitmentOffer(ownCard(), [...ignores("own", 5), declined(15)], NOW)).toEqual({ skipCount: 5 });
  });

  it("a decline on a different card does not suppress this one", () => {
    const other = { event_type: COMMITMENT_OFFER_EVENTS.DECLINED, card_id: "other", created_at: daysAgo(1) };
    expect(getCommitmentOffer(ownCard(), [...ignores("own", 3), other], NOW)).toEqual({ skipCount: 3 });
  });

  it("offer events themselves do not break or extend the skip run", () => {
    const shown = { event_type: COMMITMENT_OFFER_EVENTS.SHOWN, card_id: "own", created_at: daysAgo(1) };
    expect(getCommitmentOffer(ownCard(), [...ignores("own", 3), shown], NOW)).toEqual({ skipCount: 3 });
  });

  it("counts one Not done as one skip, not two (bash_not_done twin of card_ignored)", () => {
    const pair = (n) => [
      { event_type: "bash_not_done", card_id: "own", action_taken: "dismissed", created_at: daysAgo(n) },
      { event_type: "card_ignored", card_id: "own", action_taken: "ignored", created_at: daysAgo(n), metadata: { legacyEventType: "bash_not_done" } },
    ];
    expect(getCommitmentOffer(ownCard(), [...pair(3), ...pair(2)], NOW)).toBeNull();
    expect(getCommitmentOffer(ownCard(), [...pair(3), ...pair(2), ...pair(1)], NOW)).toEqual({ skipCount: 3 });
  });
});
