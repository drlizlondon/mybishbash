import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FAKE_APP_LAUNCHERS,
  assertKnownLauncherId,
  buildManifestForLauncher,
  mergeLauncherConfig,
  mergeLauncherConfigs,
} from "../src/lib/launcherRegistry.js";

const root = resolve(import.meta.dirname, "..");
const requiredFields = [
  "id",
  "displayName",
  "realAppLabel",
  "category",
  "installPath",
  "launchPath",
  "manifestPath",
  "iconSrc",
  "nativeAppUrl",
  "webFallbackUrl",
  "defaultInterruptionPackId",
  "enabled",
  "hqVisible",
];

for (const launcher of FAKE_APP_LAUNCHERS) {
  for (const field of requiredFields) {
    assert.notEqual(launcher[field], undefined, `${launcher.id} missing ${field}`);
  }

  if (!launcher.enabled) continue;

  assert.match(launcher.installPath, new RegExp(`^/mybishbash/install/${launcher.id}/$`));
  assert.equal(launcher.launchPath, `/intercept/${launcher.id}`);
  assert.equal(launcher.manifestPath, `/mybishbash/launchers/${launcher.id}/manifest.webmanifest`);
  assert.equal(buildManifestForLauncher(launcher).start_url, `https://drlizlondon.github.io/mybishbash/intercept/${launcher.id}`);

  const manifestPath = resolve(root, "public", "launchers", launcher.id, "manifest.webmanifest");
  const installPath = resolve(root, "public", "install", launcher.id, "index.html");
  assert.equal(existsSync(manifestPath), true, `${launcher.id} manifest file missing`);
  assert.equal(existsSync(installPath), true, `${launcher.id} install page missing`);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.start_url, `https://drlizlondon.github.io/mybishbash/intercept/${launcher.id}`);
  assert.equal(manifest.scope, "https://drlizlondon.github.io/mybishbash/");
  assert.equal(manifest.display, "standalone");

  const installHtml = readFileSync(installPath, "utf8");
  assert.match(installHtml, new RegExp(`launcherContext "<span data-launcher-context>${launcher.id}</span>"`));
}

const normalLaunchEvent = { event_type: "app_opened", route: "/home" };
assert.notEqual(normalLaunchEvent.event_type, "fake_launcher_opened");

const safari = FAKE_APP_LAUNCHERS.find((launcher) => launcher.id === "safari");
const instagram = FAKE_APP_LAUNCHERS.find((launcher) => launcher.id === "instagram");
assert.equal(
  safari.webFallbackUrl,
  "https://www.google.com",
  "Safari desktop fallback defaults to Google as the browsing/search destination",
);
assert.equal(
  safari.iosAppUrl,
  "x-safari-https://www.google.com",
  "Safari uses x-safari for the iOS app URL default",
);
assert.doesNotMatch(
  [safari.webFallbackUrl, safari.androidWebFallbackUrl, safari.iosWebFallbackUrl, safari.iosAppUrl, safari.manualUrl].join("\n"),
  /apple\.com\/safari/i,
  "Safari must not default to the Apple Safari marketing page",
);
const safariWithEmptyCloudFields = mergeLauncherConfig(safari, {
  displayName: "",
  iosAppUrl: "",
  androidIntentUrl: "",
  webFallbackUrl: "",
  manualUrl: "",
  enabled: undefined,
  hqVisible: undefined,
});
assert.equal(safariWithEmptyCloudFields.displayName, safari.displayName);
assert.equal(safariWithEmptyCloudFields.iosAppUrl, safari.iosAppUrl);
assert.equal(safariWithEmptyCloudFields.webFallbackUrl, safari.webFallbackUrl);
assert.equal(safariWithEmptyCloudFields.manualUrl, safari.manualUrl);
assert.equal(safariWithEmptyCloudFields.enabled, true);
assert.equal(safariWithEmptyCloudFields.hqVisible, true);

const instagramWithEmptyCloudFields = mergeLauncherConfig(instagram, {
  appUrl: "",
  iosAppUrl: "",
  androidIntentUrl: "",
  webFallbackUrl: "",
});
assert.equal(instagramWithEmptyCloudFields.appUrl, instagram.appUrl);
assert.equal(instagramWithEmptyCloudFields.iosAppUrl, instagram.iosAppUrl);
assert.equal(instagramWithEmptyCloudFields.androidIntentUrl, instagram.androidIntentUrl);
assert.equal(instagramWithEmptyCloudFields.webFallbackUrl, instagram.webFallbackUrl);

const launchersWithUnknownCloudConfig = mergeLauncherConfigs([
  {
    id: "tiktok",
    displayName: "TikTok",
    enabled: true,
    hqVisible: true,
    webFallbackUrl: "https://www.tiktok.com",
  },
  {
    id: "instagram",
    displayName: "Instagram Test Name",
  },
]);
assert.equal(
  launchersWithUnknownCloudConfig.some((launcher) => launcher.id === "tiktok"),
  false,
  "Unknown HQ launcher config IDs must not become live launchers",
);
assert.equal(
  launchersWithUnknownCloudConfig.find((launcher) => launcher.id === "instagram")?.displayName,
  "Instagram Test Name",
  "Known HQ launcher configs should still override supported launchers",
);

assert.throws(
  () => assertKnownLauncherId("tiktok"),
  /Only supported launcher IDs can be saved as live launcher configs/,
  "Unknown launcher IDs must be rejected before Supabase save",
);

const syncSource = readFileSync(resolve(root, "src", "lib", "mybishbashSync.js"), "utf8");
assert.match(syncSource, /withTimeout\(query,\s*1200,\s*\{ data: \[\], error: null \}/);

console.log(`Validated ${FAKE_APP_LAUNCHERS.length} launchers.`);
