import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { deriveClientRoutes } from "./derive-client-routes.mjs";
import { ROUTE_META } from "../src/content/routeMeta.js";

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
// 404 for it and crawlers never index the page. Both spellings are required:
// dist/privacy.html serves "/privacy" as a direct 200, while
// dist/privacy/index.html alone answers 308 to "/privacy/" on Cloudflare Pages.
for (const route of deriveClientRoutes()) {
  for (const routeFile of [`dist${route.path}.html`, `dist${route.path}/index.html`]) {
    assert.ok(existsSync(routeFile), `Cloudflare build must prerender ${route.path} as ${routeFile} so it returns 200`);
    const routeHtml = readFileSync(routeFile, "utf8");
    assert.match(
      routeHtml,
      new RegExp(`<link rel="canonical" href="https://mybishbash\\.app${route.path}"`),
      `${routeFile} should be self-canonical, not canonical to /`,
    );
    if (route.indexable) {
      assert.match(routeHtml, /<meta name="robots" content="index, follow/, `${route.path} is a public page and should stay indexable`);
      // Each public page is served with its own title and description, so
      // search results stop showing six copies of the homepage listing.
      const meta = ROUTE_META[route.path];
      assert.ok(meta, `${route.path} is a public page and needs an entry in src/content/routeMeta.js`);
      assert.equal(servedTag(routeHtml, /<title>([^<]*)<\/title>/), meta.title, `${routeFile} should serve its own <title>`);
      for (const pattern of [
        /<meta\s+name="description"\s+content="([^"]*)"/,
        /<meta\s+property="og:description"\s+content="([^"]*)"/,
        /<meta\s+name="twitter:description"\s+content="([^"]*)"/,
      ]) {
        assert.equal(servedTag(routeHtml, pattern), meta.description, `${routeFile} should serve its own description (${pattern})`);
      }
      for (const pattern of [/<meta property="og:title" content="([^"]*)"/, /<meta name="twitter:title" content="([^"]*)"/]) {
        assert.equal(servedTag(routeHtml, pattern), meta.title, `${routeFile} should serve its own social title (${pattern})`);
      }
    } else {
      assert.match(routeHtml, /<meta name="robots" content="noindex, follow"/, `${route.path} is an app route and should be noindex`);
    }
  }
}

// No two public pages (or a page and the homepage) may share a title.
const publicTitles = [servedTag(html, /<title>([^<]*)<\/title>/), ...deriveClientRoutes().filter((r) => r.indexable).map((r) => ROUTE_META[r.path].title)];
assert.equal(new Set(publicTitles).size, publicTitles.length, `public page titles must be unique: ${publicTitles.join(" / ")}`);
for (const text of [...publicTitles, ...Object.values(ROUTE_META).map((m) => m.description)]) {
  assert.doesNotMatch(text, /\u2014/, `route meta must not contain an em dash: ${text}`);
}

assert.match(serviceWorker, /const APP_BASE = new URL\("\.\/", self\.location\)\.pathname;/);
assert.doesNotMatch(serviceWorker, /const APP_BASE = "\/mybishbash\//);
assert.ok(version.sourceSha, "Cloudflare version.json should include sourceSha for deployment verification");

console.log("Cloudflare production build validated for /");

function servedTag(source, pattern) {
  const match = source.match(pattern);
  return match ? match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"') : undefined;
}
