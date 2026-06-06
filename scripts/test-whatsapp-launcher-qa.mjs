import assert from "node:assert/strict";
import { getLauncherConfig, mergeLauncherConfig, sanitizeLauncherUrl } from "../src/lib/launcherRegistry.js";

const whatsapp = getLauncherConfig("whatsapp");

assert.equal(whatsapp.enabled, false, "WhatsApp must stay disabled during QA");
assert.equal(whatsapp.hqVisible, true, "WhatsApp must stay visible in HQ during QA");

withNavigator(
  {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    vendor: "Apple Computer, Inc.",
    platform: "iPhone",
    maxTouchPoints: 5,
  },
  () => {
    assert.equal(resolveOpenHrefForTest(whatsapp), "https://api.whatsapp.com/send");
    assert.equal(resolveOpenHrefForTest(whatsapp, { preferFastDestination: true }), "https://api.whatsapp.com/send");
  },
);

withNavigator(
  {
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
    vendor: "Google Inc.",
    platform: "Linux armv81",
    maxTouchPoints: 5,
  },
  () => {
    const href = resolveOpenHrefForTest(whatsapp);
    assert.equal(href, whatsapp.androidIntentUrl);
    assert.match(href, /^intent:\/\/send\/#Intent;scheme=whatsapp;package=com\.whatsapp;/);
    assert.match(href, /S\.browser_fallback_url=https%3A%2F%2Fapi\.whatsapp\.com%2Fsend;end$/);
    assert.equal(resolveOpenHrefForTest(whatsapp, { preferFastDestination: true }), "https://api.whatsapp.com/send");
  },
);

withNavigator(
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    vendor: "Google Inc.",
    platform: "MacIntel",
    maxTouchPoints: 0,
  },
  () => {
    assert.equal(resolveOpenHrefForTest(whatsapp), "https://api.whatsapp.com/send");
  },
);

const cloudOverrideTryingToEnableUnknown = mergeLauncherConfig(whatsapp, {
  iosAppUrl: "whatsapp://",
  webFallbackUrl: "javascript:alert(1)",
  androidIntentUrl: whatsapp.androidIntentUrl,
});
assert.equal(cloudOverrideTryingToEnableUnknown.iosAppUrl, whatsapp.iosAppUrl);
assert.equal(cloudOverrideTryingToEnableUnknown.webFallbackUrl, whatsapp.webFallbackUrl);
assert.equal(cloudOverrideTryingToEnableUnknown.androidIntentUrl, whatsapp.androidIntentUrl);
assert.equal(sanitizeLauncherUrl("whatsapp://"), "");

console.log("WhatsApp launcher QA destination checks passed.");

function withNavigator(navigatorValue, callback) {
  const existing = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: navigatorValue,
  });

  try {
    callback();
  } finally {
    if (existing) Object.defineProperty(globalThis, "navigator", existing);
    else delete globalThis.navigator;
  }
}

function resolveOpenHrefForTest(version, { preferFastDestination = false } = {}) {
  const platform = getLauncherPlatformForTest();

  if (preferFastDestination) {
    const href = normalizeWebHref(firstNonEmpty(
      version.webFallbackUrl,
      version.iosWebFallbackUrl,
      version.androidWebFallbackUrl,
      version.manualUrl,
    ));
    if (href) return href;
  }

  if (platform === "android") {
    return firstNonEmpty(
      version.androidIntentUrl,
      version.androidWebFallbackUrl,
      version.webFallbackUrl,
      version.manualUrl,
    ) || "https://www.google.com";
  }

  if (platform === "ios") {
    return firstNonEmpty(
      version.iosAppUrl,
      version.appUrl,
      version.nativeAppUrl,
      version.iosWebFallbackUrl,
      version.webFallbackUrl,
      version.manualUrl,
    );
  }

  return firstNonEmpty(
    version.webFallbackUrl,
    version.manualUrl,
    version.androidWebFallbackUrl,
    version.iosWebFallbackUrl,
  );
}

function getLauncherPlatformForTest() {
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
