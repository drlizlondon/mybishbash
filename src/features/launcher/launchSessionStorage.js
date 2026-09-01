import { isKnownLauncher } from "../../lib/launcherRegistry";

const LAUNCH_SESSION_STORAGE_KEY = "mybishbash.launch-session.v1";
const ACTIVE_PROTECTED_APP_CONTEXT_KEY = "mybishbash.active-protected-app-context.v1";
const ACTIVE_PROTECTED_APP_CONTEXT_TTL_MS = 8 * 60 * 60 * 1000;

export function persistLaunchSession(session) {
  if (typeof window === "undefined" || !session) return;
  try {
    window.localStorage.setItem(LAUNCH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Local storage can be unavailable in private or embedded contexts.
  }
}

export function loadActiveProtectedAppContext() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_PROTECTED_APP_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const launcherId = isKnownLauncher(parsed?.launcherId) ? parsed.launcherId : null;
    const updatedAt = Number(parsed?.updatedAt ?? 0);
    if (!launcherId || !Number.isFinite(updatedAt)) return null;
    if (Date.now() - updatedAt > ACTIVE_PROTECTED_APP_CONTEXT_TTL_MS) {
      window.sessionStorage.removeItem(ACTIVE_PROTECTED_APP_CONTEXT_KEY);
      return null;
    }
    return { launcherId, updatedAt };
  } catch {
    return null;
  }
}

export function persistActiveProtectedAppContext(launcherId) {
  if (typeof window === "undefined" || !isKnownLauncher(launcherId)) return null;
  const nextContext = { launcherId, updatedAt: Date.now() };
  try {
    window.sessionStorage.setItem(ACTIVE_PROTECTED_APP_CONTEXT_KEY, JSON.stringify(nextContext));
  } catch {
    // Session storage can be unavailable in private or embedded contexts.
  }
  return nextContext;
}

export function clearActiveProtectedAppContext() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ACTIVE_PROTECTED_APP_CONTEXT_KEY);
  } catch {
    // Session storage can be unavailable in private or embedded contexts.
  }
}
