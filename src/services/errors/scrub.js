// Pure scrubbing helpers for client error telemetry (Phase 1).
// No app imports, no side effects — fully unit-testable in Node.
//
// Reports must never contain tokens, emails, access codes or user content.
// Query strings and hashes are stripped because handoff references and access
// codes travel in them. JWT- and email-shaped strings are redacted from
// message and stack as defence in depth.

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const QUERY_OR_HASH_PATTERN = /([?#])[^\s'")\]]+/g;

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LENGTH = 6000;

export function scrubText(text, maxLength) {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const scrubbed = raw
    .replace(JWT_PATTERN, "[jwt]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(QUERY_OR_HASH_PATTERN, "$1[redacted]");
  return typeof maxLength === "number" && maxLength >= 0 ? scrubbed.slice(0, maxLength) : scrubbed;
}

// Stable per-error identity used for session dedupe: same kind + message +
// first stack line collapse into one signature.
export function getErrorSignature(report) {
  const message = String(report?.message ?? "").slice(0, 120);
  const firstStackLine = String(report?.stack ?? "").split("\n")[0] ?? "";
  return `${report?.kind ?? "unknown"}|${message}|${firstStackLine}`;
}

export function buildErrorReport({ error, kind, release = "", platform = "", pathname = "", userAgent = "" } = {}) {
  const message = error && typeof error === "object" && "message" in error && error.message != null
    ? error.message
    : error;
  const stack = error && typeof error === "object" && typeof error.stack === "string" ? error.stack : "";
  // pathname only — never query or hash.
  const route = String(pathname ?? "").split("?")[0].split("#")[0];

  return {
    kind: String(kind ?? "unknown"),
    message: scrubText(message, MAX_MESSAGE_LENGTH) || "unknown error",
    stack: scrubText(stack, MAX_STACK_LENGTH),
    route,
    release: String(release ?? ""),
    platform: String(platform ?? ""),
    user_agent: String(userAgent ?? "").slice(0, 300),
  };
}
