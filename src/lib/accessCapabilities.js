// Entitlement model — the single source of truth for limits and feature flags.
//
// Three separated concepts:
//   • Membership  — commercial entitlement only: free | founder | premium.
//   • Tester      — orthogonal beta/experimental flag (profile.is_tester).
//   • Admin       — orthogonal operational HQ role (admin_users table).
//
// Feature code must read ENTITLEMENTS via resolveEntitlements(), never branch on
// membership strings or hardcode numeric limits ("2 apps", "5 cards"). The
// defaults below are the ONLY place those numbers live. Per-account overrides
// (profile.entitlement_overrides) and per-code overrides (stamped onto the
// profile at claim time) merge over the membership defaults.

export const MEMBERSHIPS = {
  FREE: "free",
  FOUNDER: "founder",
  PREMIUM: "premium",
};

// null = unlimited. Founder and Premium are identical at launch (they differ
// only in commercial meaning); keep them separate so they can diverge later.
const PAID_ENTITLEMENTS = {
  maxConnectedApps: null,
  maxPersonalCards: 20,
  maxCustomCards: 20,
  premiumPacksEnabled: true,
};

export const MEMBERSHIP_ENTITLEMENTS = {
  [MEMBERSHIPS.FREE]: {
    maxConnectedApps: 2,
    maxPersonalCards: 5,
    maxCustomCards: 5,
    premiumPacksEnabled: false,
  },
  [MEMBERSHIPS.FOUNDER]: { ...PAID_ENTITLEMENTS },
  [MEMBERSHIPS.PREMIUM]: { ...PAID_ENTITLEMENTS },
};

// Keys that may be overridden per-account / per-code. Numeric keys accept a
// number or null (unlimited); boolean keys accept true/false.
const OVERRIDABLE_ENTITLEMENTS = Object.keys(MEMBERSHIP_ENTITLEMENTS[MEMBERSHIPS.FREE]);

const MEMBERSHIP_RANK = {
  [MEMBERSHIPS.FREE]: 0,
  [MEMBERSHIPS.FOUNDER]: 1,
  [MEMBERSHIPS.PREMIUM]: 2,
};

export function membershipRank(membership) {
  return MEMBERSHIP_RANK[membership] ?? 0;
}

// ── access state ────────────────────────────────────────────────────────────

// Mirrors public.has_active_access(): access is active when has_access is not
// explicitly false and any expiry is still in the future.
export function isAccessActive(profile = {}, now = new Date()) {
  if (profile?.has_access === false) return false;
  const expiresAt = profile?.access_expires_at ?? profile?.accessExpiresAt ?? null;
  if (expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();
    if (!Number.isNaN(expiryTime) && expiryTime <= now.getTime()) return false;
  }
  return true;
}

function rawMembership(profile = {}) {
  const value = profile?.membership ?? profile?.access_tier ?? profile?.accessTier;
  // Legacy 'premium' tier (pre-membership rows) maps to premium membership.
  if (value === MEMBERSHIPS.PREMIUM || value === MEMBERSHIPS.FOUNDER) return value;
  return MEMBERSHIPS.FREE;
}

// Effective membership: a paid membership degrades to free when access has
// lapsed (expiry) or been revoked (has_access=false). An explicit revoke also
// removes app entry; that is enforced by the session gate, not here.
export function getMembership(profile = {}, now = new Date()) {
  const membership = rawMembership(profile);
  if (membership === MEMBERSHIPS.FREE) return MEMBERSHIPS.FREE;
  return isAccessActive(profile, now) ? membership : MEMBERSHIPS.FREE;
}

// ── entitlement resolution ───────────────────────────────────────────────────

function readOverrides(profile = {}) {
  const raw = profile?.entitlement_overrides ?? profile?.entitlementOverrides ?? null;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) ?? {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

// Resolve the full entitlement set for a profile. Pass { isAdmin } separately —
// admin is an orthogonal operational role (admin_users), not a membership.
export function resolveEntitlements(profile = {}, { isAdmin = false, now = new Date() } = {}) {
  const membership = getMembership(profile, now);
  const base = MEMBERSHIP_ENTITLEMENTS[membership] ?? MEMBERSHIP_ENTITLEMENTS[MEMBERSHIPS.FREE];
  const overrides = readOverrides(profile);

  const entitlements = { ...base };
  for (const key of OVERRIDABLE_ENTITLEMENTS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key) && overrides[key] !== undefined) {
      entitlements[key] = overrides[key];
    }
  }

  return {
    membership,
    ...entitlements,
    // Orthogonal flags.
    canUseExperimentalFeatures: profile?.is_tester === true || profile?.isTester === true,
    canAccessHq: isAdmin === true,
  };
}

// ── numeric limit helpers ────────────────────────────────────────────────────

export function isUnlimited(limit) {
  return limit === null || limit === undefined;
}

// True when `count` items are allowed under `limit` (null = unlimited).
export function isWithinLimit(count, limit) {
  if (isUnlimited(limit)) return true;
  return count <= limit;
}

// True when one more item may be added under `limit`.
export function canAddUnder(count, limit) {
  if (isUnlimited(limit)) return true;
  return count < limit;
}

// ── backwards-compatible capability shim ─────────────────────────────────────
//
// Existing call sites import CAPABILITIES / getCapabilities / hasCapability.
// Keep them working by mapping onto the entitlement resolver.

export const CAPABILITIES = {
  CAN_USE_MULTIPLE_APPS: "can_use_multiple_apps",
  CAN_USE_PREMIUM_CONTENT: "can_use_premium_content",
  CAN_USE_EXPERIMENTAL_FEATURES: "can_use_experimental_features",
};

export function getCapabilities(profile = {}, options = {}) {
  const entitlements = resolveEntitlements(profile, normalizeOptions(options));
  const set = new Set();
  if (entitlements.premiumPacksEnabled) set.add(CAPABILITIES.CAN_USE_PREMIUM_CONTENT);
  if (entitlements.maxConnectedApps !== 1) set.add(CAPABILITIES.CAN_USE_MULTIPLE_APPS);
  if (entitlements.canUseExperimentalFeatures) set.add(CAPABILITIES.CAN_USE_EXPERIMENTAL_FEATURES);
  return set;
}

export function hasCapability(profile, capability, options = {}) {
  return getCapabilities(profile, options).has(capability);
}

// Accept either a Date (legacy `now` positional) or an options object.
function normalizeOptions(options) {
  if (options instanceof Date) return { now: options };
  return options ?? {};
}

// ── legacy tier exports (kept so older imports do not break) ─────────────────

export const ACCESS_TIERS = {
  FREE: "free",
  PREMIUM: "premium",
  FREE_CORE: "free",
  FOUNDING_ACCESS: "premium",
};

// Legacy: returns the binary access_tier mirror of the effective membership.
export function getEffectiveTier(profile = {}, now = new Date()) {
  return getMembership(profile, now) === MEMBERSHIPS.FREE ? ACCESS_TIERS.FREE : ACCESS_TIERS.PREMIUM;
}
