import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";

const DIST_DIR = "dist";
const PRODUCTION_ORIGIN = "https://drlizlondon.github.io";
const PRODUCTION_BASE_PATH = "/mybishbash/";

const previewOrigin = normalizeOrigin(process.env.PAGES_PREVIEW_ORIGIN || PRODUCTION_ORIGIN);
const previewBasePath = normalizeBasePath(process.env.PAGES_PREVIEW_BASE_PATH || "/mybishbash-preview/");
const previewAppName = process.env.PAGES_PREVIEW_APP_NAME || "MyBishBash Test";
const previewShortName = process.env.PAGES_PREVIEW_SHORT_NAME || "BishBash Test";
const previewRoot = `${previewOrigin}${previewBasePath.replace(/\/$/, "")}`;
const sourceSha = process.env.VITE_SOURCE_SHA || process.env.GITHUB_SHA || gitSourceSha();
const previewVersion = process.env.VITE_APP_VERSION || (sourceSha ? `preview-${sourceSha}` : "preview-local");

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

rewriteDistPaths();
rewriteHtmlAppTitles();
rewriteManifests();
rewriteVersionMarker();
writeFileSync(
  join(DIST_DIR, "preview-build.json"),
  `${JSON.stringify(
    {
      preview: true,
      appName: previewAppName,
      origin: previewOrigin,
      basePath: previewBasePath,
      rootUrl: `${previewRoot}/`,
      homeUrl: `${previewRoot}/home`,
      safariInstallUrl: `${previewRoot}/install/safari/`,
      safariStartUrl: `${previewRoot}/intercept/safari`,
      sourceSha,
      sourceVersion: previewVersion,
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

function rewriteDistPaths() {
  for (const filePath of listFiles(DIST_DIR)) {
    if (!isTextFile(filePath)) continue;
    const original = readFileSync(filePath, "utf8");
    const next = original
      .replace(
        new RegExp(`${escapeRegExp(PRODUCTION_ORIGIN)}${escapeRegExp(PRODUCTION_BASE_PATH.replace(/\/$/, ""))}(?=/|["'?#]|$)`, "g"),
        `${previewOrigin}${previewBasePath.replace(/\/$/, "")}`,
      )
      .replace(
        new RegExp(`${escapeRegExp(PRODUCTION_BASE_PATH.replace(/\/$/, ""))}(?=/|["'?#])`, "g"),
        previewBasePath.replace(/\/$/, ""),
      );

    if (next !== original) {
      writeFileSync(filePath, next);
    }
  }

  const serviceWorkerPath = join(DIST_DIR, "service-worker.js");
  const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
  writeFileSync(
    serviceWorkerPath,
    serviceWorker.replace(/const SERVICE_WORKER_VERSION = "dev";/, `const SERVICE_WORKER_VERSION = ${JSON.stringify(previewVersion)};`),
  );
}

function rewriteHtmlAppTitles() {
  for (const filePath of listFiles(DIST_DIR)) {
    if (!filePath.endsWith(".html")) continue;
    const original = readFileSync(filePath, "utf8");
    const next = original
      .replace(
        /(<meta\s+[^>]*name=["']apple-mobile-web-app-title["'][^>]*content=["'])[^"']*(["'][^>]*>)/gi,
        `$1${previewAppName}$2`,
      )
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${previewAppName}</title>`);

    if (next !== original) {
      writeFileSync(filePath, next);
    }
  }
}

function rewriteManifests() {
  for (const filePath of listFiles(DIST_DIR)) {
    if (!filePath.endsWith(".webmanifest")) continue;
    const manifest = JSON.parse(readFileSync(filePath, "utf8"));
    const path = relative(DIST_DIR, filePath);
    const launcherId = path.match(/(?:^|\/)(?:launchers\/)?(safari|youtube|instagram)\/manifest\.webmanifest$/)?.[1];

    if (launcherId) {
      const launcherName = manifest.short_name || manifest.name || launcherId;
      manifest.name = `${launcherName} · ${previewAppName}`;
      manifest.short_name = `${launcherName} Test`;
      manifest.id = `${previewRoot}/intercept/${launcherId}`;
      manifest.start_url = `${previewRoot}/intercept/${launcherId}`;
      manifest.scope = `${previewRoot}/`;
    } else {
      manifest.name = previewAppName;
      manifest.short_name = previewShortName;
      manifest.id = `${previewRoot}/`;
      manifest.start_url = `${previewRoot}/home`;
      manifest.scope = `${previewRoot}/`;
    }

    if (Array.isArray(manifest.icons)) {
      manifest.icons = manifest.icons.map((icon) => ({
        ...icon,
        src: typeof icon.src === "string" && icon.src.startsWith(PRODUCTION_BASE_PATH)
          ? icon.src.replace(PRODUCTION_BASE_PATH, previewBasePath)
          : icon.src,
      }));
    }

    writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function rewriteVersionMarker() {
  const versionPath = join(DIST_DIR, "version.json");
  const version = JSON.parse(readFileSync(versionPath, "utf8"));
  writeFileSync(
    versionPath,
    `${JSON.stringify(
      {
        ...version,
        version: previewVersion,
        sourceSha,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

function* listFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const filePath = join(dir, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      yield* listFiles(filePath);
    } else if (stats.isFile()) {
      yield filePath;
    }
  }
}

function isTextFile(filePath) {
  return textExtensions.has(filePath.slice(filePath.lastIndexOf(".")));
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
