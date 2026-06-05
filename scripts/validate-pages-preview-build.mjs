import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const previewOrigin = normalizeOrigin(process.env.PAGES_PREVIEW_ORIGIN || "https://drlizlondon.github.io");
const previewBasePath = normalizeBasePath(process.env.PAGES_PREVIEW_BASE_PATH || "/mybishbash-preview/");
const previewRoot = `${previewOrigin}${previewBasePath.replace(/\/$/, "")}`;

const appManifest = readJson("dist/manifest.webmanifest");
assert.equal(appManifest.name, "MyBishBash Test");
assert.equal(appManifest.start_url, `${previewRoot}/home`);
assert.equal(appManifest.scope, `${previewRoot}/`);

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
