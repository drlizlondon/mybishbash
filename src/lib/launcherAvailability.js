// Central launcher availability model.
//
// HQ controls whether a launcher exists for users at all via a single
// availability status. The static registry remains the supported-ID
// foundation; this module only decides *who can see* a supported launcher
// in each surface. User/device preferences may further hide an available
// launcher, but can never make an unavailable launcher visible.

export const LAUNCHER_AVAILABILITY = {
  PUBLIC: "public",
  HIDDEN: "hidden",
  EXPERIMENTAL: "experimental",
  TESTER_ONLY: "tester_only",
  DISABLED: "disabled",
};

export const LAUNCHER_AVAILABILITY_STATUSES = Object.values(LAUNCHER_AVAILABILITY);

// Surfaces that ask "which launchers can this person see here?".
export const LAUNCHER_CONTEXTS = {
  USER_SETUP: "user_setup",
  FAKE_LAUNCHER_BAR: "fake_launcher_bar",
  SETTINGS: "settings",
  ONBOARDING: "onboarding",
  HQ: "hq",
  TESTER: "tester",
};

const TESTER_CONTEXTS = new Set([LAUNCHER_CONTEXTS.TESTER]);

export function isValidAvailabilityStatus(value) {
  return LAUNCHER_AVAILABILITY_STATUSES.includes(value);
}

// Legacy mapping: rows/configs written before availability_status existed
// only carry the `enabled` boolean. enabled=true was "live for users",
// enabled=false was "not live for users but still reviewable in HQ".
export function deriveAvailabilityFromLegacyFlags({ enabled, hqVisible } = {}) {
  if (enabled === true) return LAUNCHER_AVAILABILITY.PUBLIC;
  if (hqVisible === false) return LAUNCHER_AVAILABILITY.HIDDEN;
  return LAUNCHER_AVAILABILITY.DISABLED;
}

export function getLauncherAvailabilityStatus(launcher = {}) {
  if (isValidAvailabilityStatus(launcher.availabilityStatus)) {
    return launcher.availabilityStatus;
  }
  return deriveAvailabilityFromLegacyFlags(launcher);
}

// Keep `enabled` and `availabilityStatus` from contradicting each other:
// only public launchers count as enabled for ordinary users.
export function isAvailabilityStatusEnabledForUsers(status) {
  return status === LAUNCHER_AVAILABILITY.PUBLIC;
}

function isTesterStatus(testerStatus, user) {
  return testerStatus?.is_tester === true || user?.isTester === true;
}

// Decide whether one launcher is visible for a viewer in a context.
export function isLauncherVisibleInContext(launcher, {
  user = null,
  testerStatus = null,
  context = LAUNCHER_CONTEXTS.USER_SETUP,
  includeHqHidden = false,
  includeDisabled = false,
} = {}) {
  const status = getLauncherAvailabilityStatus(launcher);
  const isTester = isTesterStatus(testerStatus, user);

  if (context === LAUNCHER_CONTEXTS.HQ) {
    // HQ can always see supported launchers — disabled and hidden apps stay
    // reviewable there unless the caller explicitly filters them out.
    return true;
  }

  switch (status) {
    case LAUNCHER_AVAILABILITY.PUBLIC:
      return true;
    case LAUNCHER_AVAILABILITY.TESTER_ONLY:
      return isTester;
    case LAUNCHER_AVAILABILITY.EXPERIMENTAL:
      return isTester || TESTER_CONTEXTS.has(context);
    case LAUNCHER_AVAILABILITY.HIDDEN:
      // Hidden apps never appear to normal users; HQ-style callers can opt in.
      return includeHqHidden === true;
    case LAUNCHER_AVAILABILITY.DISABLED:
      return includeDisabled === true;
    default:
      return false;
  }
}

// The one selector used by every surface. `launchers` are merged launcher
// configs (static registry + HQ overrides). `userPreferences` is the local
// per-launcher behaviour map; a user can disable an available launcher for
// themselves, but cannot enable an unavailable one.
export function getAvailableLaunchersForUser({
  launchers = [],
  user = null,
  testerStatus = null,
  includeHqHidden = false,
  includeDisabled = false,
  context = LAUNCHER_CONTEXTS.USER_SETUP,
  userPreferences = null,
  respectUserPreference = false,
} = {}) {
  return (Array.isArray(launchers) ? launchers : []).filter((launcher) => {
    if (!launcher?.id) return false;
    const visible = isLauncherVisibleInContext(launcher, {
      user,
      testerStatus,
      context,
      includeHqHidden,
      includeDisabled,
    });
    if (!visible) return false;
    if (respectUserPreference && context !== LAUNCHER_CONTEXTS.HQ) {
      const preference = userPreferences?.[launcher.id];
      if (preference?.userEnabled === false) return false;
    }
    return true;
  });
}

// Users may only toggle launchers HQ has made available to them.
export function canUserToggleLauncher(launcher, { user = null, testerStatus = null } = {}) {
  return isLauncherVisibleInContext(launcher, {
    user,
    testerStatus,
    context: LAUNCHER_CONTEXTS.USER_SETUP,
  });
}

// Final shell-matching guard, checked immediately before opening a real
// destination. A fake-launcher shell session may only continue to its own
// app; everything else is blocked and logged by the caller.
export function shouldBlockCrossAppLaunch({ launchSession = null, requestedLauncherId = null } = {}) {
  if (!launchSession || launchSession.entrySurface !== "fake_launcher") return false;
  if (!launchSession.launcherId || !requestedLauncherId) return false;
  return launchSession.launcherId !== requestedLauncherId;
}
