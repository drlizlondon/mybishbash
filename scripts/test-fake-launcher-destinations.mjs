import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

const failures = [];

function normalizeSnippet(snippet) {
  return snippet.replace(/\s+/g, " ").trim();
}

function matchingSnippets(pattern) {
  return [...appSource.matchAll(pattern)].map((match) => normalizeSnippet(match[0]));
}

function findCallWithSource(functionName, source) {
  const pattern = new RegExp(`${functionName}\\([\\s\\S]{0,400}source:\\s*"${source}"[\\s\\S]{0,200}?\\)`, "g");
  return [...appSource.matchAll(pattern)].map((match) => normalizeSnippet(match[0]));
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message, offendingSource = null) {
  failures.push({ message, offendingSource });
  console.error(`FAIL ${message}`);
  if (offendingSource) {
    console.error(`  Offending source: ${offendingSource}`);
  }
}

function assertPattern(message, pattern) {
  const matches = matchingSnippets(pattern);
  if (matches.length === 0) {
    fail(message);
    return;
  }
  pass(message);
}

function assertInAppLauncherUsesSharedHandler(source) {
  const handlerCalls = matchingSnippets(new RegExp(`handleFakeLauncherLaunch\\(versionId, "${source}"\\)`, "g"));
  if (handlerCalls.length === 0) {
    fail(`${source} must use handleFakeLauncherLaunch`);
    return;
  }

  pass(`${source} uses handleFakeLauncherLaunch`);
}

assertInAppLauncherUsesSharedHandler("home_fake_launcher_bar");
assertInAppLauncherUsesSharedHandler("overlay_fake_launcher");
assertInAppLauncherUsesSharedHandler("settings_fake_launcher");

assertPattern(
  "in-app fake launcher sources are separated from installed launcher entries",
  /const IN_APP_SHORTCUT_SOURCES = new Set\(\[[\s\S]{0,180}"home_fake_launcher_bar"[\s\S]{0,180}"overlay_fake_launcher"[\s\S]{0,180}"settings_fake_launcher"[\s\S]{0,120}\]\);[\s\S]{0,260}const INSTALLED_FAKE_LAUNCHER_ENTRY_SOURCES = new Set\(\[[\s\S]{0,180}"route"[\s\S]{0,180}"home_screen_resume"[\s\S]{0,180}"standalone_home_recovery"/g,
);

assertPattern(
  "in-app fake launcher clicks still open real destinations",
  /function handleFakeLauncherLaunch\(versionId, source\) \{[\s\S]{0,260}if \(!isInAppShortcutClick\(source\)\)[\s\S]{0,420}openDestinationApp\(versionId,[\s\S]{0,100}source,[\s\S]{0,120}reason: "fake_launcher_icon_clicked"/g,
);

for (const source of ["home_fake_launcher_bar", "overlay_fake_launcher", "settings_fake_launcher"]) {
  const calls = findCallWithSource("beginInterceptionFlow", source);
  if (calls.length > 0) {
    fail(`${source} must not call beginInterceptionFlow`, calls[0]);
  } else {
    pass(`${source} does not call beginInterceptionFlow`);
  }
}

if (/if \(testerStatus\?\.is_tester === true\) \{[\s\S]{0,420}beginInterceptionFlow\(versionId/.test(appSource)) {
  fail("tester in-app fake launcher clicks must not start a launcher interception session");
} else {
  pass("tester in-app fake launcher clicks do not start a launcher interception session");
}

const interceptRouteCalls = [...appSource.matchAll(/if \(route\.kind === "intercept"\)[\s\S]{0,7000}beginInterceptionFlow\(route\.versionId,[\s\S]{0,240}source:\s*isResumeInterceptLaunch \? "home_screen_resume" : "route"/g)].map((match) =>
  normalizeSnippet(match[0]),
);
if (interceptRouteCalls.length === 0) {
  fail("/intercept/:launcherId must still be allowed to call beginInterceptionFlow");
} else {
  pass("/intercept/:launcherId still enters beginInterceptionFlow");
}

const continueToAppCalls = [...appSource.matchAll(/onContinueToApp=\{\(versionId,\s*options\)\s*=>\s*openDestinationApp\(versionId,\s*options\)\}/g)].map((match) =>
  normalizeSnippet(match[0]),
);
if (continueToAppCalls.length === 0) {
  fail("continue-to-app must still use openDestinationApp");
} else {
  pass("continue-to-app still uses openDestinationApp");
}

if (!/window\.location\.assign\(href\)/.test(appSource)) {
  fail("openDestinationApp must still call window.location.assign(href)");
} else {
  pass("openDestinationApp still calls window.location.assign(href)");
}

if (!/const preferFastDestination = reason === "fake_launcher_icon_clicked";[\s\S]{0,160}resolveLauncherDestination\(version,\s*\{\s*preferFastDestination\s*\}\)/.test(appSource)) {
  fail("fake launcher icon clicks must prefer fast app-capable destinations before slow native deep links");
} else {
  pass("fake launcher icon clicks prefer fast app-capable destinations before slow native deep links");
}

// ── Final shell-matching guard ───────────────────────────────────────────────

if (!/if \(!isKnownLauncher\(versionId\)\) \{[\s\S]{0,200}return false;/.test(appSource)) {
  fail("openDestinationApp must refuse unsupported launcher IDs");
} else {
  pass("openDestinationApp refuses unsupported launcher IDs");
}

if (!/shouldBlockCrossAppLaunch\(\{ launchSession: effectiveLaunchSession, requestedLauncherId: versionId \}\)[\s\S]{0,900}fake_launcher_cross_app_blocked/.test(appSource)) {
  fail("openDestinationApp must block and log cross-app launches from fake launcher shells");
} else {
  pass("openDestinationApp blocks and logs cross-app launches from fake launcher shells");
}

if (!/fake_launcher_cross_app_blocked[\s\S]{0,400}requested_launcher_id[\s\S]{0,200}shell_launcher_id[\s\S]{0,200}launched_from[\s\S]{0,200}route/.test(appSource)) {
  fail("cross-app block events must include requested/shell launcher IDs, source and route metadata");
} else {
  pass("cross-app block events include requested/shell launcher IDs, source and route metadata");
}

// ── Missing destination handling ─────────────────────────────────────────────

if (!/if \(!href\) \{[\s\S]{0,600}fake_launcher_destination_missing[\s\S]{0,600}return false;/.test(appSource)) {
  fail("continue-to-app must log a missing destination instead of silently doing nothing");
} else {
  pass("continue-to-app logs a missing destination instead of silently doing nothing");
}

if (!/destination_strategy: resolution\.strategy/.test(appSource)) {
  fail("continue-to-app must log the resolved destination strategy");
} else {
  pass("continue-to-app logs the resolved destination strategy");
}

if (!/fake_launcher_pause_bypass_used/.test(appSource)) {
  fail("app pause bypasses must be logged");
} else {
  pass("app pause bypasses are logged");
}

if (failures.length > 0) {
  console.error(`\nFake launcher destination checks failed: ${failures.length}`);
  process.exit(1);
}

console.log("\nFake launcher destination checks passed");
