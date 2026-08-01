import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationPath = join(root, "supabase/migrations/202608010001_sync_v2_rollout_control.sql");
const rollbackPath = join(root, "supabase/rollback/202608010001_sync_v2_rollout_control.sql");
const sqlProbePath = join(root, "scripts/verify-sync-v2-rollout-control.sql");
const packagePath = join(root, "package.json");
const beforePushPath = join(root, "scripts/test-before-push.mjs");

const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const sqlProbe = readFileSync(sqlProbePath, "utf8");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const beforePush = readFileSync(beforePushPath, "utf8");

const failures = [];
const requireMatch = (label, text, pattern) => {
  if (!pattern.test(text)) failures.push(`${label}: missing ${pattern}`);
};
const forbidMatch = (label, text, pattern) => {
  if (pattern.test(text)) failures.push(`${label}: forbidden ${pattern}`);
};

requireMatch("blob-only table constraint", migration, /check\s*\(mode\s*=\s*'blob'\)/i);
requireMatch("catch-all seed", migration, /'all'[\s\S]*?'catch-all-blob'[\s\S]*?'blob'/i);
requireMatch("RLS enabled", migration, /enable row level security/i);
requireMatch(
  "no direct client table surface",
  migration,
  /revoke all on table public\.sync_v2_rollout_rules from public, anon, authenticated/i,
);
forbidMatch("no client table policy", migration, /create policy[\s\S]{0,160}sync_v2_rollout_rules/i);
requireMatch("authenticated implicit caller", migration, /caller_id\s*:=\s*auth\.uid\(\)/i);
requireMatch("unauthenticated assignment denied", migration, /Authentication required[\s\S]*?42501/i);
requireMatch("assignment fixed search path", migration, /get_sync_v2_assignment[\s\S]*?set search_path = pg_catalog, public/i);
requireMatch("assignment output hard-coded blob", migration, /'mode',\s*'blob'[\s\S]*?'readAuthority',\s*'blob'/i);
requireMatch("assignment exception fail-closed", migration, /exception when others then[\s\S]*?'lookup_error'/i);
requireMatch("assignment public execute revoked", migration, /revoke execute on function public\.get_sync_v2_assignment[\s\S]*?from public, anon/i);
requireMatch("admin operator roles", migration, /admins\.role in \('owner', 'admin'\)/i);
requireMatch("non-blob admin write rejected", migration, /p_mode is distinct from 'blob'[\s\S]*?22023/i);
requireMatch("admin write audited", migration, /sync_v2_rollout_rule_change/i);
requireMatch("exact reset path", migration, /hq_reset_sync_v2_rollout_rules\(\)[\s\S]*?delete from public\.sync_v2_rollout_rules/i);
requireMatch("migration postcondition", migration, /Sync v2 rollout preflight postcondition failed/i);

forbidMatch(
  "no later Sync v2 server schemas",
  migration,
  /create\s+table[\s\S]{0,120}sync_v2_(?:entities|mutation_receipts|accounts|health)/i,
);
forbidMatch("no shadow/entity rule value", migration, /'shadow'|'entities'|'paused'/i);

requireMatch("rollback exact default", rollback, /delete from public\.sync_v2_rollout_rules[\s\S]*?'catch-all-blob'/i);
requireMatch("rollback executable assertion", rollback, /Sync v2 rollout safe-posture rollback failed/i);

for (const category of [
  "listed tester",
  "unlisted tester",
  "ordinary account",
  "staff account",
  "admin account",
  "missing configuration",
  "malformed configuration",
  "internal lookup error",
  "non-admin configuration write",
  "unauthenticated assignment",
  "exact default restore",
]) {
  requireMatch(`SQL probe covers ${category}`, sqlProbe, new RegExp(category, "i"));
}

const collectSource = (directory) =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectSource(path);
    return /\.(?:js|jsx)$/.test(path) ? [path] : [];
  });

const runtimeImports = collectSource(join(root, "src"))
  .filter((path) => !path.endsWith("syncV2Assignment.js"))
  .filter((path) => !/\.test\.(?:js|jsx)$/.test(path))
  .filter((path) => /syncV2Assignment/.test(readFileSync(path, "utf8")))
  .map((path) => relative(root, path));

if (runtimeImports.length > 0) {
  failures.push(`Preflight parser must remain inert; runtime imports: ${runtimeImports.join(", ")}`);
}
if (existsSync(join(root, "src/services/sync"))) {
  failures.push("Phase 6 Commit 1+ scope detected: src/services/sync exists");
}

const contractCommand = "node scripts/test-sync-v2-rollout-contract.mjs";
if (packageJson.scripts["test:sync-v2-rollout-contract"] !== contractCommand) {
  failures.push("package.json must expose the exact rollout contract command");
}
for (const scriptName of ["test", "test:release"]) {
  if (!packageJson.scripts[scriptName]?.includes("test:sync-v2-rollout-contract")) {
    failures.push(`${scriptName} must include test:sync-v2-rollout-contract`);
  }
}
if (!beforePush.includes('"npm", "run", "test:sync-v2-rollout-contract"')) {
  failures.push("test-before-push must include the rollout contract");
}

if (failures.length > 0) {
  console.error("Sync v2 rollout preflight contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Sync v2 rollout preflight contract passed (blob-only, inert, default-deny).");
