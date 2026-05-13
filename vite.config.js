import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appVersion = process.env.VITE_APP_VERSION || new Date().toISOString();

function appVersionPlugin() {
  return {
    name: "bishbash-version",
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
  base: "/bishbash/",
  plugins: [react(), appVersionPlugin()],
  define: {
    __BISHBASH_VERSION__: JSON.stringify(appVersion),
  },
});
