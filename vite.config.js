import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveClientRoutes } from "./scripts/derive-client-routes.mjs";
import {
  FREE_PRICE_AMOUNT,
  FREE_PRICE_CURRENCY,
  PLUS_PRICE_AMOUNT,
  PLUS_PRICE_CURRENCY,
} from "./src/content/pricingConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appVersion = process.env.VITE_APP_VERSION || new Date().toISOString();
const sourceSha = process.env.VITE_SOURCE_SHA || process.env.VITE_GIT_SHA || getGitSha();

const EDITABLE_CONTENT_FILES = {
  "/__save-landing-content": ["src/content/landingContent.js", "landingContent"],
  "/__save-about-content": ["src/content/aboutContent.js", "aboutContent"],
  "/__save-early-access-content": ["src/content/earlyAccessContent.js", "earlyAccessContent"],
  "/__save-onboarding-content": ["src/content/onboardingContent.js", "onboardingContent"],
  "/__save-download-content": ["src/content/downloadContent.js", "downloadContent"],
  "/__save-auth-content": ["src/content/authContent.js", "authContent"],
};

function localContentEditorPlugin() {
  return {
    name: "local-content-editor",
    apply: "serve",
    configureServer(server) {
      Object.entries(EDITABLE_CONTENT_FILES).forEach(([endpoint, [filePath, exportName]]) => {
        server.middlewares.use(endpoint, async (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method not allowed");
            return;
          }

          let body = "";

          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", () => {
            try {
              const content = JSON.parse(body);
              const file = resolve(__dirname, filePath);
              const existing = readFileSync(file, "utf8");
              const output = replaceNamedExport(existing, exportName, content);

              writeFileSync(file, output);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch (error) {
              res.statusCode = 400;
              res.end(error.message);
            }
          });
        });
      });
    },
  };
}

function replaceNamedExport(source, exportName, value) {
  const exportStart = source.indexOf(`export const ${exportName} =`);
  if (exportStart === -1) {
    throw new Error(`Could not find export const ${exportName}`);
  }

  const valueStart = source.indexOf("=", exportStart) + 1;
  const objectStart = source.indexOf("{", valueStart);
  if (objectStart === -1) {
    throw new Error(`Could not find object for ${exportName}`);
  }

  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      const semicolonIndex = source.indexOf(";", index);
      if (semicolonIndex === -1) {
        throw new Error(`Could not find export terminator for ${exportName}`);
      }

      const nextExport = `export const ${exportName} = ${JSON.stringify(value, null, 2)};`;
      return `${source.slice(0, exportStart)}${nextExport}${source.slice(semicolonIndex + 1)}`;
    }
  }

  throw new Error(`Could not finish reading export ${exportName}`);
}

function legacyBishbashBaseAliasPlugin() {
  return {
    name: "legacy-bishbash-base-alias",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/bishbash" || req.url?.startsWith("/bishbash/")) {
          req.url = req.url.replace(/^\/bishbash(?=\/|$)/, "/mybishbash");
        }
        next();
      });
    },
  };
}

const DEV_PUBLIC_BASE_PREFIXES = [
  "/icons/",
  "/install/",
  "/launchers/",
  "/bbc-news/",
  "/chrome/",
  "/duolingo/",
  "/instagram/",
  "/linkedin/",
  "/mybishbash/",
  "/reddit/",
  "/safari/",
  "/whatsapp/",
  "/youtube/",
];

const DEV_CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function devBasePublicFilesPlugin() {
  return {
    name: "dev-base-public-files",
    apply: "serve",
    configureServer(server) {
      const publicDir = resolve(__dirname, "public");
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url?.split("?")[0] ?? "";
        if (!rawUrl.startsWith("/mybishbash/")) {
          next();
          return;
        }

        const publicPath = rawUrl.replace(/^\/mybishbash(?=\/|$)/, "") || "/";
        if (!DEV_PUBLIC_BASE_PREFIXES.some((prefix) => publicPath === prefix.slice(0, -1) || publicPath.startsWith(prefix))) {
          next();
          return;
        }

        const decodedPath = decodeURIComponent(publicPath);
        const relativePath = decodedPath.replace(/^\/+/, "");
        const candidate = normalize(join(publicDir, relativePath));
        if (!candidate.startsWith(publicDir)) {
          next();
          return;
        }

        const filePath = existsSync(candidate) && statSync(candidate).isDirectory()
          ? join(candidate, "index.html")
          : candidate;
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", DEV_CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream");
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

function appVersionPlugin() {
  return {
    name: "mybishbash-version",
    generateBundle() {
      const builtAt = new Date().toISOString();
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          {
            version: appVersion,
            sourceSha,
            builtAt,
          },
          null,
          2,
        ),
      });
    },
  };
}

// Stamp the built service worker with the per-build version so its bytes change
// every push. Without this the SW is byte-identical each deploy, the browser
// never installs the new one, and its version-keyed caches never rotate —
// leaving installed PWAs on stale assets. The SOURCE file keeps "dev" (release
// guardrails read the source); only the emitted dist/service-worker.js is
// stamped, which is what browsers fetch.
function serviceWorkerVersionPlugin() {
  return {
    name: "mybishbash-sw-version",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir || resolve(__dirname, "dist");
      const swPath = join(outDir, "service-worker.js");
      if (!existsSync(swPath)) return;
      const source = readFileSync(swPath, "utf8");
      const stamped = source.replace(
        /const SERVICE_WORKER_VERSION = "[^"]*";/,
        `const SERVICE_WORKER_VERSION = ${JSON.stringify(String(appVersion))};`,
      );
      if (stamped !== source) writeFileSync(swPath, stamped);
    },
  };
}

