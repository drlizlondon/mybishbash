import { expect, test, type Page } from '@playwright/test';

const now = '2026-06-13T12:00:00.000Z';

function card(id: string, promptText: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

async function seedState(page: Page) {
  await page.addInitScript(
    ({ seededCards, seededActionCards }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Nav Tester', timezone: 'Europe/London' }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.action-cards.v1', JSON.stringify(seededActionCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.hidden-library-packs.v1', '[]');
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
        mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      }));
      window.localStorage.setItem('mybishbash.app-pauses.v1', '{}');
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    {
      seededCards: [
        card('personal-nav-card', 'Personal nav card'),
        card('commitment-nav-card', 'I will keep the nav working', {
          cardKind: 'commitment',
          commitmentReason: 'So Library stays usable.',
        }),
        card('pack-nav-card', 'Pack nav card', {
          sourcePackId: 'motivational-quotes',
          dashboardTitle: 'Motivational Quote',
          icon: 'quote',
        }),
      ],
      seededActionCards: [
        {
          id: 'action-nav-card',
          title: 'Action nav card',
          body: 'Step away for a minute.',
          category: 'Action',
          launchUrl: '',
          hidden: false,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  );
}

async function assertNoClosedLibraryHitLayers(page: Page) {
  const report = await page.evaluate(() => {
    const navButtons = Array.from(document.querySelectorAll<HTMLElement>('.bottom-nav [data-testid^="bottom-nav-"]'));
    const blockedButtons = navButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement | null;
      return {
        id: button.dataset.testid,
        topTestId: top?.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? null,
        topClass: typeof top?.className === 'string' ? top.className : '',
        reachesButton: Boolean(top?.closest(`[data-testid="${button.dataset.testid}"]`)),
      };
    }).filter((item) => !item.reachesButton);

    const closedDrawers = Array.from(document.querySelectorAll<HTMLElement>('.expandable-collection-body-wrap[aria-hidden="true"]'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          id: el.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? null,
          height: rect.height,
          pointerEvents: style.pointerEvents,
        };
      });

    const staleBlockers = Array.from(document.querySelectorAll<HTMLElement>(
      '.modal-backdrop, .premium-card-screen, .launcher-preparing-placeholder, .menu',
    )).map((el) => ({
      tag: el.tagName,
      testId: el.dataset.testid ?? null,
      className: el.className,
      pointerEvents: getComputedStyle(el).pointerEvents,
    }));

    return { blockedButtons, closedDrawers, staleBlockers };
  });

  expect(report.blockedButtons).toEqual([]);
  expect(report.closedDrawers.every((drawer) => drawer.pointerEvents === 'none')).toBe(true);
  expect(report.staleBlockers).toEqual([]);
}

async function clickNavAndExpect(page: Page, testId: string, urlPattern: RegExp) {
  await assertNoClosedLibraryHitLayers(page);
  await page.getByTestId(testId).click();
  await expect(page).toHaveURL(urlPattern);
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

async function openAndCloseLibrarySections(page: Page) {
  for (const section of ['personal', 'commitment', 'active-packs', 'do-instead']) {
    const toggle = page.getByTestId(`library-${section}-section-toggle`);
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId(`library-${section}-section`)).toBeVisible();
    await toggle.click();
  }
}

test('Library drawers and row menus do not block bottom nav', async ({ page }) => {
  await seedState(page);
  await page.goto('/mybishbash/library');
  await expect(page.getByTestId('library-personal-section-toggle')).toBeVisible();

  await openAndCloseLibrarySections(page);
  await assertNoClosedLibraryHitLayers(page);

  await page.getByTestId('library-personal-section-toggle').click();
  const personalRow = page.getByTestId('library-row-personal-nav-card');
  await expect(personalRow).toBeVisible();
  await personalRow.getByRole('button', { name: 'Card options' }).click();
  await expect(page.locator('.menu')).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(page.locator('.menu')).toHaveCount(0);
  await assertNoClosedLibraryHitLayers(page);

  await clickNavAndExpect(page, 'bottom-nav-home', /\/mybishbash\/home$/);
  await clickNavAndExpect(page, 'bottom-nav-explore', /\/mybishbash\/explore$/);
  await clickNavAndExpect(page, 'bottom-nav-apps', /\/mybishbash\/apps$/);
  await clickNavAndExpect(page, 'bottom-nav-library', /\/mybishbash\/library$/);

  await page.goto('/mybishbash/settings');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await clickNavAndExpect(page, 'bottom-nav-home', /\/mybishbash\/home$/);
});

test('Library bottom nav works after fake-app settings and pause-modal flows', async ({ page }) => {
  await seedState(page);
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await expect(page).toHaveURL(/\/mybishbash\/apps\/safari$/);
  await expect(page.getByTestId('apps-interruptions-toggle-safari')).toBeVisible();
  await clickNavAndExpect(page, 'bottom-nav-library', /\/mybishbash\/library$/);
  await clickNavAndExpect(page, 'bottom-nav-home', /\/mybishbash\/home$/);

  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog', { name: 'Pause MyBishBash?' })).toBeVisible();
  await page.getByTestId('pause-modal-close').click();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);

  await page.getByTestId('dashboard-shortcut').click();
  await expect(page).toHaveURL(/\/mybishbash\/apps\/safari$/);
  await clickNavAndExpect(page, 'bottom-nav-library', /\/mybishbash\/library$/);
  await assertNoClosedLibraryHitLayers(page);
});

test('mobile Library bottom nav hit targets stay clear across common widths', async ({ page }) => {
  for (const width of [360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 780 });
    await seedState(page);
    await page.goto('/mybishbash/library');
    await openAndCloseLibrarySections(page);
    await assertNoClosedLibraryHitLayers(page);
    await clickNavAndExpect(page, 'bottom-nav-apps', /\/mybishbash\/apps$/);
  }
});
