import { describe, expect, it } from "vitest";
import {
  ACCESS_TIERS,
  CAPABILITIES,
  MEMBERSHIPS,
  canAddUnder,
  getCapabilities,
  getEffectiveTier,
  getMembership,
  isAccessActive,
  isUnlimited,
  isWithinLimit,
  membershipRank,
  resolveEntitlements,
} from "./accessCapabilities.js";

const NOW = new Date("2026-07-10T12:00:00Z");
const PAST = "2026-01-01T00:00:00Z";
const FUTURE = "2027-01-01T00:00:00Z";

describe("tier and membership constants", () => {
  it("keeps the tier strings stable (persisted in profiles and E2E fixtures)", () => {
    expect(ACCESS_TIERS).toEqual({
      FREE: "free",
      PREMIUM: "premium",
      FREE_CORE: "free",
      FOUNDING_ACCESS: "premium",
    });
    expect(MEMBERSHIPS).toEqual({ FREE: "free", FOUNDER: "founder", PREMIUM: "premium" });
  });

  it("ranks memberships free < founder < premium, unknown as free", () => {
    expect(membershipRank(MEMBERSHIPS.FREE)).toBe(0);
    expect(membershipRank(MEMBERSHIPS.FOUNDER)).toBe(1);
    expect(membershipRank(MEMBERSHIPS.PREMIUM)).toBe(2);
    expect(membershipRank("nonsense")).toBe(0);
  });
});

describe("isAccessActive", () => {
  it("defaults to active for empty or missing profiles", () => {
    expect(isAccessActive({}, NOW)).toBe(true);
    expect(isAccessActive(undefined, NOW)).toBe(true);
  });

  it("is inactive when has_access is explicitly false", () => {
    expect(isAccessActive({ has_access: false }, NOW)).toBe(false);
  });

  it("respects access_expires_at in both snake and camel case", () => {
    expect(isAccessActive({ access_expires_at: PAST }, NOW)).toBe(false);
    expect(isAccessActive({ accessExpiresAt: PAST }, NOW)).toBe(false);
    expect(isAccessActive({ access_expires_at: FUTURE }, NOW)).toBe(true);
  });

  it("treats an unparseable expiry as active (documented current behaviour)", () => {
    expect(isAccessActive({ access_expires_at: "not-a-date" }, NOW)).toBe(true);
  });
});

describe("getMembership / getEffectiveTier", () => {
  it("maps empty and unknown profiles to free", () => {
    expect(getMembership({}, NOW)).toBe(MEMBERSHIPS.FREE);
    expect(getMembership({ membership: "mystery" }, NOW)).toBe(MEMBERSHIPS.FREE);
    expect(getEffectiveTier({}, NOW)).toBe(ACCESS_TIERS.FREE);
  });

  it("honours paid memberships from membership or legacy access_tier fields", () => {
    expect(getMembership({ membership: "premium" }, NOW)).toBe(MEMBERSHIPS.PREMIUM);
    expect(getMembership({ access_tier: "founder" }, NOW)).toBe(MEMBERSHIPS.FOUNDER);
    expect(getMembership({ access_tier: "founding_access" }, NOW)).toBe(MEMBERSHIPS.PREMIUM);
    expect(getMembership({ accessTier: "founding-access" }, NOW)).toBe(MEMBERSHIPS.PREMIUM);
    expect(getEffectiveTier({ membership: "founder" }, NOW)).toBe(ACCESS_TIERS.PREMIUM);
  });

  it("degrades a paid membership to free when access lapsed or was revoked", () => {
    expect(getMembership({ membership: "premium", access_expires_at: PAST }, NOW)).toBe(MEMBERSHIPS.FREE);
    expect(getMembership({ membership: "premium", has_access: false }, NOW)).toBe(MEMBERSHIPS.FREE);
    expect(getEffectiveTier({ membership: "premium", has_access: false }, NOW)).toBe(ACCESS_TIERS.FREE);
  });
});

describe("resolveEntitlements", () => {
  it("resolves the free defaults", () => {
    expect(resolveEntitlements({}, { now: NOW })).toEqual({
      membership: "free",
      maxConnectedApps: 1,
      maxPersonalCards: 5,
      maxCustomCards: 5,
      premiumPacksEnabled: false,
      canUseExperimentalFeatures: false,
      canAccessHq: false,
    });
  });

  it("resolves the paid defaults (unlimited apps, premium packs)", () => {
    const paid = resolveEntitlements({ membership: "premium" }, { now: NOW });
    expect(paid.membership).toBe("premium");
    expect(paid.maxConnectedApps).toBeNull();
    expect(paid.maxPersonalCards).toBe(20);
    expect(paid.premiumPacksEnabled).toBe(true);
  });

  it("merges per-account overrides over membership defaults", () => {
    const resolved = resolveEntitlements(
      { entitlement_overrides: { maxPersonalCards: 50, premiumPacksEnabled: true } },
      { now: NOW },
    );
    expect(resolved.maxPersonalCards).toBe(50);
    expect(resolved.premiumPacksEnabled).toBe(true);
    // Non-overridden keys keep the free defaults.
    expect(resolved.maxConnectedApps).toBe(1);
  });

  it("parses JSON-string overrides and ignores malformed ones", () => {
    expect(
      resolveEntitlements({ entitlement_overrides: '{"maxCustomCards":9}' }, { now: NOW }).maxCustomCards,
    ).toBe(9);
    expect(
      resolveEntitlements({ entitlement_overrides: "{broken json" }, { now: NOW }).maxCustomCards,
    ).toBe(5);
  });

  it("keeps tester and admin flags orthogonal to membership", () => {
    expect(resolveEntitlements({ is_tester: true }, { now: NOW }).canUseExperimentalFeatures).toBe(true);
    expect(resolveEntitlements({}, { isAdmin: true, now: NOW }).canAccessHq).toBe(true);
    expect(resolveEntitlements({ is_tester: true }, { now: NOW }).membership).toBe("free");
  });
});

describe("numeric limit helpers", () => {
  it("treats null/undefined as unlimited", () => {
    expect(isUnlimited(null)).toBe(true);
    expect(isUnlimited(undefined)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
  });

  it("isWithinLimit allows counts at or under the limit", () => {
    expect(isWithinLimit(1, 1)).toBe(true);
    expect(isWithinLimit(2, 1)).toBe(false);
    expect(isWithinLimit(999, null)).toBe(true);
  });

  it("canAddUnder allows adding strictly below the limit", () => {
    expect(canAddUnder(0, 1)).toBe(true);
    expect(canAddUnder(1, 1)).toBe(false);
    expect(canAddUnder(999, null)).toBe(true);
  });
});

describe("capability shim", () => {
  it("free profiles get no premium or multi-app capability", () => {
    const set = getCapabilities({}, { now: NOW });
    expect(set.has(CAPABILITIES.CAN_USE_PREMIUM_CONTENT)).toBe(false);
    expect(set.has(CAPABILITIES.CAN_USE_MULTIPLE_APPS)).toBe(false);
  });

  it("paid profiles get premium content and multiple apps", () => {
    const set = getCapabilities({ membership: "premium" }, { now: NOW });
    expect(set.has(CAPABILITIES.CAN_USE_PREMIUM_CONTENT)).toBe(true);
    expect(set.has(CAPABILITIES.CAN_USE_MULTIPLE_APPS)).toBe(true);
  });

  it("accepts a legacy Date as the options argument", () => {
    const set = getCapabilities({ membership: "premium", access_expires_at: PAST }, NOW);
    expect(set.has(CAPABILITIES.CAN_USE_PREMIUM_CONTENT)).toBe(false);
  });
});
