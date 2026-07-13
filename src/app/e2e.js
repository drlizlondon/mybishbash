import { ACCESS_TIERS } from "../lib/accessCapabilities";

const E2E_MODE_KEY = "MYBISHBASH_E2E_MODE";
const E2E_TESTER_MODE_KEY = "MYBISHBASH_E2E_TESTER_MODE";
const LAUNCH_TIMING_LOG_KEY = "bishbash.launchTiming.v1";

function isE2EModeEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(E2E_MODE_KEY) === "true";
}

function loadE2EAccessProfile() {
  if (typeof window === "undefined") return null;
  const accessTier = window.localStorage.getItem("MYBISHBASH_E2E_ACCESS_TIER") || ACCESS_TIERS.FREE_CORE;
  return { access_tier: accessTier, has_access: true };
}

function buildE2ESession() {
  return {
    user: {
      id: "e2e-user",
      email: "e2e@mybishbash.local",
    },
  };
}

function isLaunchTimingEnabled(testerStatus = null) {
  if (typeof window === "undefined") return false;
  if (testerStatus?.is_tester === true) return true;
  return window.localStorage.getItem(E2E_TESTER_MODE_KEY) === "true";
}

function recordLaunchTiming(label, payload = {}, testerStatus = null) {
  if (!isLaunchTimingEnabled(testerStatus)) return;
  const entry = {
    label,
    payload,
    at: new Date().toISOString(),
    t: performance.now(),
  };
  window.__MYBISHBASH_LAUNCH_TIMINGS = [
    ...(window.__MYBISHBASH_LAUNCH_TIMINGS ?? []),
    entry,
  ].slice(-200);
  try {
    const stored = JSON.parse(window.localStorage.getItem(LAUNCH_TIMING_LOG_KEY) || "[]");
    stored.push(entry);
    if (stored.length > 200) stored.splice(0, stored.length - 200);
    window.localStorage.setItem(LAUNCH_TIMING_LOG_KEY, JSON.stringify(stored));
  } catch {
    // Timing logs are diagnostic only.
  }
}

export {
  E2E_TESTER_MODE_KEY,
  isE2EModeEnabled,
  loadE2EAccessProfile,
  buildE2ESession,
  isLaunchTimingEnabled,
  recordLaunchTiming,
};
