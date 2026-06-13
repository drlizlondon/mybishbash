const COVER_PALETTES = [
  { name: "charcoal-cream", bg: "#211f1d", bg2: "#3b3732", ink: "#fff8ec", muted: "#d8cab4", accent: "#f0c46b", accent2: "#7e7568" },
  { name: "navy-blush", bg: "#111d32", bg2: "#263b5d", ink: "#fff3ef", muted: "#e5b9b0", accent: "#f2a8a0", accent2: "#6f87ac" },
  { name: "plum-ivory", bg: "#2f193d", bg2: "#654177", ink: "#fff7e9", muted: "#dcc6e4", accent: "#d8a4f0", accent2: "#f1d78b" },
  { name: "forest-mist", bg: "#1f3a32", bg2: "#496c5f", ink: "#f4fff8", muted: "#bdd8c8", accent: "#9ee0bd", accent2: "#d7eadb" },
  { name: "ink-copper", bg: "#16191f", bg2: "#343941", ink: "#fff5ea", muted: "#c5b8aa", accent: "#c7804c", accent2: "#74655a" },
  { name: "aubergine-linen", bg: "#392132", bg2: "#73495f", ink: "#fff6ed", muted: "#e6c7d5", accent: "#efb86f", accent2: "#a77996" },
  { name: "teal-parchment", bg: "#173f43", bg2: "#2f7273", ink: "#fbf0d8", muted: "#c9dfd9", accent: "#f3cd75", accent2: "#8ec9c5" },
  { name: "midnight-gold", bg: "#101522", bg2: "#28364f", ink: "#fff6d9", muted: "#c4cce0", accent: "#e9c968", accent2: "#607090" },
  { name: "olive-paper", bg: "#343a27", bg2: "#69724c", ink: "#fff8e6", muted: "#d5d6b8", accent: "#c8d27a", accent2: "#969c72" },
  { name: "claret-shell", bg: "#4b1f2e", bg2: "#8b4656", ink: "#fff5ef", muted: "#ecc6c4", accent: "#f1ad7e", accent2: "#c97086" },
  { name: "slate-celadon", bg: "#24313a", bg2: "#52646b", ink: "#f3fff8", muted: "#c2d5d5", accent: "#a7d8be", accent2: "#859aa0" },
  { name: "black-vermillion", bg: "#171412", bg2: "#3a2721", ink: "#fff3e5", muted: "#d2c0ac", accent: "#ee6f4d", accent2: "#826f63" },
  { name: "indigo-sage", bg: "#202344", bg2: "#434a78", ink: "#f9fff1", muted: "#c7cbe6", accent: "#bad77f", accent2: "#8b92c4" },
];

const COVER_LAYOUTS = [
  "large-title",
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
  "underline",
  "rail",
];

export function hashSeed(value) {
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

function cleanText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function compactSentence(text, limit) {
  const clean = cleanText(text);
  if (clean.length <= limit) return clean;
  const boundary = clean.lastIndexOf(" ", limit - 1);
  if (boundary < Math.floor(limit * 0.55)) return clean.slice(0, limit - 1).trimEnd();
  return clean.slice(0, boundary).trimEnd();
}

function usefulTagline(text) {
  const clean = compactSentence(text, 92);
  if (clean.length < 16) return "";
  if (clean.split(/\s+/).length < 3) return "";
  return clean;
}

function entryText(entry) {
  return cleanText(entry?.promptText ?? entry?.text ?? entry?.title ?? "");
}

export function getCoverTagline(pack) {
  const fromDescription = usefulTagline(pack?.description);
  if (fromDescription) return fromDescription;

  const entries = Array.isArray(pack?.entries) ? pack.entries : Array.isArray(pack?.cards) ? pack.cards : [];
  for (const entry of entries.slice(0, 4)) {
    const tagline = usefulTagline(entryText(entry));
    if (tagline) return tagline;
  }
  return "";
}

export function getCardCount(pack) {
  const explicit = Number(pack?.cardCount);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  if (Array.isArray(pack?.entries)) return pack.entries.length;
  if (Array.isArray(pack?.cards)) return pack.cards.length;
  return 0;
}

export function getCoverStatusBadges(pack, { isActive = false, locked = false } = {}) {
  const badges = [];
  if (pack?.comingSoon || pack?.isComingSoon || locked) badges.push("COMING SOON");
  if (isActive || pack?.isInstalled || pack?.isActive) badges.push("INSTALLED");
  if (pack?.isNew || pack?.new) badges.push("NEW");
  if (pack?.isPopular || pack?.popular) badges.push("POPULAR");
  return [...new Set(badges)].slice(0, 3);
}

export function splitTitleIntoLines(title) {
  const clean = cleanText(title || "Untitled Pack");
  const words = clean.split(" ").filter(Boolean);
  const targetLines = clean.length <= 24 ? 2 : clean.length <= 46 ? 3 : 4;
  const maxLineLength = Math.ceil(clean.length / targetLines) + 4;
  const lines = [];
  let current = "";

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length <= maxLineLength || lines.length >= targetLines - 1) {
      current = `${current} ${word}`;
      return;
    }
    lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines.slice(0, 4);
}

export function getTitleScale(title) {
  const length = cleanText(title).length;
  if (length <= 22) return "short";
  if (length <= 48) return "medium";
  if (length <= 76) return "long";
  return "extra-long";
}

export function getCoverModel(pack, { variant = "grid", isActive = false, locked = false } = {}) {
  const title = cleanText(pack?.title || "Untitled Pack");
  const seed = hashSeed(`${pack?.id ?? ""}:${title}:${pack?.description ?? ""}:${entryText(pack?.entries?.[0] ?? pack?.cards?.[0])}`);
  const palette = pick(COVER_PALETTES, seed, 1);
  const layout = variant === "thumb" ? "large-title" : pick(COVER_LAYOUTS, seed, 17);
  const texture = pick(COVER_TEXTURES, seed, 97);
  const accent = pick(COVER_ACCENTS, seed, 433);
  const cardCount = getCardCount(pack);

  return {
    title,
    titleLines: splitTitleIntoLines(title),
    titleScale: getTitleScale(title),
    tagline: getCoverTagline(pack),
    cardCount,
    cardCountLabel: cardCount > 0 ? `${cardCount} ${cardCount === 1 ? "CARD" : "CARDS"}` : "",
    statusBadges: getCoverStatusBadges(pack, { isActive, locked }),
    palette,
    layout,
    texture,
    accent,
    angle: 112 + (seed % 64),
    spotX: 12 + ((seed >>> 5) % 76),
    spotY: 10 + ((seed >>> 11) % 58),
  };
}
