import { describe, expect, it } from "vitest";
import {
  FAKE_APP_LAUNCHERS,
  LAUNCHER_IDS,
  LAUNCHER_ID_PATTERN,
  LAUNCHER_REGISTRY,
  mergeLauncherConfig,
  normalizeLauncherOverride,
} from "./launcherRegistry.js";

describe("static registry invariant", () => {
  it("keeps the static launcher IDs stable (installed shells depend on them)", () => {
    // This list is load-bearing: installed PWA shells and intercept routes
    // reference these IDs forever. Removing or renaming one is a breaking
    // change that must be a deliberate decision, not a side effect.
    expect([...LAUNCHER_IDS].sort()).toEqual([
      "bbc-news",
      "chrome",
      "duolingo",
      "instagram",
      "linkedin",
      "reddit",
      "safari",
      "whatsapp",
      "youtube",
    ]);
  });

  it("has unique, pattern-conformant IDs and a registry keyed by them", () => {
    expect(new Set(LAUNCHER_IDS).size).toBe(LAUNCHER_IDS.length);
    for (const id of LAUNCHER_IDS) {
      expect(id).toMatch(LAUNCHER_ID_PATTERN);
      expect(LAUNCHER_REGISTRY[id].id).toBe(id);
    }
    expect(Object.keys(LAUNCHER_REGISTRY).sort()).toEqual([...LAUNCHER_IDS].sort());
  });

  it("gives every static launcher the fields the launch flow depends on", () => {
    for (const launcher of FAKE_APP_LAUNCHERS) {
      expect(launcher.launchPath).toBe(`/intercept/${launcher.id}`);
      expect(typeof launcher.displayName).toBe("string");
      expect(launcher.displayName.length).toBeGreaterThan(0);
      expect(typeof launcher.installPath).toBe("string");
      expect(typeof launcher.manifestPath).toBe("string");
    }
  });
});

describe("normalizeLauncherOverride", () => {
  it("keeps only HQ-editable fields and drops empty or null values", () => {
    const normalized = normalizeLauncherOverride({
      displayName: "  New Name  ",
      qaNotes: "",
      launchPath: "/intercept/evil",
      id: "evil",
      nativeAppUrl: null,
    });
    expect(normalized).toEqual({ displayName: "New Name" });
  });

  it("rejects non-boolean values for boolean fields", () => {
    expect(normalizeLauncherOverride({ enabled: "true" })).toEqual({});
    expect(normalizeLauncherOverride({ enabled: false })).toEqual({ enabled: false });
  });

  it("rejects invalid availability statuses", () => {
    expect(normalizeLauncherOverride({ availabilityStatus: "sort_of_live" })).toEqual({});
    expect(normalizeLauncherOverride({ availabilityStatus: "tester_only" })).toEqual({
      availabilityStatus: "tester_only",
    });
  });
});

describe("mergeLauncherConfig", () => {
  const base = LAUNCHER_REGISTRY.youtube;

  it("returns null without a default launcher", () => {
    expect(mergeLauncherConfig(null, { displayName: "X" })).toBeNull();
  });

  it("merges HQ overrides but never lets them change identity fields", () => {
    const merged = mergeLauncherConfig(base, {
      id: "hijacked",
      category: "other",
      installPath: "/elsewhere",
      launchPath: "/intercept/elsewhere",
      displayName: "Tube",
    });
    expect(merged.id).toBe("youtube");
    expect(merged.category).toBe(base.category);
    expect(merged.installPath).toBe(base.installPath);
    expect(merged.launchPath).toBe(base.launchPath);
    expect(merged.displayName).toBe("Tube");
  });

  it("keeps enabled and availabilityStatus consistent", () => {
    const testerOnly = mergeLauncherConfig(base, { availabilityStatus: "tester_only" });
    expect(testerOnly.availabilityStatus).toBe("tester_only");
    expect(testerOnly.enabled).toBe(false);

    const publiclyAvailable = mergeLauncherConfig(base, { availabilityStatus: "public" });
    expect(publiclyAvailable.enabled).toBe(true);
  });

  it("maps a legacy enabled=false override onto a non-public status", () => {
    const merged = mergeLauncherConfig(base, { enabled: false });
    expect(merged.enabled).toBe(false);
    expect(merged.availabilityStatus).not.toBe("public");
  });

  it("with no override returns the launcher unchanged in the fields that matter", () => {
    const merged = mergeLauncherConfig(base, {});
    expect(merged.id).toBe(base.id);
    expect(merged.displayName).toBe(base.displayName);
    expect(merged.availabilityStatus).toBe(base.availabilityStatus);
    expect(merged.enabled).toBe(base.enabled);
  });
});
