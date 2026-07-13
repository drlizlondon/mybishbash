import { describe, expect, it, afterEach, vi } from "vitest";
import {
  getPathRelativeToKnownBase,
  getRouteFromLocation,
  getSafeAppTab,
  getBottomNavItems,
  normalizeRoutePath,
  parseRoute,
} from "./routes";
import { registerDynamicLaunchers, resetDynamicLaunchersForTests } from "../../lib/launcherRegistry";

afterEach(() => {
  resetDynamicLaunchersForTests();
  vi.unstubAllGlobals();
});

describe("getRouteFromLocation — no window (SSR/unit environment)", () => {
  it("goes to onboarding when setup is incomplete", () => {
    expect(getRouteFromLocation(false)).toBe("/onboarding");
  });
  it("goes home when setup is complete", () => {
    expect(getRouteFromLocation(true)).toBe("/home");
  });
});

function stubWindow({ pathname = "/", search = "" } = {}) {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname, search },
    history: { replaceState },
  });
  return replaceState;
}

describe("getRouteFromLocation — with a stubbed window", () => {
  it("returns onboarding for the root path when setup is incomplete", () => {
    stubWindow({ pathname: "/" });
    expect(getRouteFromLocation(false)).toBe("/onboarding");
  });
  it("returns home for the root path when setup is complete", () => {
    stubWindow({ pathname: "/" });
    expect(getRouteFromLocation(true)).toBe("/home");
  });
  it("resolves a known-launcher ?disguise= param to an intercept route", () => {
    stubWindow({ pathname: "/", search: "?disguise=safari" });
    expect(getRouteFromLocation(true)).toBe("/intercept/safari");
  });
  it("ignores an unknown-launcher ?disguise= param", () => {
    stubWindow({ pathname: "/", search: "?disguise=not-a-real-launcher" });
    expect(getRouteFromLocation(true)).toBe("/home");
  });
  it("resolves a ?route= param and rewrites history", () => {
    const replaceState = stubWindow({ pathname: "/", search: "?route=%2Flibrary" });
    expect(getRouteFromLocation(true)).toBe("/library");
    expect(replaceState).toHaveBeenCalled();
  });
  it("strips the legacy /mybishbash base path from the real pathname", () => {
    stubWindow({ pathname: "/mybishbash/library" });
    expect(getRouteFromLocation(true)).toBe("/library");
  });
  it("redirects an incomplete setup on a non-onboarding path back to onboarding", () => {
    stubWindow({ pathname: "/library" });
    expect(getRouteFromLocation(false)).toBe("/onboarding");
  });
  it("allows a valid intercept path through even with setup incomplete", () => {
    stubWindow({ pathname: "/intercept/safari" });
    expect(getRouteFromLocation(false)).toBe("/intercept/safari");
  });
});

describe("normalizeRoutePath", () => {
  it("adds a leading slash", () => {
    expect(normalizeRoutePath("home")).toBe("/home");
  });
  it("strips trailing slashes except root", () => {
    expect(normalizeRoutePath("/home/")).toBe("/home");
    expect(normalizeRoutePath("/")).toBe("/");
  });
  it("defaults empty input to root", () => {
    expect(normalizeRoutePath("")).toBe("/");
    expect(normalizeRoutePath(null)).toBe("/");
  });
});

describe("getPathRelativeToKnownBase", () => {
  it("strips the production base path", () => {
    expect(getPathRelativeToKnownBase("/mybishbash/home")).toBe("/home");
  });
  it("strips the legacy /bishbash base path", () => {
    expect(getPathRelativeToKnownBase("/bishbash/library")).toBe("/library");
  });
  it("returns / when the path equals the base", () => {
    expect(getPathRelativeToKnownBase("/mybishbash")).toBe("/");
  });
  it("passes through unknown paths unchanged", () => {
    expect(getPathRelativeToKnownBase("/home")).toBe("/home");
  });
});

