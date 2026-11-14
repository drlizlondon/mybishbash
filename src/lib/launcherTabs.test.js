import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FAKE_APP_LAUNCHERS } from "./launcherRegistry.js";
import { resolveLauncherDestination } from "./launcherDestinations.js";
import { getBrowserSafeDestinationHref, getLauncherBrowserSetupUrl } from "./launcherSetupUrl.js";

// Pins the new-browser-tab invariants (MBB tab pile-up investigation).
// iOS opens a NEW Safari tab for every x-safari- URL. The only launcher that
// uses it is "safari" (ruling 2026-09-05: keep the hand-off, one tab per pause).

const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";

function stubBrowser({ standalone, ua = IOS_UA }) {
  vi.stubGlobal("window", {
    location: { origin: "https://mybishbash.app" },
    navigator: { userAgent: ua, standalone },
    matchMedia: () => ({ matches: standalone }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("x-safari- gating", () => {
  it("is stripped in standalone Safari (a normal browser tab): launch stays in the current tab", () => {
    stubBrowser({ standalone: false });
    expect(getBrowserSafeDestinationHref("x-safari-https://www.google.com")).toBe("https://www.google.com");
    expect(getLauncherBrowserSetupUrl("safari")).not.toMatch(/^x-safari-/);
  });

  it("only the safari launcher ever resolves to x-safari- on iOS (other launches add 0 tabs)", () => {
    for (const launcher of FAKE_APP_LAUNCHERS) {
      for (const opts of [{}, { preferFastDestination: true }, { preferDirectAppDestination: true }]) {
        const r = resolveLauncherDestination(launcher, { platform: "ios", ...opts });
        if (launcher.id !== "safari") expect(r.href.startsWith("x-safari-"), `${launcher.id} ${JSON.stringify(opts)}`).toBe(false);
      }
    }
  });

  it("icon-tap fast path never uses x-safari- for any launcher, incl. safari", () => {
    for (const launcher of FAKE_APP_LAUNCHERS) {
      const r = resolveLauncherDestination(launcher, { platform: "ios", preferFastDestination: true });
      if (launcher.id === "safari") continue; // iOS safari fast path deliberately keeps iosAppUrl
      expect(r.usedXSafariPrefix).toBe(false);
    }
  });

  it("webview/PWA escape: installed PWA on iOS keeps the x-safari- hand-off for the setup page", () => {
    stubBrowser({ standalone: true });
    expect(getLauncherBrowserSetupUrl("safari")).toMatch(/^x-safari-https:\/\//);
    expect(getBrowserSafeDestinationHref("x-safari-https://www.google.com")).toBe("x-safari-https://www.google.com");
  });
});

describe("window.open _blank", () => {
  it("setup interstitial _blank is unreachable on iOS PWA (x-safari branch returns first)", () => {
    stubBrowser({ standalone: true });
    const href = getLauncherBrowserSetupUrl("instagram");
    expect(href.startsWith("x-safari-")).toBe(true); // interstitial takes location.assign branch, never window.open
  });

  it("window.open is only called from the setup interstitial, never from the launch path", () => {
    const launchPath = ["../App.jsx", "./launcherDestinations.js", "../features/launcher/OverlayHost.jsx"];
    for (const f of launchPath) {
      expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/window\.open\(|"_blank"|target="_blank"/);
    }
  });
});
