import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
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

assert.ok(
  /const APP_BASE = new URL\("\.\/", self\.location\)\.pathname;/.test(serviceWorker) ||
    /const APP_BASE = "\/";/.test(serviceWorker),
  "Cloudflare service worker should be scoped to the root path",
);
assert.doesNotMatch(serviceWorker, /const APP_BASE = "\/mybishbash\//);
assert.doesNotMatch(serviceWorker, /\/mybishbash(?=\/|["'?#$]|$)/);
assert.ok(version.sourceSha, "Cloudflare version.json should include sourceSha for deployment verification");

console.log("Cloudflare production build validated for /");
