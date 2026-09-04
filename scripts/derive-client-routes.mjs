// The list of paths the SPA resolves in the browser, derived from the router
// source and the sitemap rather than hand-maintained. A route added to
// RootRouter.jsx or routes.js is therefore prerendered (and asserted) with no
// second list to remember — MBB-6.
//
// Why this exists: mybishbash.app is served by Cloudflare Pages, which matches
// a static file first and otherwise serves the built 404.html *with a 404
// status*. Every client route (/privacy, /invite, /early-access, /about,
// /terms, ...) therefore rendered correctly but answered 404, so crawlers never
// indexed them. Emitting <route>/index.html per route makes each one a real
// static file, which is a 200 on Cloudflare Pages and on GitHub Pages alike.
// 404.html stays as the fallback for genuinely unknown and dynamic paths
// (/card/:id, /intercept/:launcher, /apps/:launcher).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Only plain single-segment routes can be prerendered: no parameters, no dots
// (which would catch "/index.html"), no nesting.
const PRERENDERABLE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Both router files decide the route with a literal comparison:
//   RootRouter.jsx  normalizedPath === "/early-access"
//   routes.js       normalized === "/settings"
const LITERAL_COMPARISON = /===\s*"(\/[^"]*)"/g;

function literalRoutes(source) {
  const found = new Set();
  for (const match of source.matchAll(LITERAL_COMPARISON)) {
    if (PRERENDERABLE.test(match[1])) found.add(match[1]);
  }
  return found;
}

// The app-shell tabs are a list, not comparisons, so read them separately.
function appShellTabRoutes(routesSource) {
  const found = new Set();
  const declaration = routesSource.match(/const APP_SHELL_TABS = \[([^\]]*)\]/);
  if (!declaration) return found;
  for (const match of declaration[1].matchAll(/"([^"]+)"/g)) {
    const path = `/${match[1]}`;
    if (PRERENDERABLE.test(path)) found.add(path);
  }
  return found;
}

function sitemapRoutes(sitemapSource) {
  const found = new Set();
  for (const match of sitemapSource.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let path;
    try {
      path = new URL(match[1]).pathname;
    } catch {
      continue;
    }
    if (PRERENDERABLE.test(path)) found.add(path);
  }
  return found;
}

// Returns [{ path, indexable }] sorted by path.
//
// indexable = the public marketing/legal surface (the routes RootRouter serves
// before the app boots, plus anything the sitemap advertises). The app-shell
// routes behind them (/home, /library, /settings, ...) are real routes that
// must answer 200 when someone opens a shared link, but they are the logged-in
// app, so their prerendered shell is marked noindex.
function deriveClientRoutes(root = repoRoot) {
  const rootRouterSource = readFileSync(join(root, "src/app/router/RootRouter.jsx"), "utf8");
  const routesSource = readFileSync(join(root, "src/app/router/routes.js"), "utf8");
  const sitemapSource = readFileSync(join(root, "public/sitemap.xml"), "utf8");

  const marketing = new Set([...literalRoutes(rootRouterSource), ...sitemapRoutes(sitemapSource)]);
  const app = new Set([...literalRoutes(routesSource), ...appShellTabRoutes(routesSource)]);

  const routes = [];
  for (const path of new Set([...marketing, ...app])) {
    routes.push({ path, indexable: marketing.has(path) });
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

export { deriveClientRoutes, PRERENDERABLE };
