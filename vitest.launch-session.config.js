import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/domain/launcher/launchSession.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/domain/launcher/launchSession.js"],
      thresholds: { branches: 95 },
      reporter: ["text"],
    },
  },
});
