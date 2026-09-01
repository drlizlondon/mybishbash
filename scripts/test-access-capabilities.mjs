import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MEMBERSHIPS,
  MEMBERSHIP_ENTITLEMENTS,
  CAPABILITIES,
  getCapabilities,
  getMembership,
  hasCapability,
  isAccessActive,
  resolveEntitlements,
  isUnlimited,
  canAddUnder,
  isWithinLimit,
} from "../src/lib/accessCapabilities.js";

const NOW = new Date("2026-06-12T12:00:00Z");
const PAST = "2026-01-01T00:00:00Z";
const FUTURE = "2026-12-31T00:00:00Z";
const opts = { now: NOW };

// ── Active access mirrors public.has_active_access() ────────────────────────

assert.equal(isAccessActive({ has_access: true }, NOW), true, "access with no expiry is active");
assert.equal(isAccessActive({ has_access: false }, NOW), false, "explicit revoke blocks access");
assert.equal(isAccessActive({ has_access: true, access_expires_at: FUTURE }, NOW), true, "future expiry is active");
assert.equal(isAccessActive({ has_access: true, access_expires_at: PAST }, NOW), false, "past expiry is inactive");
assert.equal(isAccessActive({}, NOW), true, "legacy profile without access columns keeps working");
assert.equal(isAccessActive({ has_access: true, access_expires_at: "not-a-date" }, NOW), true, "malformed expiry does not lock users out");

// ── Effective membership: expired paid membership degrades to free ──────────

assert.equal(getMembership({ membership: "premium", has_access: true }, NOW), MEMBERSHIPS.PREMIUM);
assert.equal(getMembership({ membership: "founder", has_access: true }, NOW), MEMBERSHIPS.FOUNDER);
assert.equal(getMembership({ membership: "premium", has_access: true, access_expires_at: PAST }, NOW), MEMBERSHIPS.FREE, "expired premium degrades to free");
assert.equal(getMembership({ membership: "founder", has_access: false }, NOW), MEMBERSHIPS.FREE, "revoked founder degrades to free");
assert.equal(getMembership({ access_tier: "premium", has_access: true }, NOW), MEMBERSHIPS.PREMIUM, "legacy premium tier maps to premium membership");
assert.equal(getMembership({}, NOW), MEMBERSHIPS.FREE, "missing membership defaults to free");
assert.equal(getMembership({ membership: "nonsense" }, NOW), MEMBERSHIPS.FREE, "unknown membership fails safe to free");

// ── Entitlements: membership defaults are the single source of truth ────────

const freeEnt = resolveEntitlements({ membership: "free", has_access: true }, opts);
const founderEnt = resolveEntitlements({ membership: "founder", has_access: true }, opts);
const premiumEnt = resolveEntitlements({ membership: "premium", has_access: true }, opts);

assert.equal(freeEnt.maxConnectedApps, 1, "free allows myBishBash core + 1 connected app");
assert.equal(freeEnt.maxPersonalCards, 5, "free allows 5 personal cards");
assert.equal(freeEnt.premiumPacksEnabled, false, "free has no premium packs");
assert.equal(isUnlimited(founderEnt.maxConnectedApps), true, "founder apps unlimited");
assert.equal(founderEnt.premiumPacksEnabled, true, "founder gets premium packs");
assert.equal(premiumEnt.premiumPacksEnabled, true, "premium gets premium packs");
assert.deepEqual(
  { a: founderEnt.maxConnectedApps, b: founderEnt.premiumPacksEnabled },
  { a: premiumEnt.maxConnectedApps, b: premiumEnt.premiumPacksEnabled },
  "founder and premium share entitlements at launch",
);

// Expired paid membership degrades to free entitlements.
const expiredPremium = resolveEntitlements({ membership: "premium", has_access: true, access_expires_at: PAST }, opts);
assert.equal(expiredPremium.premiumPacksEnabled, false, "expired premium loses premium packs");
assert.equal(expiredPremium.maxConnectedApps, 1, "expired premium falls back to free app cap");

// ── Tester and admin are orthogonal ──────────────────────────────────────────

const freeTester = resolveEntitlements({ membership: "free", has_access: true, is_tester: true }, opts);
assert.equal(freeTester.membership, MEMBERSHIPS.FREE, "tester does not change membership");
assert.equal(freeTester.canUseExperimentalFeatures, true, "tester unlocks experimental features");
assert.equal(freeTester.premiumPacksEnabled, false, "tester does not unlock premium packs");
assert.equal(resolveEntitlements({ membership: "free", has_access: true }, opts).canUseExperimentalFeatures, false, "non-tester has no experimental access");
assert.equal(resolveEntitlements({ membership: "premium", has_access: true }, { ...opts, isAdmin: true }).canAccessHq, true, "admin flag grants HQ access");
assert.equal(premiumEnt.canAccessHq, false, "membership alone does not grant HQ access");

// ── Per-account entitlement overrides merge over defaults ────────────────────

