import assert from "node:assert/strict";
import {
  getAndroidIntentBrowserFallback,
  getVersionOpenHref,
  resolveLauncherDestination,
} from "../src/lib/launcherDestinations.js";
import { FAKE_APP_LAUNCHERS } from "../src/lib/launcherRegistry.js";

const byId = Object.fromEntries(FAKE_APP_LAUNCHERS.map((launcher) => [launcher.id, launcher]));

// ── iOS Safari keeps its x-safari strategy ───────────────────────────────────

const safariIos = resolveLauncherDestination(byId.safari, { platform: "ios" });
assert.equal(safariIos.href, "x-safari-https://www.google.com");
assert.equal(safariIos.strategy, "ios_app_url");
assert.equal(safariIos.sourceField, "iosAppUrl");
assert.equal(safariIos.usedXSafariPrefix, true);
assert.equal(safariIos.platform, "ios");

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

console.log("Destination resolver checks passed");
