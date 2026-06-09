/**
 * Targeted e2e tests for the app-specific pause button implementation.
 *
 * All tests are self-contained: they seed localStorage via addInitScript and
 * capture navigation attempts through the same hook used by launcher-before-push.spec.ts.
 *
 * Requirements enforced:
 *  - Pause button only appears on intercept / fake-launcher flows
 *  - Tapping pause opens a duration modal (no Cancel button, X closes without pausing)
 *  - Selecting a duration writes a future expiry to localStorage and navigates to the app
 *  - Active pause causes the next intercept to bypass cards entirely (one navigation, no card)
 *  - Pause is per-app: pausing safari does not affect youtube
 *  - Expired pauses are ignored; cards are shown as normal
 *  - Normal card completion still routes to continue-to-app
 */

import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
  }
}

const now = '2026-06-08T12:00:00.000Z';

// ── Helpers ──────────────────────────────────────────────────────────────────

function personalCard(id: string, promptText: string) {
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
    sourcePackId: null,
  };
}

function launcherSettings(appIds: string[]) {
  const entries: Record<string, object> = {
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
  };
  for (const id of appIds) {
    entries[id] = { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' };
  }
  return entries;
}

/**
 * Seed localStorage before the app boots.
 *
 * @param appPauses  Optional map of appId → ISO expiry string to pre-populate pauses.
 */
async function seedState(
  page: Page,
  {
    cards = [],
    appIds = ['safari', 'youtube'],
    appPauses = {},
  }: {
    cards?: Array<Record<string, unknown>>;
    appIds?: string[];
    appPauses?: Record<string, string>;
  } = {},
) {
  await page.addInitScript(
    ({ seededCards, seededSettings, seededAppPauses }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Pause Tester', timezone: 'Europe/London' }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededSettings));
      if (Object.keys(seededAppPauses).length > 0) {
        window.localStorage.setItem('mybishbash.app-pauses.v1', JSON.stringify(seededAppPauses));
      }
      // Capture navigation attempts instead of actually leaving the page.
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true; // returning true tells the app to suppress the real navigation
      };
    },
    {
      seededCards: cards,
      seededSettings: launcherSettings(appIds),
      seededAppPauses: appPauses,
    },
  );
}

async function getNavigationAttempts(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('pause-button-appears — pause button visible on intercept route', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p1', 'Pause test card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('pause-app-button')).toBeVisible();
});

test('pause-button-absent-home — pause button NOT shown on home screen', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p2', 'Home test card')] });
  await page.goto('/mybishbash/home');
  // The app-shell (home dashboard) should be visible
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('pause-app-button')).toHaveCount(0);
});

test('pause-selects-30min — selecting 30 mins writes a future expiry and navigates', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p3', 'Pause 30 min card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Tap "30 mins"
  await page.getByRole('button', { name: '30 mins' }).click();

  // Confirmation state is shown
  await expect(page.getByText(/Paused for 30 mins/i)).toBeVisible();

  // Navigation attempt fires (after ~1400ms confirmation delay).
  // At least one attempt should be towards the safari destination.
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  const attempts = await getNavigationAttempts(page);
  expect(attempts.some((a) => (a.metadata as Record<string, unknown>)['versionId'] === 'safari')).toBe(true);

  // localStorage should have a future expiry for safari
  const expiry = await page.evaluate(() => {
    try {
      const map = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
      return map['safari'] ?? null;
    } catch { return null; }
  });
  expect(expiry).not.toBeNull();
  expect(new Date(expiry as string).getTime()).toBeGreaterThan(Date.now());
});

test('pause-bypasses-on-reopen — paused app navigates immediately, no card shown', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('p4', 'Bypass card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/intercept/safari');

  // Navigation attempt fires immediately — no card overlay
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBe(1);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);

  // Only ONE navigation attempt (ref guard prevents repeats)
  await page.waitForTimeout(1000);
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(1);
});

test('pause-does-not-affect-other-app — safari paused, youtube shows card normally', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('p5', 'Cross-app card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/intercept/youtube');

  // YouTube is not paused — card overlay should appear
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('pause-expires-restores-card — expired safari pause shows card as normal', async ({ page }) => {
  const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute in the past
  await seedState(page, {
    cards: [personalCard('p6', 'Expired pause card')],
    appPauses: { safari: pastExpiry },
  });
  await page.goto('/mybishbash/intercept/safari');

  // Expired pause → card is shown, no navigation bypass
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('x-button-does-not-pause — closing modal with X leaves no pause in localStorage', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p7', 'X close card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  // Open modal
  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Close with X
  await page.getByTestId('pause-modal-close').click();

  // Modal closes
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // No pause in localStorage for safari
  const expiry = await page.evaluate(() => {
    try {
      const map = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
      return map['safari'] ?? null;
    } catch { return null; }
  });
  expect(expiry).toBeNull();

  // Card is still visible
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('continue-card-after-normal-completion — Done on personal card shows continue-to-app', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p8', 'Completion card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  // Complete the card
  await page.getByTestId('card-overlay-personal').getByTestId('card-action-done').click();

  // Continue-to-app card must appear
  await expect(page.getByTestId('continue-to-app-card')).toBeVisible({ timeout: 5000 });
});

test('no-button-overlap — pause button does not cover dashboard button on mobile viewport', async ({ page }) => {
  // Use a narrow iPhone-style viewport where overlap is most likely.
  await page.setViewportSize({ width: 390, height: 844 });
  await seedState(page, { cards: [personalCard('p9', 'Overlap test card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  const dashBox = await page.getByTestId('dashboard-shortcut').boundingBox();
  const pauseBox = await page.getByTestId('pause-app-button').boundingBox();

  expect(dashBox).not.toBeNull();
  expect(pauseBox).not.toBeNull();

  // Verify no vertical overlap: pause button top must be at or below dashboard bottom.
  const dashBottom = dashBox!.y + dashBox!.height;
  expect(pauseBox!.y).toBeGreaterThanOrEqual(dashBottom - 2); // 2px tolerance for sub-pixel rounding
});
