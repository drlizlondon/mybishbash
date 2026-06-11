import { buildCustomLauncher, registerDynamicLaunchers } from "./launcherRegistry.js";

// Cold-start support for HQ-created launchers. Route parsing happens before
// Supabase configs arrive, so dynamic launcher definitions are cached in
// localStorage and registered synchronously before first render (main.jsx).
// Limitation: a brand-new device must open MyBishBash once (fetching configs)
// before a dynamic /intercept/:id shell route resolves on that device.

const DYNAMIC_LAUNCHER_CACHE_KEY = "mybishbash.dynamic-launchers.v1";

export function initDynamicLaunchersFromCache() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DYNAMIC_LAUNCHER_CACHE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return registerDynamicLaunchers(parsed);
  } catch {
    return [];
  }
}

// Called with freshly fetched HQ configs: registers custom rows as runtime
// launchers and refreshes the cache (sanitized via buildCustomLauncher so
// only validated definitions are ever persisted).
export function cacheAndRegisterDynamicLaunchers(configs = []) {
  const registered = registerDynamicLaunchers(configs);
  if (typeof window === "undefined") return registered;
  try {
    const sanitized = (Array.isArray(configs) ? configs : [])
      .filter((config) => config?.isCustom === true)
      .map((config) => buildCustomLauncher(config))
      .filter(Boolean);
    window.localStorage.setItem(DYNAMIC_LAUNCHER_CACHE_KEY, JSON.stringify(sanitized));
  } catch {
    // Cache write failures only affect cold-start routes; ignore.
  }
  return registered;
}
