function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

function isLaunchDebugEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("bishbash.launchDebug.enabled") === "true";
}

export function debugLaunch(label, payload) {
  if (!isLaunchDebugEnabled()) return;
  debugLog(label, payload);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = JSON.parse(window.localStorage.getItem("bishbash.launchDebug.v1") || "[]");
      stored.push({ label, payload, at: new Date().toISOString() });
      if (stored.length > 100) {
        stored.splice(0, stored.length - 100);
      }
      window.localStorage.setItem("bishbash.launchDebug.v1", JSON.stringify(stored));
    }
  } catch (e) {
    // ignore storage errors
  }
}

export function getCardOverlayRenderKey(overlay, activeCardId = null) {
  return [
    overlay?.type ?? "none",
    overlay?.versionId ?? "",
    overlay?.activationKey ?? "",
    overlay?.cardId ?? "",
    overlay?.packId ?? "",
    overlay?.flowStep ?? "",
    activeCardId ?? "",
  ].join(":");
}
