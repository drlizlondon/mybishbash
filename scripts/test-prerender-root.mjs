// MBB-28 guard: dist/index.html must arrive with the landing already inside
// #root, the landing must never show to app-bound visitors, and the SSR bundle
// must not ship. Builds the real site, then proves each check can fail with
// mutants (injection plugin removed, inline hide script removed).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { landingContent } from "../src/content/landingContent.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
}

function text(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function rootInner(html) {
  const start = html.indexOf('<div id="root">');
  return start < 0 ? "" : html.slice(start, html.indexOf("</body>"));
}

// Static checks on a built directory. Returns a list of failure messages.
function staticFailures(dir) {
  const out = [];
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const rootHtml = rootInner(html);
  // h1 text comes from the landing's content source, never typed here.
  const h1 = (rootHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const expected = landingContent.hero.headline[0];
  if (!h1 || !text(h1).includes(expected)) out.push(`#root h1 does not contain landing headline "${expected}"`);
  if (!rootHtml.includes("<div data-prerender>")) out.push("#root is not wrapped in <div data-prerender>");
  for (const route of ["home.html", "about.html", "early-access.html"]) {
    if (existsSync(join(dir, route)) && readFileSync(join(dir, route), "utf8").includes("<div data-prerender>")) {
      out.push(`${route} carries the landing prerender (only / may)`);
    }
  }
  if (existsSync(join(dir, "dist-prerender")) || existsSync(join(dir, "entry-prerender.js"))) out.push("SSR bundle was copied into dist");
  // G6: pre-rendered markup holds no storage-derived value.
  if (/localStorage|sessionStorage|indexedDB/.test(rootHtml)) out.push("#root mentions a storage API");
  return out;
}

function serve(dir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let file = join(dir, decodeURIComponent(url.pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = join(dir, "index.html");
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

// Visibility of the prerendered block at first paint, with all JS blocked so the
// answer comes from the inline head script and CSS alone.
async function visibilityFailures(dir) {
  const out = [];
  const server = await serve(dir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const cases = [
    ["plain first visit", "/", "", true],
    ["?route=x", "/?route=x", "", false],
    ["window.Capacitor", "/", "window.Capacitor = {};", false],
    ["display-mode standalone", "/", "const m = window.matchMedia.bind(window); window.matchMedia = (q) => q.includes('standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : m(q);", false],
    ["navigator.standalone", "/", "Object.defineProperty(window.navigator, 'standalone', { value: true });", false],
  ];
  try {
    for (const [label, path, init, shouldShow] of cases) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.route(/\.js(\?.*)?$/, (route) => route.abort()); // no bundle, no mbb-consent.js
      if (init) await page.addInitScript(init);
      await page.goto(base + path, { waitUntil: "domcontentloaded" });
      const display = await page.evaluate(() => {
        const el = document.querySelector("[data-prerender]");
        return el ? getComputedStyle(el).display : "missing";
      });
      const visible = display !== "none" && display !== "missing";
      if (visible !== shouldShow) out.push(`${label}: prerender display=${display}, expected ${shouldShow ? "visible" : "hidden"}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

async function allFailures(dir) {
  return [...staticFailures(dir), ...(await visibilityFailures(dir))];
}

// 1. The real build.
run("npm", ["run", "build"]);
const real = await allFailures(join(root, "dist"));
if (real.length) {
  console.error("FAIL real build:\n - " + real.join("\n - "));
  process.exit(1);
}
console.log("PASS real build: landing h1 is inside #root, hidden for app-bound visitors, SSR bundle not shipped");

// 2. Mutant A: build with the injection plugin removed. Must fail.
const mutantConfig = join(root, "vite.mutant-no-inject.config.js");
const mutantOut = join(root, "dist-mutant");
try {
  const cfg = readFileSync(join(root, "vite.config.js"), "utf8");
  const mutated = cfg.replace(", landingPrerenderInjectPlugin()],", "],");
  assert.notEqual(mutated, cfg, "mutant could not remove the injection plugin");
  writeFileSync(mutantConfig, mutated);
  run("npx", ["vite", "build", "--config", mutantConfig, "--outDir", mutantOut]);
  const a = staticFailures(mutantOut);
  if (!a.length) {
    console.error("FAIL mutant (injection removed) was not caught");
    process.exit(1);
  }
  console.log(`PASS mutant (injection removed) is caught: ${a[0]}`);

  // 3. Mutant B: real build output with the inline hide script stripped. Must fail.
  const tmp = mkdtempSync(join(tmpdir(), "mbb28-"));
  cpSync(join(root, "dist"), tmp, { recursive: true });
  const idx = readFileSync(join(tmp, "index.html"), "utf8");
  const stripped = idx.replace(/<script>\s*\(function \(\) \{[\s\S]*?data-app[\s\S]*?<\/script>/, "");
  assert.notEqual(stripped, idx, "mutant could not strip the inline script");
  writeFileSync(join(tmp, "index.html"), stripped);
  const b = await visibilityFailures(tmp);
  rmSync(tmp, { recursive: true, force: true });
  if (!b.some((m) => m.startsWith("window.Capacitor"))) {
    console.error("FAIL mutant (inline script removed) did not fail the Capacitor case: " + JSON.stringify(b));
    process.exit(1);
  }
  console.log(`PASS mutant (inline script removed) is caught: ${b.find((m) => m.startsWith("window.Capacitor"))}`);
} finally {
  rmSync(mutantConfig, { force: true });
  rmSync(mutantOut, { recursive: true, force: true });
}
