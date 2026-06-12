import { expect, test, type Page } from '@playwright/test';

// Explore + Library restructure (docs/explore-architecture.md).
// Runs in e2e/demo mode: globalPacks = [], so Explore renders the static
// PACKS fallback (no goal metadata → all packs land in the ungrouped
// section). Install/remove exercise the same copy-on-activate path as
// production packs.

const now = '2026-06-01T12:00:00.000Z';

// A static pack with entries that exists in src/utils.js PACKS.
const STATIC_PACK_ID = 'motivational-quotes';

async function seedE2EState(page: Page) {
  await page.addInitScript(({ fixedNow }) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args: any[]) {
        super(...(args.length === 0 ? [fixedNow] : args));
      }
      static now() {
        return new RealDate(fixedNow).getTime();
      }
    }
    window.Date = FixedDate as DateConstructor;

    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'E2E', timezone: 'Europe/London' }));
    window.localStorage.setItem('mybishbash.cards.v1', '[]');
    window.localStorage.setItem('mybishbash.event-log.v1', '[]');
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
    window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
    window.localStorage.setItem('mybishbash.hidden-library-packs.v1', '[]');
  }, { fixedNow: now });
}

test('Explore tab renders from bottom nav and /explore route', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/explore');
  await expect(page.getByTestId('explore-panel')).toBeVisible();

  await page.getByTestId('bottom-nav-home').click();
  await expect(page.getByTestId('explore-panel')).not.toBeVisible();

  await page.getByTestId('bottom-nav-explore').click();
  await expect(page.getByTestId('explore-panel')).toBeVisible();
  await expect(page.getByTestId(`explore-pack-card-${STATIC_PACK_ID}`)).toBeVisible();
});

test('legacy /packs route lands on Explore', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/packs');
  await expect(page.getByTestId('explore-panel')).toBeVisible();
  await expect(page.getByTestId('bottom-nav-explore')).toHaveClass(/active/);
});

test('pack cover detail installs and removes a pack', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/explore');

  await page.getByTestId(`explore-pack-card-${STATIC_PACK_ID}`).click();
  const detail = page.getByTestId('explore-pack-detail');
  await expect(detail).toBeVisible();
  // Cover anatomy: meta line, preview cards, sticky install.
  await expect(detail.getByText(/cards · by MyBishBash/)).toBeVisible();
  await expect(detail.getByText('A taste:')).toBeVisible();

  await page.getByTestId('explore-install-button').click();
  await expect(page.getByTestId('explore-active-note')).toBeVisible();
  await expect(page.getByTestId('explore-manage-cards')).toBeVisible();

  // Installed pack appears in Library → Active Packs.
  await page.getByTestId('explore-detail-close').click();
  await page.getByTestId('bottom-nav-library').click();
  await page.getByTestId('library-active-packs-section-toggle').click();
  await expect(page.getByTestId('library-active-packs-section')).toContainText('Motivational Quote');

  // Remove from the cover detail.
  await page.getByTestId('bottom-nav-explore').click();
  await page.getByTestId(`explore-pack-card-${STATIC_PACK_ID}`).click();
  await page.getByTestId('explore-remove-button').click();
  await expect(page.getByTestId('explore-install-button')).toBeVisible();
});

test('Library shows all four sections including Do Instead Cards', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/library');

  await expect(page.getByTestId('library-personal-section')).toBeVisible();
  await expect(page.getByTestId('library-commitment-section')).toBeVisible();
  await expect(page.getByTestId('library-active-packs-section')).toBeVisible();
  const doInstead = page.getByTestId('library-do-instead-section');
  await expect(doInstead).toBeVisible();
  await expect(doInstead).toContainText('Do Instead Cards');

  // Starter Do Instead cards are listed and can be hidden/restored.
  await page.getByTestId('library-do-instead-section-toggle').click();
  await expect(page.getByText('Call a family member')).toBeVisible();
});

test('bottom nav no longer exposes Packs', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('bottom-nav-explore')).toBeVisible();
  await expect(page.getByTestId('bottom-nav-packs')).toHaveCount(0);
});