const overridden = resolveEntitlements({ membership: "free", has_access: true, entitlement_overrides: { maxPersonalCards: 50, premiumPacksEnabled: true } }, opts);
assert.equal(overridden.maxPersonalCards, 50, "override raises personal card cap");
assert.equal(overridden.premiumPacksEnabled, true, "override can enable premium packs for a free user");
assert.equal(overridden.maxConnectedApps, 1, "non-overridden keys keep membership default");
const stringOverride = resolveEntitlements({ membership: "free", has_access: true, entitlement_overrides: '{"maxConnectedApps": null}' }, opts);
assert.equal(isUnlimited(stringOverride.maxConnectedApps), true, "string JSON overrides parse and apply");

// ── Numeric limit helpers ────────────────────────────────────────────────────

assert.equal(canAddUnder(1, 2), true, "can add a 2nd item under a cap of 2");
assert.equal(canAddUnder(2, 2), false, "cannot add a 3rd item under a cap of 2");
assert.equal(canAddUnder(99, null), true, "unlimited never blocks");
assert.equal(isWithinLimit(2, 2), true, "2 items within a cap of 2");
assert.equal(isWithinLimit(3, 2), false, "3 items exceeds a cap of 2");

// ── Capability shim still maps onto entitlements ─────────────────────────────

const freeCapabilities = getCapabilities({ membership: "free", has_access: true }, opts);
const paidCapabilities = getCapabilities({ membership: "premium", has_access: true }, opts);

assert.equal(freeCapabilities.has(CAPABILITIES.CAN_USE_MULTIPLE_APPS), false, "free (1 connected app) is not 'multiple apps' under the shim");
assert.equal(getMembership({ access_tier: "founding_access", has_access: true }, NOW), MEMBERSHIPS.PREMIUM, "legacy founding_access tier maps to premium");
assert.equal(freeCapabilities.has(CAPABILITIES.CAN_USE_PREMIUM_CONTENT), false, "free has no premium content");
assert.equal(paidCapabilities.has(CAPABILITIES.CAN_USE_PREMIUM_CONTENT), true, "paid unlocks premium content");
assert.equal(
  hasCapability({ membership: "premium", has_access: true, access_expires_at: PAST }, CAPABILITIES.CAN_USE_PREMIUM_CONTENT, opts),
  false,
  "expired premium loses premium content",
);
assert.equal(
  hasCapability({ membership: "free", has_access: true, is_tester: true }, CAPABILITIES.CAN_USE_EXPERIMENTAL_FEATURES, opts),
  true,
  "tester capability flows through the shim",
);

// ── Source-shape guardrails ──────────────────────────────────────────────────

const root = resolve(import.meta.dirname, "..");
const syncSource = readFileSync(resolve(root, "src", "lib", "mybishbashSync.js"), "utf8");
const downloadSource = readFileSync(resolve(root, "src", "features", "marketing", "DownloadPage.jsx"), "utf8");
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
  "the Get myBishBash gate must validate and remember the entered code through the shared access layer",
);
assert.doesNotMatch(
  downloadSource,
  /TEMPORARY_ROLLOUT_CODE|ROLLOUT_ACCESS_KEY|normalized\s*===/,
  "the public gate must not use a hardcoded code or boolean rollout flag",
);
assert.doesNotMatch(
  appSource,
  /id="sync-access-code"|htmlFor="sync-access-code"/,
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
const handoffMigrationSource = readFileSync(
  resolve(root, "supabase", "migrations", "202606190001_signup_handoffs.sql"),
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
assert.match(
  handoffMigrationSource,
  /revoke execute on function public\.create_mybishbash_signup_handoff\(text\) from public;\s*\ngrant execute on function public\.create_mybishbash_signup_handoff\(text\) to anon, authenticated;/,
  "only the invite-gate handoff creation RPC should be client-callable",
);
assert.match(
  handoffMigrationSource,
  /revoke execute on function public\.redeem_mybishbash_signup_handoff\(text, uuid, text\) from public, anon, authenticated;/,
  "handoff redemption must not be executable by anon or authenticated clients",
);
assert.doesNotMatch(
  handoffMigrationSource,
  /grant execute on function public\.redeem_mybishbash_signup_handoff\(text, uuid, text\) to (anon|authenticated|public)/,
  "handoff redemption must remain internal to the security-definer trigger path",
);
assert.match(
  handoffMigrationSource,
  /revoke execute on function public\.handle_new_user_profile\(\) from public, anon, authenticated;/,
  "the profile trigger function must not be a public-facing RPC",
);
assert.match(
  handoffMigrationSource,
  /perform public\.redeem_mybishbash_signup_handoff\(metadata_handoff_ref, new\.id, new\.email\);[\s\S]*if not exists \(select 1 from public\.user_profiles where user_id = new\.id\) then[\s\S]*metadata_access_code := public\.normalize_mybishbash_access_code/,
  "signup via handoff must redeem through the trigger before the legacy access-code path runs",
);
assert.match(
  handoffMigrationSource,
  /if not exists \(select 1 from public\.user_profiles where user_id = new\.id\) then[\s\S]*'system:signup'[\s\S]*'pending_grant_applied'[\s\S]*end if;\s*\n\s*return new;/,
  "legacy signup and pending-grant writes must be skipped when handoff redemption already created the profile",
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
