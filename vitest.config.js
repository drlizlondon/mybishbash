import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    // Playwright owns *.spec.*; never collect them.
    exclude: ["node_modules/**", "dist/**", "tests/**", "e2e/**"],
  },
});
