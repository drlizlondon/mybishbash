const COVER_PALETTES = [
  { name: "plum", bg: "#2f193d", bg2: "#654177", ink: "#fff7e9", muted: "#dcc6e4" },
  { name: "navy", bg: "#111d32", bg2: "#263b5d", ink: "#fff3ef", muted: "#c7d3ec" },
  { name: "teal", bg: "#173f43", bg2: "#2f7273", ink: "#fbf0d8", muted: "#c9dfd9" },
  { name: "forest", bg: "#1f3a32", bg2: "#496c5f", ink: "#f4fff8", muted: "#bdd8c8" },
  { name: "burgundy", bg: "#4b1f2e", bg2: "#8b4656", ink: "#fff5ef", muted: "#ecc6c4" },
  { name: "copper", bg: "#5a2b1f", bg2: "#9d5b38", ink: "#fff4df", muted: "#ecd0a7" },
  { name: "charcoal", bg: "#211f1d", bg2: "#3b3732", ink: "#fff8ec", muted: "#d8cab4" },
  { name: "midnight-blue", bg: "#101522", bg2: "#28364f", ink: "#fff6d9", muted: "#c4cce0" },
];

export const DEFAULT_COVER_PALETTE = COVER_PALETTES[6];
const DEFAULT_TITLE = "Untitled Pack";

export function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cleanText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function usefulTagline(text) {
  const clean = cleanText(text);
  if (clean.length < 16) return "";
  if (clean.split(/\s+/).length < 3) return "";
  return clean;
}

export function getCoverTagline(pack) {
  return usefulTagline(pack?.description);
}

export function getCardCount(pack) {
  const explicit = Number(pack?.cardCount);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  if (Array.isArray(pack?.entries)) return pack.entries.length;
  if (Array.isArray(pack?.cards)) return pack.cards.length;
  return 0;
}

export function getCoverStatusBadge(pack, { isActive = false, locked = false } = {}) {
  if (pack?.comingSoon || pack?.isComingSoon || locked) return "COMING SOON";
  if (isActive || pack?.isInstalled || pack?.isActive) return "✓ Added";
  return "+ Add";
}

function lineScore(lines) {
  const lengths = lines.map((line) => line.length);
  const longest = Math.max(...lengths);
  const shortest = Math.min(...lengths);
  return longest - shortest + longest * 0.08 + lines.length * 0.4;
}

function greedyLines(words, lineCount) {
  if (lineCount <= 1) return [words.join(" ")];
  const totalChars = words.reduce((sum, word) => sum + word.length, 0) + Math.max(0, words.length - 1);
  const target = Math.ceil(totalChars / lineCount);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= target || lines.length >= lineCount - 1) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function splitTitleIntoLines(title) {
  const clean = cleanText(title || DEFAULT_TITLE) || DEFAULT_TITLE;
  const words = clean.split(" ").filter(Boolean);
  if (words.length <= 1) return [clean];

  const maxLines = clean.length <= 18 ? 2 : clean.length <= 42 ? 3 : clean.length <= 72 ? 4 : 5;
  let best = [clean];

  for (let lineCount = 2; lineCount <= Math.min(maxLines, words.length); lineCount += 1) {
    const candidate = greedyLines(words, lineCount);
    if (candidate.join(" ") !== clean) continue;
    if (candidate.length > maxLines) continue;
    if (best.length === 1 || lineScore(candidate) < lineScore(best)) best = candidate;
  }

  return best;
}

function getTitleMetrics(lines, variant) {
  const safeLines = Array.isArray(lines) && lines.length > 0 ? lines.filter(Boolean) : [DEFAULT_TITLE];
  const longestLine = Math.max(...safeLines.map((line) => String(line).length), 1);
  const lineCount = Math.max(safeLines.length, 1);
  const widthLimit = 150 / longestLine;
  const heightLimit = (variant === "detail" ? 42 : 33) / lineCount;
  const baseLimit = variant === "detail" ? 13.5 : 12.5;
  const size = Math.max(4.8, Math.min(baseLimit, widthLimit, heightLimit));
  const scale = size >= 11 ? "short" : size >= 8.5 ? "medium" : size >= 6.5 ? "long" : "extra-long";
  return { scale, size };
}

export function getCoverModel(pack, { variant = "grid", isActive = false, locked = false } = {}) {
  const title = cleanText(pack?.title || DEFAULT_TITLE) || DEFAULT_TITLE;
  const seed = hashSeed(pack?.id ?? title);
  const palette = COVER_PALETTES[seed % COVER_PALETTES.length] ?? DEFAULT_COVER_PALETTE;
  const template = seed % 6;
  const cardCount = getCardCount(pack);
  const titleLines = splitTitleIntoLines(title).filter(Boolean);
  const titleMetrics = getTitleMetrics(titleLines, variant);
  const shouldShowTagline = variant === "detail";

  return {
    title,
    template,
    initial: title.trim().charAt(0).toUpperCase() || "M",
    titleLines: titleLines.length > 0 ? titleLines : [DEFAULT_TITLE],
    titleScale: titleMetrics.scale || "medium",
    titleSize: `${Number.isFinite(titleMetrics.size) ? titleMetrics.size.toFixed(2) : "9.00"}cqw`,
    tagline: shouldShowTagline ? getCoverTagline(pack) : "",
    cardCount,
    cardCountLabel: variant === "detail" && cardCount > 0 ? `${cardCount} ${cardCount === 1 ? "CARD" : "CARDS"}` : "",
    statusBadge: getCoverStatusBadge(pack, { isActive, locked }),
    palette,
    angle: 128 + (seed % 34),
    spotX: 18 + ((seed >>> 5) % 56),
    spotY: 12 + ((seed >>> 11) % 54),
  };
}
