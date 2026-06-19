import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCESS_TIERS,
  CAPABILITIES,
  getCapabilities,
  getEffectiveTier,
  hasCapability,
  isAccessActive,
} from "../src/lib/accessCapabilities.js";

const NOW = new Date("2026-06-12T12:00:00Z");
const PAST = "2026-01-01T00:00:00Z";
const FUTURE = "2026-12-31T00:00:00Z";

// ── Active access mirrors public.has_active_access() ────────────────────────

assert.equal(isAccessActive({ has_access: true }, NOW), true, "access with no expiry is active");
assert.equal(isAccessActive({ has_access: false }, NOW), false, "explicit revoke blocks access");
assert.equal(isAccessActive({ has_access: true, access_expires_at: FUTURE }, NOW), true, "future expiry is active");
assert.equal(isAccessActive({ has_access: true, access_expires_at: PAST }, NOW), false, "past expiry is inactive");
assert.equal(isAccessActive({}, NOW), true, "legacy profile without access columns keeps working");
assert.equal(isAccessActive({ has_access: true, access_expires_at: "not-a-date" }, NOW), true, "malformed expiry does not lock users out");

// ── Effective tier: expired Founding Access degrades to Free Core ───────────

assert.equal(getEffectiveTier({ access_tier: "founding_access", has_access: true }, NOW), ACCESS_TIERS.FOUNDING_ACCESS);
assert.equal(getEffectiveTier({ access_tier: "founding_access", has_access: true, access_expires_at: FUTURE }, NOW), ACCESS_TIERS.FOUNDING_ACCESS);
assert.equal(getEffectiveTier({ access_tier: "founding_access", has_access: true, access_expires_at: PAST }, NOW), ACCESS_TIERS.FREE_CORE, "expired Founding Access degrades to Free Core");
assert.equal(getEffectiveTier({ access_tier: "free_core", has_access: true }, NOW), ACCESS_TIERS.FREE_CORE);
assert.equal(getEffectiveTier({ access_tier: "premium", has_access: true }, NOW), ACCESS_TIERS.FOUNDING_ACCESS, "legacy premium maps to Founding Access");
assert.equal(getEffectiveTier({ access_tier: "free", has_access: true }, NOW), ACCESS_TIERS.FREE_CORE, "legacy free maps to Free Core");
assert.equal(getEffectiveTier({}, NOW), ACCESS_TIERS.FREE_CORE, "missing tier defaults to Free Core");
assert.equal(getEffectiveTier({ access_tier: "nonsense" }, NOW), ACCESS_TIERS.FREE_CORE, "unknown tier values fail safe to Free Core");

// ── Capability sets ──────────────────────────────────────────────────────────

const freeCapabilities = getCapabilities({ access_tier: "free_core", has_access: true }, NOW);
const foundingAccessCapabilities = getCapabilities({ access_tier: "founding_access", has_access: true }, NOW);

// The free set includes everything shipped today — nothing user-facing is
// gated yet. If this assertion ever changes, that is a deliberate product
// decision (with grandfathering via cohort), not a side effect.
for (const capability of [
  CAPABILITIES.CAN_CONSUME_CONTENT,
  CAPABILITIES.CAN_USE_MULTIPLE_APPS,
  CAPABILITIES.CAN_USE_COMMITMENTS,
  CAPABILITIES.CAN_USE_ADVANCED_SCHEDULING,
  CAPABILITIES.CAN_CREATE_CARDS,
  CAPABILITIES.CAN_CREATE_PACKS,
]) {
  assert.equal(freeCapabilities.has(capability), true, `free tier keeps ${capability}`);
}

assert.equal(freeCapabilities.has(CAPABILITIES.CAN_PUBLISH_PACKS), false, "publishing is born premium-gated");
assert.equal(foundingAccessCapabilities.has(CAPABILITIES.CAN_PUBLISH_PACKS), true, "Founding Access grants publishing");

for (const capability of freeCapabilities) {
  assert.equal(foundingAccessCapabilities.has(capability), true, `Founding Access is a superset of Free Core (${capability})`);
}

assert.equal(
  hasCapability({ access_tier: "founding_access", has_access: true, access_expires_at: PAST }, CAPABILITIES.CAN_PUBLISH_PACKS, NOW),
  false,
  "expired Founding Access loses Founding Access capabilities",
);
assert.equal(
  hasCapability({ access_tier: "founding_access", has_access: true, access_expires_at: PAST }, CAPABILITIES.CAN_CREATE_PACKS, NOW),
  true,
  "expired Founding Access keeps Free Core capabilities",
);

