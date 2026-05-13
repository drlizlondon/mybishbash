import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FAKE_APP_LAUNCHERS, buildManifestForLauncher } from "../src/lib/launcherRegistry.js";

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

console.log(`Validated ${FAKE_APP_LAUNCHERS.length} launchers.`);
