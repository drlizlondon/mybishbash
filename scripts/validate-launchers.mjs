import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FAKE_APP_LAUNCHERS,
  assertKnownLauncherId,
  buildManifestForLauncher,
  mergeLauncherConfig,
  mergeLauncherConfigs,
  sanitizeLauncherUrl,
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
const launcherIds = FAKE_APP_LAUNCHERS.map((launcher) => launcher.id);
const liveLauncherIds = ["safari", "youtube", "instagram"];
const acceptedPhaseTwoLauncherIds = ["chrome", "reddit", "linkedin", "whatsapp", "bbc-news", "duolingo"];

assert.equal(new Set(launcherIds).size, launcherIds.length, "Launcher IDs must be unique");
for (const id of acceptedPhaseTwoLauncherIds) {
  assert.equal(launcherIds.includes(id), true, `${id} should be a supported code-reviewed launcher`);
}
assert.equal(launcherIds.includes("tiktok"), false, "TikTok should wait for a follow-up branch");
assert.equal(launcherIds.includes("hinge"), false, "Hinge should wait for a follow-up branch");

for (const id of liveLauncherIds) {
  const launcher = FAKE_APP_LAUNCHERS.find((item) => item.id === id);
  assert.equal(launcher?.enabled, true, `${id} should remain enabled`);
  assert.equal(launcher?.availabilityStatus, "public", `${id} should remain publicly available`);
  assert.equal(launcher?.hqVisible, true, `${id} should remain visible in HQ`);
}

for (const id of acceptedPhaseTwoLauncherIds) {
  const launcher = FAKE_APP_LAUNCHERS.find((item) => item.id === id);
  assert.equal(launcher?.enabled, false, `${id} should stay disabled until icon/device QA`);
  assert.equal(launcher?.availabilityStatus, "hidden", `${id} should stay hidden from users until icon/device QA`);
  assert.equal(launcher?.hqVisible, true, `${id} should stay visible in HQ for review`);
}

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
  assert.match(
    installHtml,
    new RegExp(`Add [\\s\\S]{0,120}${escapeRegExp(launcher.displayName)}[\\s\\S]{0,120} to your Home Screen`),
  );
  assert.match(
    installHtml,
    new RegExp(`MyBishBash will show your Personal Cards before [\\s\\S]{0,120}${escapeRegExp(launcher.displayName)}`),
  );
}

const normalLaunchEvent = { event_type: "app_opened", route: "/home" };
assert.notEqual(normalLaunchEvent.event_type, "fake_launcher_opened");

const safari = FAKE_APP_LAUNCHERS.find((launcher) => launcher.id === "safari");
const instagram = FAKE_APP_LAUNCHERS.find((launcher) => launcher.id === "instagram");
const whatsapp = FAKE_APP_LAUNCHERS.find((launcher) => launcher.id === "whatsapp");
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

