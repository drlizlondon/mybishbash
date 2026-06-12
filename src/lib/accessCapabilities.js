// Capability layer over the access tier model.
//
// Tiers are the stored primitive ('free' | 'premium' on user_profiles, plus
// access_expires_at). Capabilities are a read-only lens derived from them and
// are the ONLY thing feature code is allowed to check — never
// `tier === "premium"` and never grant_reason/cohort, which are HQ/audit
// metadata.
//
// Nothing user-facing is gated yet: the free set includes everything shipped
// today. New gates are added by moving a key out of FREE_CAPABILITIES (a
// product decision, with grandfathering expressible via cohort), and new
// premium features are born here (see can_publish_packs).

export const ACCESS_TIERS = {
  FREE: "free",
  PREMIUM: "premium",
};

export const CAPABILITIES = {
  // Consumption — packs, cards, intercept flows. Everything live today.
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

  // Installing premium Explore packs. Born premium-gated: free users see the
  // full cover and preview cards, but the install CTA is locked
  // ("Premium — Coming Soon"). Unlike the session gate, callers of this
  // capability must fail CLOSED when profile data is unavailable.
  CAN_USE_PREMIUM_CONTENT: "can_use_premium_content",
};

const FREE_CAPABILITIES = new Set([
  CAPABILITIES.CAN_CONSUME_CONTENT,
  CAPABILITIES.CAN_USE_MULTIPLE_APPS,
  CAPABILITIES.CAN_USE_COMMITMENTS,
  CAPABILITIES.CAN_USE_ADVANCED_SCHEDULING,
  CAPABILITIES.CAN_CREATE_CARDS,
  CAPABILITIES.CAN_CREATE_PACKS,
]);

const PREMIUM_CAPABILITIES = new Set([
  ...FREE_CAPABILITIES,
  CAPABILITIES.CAN_PUBLISH_PACKS,
  CAPABILITIES.CAN_USE_PREMIUM_CONTENT,
]);

const TIER_CAPABILITIES = {
  [ACCESS_TIERS.FREE]: FREE_CAPABILITIES,
  [ACCESS_TIERS.PREMIUM]: PREMIUM_CAPABILITIES,
};

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

// Expired premium degrades to free rather than to "no access": expiry of a
// premium grant removes premium capabilities, while has_access=false (an
// explicit revoke) removes entry to the app itself.
export function getEffectiveTier(profile = {}, now = new Date()) {
  const tier = profile?.access_tier ?? profile?.accessTier ?? ACCESS_TIERS.FREE;
  if (tier !== ACCESS_TIERS.PREMIUM) return ACCESS_TIERS.FREE;
  return isAccessActive(profile, now) ? ACCESS_TIERS.PREMIUM : ACCESS_TIERS.FREE;
}

export function getCapabilities(profile = {}, now = new Date()) {
  return new Set(TIER_CAPABILITIES[getEffectiveTier(profile, now)] ?? FREE_CAPABILITIES);
}

export function hasCapability(profile, capability, now = new Date()) {
  return getCapabilities(profile, now).has(capability);
}
