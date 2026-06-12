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

// Palettes for generated covers (docs/explore-architecture.md K2). Generated
// covers are the standard cover system; uploaded artwork is an optional
// override. Pairs are chosen for AA contrast of `ink` on the gradient.
export const GOAL_STYLES = {
  Confidence: { from: "#8c3b2e", to: "#54200f", highlight: "rgba(255, 158, 110, 0.5)", ink: "#ffefe6" },
  Focus: { from: "#2b3147", to: "#14182a", highlight: "rgba(120, 140, 255, 0.35)", ink: "#e8ecff" },
  Calm: { from: "#5d6e54", to: "#3a4634", highlight: "rgba(214, 232, 201, 0.42)", ink: "#f2f7ec" },
  Create: { from: "#5c3a66", to: "#341d3e", highlight: "rgba(216, 160, 255, 0.4)", ink: "#f6ebfd" },
  Health: { from: "#2e6b5e", to: "#17443a", highlight: "rgba(126, 224, 196, 0.38)", ink: "#e7faf3" },
  Relationships: { from: "#9c4a5e", to: "#5e2434", highlight: "rgba(255, 170, 190, 0.42)", ink: "#ffedf1" },
};

export const DEFAULT_GOAL_STYLE = { from: "#4a4542", to: "#27221f", highlight: "rgba(243, 214, 203, 0.38)", ink: "#fbf7f2" };

export function getGoalStyle(goal) {
  return GOAL_STYLES[goal?.trim?.() ?? goal] ?? DEFAULT_GOAL_STYLE;
}