assert.equal(whatsapp.enabled, false, "WhatsApp must remain disabled until manual iPhone QA passes");
assert.equal(whatsapp.hqVisible, true, "WhatsApp should remain visible in HQ for manual QA");
assert.equal(whatsapp.iosAppUrl, "https://api.whatsapp.com/send");
assert.equal(whatsapp.iosWebFallbackUrl, "https://api.whatsapp.com/send");
assert.equal(whatsapp.webFallbackUrl, "https://api.whatsapp.com/send");
assert.equal(whatsapp.manualUrl, "https://api.whatsapp.com/send");
assert.match(whatsapp.androidIntentUrl, /^intent:\/\/send\/#Intent;scheme=whatsapp;package=com\.whatsapp;/);
assert.match(whatsapp.androidIntentUrl, /S\.browser_fallback_url=https%3A%2F%2Fapi\.whatsapp\.com%2Fsend;end$/);
assert.equal(whatsapp.androidWebFallbackUrl, "https://api.whatsapp.com/send");
assert.equal(whatsapp.qaDestinationCandidates?.preferred, "https://api.whatsapp.com/send");
assert.equal(whatsapp.qaDestinationCandidates?.fallback, "https://api.whatsapp.com/send");
assert.equal(
  whatsapp.qaDestinationCandidates?.ios?.includes("whatsapp://"),
  true,
  "WhatsApp QA candidates should document whatsapp:// without making it the default runtime URL",
);
assert.equal(
  whatsapp.qaDestinationCandidates?.ios?.includes("https://web.whatsapp.com/"),
  true,
  "WhatsApp QA candidates should keep web.whatsapp.com documented as a weak iPhone comparison case",
);

const whatsappManifestPath = resolve(root, "public", "launchers", "whatsapp", "manifest.webmanifest");
const whatsappInstallPath = resolve(root, "public", "install", "whatsapp", "index.html");
assert.equal(existsSync(whatsappManifestPath), true, "WhatsApp manifest file missing");
assert.equal(existsSync(whatsappInstallPath), true, "WhatsApp install page missing");
const whatsappManifest = JSON.parse(readFileSync(whatsappManifestPath, "utf8"));
assert.equal(whatsappManifest.start_url, "https://drlizlondon.github.io/mybishbash/intercept/whatsapp");
assert.equal(whatsappManifest.display, "standalone");
assert.match(
  readFileSync(whatsappInstallPath, "utf8"),
  /Add [\s\S]{0,120}WhatsApp[\s\S]{0,120} to your Home Screen/,
);

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

assert.equal(sanitizeLauncherUrl("googlechromes://www.google.com"), "googlechromes://www.google.com");
assert.equal(sanitizeLauncherUrl("https://api.whatsapp.com/send"), "https://api.whatsapp.com/send");
assert.equal(sanitizeLauncherUrl("https://wa.me/"), "https://wa.me/");
assert.equal(sanitizeLauncherUrl(whatsapp.androidIntentUrl), whatsapp.androidIntentUrl);
assert.equal(sanitizeLauncherUrl("whatsapp://"), "");
assert.equal(sanitizeLauncherUrl("tiktok://"), "");
assert.equal(sanitizeLauncherUrl("hinge://"), "");

assert.throws(
  () => assertKnownLauncherId("tiktok"),
  /Only supported launcher IDs can be saved as live launcher configs/,
  "Unknown launcher IDs must be rejected before Supabase save",
);

const syncSource = readFileSync(resolve(root, "src", "lib", "mybishbashSync.js"), "utf8");
assert.match(syncSource, /withTimeout\(query,\s*1200,\s*\{ data: \[\], error: null \}/);
assert.match(
  syncSource,
  /isMissingColumnError\(error\)[\s\S]{0,300}upsert\(legacyPayload\)/,
  "Launcher config saves must fall back to legacy columns when the availability migration is missing",
);
assert.match(
  syncSource,
  /availability_status: availabilityStatus/,
  "Launcher config saves must persist the availability status",
);
assert.match(
  syncSource,
  /availabilityStatus: row\.availability_status/,
  "Launcher config fetches must map the availability status when present",
);

const appSource = readFileSync(resolve(root, "src", "App.jsx"), "utf8");
assert.match(
  appSource,
  /return getAvailableLaunchersForUser\(\{\s*launchers: candidates,\s*testerStatus,\s*context: LAUNCHER_CONTEXTS\.FAKE_LAUNCHER_BAR,\s*\}\);/,
  "Fake launcher bar options must come from the central availability selector",
);
assert.match(
  appSource,
  /installableHomeScreenVersions = Object\.values\(homeScreenVersions\)\.filter\([\s\S]{0,300}version\.id === "mybishbash" \|\|\s*isLauncherVisibleInContext\(version, \{ testerStatus: settingsTesterStatus, context: LAUNCHER_CONTEXTS\.SETTINGS \}\)/,
  "Settings install options must come from the central availability selector",
);
assert.match(
  appSource,
  /const selectedPreviewVersion = installableHomeScreenVersions\.some/,
  "Settings preview must fall back when the selected launcher is disabled",
);

console.log(`Validated ${FAKE_APP_LAUNCHERS.length} launchers.`);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
