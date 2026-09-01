import { devices, expect, test, type Page } from '@playwright/test';

const now = '2026-06-19T12:00:00.000Z';

function personalCard(id: string, promptText: string) {
  return {
    id,
    cardKind: 'personal',
    promptText,
    dashboardTitle: promptText,
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening', 'night'],
    statusToday: 'fresh',
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
  };
}

async function seedDrinkWaterCard(page: Page) {
  await page.addInitScript(({ seededCard, timestamp }) => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Layout Tester',
      timezone: 'Europe/London',
      onboardingCompletedAt: timestamp,
    }));
    window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify([seededCard]));
    window.localStorage.setItem('mybishbash.card-packs.v1', '[]');
    window.localStorage.setItem('mybishbash.event-log.v1', '[]');
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
    window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
    window.localStorage.setItem('mybishbash.hidden-library-packs.v1', '[]');
    window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
    window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
      mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    }));
  }, {
    seededCard: personalCard('drink-water-layout-card', 'Drink some water.'),
    timestamp: now,
  });
}

async function stableBox(page: Page, selector: string) {
  return page.locator(selector).boundingBox();
}

test('mobile WebKit card headline and CTA do not shift after first visible render', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    baseURL: 'http://127.0.0.1:4173',
  });
  const page = await context.newPage();
  await seedDrinkWaterCard(page);

  await page.goto('/mybishbash/intercept/safari');
  const overlay = page.getByTestId('card-overlay-personal');
  await expect(overlay).toBeVisible({ timeout: 10000 });
  await expect(overlay.getByRole('heading', { name: 'Drink some water.' })).toBeVisible();

  const firstHeadline = await stableBox(page, '[data-testid="card-overlay-personal"] .premium-title-box');
  const firstCta = await stableBox(page, '[data-testid="card-overlay-personal"] .premium-card-cta');
  expect(firstHeadline).not.toBeNull();
  expect(firstCta).not.toBeNull();

  await page.waitForTimeout(650);

  const settledHeadline = await stableBox(page, '[data-testid="card-overlay-personal"] .premium-title-box');
  const settledCta = await stableBox(page, '[data-testid="card-overlay-personal"] .premium-card-cta');
  expect(Math.abs((settledHeadline?.y ?? 0) - (firstHeadline?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((settledCta?.y ?? 0) - (firstCta?.y ?? 0))).toBeLessThanOrEqual(1);

  await context.close();
});
