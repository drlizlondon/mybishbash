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
  "tester fake launcher clicks start a launcher interception session",
  /if \(testerStatus\?\.is_tester === true\) \{[\s\S]{0,420}beginInterceptionFlow\(versionId,[\s\S]{0,180}source,[\s\S]{0,80}replace: true,[\s\S]{0,80}navigate: true/g,
);

assertPattern(
  "non-tester fake launcher clicks still open real destinations",
  /openDestinationApp\(versionId,[\s\S]{0,100}source,[\s\S]{0,120}reason: "fake_launcher_icon_clicked"/g,
);

const interceptRouteCalls = [...appSource.matchAll(/if \(route\.kind === "intercept"\)[\s\S]{0,5000}beginInterceptionFlow\(route\.versionId,[\s\S]{0,240}source:\s*isResumeInterceptLaunch \? "home_screen_resume" : "route"/g)].map((match) =>
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

if (!/const preferFastDestination = reason === "fake_launcher_icon_clicked";[\s\S]{0,120}getVersionOpenHref\(version,\s*\{\s*preferFastDestination\s*\}\)/.test(appSource)) {
  fail("fake launcher icon clicks must prefer fast app-capable destinations before slow native deep links");
} else {
  pass("fake launcher icon clicks prefer fast app-capable destinations before slow native deep links");
}

if (failures.length > 0) {
  console.error(`\nFake launcher destination checks failed: ${failures.length}`);
  process.exit(1);
}

console.log("\nFake launcher destination checks passed");
