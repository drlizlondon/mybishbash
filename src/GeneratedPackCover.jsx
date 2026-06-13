// Typography-first auto covers. The cover is a deterministic publishing
// system: title + pack id + optional card count in, premium deck cover out.
// Uploaded artwork remains an optional override handled by callers.

const COVER_PALETTES = [
  { name: "charcoal-cream", bg: "#211f1d", bg2: "#3b3732", ink: "#fff8ec", muted: "#d8cab4", accent: "#f0c46b", accent2: "#7e7568" },
  { name: "navy-blush", bg: "#111d32", bg2: "#263b5d", ink: "#fff3ef", muted: "#e5b9b0", accent: "#f2a8a0", accent2: "#6f87ac" },
  { name: "rust-sand", bg: "#5a2b1f", bg2: "#9d5b38", ink: "#fff4df", muted: "#ecd0a7", accent: "#f2c078", accent2: "#351a14" },
  { name: "plum-ivory", bg: "#2f193d", bg2: "#654177", ink: "#fff7e9", muted: "#dcc6e4", accent: "#d8a4f0", accent2: "#f1d78b" },
  { name: "forest-mist", bg: "#1f3a32", bg2: "#496c5f", ink: "#f4fff8", muted: "#bdd8c8", accent: "#9ee0bd", accent2: "#d7eadb" },
  { name: "ink-copper", bg: "#16191f", bg2: "#343941", ink: "#fff5ea", muted: "#c5b8aa", accent: "#c7804c", accent2: "#74655a" },
  { name: "aubergine-linen", bg: "#392132", bg2: "#73495f", ink: "#fff6ed", muted: "#e6c7d5", accent: "#efb86f", accent2: "#a77996" },
  { name: "teal-parchment", bg: "#173f43", bg2: "#2f7273", ink: "#fbf0d8", muted: "#c9dfd9", accent: "#f3cd75", accent2: "#8ec9c5" },
  { name: "espresso-rose", bg: "#30221e", bg2: "#67403e", ink: "#fff2ed", muted: "#e1c4bb", accent: "#e89a93", accent2: "#9f6d57" },
  { name: "midnight-gold", bg: "#101522", bg2: "#28364f", ink: "#fff6d9", muted: "#c4cce0", accent: "#e9c968", accent2: "#607090" },
  { name: "olive-paper", bg: "#343a27", bg2: "#69724c", ink: "#fff8e6", muted: "#d5d6b8", accent: "#c8d27a", accent2: "#969c72" },
  { name: "claret-shell", bg: "#4b1f2e", bg2: "#8b4656", ink: "#fff5ef", muted: "#ecc6c4", accent: "#f1ad7e", accent2: "#c97086" },
  { name: "slate-celadon", bg: "#24313a", bg2: "#52646b", ink: "#f3fff8", muted: "#c2d5d5", accent: "#a7d8be", accent2: "#859aa0" },
  { name: "cocoa-blue", bg: "#332721", bg2: "#5b463d", ink: "#f4fbff", muted: "#d4c7bd", accent: "#93bee8", accent2: "#8a776b" },
  { name: "black-vermillion", bg: "#171412", bg2: "#3a2721", ink: "#fff3e5", muted: "#d2c0ac", accent: "#ee6f4d", accent2: "#826f63" },
  { name: "indigo-sage", bg: "#202344", bg2: "#434a78", ink: "#f9fff1", muted: "#c7cbe6", accent: "#bad77f", accent2: "#8b92c4" },
];

const COVER_LAYOUTS = [
  "large-title",
  "deck-title",
  "split",
  "centered",
  "editorial-block",
  "minimal",
  "masthead",
  "stacked",
];

const COVER_TEXTURES = [
  "grain",
  "paper",
  "soft-gradient",
  "line-field",
  "geometry",
  "vignette",
];

const COVER_ACCENTS = [
  "frame",
  "rules",
  "corners",
  "circle",
  "underline",
  "rail",
];

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(list, seed, offset) {
  return list[Math.floor(seed / offset) % list.length];
}

function compactText(text, limit) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}...`;
}

function getCoverParts(pack) {
  const cardCount = pack?.cardCount ?? pack?.entries?.length ?? 0;
  return {
    title: compactText(pack?.title || "Untitled Pack", 56),
    cardCount,
  };
}

export default function GeneratedPackCover({ pack, variant = "grid", className = "" }) {
  const seed = hashSeed(pack?.id ?? pack?.title);
  const palette = pick(COVER_PALETTES, seed, 1);
  const layout = variant === "thumb" ? "large-title" : pick(COVER_LAYOUTS, seed, 17);
  const texture = pick(COVER_TEXTURES, seed, 97);
  const accent = pick(COVER_ACCENTS, seed, 433);
  const angle = 112 + (seed % 64);
  const spotX = 12 + ((seed >>> 5) % 76);
  const spotY = 10 + ((seed >>> 11) % 58);
  const { title, cardCount } = getCoverParts(pack);
  const variantClass = variant === "bare" ? "bare" : variant;
  const cardCountLabel = cardCount > 0 ? `${cardCount} ${cardCount === 1 ? "card" : "cards"}` : "";

  return (
    <div
      className={[
        "generated-cover",
        `generated-cover-${variantClass}`,
        `generated-cover-layout-${layout}`,
        `generated-cover-texture-${texture}`,
        `generated-cover-accent-${accent}`,
        className,
      ].filter(Boolean).join(" ")}
      data-testid="generated-cover"
      data-cover-palette={palette.name}
      data-cover-layout={layout}
      data-cover-texture={texture}
      data-cover-accent={accent}
      style={{
        "--cover-bg": palette.bg,
        "--cover-bg-2": palette.bg2,
        "--cover-ink": palette.ink,
        "--cover-muted": palette.muted,
        "--cover-accent": palette.accent,
        "--cover-accent-2": palette.accent2,
        "--cover-angle": `${angle}deg`,
        "--cover-spot-x": `${spotX}%`,
        "--cover-spot-y": `${spotY}%`,
      }}
      aria-hidden="true"
    >
      <span className="generated-cover-accent-layer" aria-hidden="true" />
      <span className="generated-cover-deck" aria-hidden="true">
        <span className="generated-cover-card generated-cover-card-back" />
        <span className="generated-cover-card generated-cover-card-front">
          <span className="generated-cover-heart">♡</span>
        </span>
      </span>
      <span className="generated-cover-copy">
        <span className="generated-cover-kicker">MyBishBash</span>
        <span className="generated-cover-title">{title}</span>
        {cardCountLabel ? <span className="generated-cover-count">{cardCountLabel}</span> : null}
      </span>
    </div>
  );
}
