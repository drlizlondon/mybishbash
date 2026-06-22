import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const installScript = readFileSync("public/install/install.js", "utf8");
const storage = new Map();
const context = {
  console: { debug() {} },
  fetch: async () => ({
    ok: true,
    async json() {
      return {
        launchers: [
          {
            id: "safari",
            displayName: "Safari",
            name: "Safari",
            launchPath: "/intercept/safari",
            manifestPath: "/mybishbash-preview/launchers/safari/manifest.webmanifest",
            iconSrc: "/mybishbash-preview/icons/apple-touch-icon.png",
          },
        ],
      };
    },
  }),
  window: {
    location: {
      pathname: "/mybishbash-preview/safari/index.html",
      origin: "https://drlizlondon.github.io",
      search: "",
    },
    matchMedia: () => ({ matches: false }),
    navigator: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    sessionStorage: {
      getItem: () => null,
    },
  },
  document: {
    title: "",
    querySelector: () => null,
  },
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout,
};
context.window.window = context.window;
context.window.console = context.console;
context.window.document = context.document;

vm.runInNewContext(installScript, context, { filename: "public/install/install.js" });

const registry = {
  launchers: [
    { id: "mybishbash", launchPath: "/home" },
    { id: "safari", launchPath: "/intercept/safari" },
    { id: "bbc-news", launchPath: "/intercept/bbc-news" },
  ],
};

assert.equal(context.detectAppBasePath("/mybishbash-preview/safari/index.html"), "/mybishbash-preview");
assert.equal(
  context.resolveLauncherIdFromPath("/mybishbash-preview/safari/index.html", registry, "/mybishbash-preview"),
  "safari",
);
assert.equal(
  context.resolveLauncherIdFromPath("/mybishbash-preview/install/safari/index.html", registry, "/mybishbash-preview"),
  "safari",
);
assert.equal(
  context.resolveLauncherIdFromPath("/mybishbash/safari/index.html", registry, "/mybishbash"),
  "safari",
);
assert.equal(
  context.resolveLauncherIdFromPath("/mybishbash-preview/install/bbc-news/index.html", registry, "/mybishbash-preview"),
  "bbc-news",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.fallbackFakeLauncher("bbc-news", "/mybishbash-preview"))),
  {
    id: "bbc-news",
    displayName: "Bbc News",
    name: "Bbc News",
    iconSrc: "/mybishbash-preview/icons/mybishbash-cover.png",
    manifestPath: "/mybishbash-preview/launchers/bbc-news/manifest.webmanifest",
    launchPath: "/intercept/bbc-news",
  },
);
const safariPayload = context.buildLauncherPayload({
  previewNamespace: "mybishbash",
  fakeAppId: "safari",
  launcher: { id: "safari", launchPath: "/intercept/safari" },
  source: "install_icon",
});
assert.deepEqual(
  {
    appId: safariPayload.appId,
    launcherContext: safariPayload.launcherContext,
    targetRoute: safariPayload.targetRoute,
  },
  {
    appId: "safari",
    launcherContext: "safari",
    targetRoute: "/intercept/safari",
  },
);
assert.notEqual(safariPayload.targetRoute, "/home");

const normalPayload = context.buildLauncherPayload({
  previewNamespace: "mybishbash-preview",
  fakeAppId: "mybishbash",
  launcher: { id: "mybishbash", launchPath: "/home" },
});
assert.equal(normalPayload.launcherContext, "mybishbash");
assert.equal(normalPayload.targetRoute, "/home");
assert.equal(
  context.buildSetupUrl({ appBasePath: "/mybishbash-preview", launcherId: "instagram" }),
  "https://drlizlondon.github.io/mybishbash-preview/install/instagram/",
);
assert.equal(
  context.resolveInstallCompleteUrl({ appBasePath: "/mybishbash-preview", launcherId: "instagram" }),
  "https://drlizlondon.github.io/mybishbash-preview/apps/instagram?installed=1",
);
assert.equal(
  context.resolveInstallCompleteUrl({
    appBasePath: "/mybishbash-preview",
    launcherId: "instagram",
    pendingSetup: { appId: "instagram" },
  }),
  "https://drlizlondon.github.io/mybishbash-preview/home?launcherInstalled=instagram",
);
assert.match(installScript, /copyTextToClipboard/);
assert.match(installScript, /installed=1/);

console.log("Launcher install resolver validated.");