// Stamp the built 404.html SPA-fallback with the deployment base so its bounce
// target matches how the site is actually served. GitHub Pages serves 404.html
// for unknown paths; if its base is wrong (e.g. "/mybishbash" on a root-served
// site) every deep link redirects to a path that 404s again — an infinite
// ?route= loop. The source default is "/" (production); staging builds with
// VITE_BASE_PATH=/mybishbash/ get stamped to match.
function fourOhFourBasePlugin() {
  let base = "/";
  return {
    name: "mybishbash-404-base",
    apply: "build",
    configResolved(config) {
      base = config.base || "/";
    },
    writeBundle(options) {
      const outDir = options.dir || resolve(__dirname, "dist");
      const htmlPath = join(outDir, "404.html");
      if (!existsSync(htmlPath)) return;
      const source = readFileSync(htmlPath, "utf8");
      const stamped = source.replace(/var BASE = "[^"]*";/, `var BASE = ${JSON.stringify(base)};`);
      if (stamped !== source) writeFileSync(htmlPath, stamped);
    },
  };
}

// Emit a real static HTML file for every client route, so deep links answer
// HTTP 200 instead of the 404-status SPA fallback (MBB-6).
//
// Cloudflare Pages (production, mybishbash.app) and GitHub Pages (staging) both
// serve a matching static file first and otherwise serve 404.html *with a 404
// status*. The page rendered, but /privacy, /invite, /early-access, /about and
// /terms all answered 404, so search engines and non-JS crawlers dropped them —
// including the cold-traffic CTA target. public/_redirects (`/* /index.html
// 200`) did not fix it: it is deployed on main and those paths still return 404.
// A static file per route is the mechanism both platforms actually honour.
//
// Two files per route, deliberately. Cloudflare Pages resolves "/privacy" as
// exact match, then "privacy.html", then "privacy/index.html" — and the
// directory form answers 308 to "/privacy/" rather than 200 (verified live on
// 2026-09-04). "privacy.html" is what makes the canonical, un-slashed URL in
// the sitemap a direct 200; "privacy/index.html" keeps the trailing-slash form
// a 200 too, so neither spelling of a shared link lands on the 404 page.
//
// 404.html is untouched and still handles unknown and dynamic paths
// (/card/:id, /intercept/:launcher, /apps/:launcher) via its ?route= bounce.
// The route list is derived from the router source and the sitemap — see
// scripts/derive-client-routes.mjs — so there is no second list to maintain.
function routePrerenderPlugin() {
  return {
    name: "mybishbash-route-prerender",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir || resolve(__dirname, "dist");
      const indexPath = join(outDir, "index.html");
      if (!existsSync(indexPath)) return;

      // Read the built index.html so every copy carries the same hashed asset
      // names and the same transformIndexHtml output (pricing schema, etc.).
      const indexHtml = readFileSync(indexPath, "utf8");
      const canonicalOrigin = (indexHtml.match(/<link rel="canonical" href="(https?:\/\/[^/"]+)/) || [])[1];

      for (const route of deriveClientRoutes(__dirname)) {
        const segment = route.path.slice(1);
        // Never shadow a real static page shipped from public/ (launcher pages,
        // /install, ...) — those are already 200s and own their own markup.
        if (existsSync(join(__dirname, "public", segment))) continue;

        let html = indexHtml;
        if (canonicalOrigin) {
          const url = `${canonicalOrigin}${route.path}`;
          html = html
            .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
            .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
        }
        if (!route.indexable) {
          html = html.replace(
            /<meta name="robots" content="[^"]*"\s*\/>/,
            '<meta name="robots" content="noindex, follow" />',
          );
        }

        // "/privacy" -> privacy.html (a direct 200, no redirect).
        writeFileSync(join(outDir, `${segment}.html`), html);
        // "/privacy/" -> privacy/index.html (the trailing-slash spelling).
        const routeDir = join(outDir, segment);
        mkdirSync(routeDir, { recursive: true });
        writeFileSync(join(routeDir, "index.html"), html);
      }
    },
  };
}

// Stamps the SoftwareApplication schema's Offer prices in index.html from
// the single pricing source in src/content/pricingConfig.js, so the visible
// pricing grid and the schema.org price can never drift apart (Inigra MBB-3
// / J4). Runs in both dev and build so no placeholder token is ever served.
function pricingSchemaPlugin() {
  return {
    name: "mybishbash-pricing-schema",
    transformIndexHtml(html) {
      return html
        .replaceAll("__MBB_FREE_PRICE_AMOUNT__", FREE_PRICE_AMOUNT)
        .replaceAll("__MBB_FREE_PRICE_CURRENCY__", FREE_PRICE_CURRENCY)
        .replaceAll("__MBB_PLUS_PRICE_AMOUNT__", PLUS_PRICE_AMOUNT)
        .replaceAll("__MBB_PLUS_PRICE_CURRENCY__", PLUS_PRICE_CURRENCY);
    },
  };
}

function getGitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  // Production (Cloudflare Pages on https://mybishbash.app) serves from root.
  // Staging (GitHub Pages) and the e2e suite set VITE_BASE_PATH=/mybishbash/.
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [legacyBishbashBaseAliasPlugin(), devBasePublicFilesPlugin(), react(), tailwindcss(), localContentEditorPlugin(), appVersionPlugin(), serviceWorkerVersionPlugin(), fourOhFourBasePlugin(), pricingSchemaPlugin(), routePrerenderPlugin()],
  define: {
    __MYBISHBASH_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) {
            return "react";
          }
          if (id.includes("/node_modules/recharts/")) {
            return "recharts";
          }
          if (id.includes("/node_modules/framer-motion/")) {
            return "motion";
          }
          if (id.includes("/node_modules/@supabase/")) {
            return "supabase";
          }
        },
      },
    },
  },
});
