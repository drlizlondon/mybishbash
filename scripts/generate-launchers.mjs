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
    <title>${escapeHtml(launcher.displayName)} · MyBishBash</title>
  </head>
  <body>
    <main class="install-shell">
      <header class="install-brand">
        <svg viewBox="0 0 32 32" class="install-heart" aria-hidden="true"><path d="M16 27s-9-6-12-11c-3-5 0-11 6-11 3 0 5 1 6 4 1-3 3-4 6-4 6 0 9 6 6 11-3 5-12 11-12 11z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1>MyBishBash</h1>
        <p>private little messages from your earlier self</p>
      </header>
      <section class="install-card">
        <img data-install-icon class="install-icon" src="${launcher.iconSrc}" alt="${escapeHtml(launcher.displayName)} icon" />
        <div class="install-copy">
          <h2 data-version-name>${escapeHtml(launcher.displayName)}</h2>
          <p>Tap Share, then Add to Home Screen.</p>
          <p class="install-note">This launcher uses launcherContext "<span data-launcher-context>${launcher.id}</span>" and the same shared MyBishBash state.</p>
        </div>
        <div class="install-steps">
          <strong>Install</strong>
          <p>Tap Share, then Add to Home Screen.</p>
        </div>
        <a data-settings-link class="install-settings-link" href="/mybishbash/settings">Back to MyBishBash settings</a>
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
