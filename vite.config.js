import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appVersion = process.env.VITE_APP_VERSION || new Date().toISOString();

const EDITABLE_CONTENT_FILES = {
  "/__save-landing-content": ["src/content/landingContent.js", "landingContent"],
  "/__save-about-content": ["src/content/aboutContent.js", "aboutContent"],
  "/__save-early-access-content": ["src/content/earlyAccessContent.js", "earlyAccessContent"],
  "/__save-onboarding-content": ["src/content/onboardingContent.js", "onboardingContent"],
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

function appVersionPlugin() {
  return {
    name: "mybishbash-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          {
            version: appVersion,
            builtAt: appVersion,
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig({
  base: "/mybishbash/",
  plugins: [legacyBishbashBaseAliasPlugin(), react(), tailwindcss(), localContentEditorPlugin(), appVersionPlugin()],
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
