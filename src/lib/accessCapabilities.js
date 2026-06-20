// Capability layer over the access tier model.
//
// Tiers are the stored primitive (current: 'free_core' | 'founding_access';
// legacy: 'free' | 'premium' on user_profiles, plus access_expires_at).
// Capabilities are a read-only lens derived from them and
// are the ONLY thing feature code is allowed to check — never
// `tier === "premium"` and never grant_reason/cohort, which are HQ/audit
// metadata.
//
// Free Core includes the main MyBishBash experience and one additional app.
// Capabilities that unlock more apps or future premium content live in
// Founding Access. New gates should be product decisions expressed here, not
// scattered tier checks in feature code.

export const ACCESS_TIERS = {
  FREE_CORE: "free_core",
  FOUNDING_ACCESS: "founding_access",
  // Legacy stored values kept readable while the database catches up.
  FREE: "free",
  PREMIUM: "premium",
};

export const CAPABILITIES = {
  // Consumption — packs, cards, and the main app experience.
  CAN_CONSUME_CONTENT: "can_consume_content",
  CAN_USE_MULTIPLE_APPS: "can_use_multiple_apps",
  CAN_USE_COMMITMENTS: "can_use_commitments",
  CAN_USE_ADVANCED_SCHEDULING: "can_use_advanced_scheduling",

  // Creation — custom cards and packs. Currently free for everyone; reserved
  // as distinct keys so a future consume/create commercial split is a mapping
  // change, not a refactor.
  CAN_CREATE_CARDS: "can_create_cards",
  CAN_CREATE_PACKS: "can_create_packs",

  // Publishing/sharing — the community/UGC surface. Does not exist yet, so it
  // is born premium-gated; Explore should check this from day one.
  CAN_PUBLISH_PACKS: "can_publish_packs",

  // Installing Founding Access Explore packs. Born access-gated: free users see the
  // full cover and preview cards, but the install CTA is locked
  // ("Founding Access — Coming Soon"). Unlike the session gate, callers of this
  // capability must fail CLOSED when profile data is unavailable.
  CAN_USE_PREMIUM_CONTENT: "can_use_premium_content",
};

const FREE_CAPABILITIES = new Set([
  CAPABILITIES.CAN_CONSUME_CONTENT,
  CAPABILITIES.CAN_USE_COMMITMENTS,
  CAPABILITIES.CAN_USE_ADVANCED_SCHEDULING,
  CAPABILITIES.CAN_CREATE_CARDS,
  CAPABILITIES.CAN_CREATE_PACKS,
]);

const PREMIUM_CAPABILITIES = new Set([
  ...FREE_CAPABILITIES,
  CAPABILITIES.CAN_USE_MULTIPLE_APPS,
  CAPABILITIES.CAN_PUBLISH_PACKS,
  CAPABILITIES.CAN_USE_PREMIUM_CONTENT,
]);

const TIER_CAPABILITIES = {
  [ACCESS_TIERS.FREE_CORE]: FREE_CAPABILITIES,
  [ACCESS_TIERS.FOUNDING_ACCESS]: PREMIUM_CAPABILITIES,
  [ACCESS_TIERS.FREE]: FREE_CAPABILITIES,
  [ACCESS_TIERS.PREMIUM]: PREMIUM_CAPABILITIES,
};

function normalizeAccessTier(tier) {
  if (tier === ACCESS_TIERS.FOUNDING_ACCESS || tier === ACCESS_TIERS.PREMIUM) {
    return ACCESS_TIERS.FOUNDING_ACCESS;
  }
  return ACCESS_TIERS.FREE_CORE;
}

// Mirrors public.has_active_access(): access is active when has_access is true
// and any expiry is still in the future. Profiles that predate the tier
// migration (no access_tier column yet) behave as before.
export function isAccessActive(profile = {}, now = new Date()) {
  if (profile?.has_access === false) return false;
  const expiresAt = profile?.access_expires_at ?? profile?.accessExpiresAt ?? null;
  if (expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();
    if (!Number.isNaN(expiryTime) && expiryTime <= now.getTime()) return false;
  }
  return true;
}

// Expired Founding Access degrades to Free Core rather than to "no access": expiry of a
// grant removes Founding Access capabilities, while has_access=false (an
// explicit revoke) removes entry to the app itself.
export function getEffectiveTier(profile = {}, now = new Date()) {
  const tier = normalizeAccessTier(profile?.access_tier ?? profile?.accessTier ?? ACCESS_TIERS.FREE_CORE);
  if (tier !== ACCESS_TIERS.FOUNDING_ACCESS) return ACCESS_TIERS.FREE_CORE;
  return isAccessActive(profile, now) ? ACCESS_TIERS.FOUNDING_ACCESS : ACCESS_TIERS.FREE_CORE;
}

export function getCapabilities(profile = {}, now = new Date()) {
  return new Set(TIER_CAPABILITIES[getEffectiveTier(profile, now)] ?? FREE_CAPABILITIES);
}

export function hasCapability(profile, capability, now = new Date()) {
  return getCapabilities(profile, now).has(capability);
}
