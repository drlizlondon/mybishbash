import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing__, trackAccountCreated, trackWaitlistJoined } from "./analytics.js";

const { CONSENT_KEY, ANALYTICS_HOSTS, isAnalyticsHost } = __testing__;
const PROD_HOST = ANALYTICS_HOSTS[0];

// vitest.config.js runs unit tests in the "node" environment (no DOM), so we
// stub a minimal window + localStorage, matching the pattern already used by
// src/storage.funnel.bytes.test.js for the same reason.
function memoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

let fakeWindow;
let originalProd;

function grantConsent() {
  fakeWindow.localStorage.setItem(CONSENT_KEY, JSON.stringify({ value: "granted", decidedAt: Date.now() }));
}

function denyConsent() {
  fakeWindow.localStorage.setItem(CONSENT_KEY, JSON.stringify({ value: "denied", decidedAt: Date.now() }));
}

// The "everything is allowed" baseline for tests that exercise the firing
// path: production build, production host, consent granted, gtag present.
function makeItFire() {
  import.meta.env.PROD = true;
  fakeWindow.location.hostname = PROD_HOST;
  grantConsent();
}

describe("analytics", () => {
  beforeEach(() => {
    originalProd = import.meta.env.PROD;
    fakeWindow = { localStorage: memoryLocalStorage(), gtag: vi.fn(), location: { hostname: "localhost" } };
    vi.stubGlobal("window", fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    import.meta.env.PROD = originalProd;
  });

  describe("trackWaitlistJoined", () => {
    it("fires generate_lead with method=waitlist once, when everything is allowed", () => {
      makeItFire();
      trackWaitlistJoined();
      expect(fakeWindow.gtag).toHaveBeenCalledTimes(1);
      expect(fakeWindow.gtag).toHaveBeenCalledWith("event", "generate_lead", { method: "waitlist" });
    });

    it("does not fire when consent has not been decided", () => {
      import.meta.env.PROD = true;
      fakeWindow.location.hostname = PROD_HOST;
      trackWaitlistJoined();
      expect(fakeWindow.gtag).not.toHaveBeenCalled();
    });

    it("does not fire when consent was denied", () => {
      import.meta.env.PROD = true;
      fakeWindow.location.hostname = PROD_HOST;
      denyConsent();
      trackWaitlistJoined();
      expect(fakeWindow.gtag).not.toHaveBeenCalled();
    });
  });

  describe("trackAccountCreated", () => {
    it("fires sign_up with the given method once, when everything is allowed", () => {
      makeItFire();
      trackAccountCreated("email");
      expect(fakeWindow.gtag).toHaveBeenCalledTimes(1);
      expect(fakeWindow.gtag).toHaveBeenCalledWith("event", "sign_up", { method: "email" });
    });

    it("defaults method to email", () => {
      makeItFire();
      trackAccountCreated();
      expect(fakeWindow.gtag).toHaveBeenCalledWith("event", "sign_up", { method: "email" });
    });

    it("does not fire without consent", () => {
      import.meta.env.PROD = true;
      fakeWindow.location.hostname = PROD_HOST;
      trackAccountCreated("email");
      expect(fakeWindow.gtag).not.toHaveBeenCalled();
    });
  });

  it("never sends personal data (email/name) in params", () => {
    makeItFire();
    trackWaitlistJoined();
    trackAccountCreated("email");
    for (const call of fakeWindow.gtag.mock.calls) {
      const params = call[2] ?? {};
      const serialized = JSON.stringify(params).toLowerCase();
      expect(serialized).not.toMatch(/@|name/);
    }
  });

  it("does nothing if window.gtag was never installed, even with everything else allowed", () => {
    import.meta.env.PROD = true;
    fakeWindow.location.hostname = PROD_HOST;
    grantConsent();
    delete fakeWindow.gtag;
    expect(() => trackWaitlistJoined()).not.toThrow();
  });

  it("does nothing if localStorage throws (private mode / storage unavailable)", () => {
    import.meta.env.PROD = true;
    fakeWindow.location.hostname = PROD_HOST;
    fakeWindow.localStorage.getItem = () => {
      throw new Error("storage disabled");
    };
    expect(() => trackWaitlistJoined()).not.toThrow();
    expect(fakeWindow.gtag).not.toHaveBeenCalled();
  });

  // MC evidence (2026-09-26): ~2,974 sessions hit the real GA4 property from
  // 127.0.0.1 between 07-29 and 09-02, traced to an old unconditional gtag
  // script in index.html (removed in commit feba94e). These guard against
  // that shape of regression at the event-firing layer.
  describe("test/CI/dev-build guard (import.meta.env.PROD)", () => {
    it("never fires in this test run's own build mode (PROD=false), even with host+consent+gtag all present", () => {
      expect(import.meta.env.PROD).toBe(false);
      fakeWindow.location.hostname = PROD_HOST;
      grantConsent();
      trackWaitlistJoined();
      trackAccountCreated("email");
      expect(fakeWindow.gtag).not.toHaveBeenCalled();
    });

    it("does not fire on a prod build if the host is not an analytics host", () => {
      import.meta.env.PROD = true;
      fakeWindow.location.hostname = "localhost";
      grantConsent();
      trackWaitlistJoined();
      expect(fakeWindow.gtag).not.toHaveBeenCalled();
    });
  });

  describe("isAnalyticsHost", () => {
    it("allows the production hosts", () => {
      for (const host of ANALYTICS_HOSTS) {
        fakeWindow.location.hostname = host;
        expect(isAnalyticsHost()).toBe(true);
      }
    });

    it("rejects localhost and 127.0.0.1", () => {
      for (const host of ["localhost", "127.0.0.1", "0.0.0.0", "::1"]) {
        fakeWindow.location.hostname = host;
        expect(isAnalyticsHost()).toBe(false);
      }
    });

    it("rejects an unrelated or preview/staging host not on the allowlist", () => {
      fakeWindow.location.hostname = "mybishbash-preview.pages.dev";
      expect(isAnalyticsHost()).toBe(false);
    });
  });
});