// ── Source-shape guardrails ──────────────────────────────────────────────────

const root = resolve(import.meta.dirname, "..");
const syncSource = readFileSync(resolve(root, "src", "lib", "mybishbashSync.js"), "utf8");
const downloadSource = readFileSync(resolve(root, "src", "DownloadPage.jsx"), "utf8");
const appSource = readFileSync(resolve(root, "src", "App.jsx"), "utf8");

assert.doesNotMatch(
  syncSource,
  /access_entitlements/,
  "The vestigial access_entitlements table must stay deleted (user_profiles is the single source of truth)",
);
assert.match(
  syncSource,
  /has_access,access_tier,access_expires_at/,
  "The session gate must read tier + expiry, not just has_access",
);
assert.match(
  syncSource,
  /mybishbash_signup_handoff_ref:\s*handoffRef/,
  "signup must pass the server-created handoff reference into auth metadata so the database signup trigger can grant access",
);
assert.doesNotMatch(
  syncSource,
  /LOCAL_INVITATION_CODES\s*=/,
  "invite codes must not be reintroduced as a client-side hardcoded fallback",
);
assert.match(
  syncSource,
  /getSignupHandoffReference\(\)/,
  "signup must read the previously created signup handoff reference",
);
assert.doesNotMatch(
  syncSource,
  /validateAccessCode\(normalizedAccessCode\)/,
  "signup must not revalidate a remembered access code client-side; it should redeem the server-side handoff",
);
assert.match(
  downloadSource,
  /validateAndRememberGateAccessCode/,
  "the Get MyBishBash gate must validate and remember the entered code through the shared access layer",
);
assert.doesNotMatch(
  downloadSource,
  /TEMPORARY_ROLLOUT_CODE|ROLLOUT_ACCESS_KEY|normalized\s*===/,
  "the public gate must not use a hardcoded code or boolean rollout flag",
);
assert.doesNotMatch(
  appSource,
  /id="sync-access-code"|htmlFor="sync-access-code"|Access code/,
  "signup must not render a second access-code field",
);

// Clients must never write access/tester columns directly: the migration
// revokes the broad grants and replaces them with column-level ones, and the
// only client writes to user_profiles stay heartbeat-shaped. These greps keep
// both halves of that contract from regressing.
const migrationSource = readFileSync(
  resolve(root, "supabase", "migrations", "202606120001_access_tiers_grants_audit.sql"),
  "utf8",
);

assert.match(
  migrationSource,
  /revoke update on public\.user_profiles from authenticated;\s*\ngrant update \(email, last_seen_at\) on public\.user_profiles to authenticated;/,
  "user_profiles client updates must stay restricted to email/last_seen_at",
);
assert.match(
  migrationSource,
  /revoke insert on public\.user_profiles from authenticated;\s*\ngrant insert \(user_id, email, signed_up_at, last_seen_at\) on public\.user_profiles to authenticated;/,
  "user_profiles client inserts must stay restricted to identity/heartbeat columns",
);
assert.match(
  migrationSource,
  /drop policy if exists "admins can update all profiles" on public\.user_profiles;/,
  "the broad admin direct-update policy must stay dropped (admin writes go through audited RPCs)",
);
assert.doesNotMatch(
  migrationSource,
  /grant (insert|update|delete) on public\.access_audit_log/,
  "the audit log must stay append-only: no client write grants",
);

const testPilotApiSource = readFileSync(resolve(root, "src", "testing", "TestPilot", "testPilotApi.js"), "utf8");
assert.match(
  testPilotApiSource,
  /rpc\("hq_set_tester_status"/,
  "tester updates must go through the audited hq_set_tester_status RPC",
);
assert.doesNotMatch(
  testPilotApiSource,
  /from\("user_profiles"\)\s*\.update\(/,
  "no direct client updates to user_profiles tester/access columns",
);

for (const source of [syncSource, testPilotApiSource]) {
  for (const restrictedField of ["has_access", "access_tier", "is_tester"]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\.update\\(\\{[^)]*${restrictedField}`, "s"),
      `clients must not attempt direct updates to ${restrictedField}`,
    );
  }
}

console.log("access capability checks passed");
