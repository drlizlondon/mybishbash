import { spawnSync } from "node:child_process";

run("npm", ["run", "build"], {
  ...process.env,
  VITE_BASE_PATH: "/",
});

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
