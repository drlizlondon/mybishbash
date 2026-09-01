function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

export function logCommitmentDebug(label, payload = {}) {
  const entry = {
    label,
    payload,
    at: new Date().toISOString(),
  };
  debugLog(`[COMMITMENT_CARD] ${label}`, payload);
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const stored = JSON.parse(window.localStorage.getItem("mybishbash.commitmentDebug.v1") || "[]");
    stored.push(entry);
    if (stored.length > 100) stored.splice(0, stored.length - 100);
    window.localStorage.setItem("mybishbash.commitmentDebug.v1", JSON.stringify(stored));
    window.__MYBISHBASH_COMMITMENT_DEBUG = stored;
  } catch {
    // Debug logging must never block the card flow.
  }
}
