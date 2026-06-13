// HQ-curated goal list for Explore sections (docs/explore-architecture.md B6).
// The database column is free text so adding a goal never needs a migration;
// this list is what the HQ form offers and what Explore renders, in order.
// Rule: a goal only renders in Explore once it holds >= 2 published packs.

export const PACK_GOALS = [
  "Confidence",
  "Focus",
  "Calm",
  "Create",
  "Health",
  "Relationships",
];

export const PACK_CONTENT_TYPES = [
  { id: "cards", label: "Card pack" },
  { id: "commitments", label: "Commitment templates" },
  { id: "do_instead", label: "Do Instead cards" },
];

export const MIN_PACKS_PER_GOAL_SECTION = 2;
