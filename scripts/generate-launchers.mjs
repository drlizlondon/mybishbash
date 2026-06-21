import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE_APP_LAUNCHERS, buildManifestForLauncher } from "../src/lib/launcherRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = resolve(root, "public");

for (const launcher of FAKE_APP_LAUNCHERS) {
  writeManifest(launcher);
  writeInstallPage(resolve(publicDir, "install", launcher.id, "index.html"), launcher);
  writeInstallPage(resolve(publicDir, launcher.id, "index.html"), launcher);
}

writeFileSync(
  resolve(publicDir, "launchers", "registry.json"),
  `${JSON.stringify({ launchers: FAKE_APP_LAUNCHERS }, null, 2)}\n`,
);

function writeManifest(launcher) {
  const manifest = buildManifestForLauncher(launcher);
  const manifestPath = resolve(publicDir, "launchers", launcher.id, "manifest.webmanifest");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeInstallPage(filePath, launcher) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buildInstallHtml(launcher));
}

function buildInstallHtml(launcher) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#F7F2EE" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(launcher.displayName)}" />
    <link rel="manifest" href="${launcher.manifestPath}" />
    <link rel="apple-touch-icon" href="${launcher.iconSrc}" />
    <link rel="stylesheet" href="/mybishbash/install/install.css" />
    <title>${escapeHtml(launcher.displayName)} · myBishBash</title>
  </head>
  <body>
    <main class="install-shell">
      <header class="install-brand">
        <img class="install-brand-logo" src="/mybishbash/icons/mybishbash-logo-mark.png" alt="" />
        <h1>myBishBash</h1>
        <p>phone triggers for the habits and commitments you want to keep</p>
      </header>
      <section class="install-card">
        <a data-launch-link class="install-icon-link" href="/mybishbash${launcher.launchPath}" aria-label="Open ${escapeHtml(launcher.displayName)} launcher">
          <img data-install-icon class="install-icon" src="${launcher.iconSrc}" alt="${escapeHtml(launcher.displayName)} icon" />
        </a>
        <div class="install-copy">
          <h2>Add <span data-version-name>${escapeHtml(launcher.displayName)}</span> with myBishBash</h2>
          <p>Add this version to your Home Screen. Use it instead of the original <span data-version-name-inline>${escapeHtml(launcher.displayName)}</span> icon when you want myBishBash to appear first.</p>
        </div>
        <div class="install-steps">
          <strong>Install panel</strong>
          <p>Tap Share, then Add to Home Screen.</p>
        </div>
        <div class="install-actions">
          <button type="button" class="install-back-button" data-install-back>Back</button>
          <button type="button" class="install-complete-button" data-install-complete>I’ve added it</button>
        </div>
        <div class="install-success" data-install-success hidden>
          <strong>You’re in.</strong>
          <p>Open your new <span data-version-name-inline>${escapeHtml(launcher.displayName)}</span> icon from your Home Screen to see myBishBash before <span data-version-name-inline>${escapeHtml(launcher.displayName)}</span> opens.</p>
        </div>
      </section>
    </main>
    <script src="/mybishbash/install/install.js"></script>
  </body>
</html>
`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return replacements[char];
  });
}
