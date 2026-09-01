import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const isStagingReleaseRun = Boolean(process.env.MYBISHBASH_STAGING_URL) || process.argv.some((arg) => arg.includes('staging-release.spec'));
const testOutputDir = process.env.PLAYWRIGHT_TEST_OUTPUT_DIR ?? 'test-results';
const htmlOutputDir = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? 'playwright-report';

// Ignore only the project root's own .claude dir. The bare glob '.claude/**'
// matches anywhere in the absolute path, which silently discovered zero tests
// when the checkout itself lives inside .claude/worktrees/.
const projectClaudeDir = `${fileURLToPath(new URL('./.claude', import.meta.url))}/**`;
const chromiumTestMatch = [
  '**/tests/e2e/**/*.spec.ts',
  '**/e2e/staging-release.spec.js',
];
const webkitSmokeTestMatch = [
  '**/tests/e2e/release-smoke.spec.ts',
  '**/tests/e2e/auth-session-persistence.spec.ts',
  '**/tests/e2e/offline-fallback.spec.ts',
  '**/tests/e2e/onboarding.spec.ts',
  '**/tests/e2e/launcher-flow-trace.spec.ts',
  '**/tests/e2e/storage-migration.spec.ts',
];

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './',
  outputDir: testOutputDir,
  testIgnore: isStagingReleaseRun
    ? [projectClaudeDir]
    : ['e2e/staging-release.spec.js', projectClaudeDir],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { outputFolder: htmlOutputDir, open: 'never' }],
      ]
    : 'list',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://127.0.0.1:4173/mybishbash',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'release-smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: chromiumTestMatch,
    },
    {
      name: 'webkit-smoke',
      use: { ...devices['Desktop Safari'] },
      testMatch: webkitSmokeTestMatch,
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: isStagingReleaseRun
    ? undefined
    : {
        // The e2e suite navigates "/mybishbash/..." paths, so build + preview
        // against that base (production builds at root "/").
        command: 'VITE_BASE_PATH=/mybishbash/ npm run build && VITE_BASE_PATH=/mybishbash/ npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173/mybishbash/',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
