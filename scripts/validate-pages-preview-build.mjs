import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const previewOrigin = normalizeOrigin(process.env.PAGES_PREVIEW_ORIGIN || "https://drlizlondon.github.io");
const previewBasePath = normalizeBasePath(process.env.PAGES_PREVIEW_BASE_PATH || "/mybishbash-preview/");
const previewAppName = process.env.PAGES_PREVIEW_APP_NAME || "MyBishBash Test";
const previewShortName = process.env.PAGES_PREVIEW_SHORT_NAME || "MyBishBash Test";
const previewRoot = `${previewOrigin}${previewBasePath.replace(/\/$/, "")}`;
const expectedSourceSha = process.env.VITE_SOURCE_SHA || process.env.GITHUB_SHA || gitSourceSha();

const appManifest = readJson("dist/manifest.webmanifest");
assert.equal(appManifest.name, previewAppName);
assert.equal(appManifest.short_name, previewShortName);
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
assert.doesNotMatch(appBundle, /Getting your card ready/);
assert.doesNotMatch(appBundle, /One moment\./);

const launcherRegistry = readJson("dist/launchers/registry.json");
const supportedLauncherIds = launcherRegistry.launchers.map((launcher) => launcher.id);
assert.ok(supportedLauncherIds.length > 3, "preview validation should cover expanded supported launchers");

for (const launcherId of supportedLauncherIds) {
  const manifest = readJson(`dist/launchers/${launcherId}/manifest.webmanifest`);
  assert.match(manifest.name, /MyBishBash Test$/);
  assert.equal(manifest.start_url, `${previewRoot}/intercept/${launcherId}`);
  assert.equal(manifest.scope, `${previewRoot}/`);

  const installHtml = readFileSync(`dist/install/${launcherId}/index.html`, "utf8");
  assert.match(installHtml, new RegExp(`href="${escapeRegExp(previewBasePath)}launchers/${escapeRegExp(launcherId)}/manifest\\.webmanifest"`));
  assert.match(installHtml, new RegExp(`href="${escapeRegExp(previewBasePath)}intercept/${escapeRegExp(launcherId)}"`));
  assert.doesNotMatch(installHtml, /launcherContext|shared MyBishBash state/);

  const legacyShell = readFileSync(`dist/${launcherId}/index.html`, "utf8");
  assert.match(legacyShell, new RegExp(`href="${escapeRegExp(previewBasePath)}intercept/${escapeRegExp(launcherId)}"`));
  assert.match(legacyShell, /MyBishBash will show your Personal Cards before/);
  assert.doesNotMatch(legacyShell, /launcherContext|shared MyBishBash state/);
}

const installScript = readFileSync("dist/install/install.js", "utf8");
assert.match(installScript, /detectAppBasePath\(window\.location\.pathname\)/);
assert.match(installScript, /resolveLauncherIdFromPath\(window\.location\.pathname, registry, appBasePath\)/);
assert.match(installScript, /event_type: "launcher_navigation_resolved"/);
assert.doesNotMatch(installScript, /pathParts\[0\] === "mybishbash"/);
assert.doesNotMatch(installScript, /\["safari", "youtube", "instagram"\]/);
await validatePreviewSafariClick(installScript, previewRoot);

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

async function validatePreviewSafariClick(installScriptSource, previewRootUrl) {
  const storage = new Map();
  const launchLink = {
    href: "",
    addEventListener(eventName, handler) {
      if (eventName === "click") this.click = handler;
    },
  };
  const context = {
    console: { debug() {} },
    fetch: async () => ({
      ok: true,
      async json() {
        return {
          launchers: [
            {
              id: "safari",
              displayName: "Safari",
              name: "Safari",
              iconSrc: `${previewRootUrl}/icons/apple-touch-icon.png`,
              manifestPath: `${previewRootUrl}/launchers/safari/manifest.webmanifest`,
              launchPath: "/intercept/safari",
            },
          ],
        };
      },
    }),
    window: {
      location: {
        pathname: "/mybishbash-preview/safari/index.html",
        origin: previewOrigin,
        search: "",
      },
      matchMedia: () => ({ matches: false }),
      navigator: {},
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
      },
      sessionStorage: {
        getItem: () => null,
      },
    },
    document: {
      title: "",
      querySelector(selector) {
        if (selector === "[data-launch-link]") return launchLink;
        return null;
      },
    },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  context.window.window = context.window;
  context.window.console = context.console;
  context.window.document = context.document;

  vm.runInNewContext(installScriptSource, context, { filename: "dist/install/install.js" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(launchLink.href, `${previewRootUrl}/intercept/safari`);
  assert.notEqual(launchLink.href, `${previewRootUrl}/home`);
  launchLink.click();
  assert.deepEqual(
    {
      currentPath: context.window.__MYBISHBASH_LAUNCH_DEBUG__.currentPath,
      appId: context.window.__MYBISHBASH_LAUNCH_DEBUG__.appId,
      launcherContext: context.window.__MYBISHBASH_LAUNCH_DEBUG__.launcherContext,
      targetRoute: context.window.__MYBISHBASH_LAUNCH_DEBUG__.targetRoute,
    },
    {
      currentPath: "/mybishbash-preview/safari/index.html",
      appId: "safari",
      launcherContext: "safari",
      targetRoute: "/intercept/safari",
    },
  );
}

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
