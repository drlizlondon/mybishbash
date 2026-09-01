// Onboarding launcher choices are generated from the launchers HQ has made
// available to this user (via getAvailableLaunchersForUser), instead of a
// hard-coded list. Product recommendations stay the same: Safari is the
// "everyday phone use" route, Instagram the "pause before scrolling" route.

const ONBOARDING_CONTEXT_DEFS = [
  {
    id: "social",
    label: "Social media",
    categories: ["social"],
    // Apps we want to tease as "Later" when they are not (yet) available.
    // A teaser is only shown if the app is absent from the available list,
    // so TikTok never appears as a selectable launcher unless it exists in
    // the supported registry and HQ has made it available.
    teasers: [{ id: "tiktok", label: "TikTok" }],
  },
  {
    id: "videos",
    label: "Videos",
    categories: ["video"],
    teasers: [],
  },
];

const PREFERRED_ORDER = ["instagram", "youtube"];

function launcherLabel(launcher) {
  return launcher.displayName ?? launcher.name ?? launcher.realAppLabel ?? launcher.id;
}

function sortPreferredFirst(launchers) {
  return [...launchers].sort((left, right) => {
    const leftIndex = PREFERRED_ORDER.indexOf(left.id);
    const rightIndex = PREFERRED_ORDER.indexOf(right.id);
    return (leftIndex === -1 ? PREFERRED_ORDER.length : leftIndex) - (rightIndex === -1 ? PREFERRED_ORDER.length : rightIndex);
  });
}

// `availableLaunchers` must already be filtered for this user by the central
// availability selector — this function only shapes them into onboarding
// contexts and never re-adds anything that was filtered out.
export function buildOnboardingLauncherContexts(availableLaunchers = []) {
  const launchers = Array.isArray(availableLaunchers) ? availableLaunchers : [];
  const availableIds = new Set(launchers.map((launcher) => launcher.id));
  const contexts = {};

  for (const def of ONBOARDING_CONTEXT_DEFS) {
    const contextLaunchers = sortPreferredFirst(
      launchers.filter((launcher) => def.categories.includes(launcher.category)),
    ).map((launcher) => ({
      id: launcher.id,
      label: launcherLabel(launcher),
      launcherId: launcher.id,
      available: true,
    }));

    for (const teaser of def.teasers) {
      if (!availableIds.has(teaser.id)) {
        contextLaunchers.push({ id: teaser.id, label: teaser.label, available: false });
      }
    }

    if (contextLaunchers.some((launcher) => launcher.available)) {
      contexts[def.id] = { label: def.label, launchers: contextLaunchers };
    }
  }

  return contexts;
}

export function getDefaultOnboardingLauncherId(contexts, preferredId = "instagram") {
  const all = Object.values(contexts ?? {}).flatMap((context) => context.launchers);
  if (all.some((launcher) => launcher.id === preferredId && launcher.available)) return preferredId;
  return all.find((launcher) => launcher.available)?.id ?? null;
}

export function isSafariOnboardingRouteAvailable(availableLaunchers = []) {
  return (Array.isArray(availableLaunchers) ? availableLaunchers : []).some((launcher) => launcher.id === "safari");
}
