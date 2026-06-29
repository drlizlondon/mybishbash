import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
              const output = `// Local Edit Mode can save directly back to this file in development.
// The edit panel can also copy the current JSON as a manual fallback.
export const ${exportName} = ${JSON.stringify(content, null, 2)};
`;

              writeFileSync(resolve(__dirname, filePath), output);
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
  plugins: [legacyBishbashBaseAliasPlugin(), devBasePublicFilesPlugin(), react(), tailwindcss(), localContentEditorPlugin(), appVersionPlugin(), serviceWorkerVersionPlugin()],
  define: {
    __MYBISHBASH_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
