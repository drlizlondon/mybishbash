import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
assert.match(redirects, /^\/\*\s+\/index\.html\s+200\s*$/m, "Cloudflare build must ship a _redirects SPA fallback (/* /index.html 200)");

assert.match(serviceWorker, /const APP_BASE = new URL\("\.\/", self\.location\)\.pathname;/);
assert.doesNotMatch(serviceWorker, /const APP_BASE = "\/mybishbash\//);
assert.ok(version.sourceSha, "Cloudflare version.json should include sourceSha for deployment verification");

console.log("Cloudflare production build validated for /");
