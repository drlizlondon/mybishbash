import { expect, test, type Page } from '@playwright/test';
import { readIndexedDbJson } from './indexeddb';

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
  await expect(detail.getByText(/cards · by myBishBash/)).toBeVisible();
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

test('Explore commitment templates create normal Commitment Cards', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/explore');

  const rail = page.getByTestId('explore-commitments-rail');
  await expect(rail).toBeVisible();
  await expect(rail).toContainText('COMMITMENT STARTER');
  await expect(rail).not.toContainText('Installed');

  await page.getByTestId('take-commitment-walk-today').click();
  await expect(page.getByTestId('card-composer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commitment Card' })).toHaveClass(/selected/);
  await expect(page.getByTestId('commitment-text-input')).toHaveValue('go for a walk today');
  await expect(page.getByTestId('commitment-reason-input')).toHaveValue('A small reset for body and mind.');

  await page.getByTestId('save-commitment-card-button').click();
  await expect(page.getByTestId('library-commitment-section')).toBeVisible();
  await page.getByTestId('library-commitment-section-toggle').click();
  await expect(page.getByTestId('library-commitment-section')).toContainText('go for a walk today');
  await expect(page.getByTestId('library-active-packs-section')).not.toContainText('Commitment Starters');

  await expect.poll(async () => {
    const cards = await readIndexedDbJson<Array<Record<string, unknown>>>(page, 'mybishbash.cards.v1', []);
    return cards.some((card: Record<string, unknown>) =>
      card.cardKind === 'commitment' &&
      card.promptText === 'go for a walk today' &&
      !card.sourcePackId
    );
  }).toBe(true);
});

test('Explore excludes App Prompts and App Packs even when saved locally', async ({ page }) => {
  await seedE2EState(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('mybishbash.card-packs.v1', JSON.stringify([
      {
        id: 'safari-app-prompts',
        title: 'Safari App Prompts',
        description: 'App-specific prompts belong in Apps.',
        sourceLabel: 'myBishBash',
        contentType: 'app-pack',
        entries: [
          {
            id: 'safari-prompt',
            promptText: 'Why are you opening Safari right now?',
            isPreview: true,
          },
        ],
      },
    ]));
  });
  await page.goto('/mybishbash/explore');

  await expect(page.getByTestId('explore-panel')).toBeVisible();
  await expect(page.getByTestId('explore-pack-card-safari-app-prompts')).toHaveCount(0);
  await expect(page.getByText('Safari App Prompts')).toHaveCount(0);
  await expect(page.getByText('App Pack')).toHaveCount(0);
  await expect(page.getByText('Use this App Pack')).toHaveCount(0);
  await expect(page.getByText('App Prompts')).toHaveCount(0);
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

test('packs without uploaded artwork render generated covers', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/explore');

  // Grid: generated cover is title-led; sample card text stays out of the
  // listing, while descriptions remain compact below the cover when present.
  const card = page.getByTestId(`explore-pack-card-${STATIC_PACK_ID}`);
  const gridCover = card.getByTestId('generated-cover');
  await expect(gridCover).toBeVisible();
  await expect(gridCover.getByTestId('generated-cover-logo')).toHaveAttribute('src', /mybishbash-cover\.png$/);
  await expect(gridCover.getByTestId('generated-cover-title').locator('span')).toHaveText(['Motivational', 'Quote']);
  await expect(gridCover).toContainText('+ Add');
  await expect(gridCover).not.toContainText('5 CARDS');
  await expect(gridCover).not.toContainText('Soft little pushes when energy dips.');
  await expect(gridCover).not.toContainText('Start where you are.');
  await expect(card.locator('.explore-cover-title')).toContainText('Motivational Quote');
  await expect(card.locator('.explore-cover-description')).toContainText('Soft little pushes when energy dips.');
  await expect(card.locator('.explore-cover-meta')).toContainText(/5 cards/i);
  await expect(card).not.toContainText('Start where you are.');

  // Detail: title-focused generated cover.
  await card.click();
  const detailCover = page.getByTestId('explore-pack-detail').getByTestId('generated-cover');
  await expect(detailCover).toBeVisible();
  await expect(detailCover.getByTestId('generated-cover-title').locator('span')).toHaveText(['Motivational', 'Quote']);

  // Library thumbnail after install.
  await page.getByTestId('explore-install-button').click();
  await expect(detailCover).toContainText('Installed');
  await page.getByTestId('explore-detail-close').click();
  await expect(card.locator('.explore-active-pill')).toHaveCount(0);
  await expect(card.getByTestId('generated-cover')).toContainText('Installed');
  await expect(card.getByText('Installed').first()).toBeVisible();
  await page.getByTestId('bottom-nav-library').click();
  await page.getByTestId('library-active-packs-section-toggle').click();
  await expect(page.getByTestId('library-active-packs-section').getByTestId('generated-cover')).toBeVisible();
});

test('Explore mobile layout has no overflow or bottom-nav cover across common widths', async ({ page }) => {
  for (const width of [360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 780 });
    await seedE2EState(page);
    await page.goto('/mybishbash/explore');

    await expect(page.getByTestId('explore-panel')).toBeVisible();
    await expect(page.getByText('Commitment Packs')).toBeVisible();
    await expect(page.getByText('More Packs')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>('.explore-commitment-rail');
      const grid = document.querySelector<HTMLElement>('.explore-cover-grid');
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.explore-cover-card'));
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      window.scrollTo(0, document.documentElement.scrollHeight);
      const lastCard = cards.at(-1);
      const lastRect = lastCard?.getBoundingClientRect();
      const navRect = nav?.getBoundingClientRect();
      const firstRowTops = cards.slice(0, 2).map((card) => Math.round(card.getBoundingClientRect().top));
      return {
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        railScrolls: rail ? rail.scrollWidth > rail.clientWidth : false,
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        firstRowAligned: firstRowTops.length === 2 && firstRowTops[0] === firstRowTops[1],
        navOverlap: Boolean(lastRect && navRect && lastRect.bottom > navRect.top),
      };
    });

    expect(metrics.bodyOverflow).toBeLessThanOrEqual(1);
    expect(metrics.railScrolls).toBe(true);
    expect(metrics.gridColumns).toBe(2);
    expect(metrics.firstRowAligned).toBe(true);
    expect(metrics.navOverlap).toBe(false);
  }
});

test('bottom nav no longer exposes Packs', async ({ page }) => {
  await seedE2EState(page);
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('bottom-nav-explore')).toBeVisible();
  await expect(page.getByTestId('bottom-nav-packs')).toHaveCount(0);
});
