import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE_APP_LAUNCHERS, buildManifestForLauncher } from "../src/lib/launcherRegistry.js";
import { BASE, BASE_NO_SLASH } from "../src/lib/basePath.js";

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
    <link rel="stylesheet" href="${BASE}install/install.css" />
    <title>${escapeHtml(launcher.displayName)} · myBishBash</title>
  </head>
  <body>
    <main class="install-shell">
      <header class="install-brand">
        <img class="install-brand-logo" src="${BASE}icons/mybishbash-logo-mark.png" alt="" />
        <h1>myBishBash</h1>
        <p>reminders, commitments and prompts before the apps you already open</p>
      </header>
      <section class="install-card">
        <a data-launch-link class="install-icon-link" href="${BASE_NO_SLASH}${launcher.launchPath}" aria-label="Open ${escapeHtml(launcher.displayName)} with myBishBash">
          <img data-install-icon class="install-icon" src="${launcher.iconSrc}" alt="${escapeHtml(launcher.displayName)} icon" />
        </a>
        <div class="install-copy">
          <h2>Set up <span data-version-name>${escapeHtml(launcher.displayName)}</span> with myBishBash</h2>
          <p>When you open <span data-version-name-inline>${escapeHtml(launcher.displayName)}</span> this way, myBishBash can appear first with the reminders, commitments and prompts you chose.</p>
        </div>
        <div class="install-steps" data-install-instructions>
          <section>
            <strong>iPhone</strong>
            <ol>
              <li>Open this page in Safari.</li>
              <li>Tap Share.</li>
              <li>Tap Add to Home Screen.</li>
              <li>Tap Add.</li>
            </ol>
          </section>
${buildSafariTabsNote(launcher)}          <section>
            <strong>Android</strong>
            <ol>
              <li>Open this page in Chrome.</li>
              <li>Tap the three dots.</li>
              <li>Tap Add to Home screen or Install app.</li>
              <li>Tap Add or Install.</li>
            </ol>
          </section>
        </div>
        <div class="install-fallback">
          <button type="button" class="install-copy-link-button" data-copy-setup-link>Copy setup link</button>
          <p>If you cannot see Share, copy this link and open it in Safari.</p>
          <p class="install-copy-status" data-copy-setup-status role="status" aria-live="polite"></p>
        </div>
        <div class="install-actions">
          <button type="button" class="install-back-button" data-install-back>Back</button>
          <button type="button" class="install-complete-button" data-install-complete>I’ve set it up</button>
        </div>
      </section>
    </main>
    <script src="${BASE}install/install.js"></script>
  </body>
</html>
`;
}

// MBB-22 (Lizzie, 2026-09-05). Continuing from the pause hands Safari a URL, and
// iOS opens a new Safari tab for every URL that arrives from another app; a
// Shortcut is the only way round it and was ruled out. So the Safari setup
// page says so plainly and points at Safari's own tidy-up setting. Rendered
// only for the safari launcher; every other install page is unchanged.
function buildSafariTabsNote(launcher) {
  if (launcher.id !== "safari") return "";
  return `          <section data-safari-tabs-note>
            <strong>Please note</strong>
            <p class="install-note">New Safari tabs will open when you continue to Safari from the pause screen. Consider setting Safari to tidy them for you: Settings &rarr; Safari &rarr; Close Tabs &rarr; After One Day (or After One Week if you like to keep tabs around).</p>
          </section>
`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return replacements[char];
  });
}
