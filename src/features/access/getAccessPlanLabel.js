import { ACCESS_TIERS, getEffectiveTier } from "../../lib/accessCapabilities";

export function getAccessPlanLabel(accessProfile, canUseMultipleApps) {
  const tier = getEffectiveTier(accessProfile ?? {});
  if (canUseMultipleApps || tier === ACCESS_TIERS.FOUNDING_ACCESS) return "Founding Access";
  return "Free Core";
}
