/**
 * Mobile card-overlay layout regression tests.
 *
 * Guards the iPhone card/quote screen against the regression where, on short
 * iPhones with long quotes, the quote rose behind the fixed top controls (and
 * crowded the source pill / Continue button). On iPhone-sized viewports it
 * verifies that the quote stays within safe horizontal margins, never overlaps
 * the top controls, the subtitle, or the bottom CTA, and that the source pill
 * and Continue/action button stay visible inside the viewport.
 *
 * Self-contained: seeds localStorage (E2E + demo mode, same shape as
 * release-smoke) and opens the pack interception card at /intercept/safari —
 * the variant with the source pill + pause button, the worst case for
 * vertical collisions.
 */
import { expect, test, type Page } from '@playwright/test';

const now = '2026-06-08T12:00:00.000Z';
const ALL_WINDOWS = ['morning', 'day', 'evening', 'night'];

const QUOTES = {
  long:
    'Courage is not the absence of fear, but the triumph over it; the brave person is not one who does not feel afraid, but one who conquers that fear every single day.',
  medium: 'You are allowed to take up space and to ask for what you actually need.',
};

const DEVICES = [
  { name: 'iPhone SE', viewport: { width: 375, height: 667 } },
  { name: 'iPhone 13', viewport: { width: 390, height: 844 } },
];

function packCard(promptText: string) {
  return {
    id: 'q',
    promptText,
    dashboardTitle: promptText,
    theme: 'Soft Bloom',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ALL_WINDOWS,
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: 'e2e-pack',
    sourcePackTitle: 'E2E Pack',
    attribution: 'E2E Pack',
  };
}

async function openCard(page: Page, quote: string) {
  await page.addInitScript((seededCards) => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'E2E', timezone: 'Europe/London' }));
    window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
    window.localStorage.setItem('mybishbash.home-screen-versions.v1', JSON.stringify({}));
    window.localStorage.setItem('mybishbash.event-log.v1', '[]');
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
    window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
    window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
    (window as unknown as { __MYBISHBASH_NAVIGATION_ATTEMPTS?: unknown[] }).__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
    (window as unknown as { __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (h: string, m: unknown) => boolean }).__MYBISHBASH_E2E_CAPTURE_NAVIGATION = () => true;
  }, [packCard(quote)]);

  await page.goto('/mybishbash/intercept/safari');
  await page.locator('[data-testid^="card-overlay-"]').first().waitFor({ state: 'attached' });
  await page.locator('.premium-headline').waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
}

function intersects(a: DOMRect, b: DOMRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

for (const device of DEVICES) {
  test.describe(`card overlay — ${device.name}`, () => {
    test.use({ viewport: device.viewport });

    for (const [label, quote] of Object.entries(QUOTES)) {
      test(`${label} quote stays within bounds and free of overlaps`, async ({ page }) => {
        await openCard(page, quote);

        const vw = device.viewport.width;
        const vh = device.viewport.height;

        const metrics = await page.evaluate(() => {
          const r = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() : null);
          return {
            headline: r(document.querySelector('.premium-headline')),
            controls: [...document.querySelectorAll('.premium-dashboard-shortcut')].map((el) => el.getBoundingClientRect().toJSON()),
            subtitle: r(document.querySelector('.premium-subtitle')),
            cta: r(document.querySelector('.premium-card-cta')),
            overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        });

        const headline = metrics.headline as DOMRect | null;
        expect(headline, 'headline renders').not.toBeNull();
        if (!headline) return;

        // 1. Within safe horizontal margins, no page overflow.
        expect(headline.left, 'headline not clipped left').toBeGreaterThanOrEqual(8);
        expect(headline.right, 'headline not clipped right').toBeLessThanOrEqual(vw - 8);
        expect(metrics.overflowX, 'no horizontal page overflow').toBe(false);

        // 2. Never behind any top control (dashboard / create / pause).
        for (const c of metrics.controls as DOMRect[]) {
          expect(intersects(headline, c), 'headline does not overlap a top control').toBe(false);
        }

        // 3. Bottom metadata + CTA sit below the quote, not over it.
        if (metrics.subtitle) {
          expect((metrics.subtitle as DOMRect).top, 'subtitle below headline').toBeGreaterThanOrEqual(headline.bottom - 1);
        }
        if (metrics.cta) {
          expect((metrics.cta as DOMRect).top, 'CTA below headline').toBeGreaterThanOrEqual(headline.bottom - 1);
        }

        // 4. Source pill (launcher chip) and Continue/action button visible in-viewport.
        await expect(page.locator('.premium-card-launchers .fake-launcher-button').first(), 'source pill visible').toBeVisible();
        const action = page.locator('.premium-action-button').first();
        await expect(action, 'primary action visible').toBeVisible();
        const actionBox = await action.boundingBox();
        expect(actionBox, 'action has a box').not.toBeNull();
        if (actionBox) {
          expect(actionBox.y + actionBox.height, 'action button inside viewport').toBeLessThanOrEqual(vh + 1);
        }
      });
    }
  });
}