describe("parseRoute — URL shape table", () => {
  const cases = [
    ["/home", { kind: "home", path: "/home", tab: "home", fallbackFrom: "/home" }],
    ["/library", { kind: "library", path: "/library", tab: "library" }],
    ["/log", { kind: "log", path: "/log", tab: "log" }],
    ["/explore", { kind: "explore", path: "/explore", tab: "explore" }],
    ["/packs", { kind: "explore", path: "/explore", tab: "explore" }],
    ["/apps", { kind: "apps", path: "/apps", tab: "apps" }],
    ["/access", { kind: "access", path: "/access", tab: "access" }],
    ["/settings", { kind: "settings", path: "/settings", tab: "settings" }],
    ["/mood", { kind: "settings", path: "/settings", tab: "settings" }],
    ["/onboarding", { kind: "onboarding", path: "/onboarding", tab: "home" }],
    ["/caught-up", { kind: "caught-up", path: "/caught-up", tab: "home" }],
    ["/hq", { kind: "hq", path: "/hq", tab: null }],
    ["/preview-continue", { kind: "preview-continue", path: "/preview-continue", tab: null }],
    ["/card/abc-123", { kind: "card", path: "/card/abc-123", tab: "home", cardId: "abc-123" }],
    ["/", { kind: "home", path: "/home", tab: "home", fallbackFrom: "/" }],
    ["/index.html", { kind: "home", path: "/home", tab: "home", fallbackFrom: "/index.html" }],
    ["/nonexistent", { kind: "home", path: "/home", tab: "home", fallbackFrom: "/nonexistent" }],
  ];

  for (const [path, expected] of cases) {
    it(`parses ${path}`, () => {
      expect(parseRoute(path)).toEqual(expected);
    });
  }

  it("parses a static known launcher intercept path", () => {
    expect(parseRoute("/intercept/safari")).toEqual({
      kind: "intercept",
      path: "/intercept/safari",
      tab: null,
      versionId: "safari",
    });
  });

  it("parses an intercept path for an unknown launcher as invalid-intercept", () => {
    expect(parseRoute("/intercept/not-a-real-launcher")).toEqual({
      kind: "invalid-intercept",
      path: "/home",
      tab: "home",
      versionId: "not-a-real-launcher",
    });
  });

  it("parses an intercept path for an HQ-registered dynamic launcher", () => {
    registerDynamicLaunchers([
      {
        id: "hq-dynamic-launcher",
        isCustom: true,
        displayName: "HQ Dynamic",
        name: "HQ Dynamic",
        installPath: "/mybishbash/install/hq-dynamic-launcher/",
        launchPath: "/intercept/hq-dynamic-launcher",
        manifestPath: "/mybishbash/launchers/hq-dynamic-launcher/manifest.webmanifest",
      },
    ]);
    expect(parseRoute("/intercept/hq-dynamic-launcher")).toEqual({
      kind: "intercept",
      path: "/intercept/hq-dynamic-launcher",
      tab: null,
      versionId: "hq-dynamic-launcher",
    });
  });

  it("parses a known-launcher apps detail route", () => {
    expect(parseRoute("/apps/safari")).toEqual({
      kind: "apps",
      path: "/apps/safari",
      tab: "apps",
      versionId: "safari",
    });
  });

  it("falls back an unknown-launcher apps detail route to the apps list", () => {
    expect(parseRoute("/apps/not-a-real-launcher")).toEqual({
      kind: "apps",
      path: "/apps",
      tab: "apps",
      versionId: null,
      fallbackFrom: "/apps/not-a-real-launcher",
    });
  });

  it("normalizes a trailing slash before matching", () => {
    expect(parseRoute("/library/")).toEqual({ kind: "library", path: "/library", tab: "library" });
  });

  it("normalizes a bare path without a leading slash", () => {
    expect(parseRoute("log")).toEqual({ kind: "log", path: "/log", tab: "log" });
  });
});

describe("getSafeAppTab", () => {
  it("passes through a known tab", () => {
    expect(getSafeAppTab("library")).toBe("library");
  });
  it("falls back unknown tabs to home", () => {
    expect(getSafeAppTab("nonexistent")).toBe("home");
    expect(getSafeAppTab(null)).toBe("home");
  });
});

describe("getBottomNavItems", () => {
  it("filters out malformed entries", () => {
    const items = [
      { id: "home", label: "Home", path: "/home", testId: "bottom-nav-home", Glyph: () => null },
      { id: "broken" },
      null,
    ];
    const result = getBottomNavItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("home");
  });
});
