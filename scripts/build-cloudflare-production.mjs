import { spawnSync } from "node:child_process";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = "dist";
const GITHUB_PAGES_ROOT = "https://drlizlondon.github.io/mybishbash";
const PRODUCTION_ROOT = "https://mybishbash.app";
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

run("npm", ["run", "build", "--", "--base=/"], {
  ...process.env,
  VITE_BASE_PATH: "/",
});

rewriteProductionDist();
run("node", ["scripts/validate-cloudflare-production-build.mjs"], process.env);

function run(command, args, env) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function rewriteProductionDist() {
  for (const filePath of listFiles(DIST_DIR)) {
    if (!isTextFile(filePath)) continue;
    const original = readFileSync(filePath, "utf8");
    const next = original
      .replace(new RegExp(escapeRegExp(GITHUB_PAGES_ROOT), "g"), PRODUCTION_ROOT)
      .replace(/url\.pathname = `\/mybishbash\$\{normalizedRoute\}`;/g, "url.pathname = normalizedRoute;")
      .replace(/\/mybishbash(?=\/|["'?#]|$)/g, "");

    if (next !== original) {
      writeFileSync(filePath, next);
    }
  }

  const versionPath = join(DIST_DIR, "version.json");
  const version = JSON.parse(readFileSync(versionPath, "utf8"));
  writeFileSync(
    versionPath,
    `${JSON.stringify(
      {
        ...version,
        sourceSha: process.env.VITE_SOURCE_SHA || process.env.VITE_GIT_SHA || gitSourceSha(),
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gitSourceSha() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
