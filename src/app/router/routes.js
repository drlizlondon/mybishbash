import { isKnownLauncher } from "../../lib/launcherRegistry";

const BASE_PATH = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const PRODUCTION_BASE_PATH = "/" + "mybishbash";
const LEGACY_BASE_PATHS = [PRODUCTION_BASE_PATH, "/bishbash"];
const APP_SHELL_TABS = ["home", "library", "log", "explore", "apps", "access", "settings"];

function normalizeRoutePath(path) {
  if (!path) return "/";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function getPathRelativeToKnownBase(pathname) {
  const cleanPathname = String(pathname || "/");
  const knownBasePaths = Array.from(new Set([BASE_PATH, ...LEGACY_BASE_PATHS].filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  const matchingBase = knownBasePaths.find((basePath) => cleanPathname === basePath || cleanPathname.startsWith(`${basePath}/`));
  return matchingBase ? cleanPathname.slice(matchingBase.length) || "/" : cleanPathname || "/";
}

function getRouteFromLocation(setupComplete) {
  if (typeof window === "undefined") {
    return setupComplete ? "/home" : "/onboarding";
  }

  const params = new URLSearchParams(window.location.search);
  const routeParam = params.get("route");
  const disguiseParam = params.get("disguise");
  const disguisedVersion = isKnownLauncher(disguiseParam) ? disguiseParam : null;
  if (disguisedVersion) {
    return `/intercept/${disguisedVersion}`;
  }

  const rawPath = routeParam ? getPathRelativeToKnownBase(routeParam) : getPathRelativeToKnownBase(window.location.pathname);
  const normalized = normalizeRoutePath(rawPath);

  if (routeParam) {
    params.delete("route");
    const remainingSearch = params.toString();
    window.history.replaceState(
      {},
      "",
      `${BASE_PATH}${normalized}${remainingSearch ? `?${remainingSearch}` : ""}`,
    );
  }

  if (normalized === "/" || normalized === "/index.html") {
    return setupComplete ? "/home" : "/onboarding";
  }

  const interceptMatch = normalized.match(/^\/intercept\/([^/]+)$/);
  const validInterceptPath = interceptMatch && isKnownLauncher(interceptMatch[1]);

  if (!setupComplete && normalized !== "/onboarding" && !validInterceptPath) {
    return "/onboarding";
  }

  return normalized;
}

function parseRoute(path) {
  const normalized = normalizeRoutePath(path);

  if (normalized === "/onboarding") {
    return { kind: "onboarding", path: normalized, tab: "home" };
  }

  const interceptMatch = normalized.match(/^\/intercept\/([^/]+)$/);
  if (interceptMatch && isKnownLauncher(interceptMatch[1])) {
    return {
      kind: "intercept",
      path: normalized,
      tab: null,
      versionId: interceptMatch[1],
    };
  }

  if (interceptMatch) {
    return { kind: "invalid-intercept", path: "/home", tab: "home", versionId: interceptMatch[1] };
  }

  const cardMatch = normalized.match(/^\/card\/([^/]+)$/);
  if (cardMatch) {
    return {
      kind: "card",
      path: normalized,
      tab: "home",
      cardId: decodeURIComponent(cardMatch[1]),
    };
  }

  if (normalized === "/caught-up") return { kind: "caught-up", path: normalized, tab: "home" };
  if (normalized === "/hq") return { kind: "hq", path: normalized, tab: null };
  if (normalized === "/preview-continue") return { kind: "preview-continue", path: normalized, tab: null };
  if (normalized === "/log") return { kind: "log", path: normalized, tab: "log" };
  if (normalized === "/explore") return { kind: "explore", path: normalized, tab: "explore" };
  // Legacy route: Packs became Explore (docs/explore-architecture.md).
  if (normalized === "/packs") return { kind: "explore", path: "/explore", tab: "explore" };
  if (normalized === "/library") return { kind: "library", path: normalized, tab: "library" };
  if (normalized === "/apps") return { kind: "apps", path: normalized, tab: "apps" };
  const appsMatch = normalized.match(/^\/apps\/([^/]+)$/);
  if (appsMatch && isKnownLauncher(appsMatch[1])) {
    return { kind: "apps", path: normalized, tab: "apps", versionId: appsMatch[1] };
  }
  if (appsMatch) {
    return { kind: "apps", path: "/apps", tab: "apps", versionId: null, fallbackFrom: normalized };
  }
  if (normalized === "/access") return { kind: "access", path: normalized, tab: "access" };
  if (normalized === "/mood") return { kind: "settings", path: "/settings", tab: "settings" };
  if (normalized === "/settings") return { kind: "settings", path: normalized, tab: "settings" };
  return { kind: "home", path: "/home", tab: "home", fallbackFrom: normalized };
}

function getSafeAppTab(tab) {
  return APP_SHELL_TABS.includes(tab) ? tab : "home";
}

// BOTTOM_NAV_ITEMS stays in App.jsx: its Glyph components (HomeGlyph,
// BookGlyph, PacksGlyph, AppsGlyph) are defined there. This function is
// generic — callers pass the items list explicitly.
function getBottomNavItems(items) {
  return items.filter((item) =>
    item &&
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    typeof item.path === "string" &&
    typeof item.testId === "string" &&
    typeof item.Glyph === "function"
  );
}

export {
  BASE_PATH,
  PRODUCTION_BASE_PATH,
  LEGACY_BASE_PATHS,
  APP_SHELL_TABS,
  normalizeRoutePath,
  getPathRelativeToKnownBase,
  getRouteFromLocation,
  parseRoute,
  getSafeAppTab,
  getBottomNavItems,
};
