import assert from "node:assert/strict";
import {
  getAndroidIntentBrowserFallback,
  getVersionOpenHref,
  resolveLauncherDestination,
  shouldUseTimedWebFallback,
} from "../src/lib/launcherDestinations.js";
import { FAKE_APP_LAUNCHERS } from "../src/lib/launcherRegistry.js";

const byId = Object.fromEntries(FAKE_APP_LAUNCHERS.map((launcher) => [launcher.id, launcher]));

// ── iOS Safari continues via the "Open Safari" shortcut (MBB-21) ─────────────
// x-safari-… hands Safari a URL and iOS opens a NEW tab for every hand-off;
// the shortcut (Open App → Safari) brings Safari forward on its last tab.

const OPEN_SAFARI_SHORTCUT_HREF = "shortcuts://run-shortcut?name=Open%20Safari";

const safariIos = resolveLauncherDestination(byId.safari, { platform: "ios" });
assert.equal(safariIos.href, OPEN_SAFARI_SHORTCUT_HREF);
assert.equal(safariIos.strategy, "ios_app_url");
assert.equal(safariIos.sourceField, "iosAppUrl");
assert.equal(safariIos.usedXSafariPrefix, false);
assert.equal(safariIos.platform, "ios");
assert.equal(safariIos.fallbackHref, "https://www.google.com", "a missing shortcut must still have a web fallback");

// The pause screen's Continue button (preferDirectAppDestination) takes the same
// shortcut route on iOS, and the manual "App didn't open?" link keeps x-safari.
const safariContinue = resolveLauncherDestination(byId.safari, { platform: "ios", preferDirectAppDestination: true });
assert.equal(safariContinue.href, OPEN_SAFARI_SHORTCUT_HREF);
assert.equal(safariContinue.sourceField, "iosAppUrl");
assert.equal(byId.safari.manualUrl, "x-safari-https://www.google.com");

// The shortcut scheme must never leak to Android or desktop.
const safariContinueAndroid = resolveLauncherDestination(byId.safari, { platform: "android", preferDirectAppDestination: true });
assert.notEqual(safariContinueAndroid.href, OPEN_SAFARI_SHORTCUT_HREF);
assert.equal(shouldUseTimedWebFallback(OPEN_SAFARI_SHORTCUT_HREF), true, "shortcuts:// needs the timed web fallback");

// The fast web path strips x-safari so it stays safe outside standalone Safari shells.
const safariFast = resolveLauncherDestination(byId.safari, { platform: "desktop", preferFastDestination: true });
assert.equal(safariFast.href, "https://www.google.com");
assert.equal(safariFast.usedXSafariPrefix, false);

// x-safari must never leak to Android, even from a bad HQ config.
const safariAndroid = resolveLauncherDestination(
  { ...byId.safari, androidIntentUrl: "", androidWebFallbackUrl: "x-safari-https://www.google.com" },
  { platform: "android" },
);
assert.equal(safariAndroid.href, "https://www.google.com");
assert.equal(safariAndroid.usedXSafariPrefix, false);

// ── Android uses intent URLs with their browser fallback preserved ──────────

const youtubeAndroid = resolveLauncherDestination(byId.youtube, { platform: "android" });
assert.equal(youtubeAndroid.strategy, "android_intent");
assert.equal(youtubeAndroid.sourceField, "androidIntentUrl");
assert.match(youtubeAndroid.href, /^intent:\/\/www\.youtube\.com/);
assert.equal(youtubeAndroid.fallbackHref, "https://www.youtube.com");

const chromeAndroid = resolveLauncherDestination(byId.chrome, { platform: "android" });
assert.equal(chromeAndroid.strategy, "android_intent");
assert.equal(chromeAndroid.fallbackHref, "https://www.google.com");

assert.equal(getAndroidIntentBrowserFallback(byId.instagram.androidIntentUrl), "https://www.instagram.com");
assert.equal(getAndroidIntentBrowserFallback("intent://x/#Intent;scheme=https;end"), "");

