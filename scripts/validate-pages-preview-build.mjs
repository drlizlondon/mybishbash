import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const previewOrigin = normalizeOrigin(process.env.PAGES_PREVIEW_ORIGIN || "https://drlizlondon.github.io");
const previewBasePath = normalizeBasePath(process.env.PAGES_PREVIEW_BASE_PATH || "/mybishbash-preview/");
const previewAppName = process.env.PAGES_PREVIEW_APP_NAME || "MyBishBash Test";
const previewRoot = `${previewOrigin}${previewBasePath.replace(/\/$/, "")}`;
const expectedSourceSha = process.env.VITE_SOURCE_SHA || process.env.GITHUB_SHA || gitSourceSha();

const appManifest = readJson("dist/manifest.webmanifest");
assert.equal(appManifest.name, previewAppName);
assert.equal(appManifest.start_url, `${previewRoot}/home`);
assert.equal(appManifest.scope, `${previewRoot}/`);

const appHtml = readFileSync("dist/index.html", "utf8");
assert.match(
  appHtml,
  new RegExp(`<meta\\s+[^>]*name=["']apple-mobile-web-app-title["'][^>]*content=["']${escapeRegExp(previewAppName)}["']`, "i"),
);
assert.match(appHtml, new RegExp(`<title>${escapeRegExp(previewAppName)}</title>`, "i"));

const appBundlePath = appHtml.match(/src="\/mybishbash-preview\/([^"]+index-[^"]+\.js)"/)?.[1];
assert.ok(appBundlePath, "index.html references the preview app bundle");
const appBundle = readFileSync(`dist/${appBundlePath}`, "utf8");
assert.match(appBundle, /continue-to-app-card/);
assert.match(appBundle, /CONTINUE-TO-APP DISPLAYED|routing to ContinueToAppCard/);

for (const launcherId of ["safari", "youtube", "instagram"]) {
  const manifest = readJson(`dist/launchers/${launcherId}/manifest.webmanifest`);
  assert.match(manifest.name, /MyBishBash Test$/);
  assert.equal(manifest.start_url, `${previewRoot}/intercept/${launcherId}`);
  assert.equal(manifest.scope, `${previewRoot}/`);
}

const safariInstall = readFileSync("dist/install/safari/index.html", "utf8");
assert.match(safariInstall, new RegExp(`href="${escapeRegExp(previewBasePath)}launchers/safari/manifest\\.webmanifest"`));
assert.match(safariInstall, new RegExp(`href="${escapeRegExp(previewBasePath)}intercept/safari"`));

const previewBuild = readJson("dist/preview-build.json");
assert.equal(previewBuild.homeUrl, `${previewRoot}/home`);
assert.equal(previewBuild.safariInstallUrl, `${previewRoot}/install/safari/`);
assert.equal(previewBuild.safariStartUrl, `${previewRoot}/intercept/safari`);
assert.equal(previewBuild.sourceSha, expectedSourceSha);
assert.match(previewBuild.sourceVersion, new RegExp(escapeRegExp(expectedSourceSha)));

const version = readJson("dist/version.json");
assert.equal(version.sourceSha, expectedSourceSha);
assert.match(version.version, new RegExp(escapeRegExp(expectedSourceSha)));
assert.match(appBundle, new RegExp(escapeRegExp(version.version)));

const serviceWorker = readFileSync("dist/service-worker.js", "utf8");
assert.match(serviceWorker, /const APP_BASE = "\/mybishbash-preview\/";/);
assert.match(serviceWorker, new RegExp(`const SERVICE_WORKER_VERSION = "preview-${escapeRegExp(expectedSourceSha)}";`));
assert.match(serviceWorker, /\$\{APP_BASE\.replace\(\/\\\/\$\/, ""\)\}\$\{normalizedRoute\}/);
assert.doesNotMatch(serviceWorker, /url\.pathname = `\/mybishbash\$\{normalizedRoute\}`/);

console.log(`Preview build validated for ${previewRoot}/`);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeOrigin(value) {
  return String(value).replace(/\/+$/, "");
}

function normalizeBasePath(value) {
  const withLeading = String(value).startsWith("/") ? String(value) : `/${value}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gitSourceSha() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
