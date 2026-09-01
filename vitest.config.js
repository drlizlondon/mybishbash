import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    // Phase 5: fake-indexeddb/auto provides globalThis.indexedDB for the
    // `node` environment so src/services/db can be unit-tested.
    setupFiles: ["./vitest.setup.js"],
    // Playwright owns *.spec.*; never collect them.
    exclude: ["node_modules/**", "dist/**", "tests/**", "e2e/**"],
    // Hermetic unit tests: blank out Supabase env so supabaseClient.js never
    // constructs a real client, regardless of .env.local or CI step env.
    // (supabase-js needs native WebSocket, absent on CI's Node 20, and unit
    // tests must not depend on ambient credentials either way.)
    env: {
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
    },
  },
});
