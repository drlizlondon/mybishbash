// Pipe-delimited card import format used by the HQ pack editor.
//
//   Card text | attribution | source title | source URL
//
// A leading "*" marks the card as a preview card — one of the up-to-three
// "a taste" cards shown on the Explore pack cover before install.

export function parseImportedCards(rawText) {
  return (rawText ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const isPreview = line.startsWith("*");
      const body = isPreview ? line.slice(1).trim() : line;
      const [promptText, attribution = "", sourceTitle = "", sourceUrl = ""] = body.split("|");
      return {
        promptText: promptText.trim(),
        attribution: attribution.trim(),
        sourceTitle: sourceTitle.trim(),
        sourceUrl: sourceUrl.trim(),
        isPreview,
        frequency: "once_daily",
        timingWindows: ["morning", "day", "evening"],
      };
    })
    .filter((entry) => entry.promptText);
}

export function formatImportedCard(entry) {
  // Fields are positional, so interior empties must be kept (text || Notes),
  // only trailing empties dropped — otherwise a card with a source title but
  // no attribution would shift fields when re-parsed.
  const fields = [entry.promptText ?? "", entry.attribution ?? "", entry.sourceTitle ?? "", entry.sourceUrl ?? ""];
  while (fields.length > 1 && !fields[fields.length - 1]) fields.pop();
  const line = fields.join(" | ");
  return entry.isPreview ? `* ${line}` : line;
}
