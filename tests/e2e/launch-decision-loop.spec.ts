import { expect, test, type Page } from '@playwright/test';
import { readIndexedDbJson } from './indexeddb';

/**
 * Regression guard for the launch-decision effect's `events` self-write cycle.
 *
 * The launch-decision effect in App.jsx logs launcher events from inside its
 * own body (beginInterceptionFlow -> logLauncherEvent -> logEvent -> the
 * eventsStore append). While `events` is also in that effect's dependency
 * array, the effect can re-trigger itself: the standalone-launcher-recovery
 * branch re-fires on every event it writes, calling beginInterceptionFlow ->
 * navigateTo('/intercept/<id>') again, indefinitely.
 *
 * Two independent guards must hold for this to stay bounded:
 *   1. `standaloneRecoveryInFlightRef` makes the recovery command idempotent
 *      while its route transition is in flight (added in `9b3440d`).
 *   2. The effect reads the event log non-reactively at its two decision
 *      points and does not depend on `events`.
 *
 * These tests assert the observable property both guards protect: the flow
 * settles on a rendered card after a bounded number of history writes, and
 * launcher events are still logged.
 */

const now = '2026-06-01T12:00:00.000Z';

declare global {
  interface Window {
    __HISTORY_WRITES__?: string[];
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
  }
}

function packCard(id: string, promptText: string, sourcePackId = 'loop-guard-pack') {
  return {
    id,
    promptText,
    dashboardTitle: promptText,
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening', 'night'],
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId,
    sourcePackTitle: 'Loop Guard Pack',
    attribution: 'Loop Guard Pack',
  };
}

/** Counts every history write the app makes, so a navigation loop is visible. */
async function installHistoryWriteCounter(page: Page) {
  await page.addInitScript(() => {
    window.__HISTORY_WRITES__ = [];
    const record = (url?: string | URL | null) => {
      window.__HISTORY_WRITES__?.push(String(url ?? window.location.pathname));
    };
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = function patchedPushState(data, unused, url) {
      record(url);
      return originalPush(data, unused, url as string);
    };
    window.history.replaceState = function patchedReplaceState(data, unused, url) {
      record(url);
      return originalReplace(data, unused, url as string);
    };
  });
}

async function simulateStandaloneDisplayMode(page: Page) {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia?.bind(window);
    const standaloneResult = (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
    window.matchMedia = ((query: string) => {
      if (query === '(display-mode: standalone)') return standaloneResult(query);
      return originalMatchMedia
        ? originalMatchMedia(query)
        : ({ ...standaloneResult(query), matches: false } as MediaQueryList);
    }) as typeof window.matchMedia;
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true });
  });
}

async function seedInstalledShellTester(page: Page) {
  await page.addInitScript(
    ({ seededCards }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('bishbash.launchAudit.enabled', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem(
        'mybishbash.profile.v1',
        JSON.stringify({ name: 'Loop Guard', timezone: 'Europe/London' }),
      );
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem(
        'mybishbash.launcher-behavior-settings.v1',
        JSON.stringify({
          mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
          safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        }),
      );
      window.localStorage.setItem(
        'mybishbash.installed-launcher-shell.v1',
        JSON.stringify({
          launcher_id: 'safari',
          launch_path: '/intercept/safari',
          updated_at: '2026-06-01T12:00:00.000Z',
        }),
      );
      // Keep real destination navigations from unloading the page mid-measurement.
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = () => true;
    },
    {
      seededCards: [
        packCard('loop-guard-pack-a', 'Loop guard pack A'),
        packCard('loop-guard-pack-b', 'Loop guard pack B'),
      ],
    },
  );
}

test('logging a launcher event does not retrigger the launch decision indefinitely', async ({ page }) => {
  await installHistoryWriteCounter(page);
  await simulateStandaloneDisplayMode(page);
  await seedInstalledShellTester(page);

  // Standalone tester home entry runs the launcher-recovery branch, which logs
  // launcher events from inside the launch-decision effect — the exact
  // write-then-redepend cycle that can loop.
  await page.goto('/mybishbash/home');

  await expect(
    page.getByTestId('card-overlay-pack').or(page.getByTestId('card-overlay-personal')),
    'launcher recovery should settle on a rendered card',
  ).toBeVisible();
  await expect(page).toHaveURL(/\/mybishbash\/intercept\/safari$/);

  // Let any runaway effect cycle accumulate before measuring.
  await page.waitForTimeout(3000);

  const interceptWrites = await page.evaluate(
    () => (window.__HISTORY_WRITES__ ?? []).filter((url) => url.includes('/intercept/')).length,
  );

  // The recovery path legitimately writes history a small, bounded number of
  // times. A loop produces a continuously growing count (dozens per second).
  expect(
    interceptWrites,
    `launch decision should settle, but wrote /intercept/ history ${interceptWrites} times`,
  ).toBeLessThan(10);

  // And it must have genuinely stopped: no further writes once settled.
  const settledCount = await page.evaluate(() => (window.__HISTORY_WRITES__ ?? []).length);
  await page.waitForTimeout(1500);
  const afterCount = await page.evaluate(() => (window.__HISTORY_WRITES__ ?? []).length);
  expect(afterCount, 'no further history writes once the launch decision has settled').toBe(settledCount);
});

test('event log keeps growing normally without re-entering the launch decision', async ({ page }) => {
  await installHistoryWriteCounter(page);
  await simulateStandaloneDisplayMode(page);
  await seedInstalledShellTester(page);

  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('card-overlay-pack').or(page.getByTestId('card-overlay-personal'))).toBeVisible();
  await page.waitForTimeout(2000);

  // The recovery path must still log its launcher events — the guards remove
  // the re-trigger, not the logging.
  let loggedEvents: Array<Record<string, unknown>> = [];
  await expect.poll(async () => {
    loggedEvents = await readIndexedDbJson<Array<Record<string, unknown>>>(
      page,
      'mybishbash.event-log.v1',
      [],
    );
    return loggedEvents.length;
  }).toBeGreaterThan(0);
  expect(Array.isArray(loggedEvents)).toBe(true);

  // A bounded event log is the other side of the same coin: an unbounded loop
  // writes a new event on every re-fire.
  expect(loggedEvents.length, 'event log should not grow without bound').toBeLessThan(25);
});
