import { getGoalStyle } from "./lib/packGoals";

// The standard cover system (docs/explore-architecture.md K). Every pack
// renders one of these unless HQ uploads a custom cover override — a missing
// upload is not an incomplete pack. Goal picks the palette; the pack id seeds
// gradient angle and highlight position so a catalogue of generated covers
// varies without per-pack configuration.
//
// Variants:
//   grid   — hook quote as the centrepiece, title in small caps (cover cards)
//   detail — title-focused (the quote already appears in "A taste" below)
//   bare   — background only (hero overlays its own copy; Library thumbnails)

function hashSeed(value) {
  let hash = 0;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getHookQuote(pack) {
  const entries = pack.entries ?? [];
  const hook = entries.find((entry) => entry.isPreview) ?? entries[0];
  const text = hook?.promptText ?? "";
  if (text.length <= 90) return text;
  return `${text.slice(0, 89).trimEnd()}…`;
}

export default function GeneratedPackCover({ pack, variant = "grid", className = "" }) {
  const palette = getGoalStyle(pack.goal);
  const seed = hashSeed(pack.id ?? pack.title);
  const angle = 115 + (seed % 51);
  const spotX = 12 + (seed % 71);
  const spotY = 8 + ((seed >> 3) % 34);
  const quote = variant === "grid" ? getHookQuote(pack) : "";

  return (
    <div
      className={`generated-cover generated-cover-${variant} ${className}`.trim()}
      data-testid="generated-cover"
      style={{
        background: `radial-gradient(circle at ${spotX}% ${spotY}%, ${palette.highlight}, transparent 62%), linear-gradient(${angle}deg, ${palette.from}, ${palette.to})`,
        color: palette.ink,
      }}
      aria-hidden="true"
    >
      {variant === "grid" ? (
        <>
          {quote ? <span className="generated-cover-quote">“{quote}”</span> : <span className="generated-cover-headline">{pack.title}</span>}
          {quote ? <span className="generated-cover-title">{pack.title}</span> : null}
        </>
      ) : null}
      {variant === "detail" ? (
        <>
          <span className="generated-cover-headline">{pack.title}</span>
          {pack.goal ? <span className="generated-cover-goal">{pack.goal}</span> : null}
        </>
      ) : null}
    </div>
  );
}
