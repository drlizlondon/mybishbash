const SENSITIVE_KEY_PATTERN = /(token|auth|session|password|secret|supabase|jwt|refresh|access|credential)/i;
const SAFE_KEY_PATTERN = /^mybishbash\.(launcher-session-id|install|version|display|setup|selected|onboarding|notifications)/i;

function safeReadLocalStorageKeys() {
  if (typeof window === "undefined" || !window.localStorage) return {};

  const summary = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith("mybishbash.")) continue;
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      summary[key] = { present: true, redacted: true };
      continue;
    }
    summary[key] = {
      present: true,
      valueIncluded: SAFE_KEY_PATTERN.test(key),
    };
  }
  return summary;
}

function summarizeRecentEvents(events = []) {
  const recent = Array.isArray(events) ? events.slice(0, 25) : [];
  const types = recent.map((event) => event?.event_type).filter(Boolean);
  return {
    count: recent.length,
    types: Array.from(new Set(types)),
  };
}

export function getDeviceSummary() {
  if (typeof navigator === "undefined") return "unknown device";
  const platform = navigator.platform || "unknown platform";
  const userAgent = navigator.userAgent || "unknown browser";
  return `${platform} / ${userAgent}`;
}

export function collectTestPilotDiagnostics({
  appVersion,
  displayMode,
  getDisplayMode,
  launcherContext,
  recentEvents = [],
  route,
  selectedLauncher,
  setupComplete,
  extra = {},
} = {}) {
  const resolvedRoute = route ?? (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "");
  const resolvedDisplayMode = displayMode ?? getDisplayMode?.() ?? "browser";
  const viewport = typeof window !== "undefined"
    ? { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 }
    : { width: null, height: null, devicePixelRatio: null };

  return {
    route: resolvedRoute,
    launcherContext: launcherContext ?? null,
    displayMode: resolvedDisplayMode,
    appVersion: appVersion ?? null,
    selectedLauncher: selectedLauncher ?? null,
    setupComplete: Boolean(setupComplete),
    device: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      platform: typeof navigator !== "undefined" ? navigator.platform : null,
      language: typeof navigator !== "undefined" ? navigator.language : null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
    },
    viewport,
    localStorageKeys: safeReadLocalStorageKeys(),
    recentEvents: summarizeRecentEvents(recentEvents),
    ...extra,
  };
}

export function diagnosticsContainsSensitiveValues(diagnostics = {}) {
  const text = JSON.stringify(diagnostics).toLowerCase();
  return ["supabase.auth", "access_token", "refresh_token", "password", "jwt"].some((needle) => text.includes(needle));
}

export function shouldShowTesterTools({ session, testerStatus }) {
  return Boolean(session?.user?.id && testerStatus?.is_tester === true);
}

export const TEST_PILOT_REPORT_TYPES = ["bug", "feedback", "confusion", "idea"];
export const TEST_PILOT_SEVERITIES = ["low", "medium", "high", "blocking"];
export const TEST_PILOT_STATUSES = ["open", "in_review", "fixed", "closed", "not_reproducible"];
