import { getLauncherConfig } from "./launcherRegistry.js";

// Structured destination resolution for fake launchers. Kept free of
// browser-only imports so node test scripts can exercise it directly.

function debugLog() {}

export function getLauncherPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || navigator.vendor || "";
  const isAndroid = /android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isAndroid) return "android";
  if (isIOS) return "ios";
  return "desktop";
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function normalizeWebHref(value) {
  if (!value) return "";
  return value.startsWith("x-safari-") ? value.replace(/^x-safari-/, "") : value;
}

const DESTINATION_STRATEGIES = {
  iosAppUrl: "ios_app_url",
  appUrl: "app_url",
  nativeAppUrl: "native_app_url",
  androidIntentUrl: "android_intent",
  webFallbackUrl: "web_fallback",
  iosWebFallbackUrl: "ios_web_fallback",
  androidWebFallbackUrl: "android_web_fallback",
  manualUrl: "manual_url",
};

function pickDestination(merged, fields, { stripXSafari = false } = {}) {
  for (const field of fields) {
    const value = merged[field];
    if (typeof value !== "string" || !value.trim()) continue;
    const href = stripXSafari ? normalizeWebHref(value) : value;
    return { href, sourceField: field, strategy: DESTINATION_STRATEGIES[field] ?? field };
  }
  return null;
}

export function getAndroidIntentBrowserFallback(intentUrl) {
  const match = /S\.browser_fallback_url=([^;]+)/.exec(intentUrl ?? "");
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

// Returns where "Continue to app" should go and how that destination was
// chosen, so callers can log the strategy and react to a missing destination
// instead of silently doing nothing.
export function resolveLauncherDestination(version, { preferFastDestination = false, preferDirectAppDestination = false, platform } = {}) {
  const resolvedPlatform = platform ?? getLauncherPlatform();
  const empty = {
    href: "",
    platform: resolvedPlatform,
    strategy: "missing",
    fallbackHref: "",
    usedXSafariPrefix: false,
    sourceField: null,
  };
  if (!version) return empty;

  const launcher = getLauncherConfig(version.id) ?? getLauncherConfig(version.type);
  const merged = { ...(launcher ?? {}), ...(version ?? {}) };

  let picked = null;
  let fallbackHref = "";

  if (preferDirectAppDestination) {
    picked = pickDestination(merged, ["appUrl", "manualUrl"]);
  }

  if (preferFastDestination) {
    if (merged.id === "safari" && resolvedPlatform === "ios") {
      picked = pickDestination(merged, ["iosAppUrl", "manualUrl", "webFallbackUrl"]);
    }
    if (!picked) {
      picked = pickDestination(
        merged,
        ["webFallbackUrl", "iosWebFallbackUrl", "androidWebFallbackUrl", "manualUrl"],
        { stripXSafari: true },
      );
    }
  }

  if (!picked && resolvedPlatform === "android") {
    // Critical safety: never return iOS-only Safari scheme on Android.
    picked = pickDestination(
      merged,
      ["androidIntentUrl", "androidWebFallbackUrl", "webFallbackUrl", "manualUrl"],
      { stripXSafari: true },
    );
    if (!picked) {
      picked = { href: "https://www.google.com", sourceField: null, strategy: "default_fallback" };
    }
  } else if (!picked && resolvedPlatform === "ios") {
    picked = merged.id === "safari"
      ? pickDestination(merged, ["iosAppUrl", "manualUrl", "webFallbackUrl"])
      : pickDestination(merged, ["iosAppUrl", "appUrl", "nativeAppUrl", "iosWebFallbackUrl", "webFallbackUrl", "manualUrl"]);
  } else if (!picked) {
    picked = pickDestination(merged, ["webFallbackUrl", "manualUrl", "androidWebFallbackUrl", "iosWebFallbackUrl"]);
  }

  if (picked?.strategy === "android_intent") {
    fallbackHref = getAndroidIntentBrowserFallback(picked.href);
  } else if (picked?.href && picked.strategy !== "web_fallback") {
    fallbackHref = normalizeWebHref(firstNonEmpty(
      resolvedPlatform === "android" ? merged.androidWebFallbackUrl : "",
      resolvedPlatform === "ios" ? merged.iosWebFallbackUrl : "",
      merged.webFallbackUrl,
    ));
    if (fallbackHref === picked.href) fallbackHref = "";
  }

  const resolution = {
    href: picked?.href ?? "",
    platform: resolvedPlatform,
    strategy: picked ? picked.strategy : "missing",
    fallbackHref,
    usedXSafariPrefix: Boolean(picked?.href?.startsWith("x-safari-")),
    sourceField: picked?.sourceField ?? null,
  };

  debugLog("[LAUNCHER_URL_RESOLVED]", {
    versionId: merged.id,
    platform: resolvedPlatform,
    href: resolution.href,
    strategy: resolution.strategy,
    sourceField: resolution.sourceField,
    preferFastDestination,
    preferDirectAppDestination,
  });

  return resolution;
}

export function getVersionOpenHref(version, { preferFastDestination = false, preferDirectAppDestination = false } = {}) {
  return resolveLauncherDestination(version, { preferFastDestination, preferDirectAppDestination }).href;
}

// Custom-scheme launches (instagram://, youtube://, x-safari-…) fail silently
// when the native app is missing: location.assign() does nothing visible and
// the launcher button appears dead. Those launches need a timed web fallback.
// http(s) destinations always navigate, and intent:// URLs carry their own
// S.browser_fallback_url handled by Android — neither needs the timer.
export function shouldUseTimedWebFallback(href) {
  if (typeof href !== "string" || !href.trim()) return false;
  if (/^https?:\/\//i.test(href)) return false;
  if (/^intent:\/\//i.test(href)) return false;
  return true;
}
