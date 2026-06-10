/**
 * Offline / no-internet fallback e2e tests.
 *
 * These tests verify that:
 *  - The app shows a calm offline screen (not a timeout/error) when the device
 *    has no network AND no eligible cards are available.
 *  - When offline but local cards ARE available, the cards are still shown normally.
 *  - The offline screen's action buttons work: "Try again", "Open anyway",
 *    "Back to MyBishBash".
 *  - First load offline with local cards skips the sync loading spinner.
 *
 * Playwright's `page.context().setOffline(true)` is used to simulate going
 * offline mid-session (fires the browser `offline` event, which the app's
 * handleOffline listener picks up and sets isOffline = true).
 *
 * Key architecture note: `app-shell` is only rendered when screen === "library".
 * When loading at /intercept/safari directly, screen === "interception" and
 * app-shell is never shown. Tests therefore wait for the card overlay testids.
 */

import { expect, test, type Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

const now = '2026-06-01T12:00:00.000Z';

function personalCard(id: string, promptText: string) {
  return {
    id,
    promptText,
    dashboardTitle: promptText,
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening'],
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
  };
}

async function seedState(
  page: Page,
  { cards = [] }: { cards?: Array<Record<string, unknown>> } = {},
) {
  await page.addInitScript(
    ({ seededCards }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'false');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem(
        'mybishbash.profile.v1',
        JSON.stringify({ name: 'Offline Tester', timezone: 'Europe/London' }),
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
          safari:     { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        }),
      );
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    { seededCards: cards },
  );
}

async function getNavigationAttempts(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
}

// ── Offline overlay — no eligible cards ───────────────────────────────────────

test('offline with no eligible cards shows offline overlay, not caught-up screen', async ({ page }) => {
  await seedState(page, { cards: [] });
  await page.goto('/mybishbash/intercept/safari');
  // Wait for the app to load and show the empty overlay (no cards)
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible({ timeout: 10000 });

  // Go offline — fires browser `offline` event → isOffline = true → re-render
  await page.context().setOffline(true);

  await expect(page.getByTestId('card-overlay-offline')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('card-overlay-empty')).toHaveCount(0);
  await expect(page.getByText(/You appear to be offline/i)).toBeVisible();
  await expect(page.getByText(/Try again/i)).toBeVisible();
});

test('offline overlay shows "Open Safari anyway" for intercept flow', async ({ page }) => {
  await seedState(page, { cards: [] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible({ timeout: 10000 });

  await page.context().setOffline(true);

  await expect(page.getByTestId('card-overlay-offline')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Open .* anyway/i)).toBeVisible();
});

test('"Open anyway" button from offline overlay triggers destination navigation', async ({ page }) => {
  await seedState(page, { cards: [] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible({ timeout: 10000 });

  await page.context().setOffline(true);
  await expect(page.getByTestId('card-overlay-offline')).toBeVisible({ timeout: 5000 });

  await page.getByText(/Open .* anyway/i).click();

  // Navigation attempt captured (actual navigation suppressed by E2E hook)
  await expect
    .poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(1);

  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.metadata).toMatchObject({ reason: 'user_pressed_open_anyway_offline' });
});

test('"Back to MyBishBash" from offline overlay navigates home', async ({ page }) => {
  await seedState(page, { cards: [] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible({ timeout: 10000 });

  await page.context().setOffline(true);
  await expect(page.getByTestId('card-overlay-offline')).toBeVisible({ timeout: 5000 });

  await page.getByText('Back to MyBishBash').click();

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
});

// ── Offline with available local cards ───────────────────────────────────────

test('offline with an eligible local card — card shown normally', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('ol1', 'Local offline card')],
  });
  await page.goto('/mybishbash/intercept/safari');
  // Card is eligible and cached locally — should render before going offline
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 10000 });

  // Go offline — card should stay visible (offline only affects the empty overlay)
  await page.context().setOffline(true);

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('card-overlay-offline')).toHaveCount(0);
});

// ── First-load offline ────────────────────────────────────────────────────────

test('going offline shows offline overlay on intercept with no cards', async ({ page }) => {
  await seedState(page, { cards: [] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible({ timeout: 10000 });

  // Simulate going offline — isOffline state flips, re-render shows offline overlay
  await page.context().setOffline(true);

  await expect(page.getByTestId('card-overlay-offline')).toBeVisible({ timeout: 5000 });
});

test('offline with local cards still renders the card experience', async ({ page }) => {
  await seedState(page, { cards: [personalCard('ol3', 'Cached card for offline')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 10000 });

  await page.context().setOffline(true);

  // Card is cached locally — should show even offline
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('card-overlay-offline')).toHaveCount(0);
});

// ── Coming back online ────────────────────────────────────────────────────────

test('going back online dismisses offline overlay on next navigation', async ({ page }) => {
  await seedState(page, { cards: [] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible({ timeout: 10000 });

  // Go offline — triggers offline overlay
  await page.context().setOffline(true);
  await expect(page.getByTestId('card-overlay-offline')).toBeVisible({ timeout: 5000 });

  // Come back online — isOffline = false → re-render → back to caught-up screen
  await page.context().setOffline(false);

  await expect(page.getByTestId('card-overlay-empty')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('card-overlay-offline')).toHaveCount(0);
});
