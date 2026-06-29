import { spawnSync } from "node:child_process";
import { execSync } from "node:child_process";

const sourceSha = process.env.VITE_SOURCE_SHA || process.env.GITHUB_SHA || gitSourceSha();
const previewVersion = process.env.VITE_APP_VERSION || (sourceSha ? `preview-${sourceSha}` : "preview-local");

run("npm", ["run", "build"], {
  ...process.env,
  // The Pages preview is rewritten from the "/mybishbash/" base into
  // "/mybishbash-preview/", so build against that base (production is root "/").
  VITE_BASE_PATH: process.env.VITE_BASE_PATH || "/mybishbash/",
  VITE_APP_VERSION: previewVersion,
  VITE_SOURCE_SHA: sourceSha,
});
run("node", ["scripts/prepare-pages-preview-build.mjs"], {
  ...process.env,
  VITE_APP_VERSION: previewVersion,
  VITE_SOURCE_SHA: sourceSha,
});
run("node", ["scripts/validate-pages-preview-build.mjs"], {
  ...process.env,
  VITE_APP_VERSION: previewVersion,
  VITE_SOURCE_SHA: sourceSha,
});

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

function gitSourceSha() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
