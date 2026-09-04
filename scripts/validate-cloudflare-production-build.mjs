import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { deriveClientRoutes } from "./derive-client-routes.mjs";

const html = readFileSync("dist/index.html", "utf8");
const redirects = readFileSync("dist/_redirects", "utf8");
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
const serviceWorker = readFileSync("dist/service-worker.js", "utf8");
const version = JSON.parse(readFileSync("dist/version.json", "utf8"));

assert.match(html, /src="\/assets\/index-[^"]+\.js"/, "Cloudflare build should load JS from /assets/");
assert.match(html, /href="\/assets\/index-[^"]+\.css"/, "Cloudflare build should load CSS from /assets/");
assert.match(html, /href="\/manifest\.webmanifest"/, "Cloudflare build should link the root manifest");
assert.match(html, /href="\/icons\/mybishbash-cover\.png"/, "Cloudflare build should link the root touch icon");

assert.doesNotMatch(html, /\/mybishbash(?:\/|-preview\/)/, "Cloudflare index.html must not contain preview or GitHub Pages base paths");
assert.doesNotMatch(html, /drlizlondon\.github\.io/, "Cloudflare index.html must not point canonical metadata at GitHub Pages");

assert.equal(manifest.id, "https://mybishbash.app/");
assert.equal(manifest.start_url, "https://mybishbash.app/home");
assert.equal(manifest.scope, "https://mybishbash.app/");
assert.ok(
  manifest.icons.every((icon) => typeof icon.src === "string" && icon.src.startsWith("/icons/")),
  "Cloudflare manifest icons should be rooted at /icons/",
);

// SPA fallback: without a catch-all rewrite to index.html, direct navigation to
// runtime-resolved routes (/early-access, /invite, /about, /download, /home)
// returns Cloudflare's 404 page instead of booting the app — the signup links
// were dead for exactly this reason. Real static files still win over this rule.
// Kept, but it is NOT what makes deep links work: with this rule live on main,
// https://mybishbash.app/privacy still answered HTTP 404 (body rendered, status
// 404), because dist/404.html wins over the rewrite. The prerendered route files
// asserted below are the mechanism that produces a real 200 (MBB-6).
assert.match(redirects, /^\/\*\s+\/index\.html\s+200\s*$/m, "Cloudflare build must ship a _redirects SPA fallback (/* /index.html 200)");

// Every client route must exist as a real static file, or the platform answers
// 404 for it and crawlers never index the page.
for (const route of deriveClientRoutes()) {
  const routeIndex = `dist${route.path}/index.html`;
  assert.ok(existsSync(routeIndex), `Cloudflare build must prerender ${route.path} as ${routeIndex} so it returns 200`);
  const routeHtml = readFileSync(routeIndex, "utf8");
  assert.match(
    routeHtml,
    new RegExp(`<link rel="canonical" href="https://mybishbash\\.app${route.path}"`),
    `${route.path} should be self-canonical, not canonical to /`,
  );
  if (route.indexable) {
    assert.match(routeHtml, /<meta name="robots" content="index, follow/, `${route.path} is a public page and should stay indexable`);
  } else {
    assert.match(routeHtml, /<meta name="robots" content="noindex, follow"/, `${route.path} is an app route and should be noindex`);
  }
}

assert.match(serviceWorker, /const APP_BASE = new URL\("\.\/", self\.location\)\.pathname;/);
assert.doesNotMatch(serviceWorker, /const APP_BASE = "\/mybishbash\//);
assert.ok(version.sourceSha, "Cloudflare version.json should include sourceSha for deployment verification");

console.log("Cloudflare production build validated for /");
