// Single reader for the recorded analytics choice. The choice itself is
// written by the consent prompt in public/mbb-consent.js ("Allow analytics" /
// "No thanks", with a "Privacy choices" link to change it later). Anything
// other than an explicit "granted" is treated as no consent.
export const CONSENT_KEY = "mbb_analytics_consent_v1";

export function hasBehaviourConsent() {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (!stored) return false;
    const choice = JSON.parse(stored);
    return Boolean(choice && choice.value === "granted");
  } catch {
    return false;
  }
}