// ── iOS app URLs with web fallback recorded ──────────────────────────────────

const instagramIos = resolveLauncherDestination(byId.instagram, { platform: "ios" });
assert.equal(instagramIos.href, "instagram://app");
assert.equal(instagramIos.strategy, "ios_app_url");
assert.equal(instagramIos.fallbackHref, "https://www.instagram.com");

const youtubeIos = resolveLauncherDestination(byId.youtube, { platform: "ios" });
assert.equal(youtubeIos.href, "youtube://");
assert.equal(youtubeIos.fallbackHref, "https://www.youtube.com");

// ── Desktop uses the web fallback ────────────────────────────────────────────

for (const id of ["safari", "instagram", "youtube", "chrome", "whatsapp"]) {
  const resolution = resolveLauncherDestination(byId[id], { platform: "desktop" });
  assert.equal(resolution.strategy, "web_fallback", `${id} desktop should use web fallback`);
  assert.equal(resolution.sourceField, "webFallbackUrl");
  assert.notEqual(resolution.href, "", `${id} desktop must resolve a destination`);
}

// ── Missing destinations are reported, never silently succeed ───────────────

const missing = resolveLauncherDestination({ id: "unknown-app" }, { platform: "ios" });
assert.equal(missing.href, "");
assert.equal(missing.strategy, "missing");
assert.equal(missing.sourceField, null);

const missingDesktop = resolveLauncherDestination({ id: "unknown-app" }, { platform: "desktop" });
assert.equal(missingDesktop.strategy, "missing");

assert.equal(resolveLauncherDestination(null, { platform: "ios" }).strategy, "missing");

// Android keeps its long-standing hard default rather than going nowhere.
const missingAndroid = resolveLauncherDestination({ id: "unknown-app" }, { platform: "android" });
assert.equal(missingAndroid.href, "https://www.google.com");
assert.equal(missingAndroid.strategy, "default_fallback");

// ── Back-compat wrapper ──────────────────────────────────────────────────────

assert.equal(getVersionOpenHref(byId.instagram), resolveLauncherDestination(byId.instagram).href);

// ── Timed web fallback for silent custom-scheme failures ────────────────────
// Custom schemes fail silently when the native app is missing; http(s) always
// navigates and intent:// embeds its own Android fallback.

assert.equal(shouldUseTimedWebFallback("instagram://app"), true, "native scheme needs timed fallback");
assert.equal(shouldUseTimedWebFallback("youtube://"), true, "native scheme needs timed fallback");
assert.equal(shouldUseTimedWebFallback("x-safari-https://www.google.com"), true, "x-safari needs timed fallback (iOS <17)");
assert.equal(shouldUseTimedWebFallback("googlechromes://www.google.com"), true);
assert.equal(shouldUseTimedWebFallback("https://www.instagram.com"), false, "https never needs the timer");
assert.equal(shouldUseTimedWebFallback("http://example.com"), false);
assert.equal(
  shouldUseTimedWebFallback("intent://www.youtube.com/#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com;end"),
  false,
  "intent URLs carry their own fallback",
);
assert.equal(shouldUseTimedWebFallback(""), false);
assert.equal(shouldUseTimedWebFallback(null), false);

// Every static launcher whose iOS pick is a custom scheme must also resolve a
// usable web fallback, otherwise the timed recovery has nowhere to go.
for (const launcher of FAKE_APP_LAUNCHERS) {
  const resolution = resolveLauncherDestination(launcher, { platform: "ios" });
  if (shouldUseTimedWebFallback(resolution.href)) {
    assert.ok(
      /^https:\/\//.test(resolution.fallbackHref) || /^https:\/\//.test(resolution.href.replace(/^x-safari-/, "")),
      `${launcher.id}: iOS custom-scheme destination has no https fallback (href=${resolution.href}, fallback=${resolution.fallbackHref})`,
    );
  }
}

console.log("Destination resolver checks passed");
