/**
 * MBB-23 Amendment 1 (B8): the commitment offer is a pop-up shown at the skip
 * that makes 3 in a row on your own card. Runs at 390px.
 *
 *  (a) own card, 2 prior skips, "Not done": pop-up; x continues where Not done goes.
 *  (b) own card, 2 prior skips, tap an app on the card: pop-up; x continues to the app.
 *  (c) library card, 2 prior skips: no pop-up.
 *  (d) before the skip, the card shows no offer.
 */
import { expect, test, type Page } from '@playwright/test';

const now = '2026-06-08T12:00:00.000Z';
const ALL_WINDOWS = ['morning', 'day', 'evening', 'night'];
const SHOT_DIR = process.env.OFFER_SHOT_DIR ?? 'test-results/commitment-offer';

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'own-card',
    cardKind: 'personal',
    promptText: 'Stretch for five minutes',
    dashboardTitle: 'Stretch for five minutes',
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ALL_WINDOWS,
    paused: false,
    disliked: false,
    deletedAt: null,
    statusToday: 'fresh',
    lastShownAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
    ...overrides,
  };
}

function priorSkips(cardId: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `prior-${cardId}-${i}`,
    event_type: 'card_ignored',
    created_at: `2026-06-0${i + 1}T09:00:00.000Z`,
    card_id: cardId,
    source_type: 'personal',
    card_source: 'personal',
    action_taken: 'ignored',
    metadata: {},
  }));
}

async function open(page: Page, seededCard: Record<string, unknown>, events: unknown[]) {
  await page.addInitScript(
    ({ cards, seededEvents }) => {
      const set = (k: string, v: unknown) => window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('MYBISHBASH_E2E_MODE', 'true');
      set('MYBISHBASH_DEMO_MODE', 'true');
      set('mybishbash.setup-complete.v1', 'true');
      set('mybishbash.profile.v1', { name: 'E2E', timezone: 'Europe/London' });
      set('mybishbash.cards.v1', cards);
      set('mybishbash.home-screen-versions.v1', {});
      set('mybishbash.event-log.v1', seededEvents);
      set('mybishbash.offline-event-queue.v1', []);
      set('mybishbash.disliked-pack-card-ids.v1', []);
      set('mybishbash.action-cards.v1', []);
      const w = window as unknown as { __NAV?: string[]; __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (h: string) => boolean };
      w.__NAV = [];
      w.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href: string) => {
        w.__NAV!.push(href);
        return true;
      };
    },
    { cards: [seededCard], seededEvents: events },
  );
  await page.goto('/mybishbash/intercept/safari');
  await page.locator('.premium-headline').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
}

const popup = (page: Page) => page.getByTestId('commitment-offer');
const continueCard = (page: Page) =>
  page.getByRole('link', { name: /Continue to/i }).or(page.getByRole('button', { name: /Continue to/i })).first();
const navigations = (page: Page) => page.evaluate(() => (window as unknown as { __NAV: string[] }).__NAV);

test.use({ viewport: { width: 390, height: 844 } });

test.describe('commitment offer pop-up (B8)', () => {
  test('(d) the card itself shows no offer before the skip', async ({ page }) => {
    await open(page, card(), priorSkips('own-card', 2));
    await expect(page.locator('.premium-headline')).toHaveText('Stretch for five minutes');
    await expect(popup(page)).toHaveCount(0);
    await expect(page.getByText("You've skipped this card")).toHaveCount(0);
  });

  test('(a) Not done on the 3rd skip shows the pop-up; x lands where Not done lands', async ({ page }) => {
    await open(page, card(), priorSkips('own-card', 2));
    await page.getByRole('button', { name: 'Not done' }).click();
    await expect(popup(page)).toBeVisible();
    await expect(popup(page)).toContainText("You've skipped this card 3 times.");
    await expect(popup(page)).toContainText('Pause it for now, or make it a commitment to help you follow through.');
    await expect(popup(page).getByRole('button', { name: 'Make it a commitment' })).toBeVisible();
    await expect(popup(page).getByRole('button', { name: 'Pause it' })).toBeVisible();
    const close = popup(page).getByRole('button', { name: 'Not now' });
    const box = await close.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.waitForTimeout(600); // let the slide-up finish
    await page.screenshot({ path: `${SHOT_DIR}/popup-not-done-390.png` });

    await close.click();
    await expect(popup(page)).toHaveCount(0);
    // Where "Not done" lands today for a fake-launcher flow: the continue-to-app card.
    await expect(continueCard(page)).toBeVisible();
  });

  test('(a2) Escape closes like x', async ({ page }) => {
    await open(page, card(), priorSkips('own-card', 2));
    await page.getByRole('button', { name: 'Not done' }).click();
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
  });

  test('(a3) 2nd skip does not show the pop-up', async ({ page }) => {
    await open(page, card(), priorSkips('own-card', 1));
    await page.getByRole('button', { name: 'Not done' }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(continueCard(page)).toBeVisible(); // same landing as after the x in (a)
  });

  test('(b) tapping an app on the card on the 3rd skip shows the pop-up; x continues to the app', async ({ page }) => {
    await open(page, card(), priorSkips('own-card', 2));
    const appButton = page.locator('.premium-card-launchers a, .premium-card-launchers button').first();
    await appButton.click();
    await expect(popup(page)).toBeVisible();
    expect(await navigations(page)).toHaveLength(0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOT_DIR}/popup-continue-to-app-390.png` });

    await popup(page).getByRole('button', { name: 'Not now' }).click();
    await expect(popup(page)).toHaveCount(0);
    const navs = await navigations(page);
    expect(navs).toHaveLength(1);
  });

  test('(c) a library card with 2 prior skips gets no pop-up when you tap an app', async ({ page }) => {
    const library = card({ id: 'lib-card', sourcePackId: 'e2e-pack', sourcePackTitle: 'E2E Pack', attribution: 'E2E Pack' });
    await open(page, library, priorSkips('lib-card', 2));
    await expect(page.getByRole('button', { name: 'Not done' })).toHaveCount(0); // it is a library card
    await page.locator('.premium-card-launchers a, .premium-card-launchers button').first().click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.getByText("You've skipped this card")).toHaveCount(0);
    expect(await navigations(page)).toHaveLength(1);
  });
});
