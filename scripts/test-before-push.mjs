import { spawn } from "node:child_process";

const checks = [
  ["Build", ["npm", "run", "build"]],
  ["Release guardrails", ["npm", "run", "test:release-guardrails"]],
  ["Launcher selector flow", ["npm", "run", "test:launcher-flow"]],
  ["Fake launcher destinations", ["npm", "run", "test:fake-launchers"]],
  ["Launcher button/state smoke", ["npx", "playwright", "test", "tests/e2e/launcher-before-push.spec.ts"]],
  ["Downloaded shell repeat", ["npm", "run", "test:launcher-shell-repeat"]],
];

function runCheck([label, command]) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${label} ===`);
    console.log(`$ ${command.join(" ")}`);

    const child = spawn(command[0], command.slice(1), {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`PASS ${label}`);
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

try {
  for (const check of checks) {
    await runCheck(check);
  }
  console.log("\nBefore-push checks passed");
} catch (error) {
  console.error(`\nBefore-push checks failed: ${error.message}`);
  process.exit(1);
}
