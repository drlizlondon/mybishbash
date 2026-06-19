import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60_000);

const now = '2026-06-13T12:00:00.000Z';

const navItems = [
  { id: 'bottom-nav-home', path: '/home', panel: null },
  { id: 'bottom-nav-library', path: '/library', panel: 'library-personal-section-toggle' },
  { id: 'bottom-nav-log', path: '/log', panel: null },
  { id: 'bottom-nav-explore', path: '/explore', panel: 'explore-panel' },
  { id: 'bottom-nav-apps', path: '/apps', panel: 'apps-panel' },
] as const;

const sourceScreens = [
  { path: '/home', label: 'Home' },
  { path: '/library', label: 'Library' },
  { path: '/explore', label: 'Explore' },
  { path: '/apps', label: 'Apps' },
  { path: '/settings', label: 'Settings' },
] as const;

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

async function seedState(
  page: Page,
  {
    cards = [
      card('personal-nav-card', 'Personal nav card'),
      card('personal-nav-card-2', 'Second personal nav card'),
      card('personal-nav-card-3', 'Third personal nav card'),
      card('personal-nav-card-4', 'Fourth personal nav card'),
      card('edit-nav-card', 'Editable nav card', { createdAt: '2026-06-13T11:56:00.000Z' }),
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
    actionCards = [
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
  }: {
    cards?: Array<Record<string, unknown>>;
    actionCards?: Array<Record<string, unknown>>;
  } = {},
) {
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
      seededCards: cards,
      seededActionCards: actionCards,
    },
  );
}

function installRuntimeAudit(page: Page) {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    const suspiciousWarning =
      /Maximum update depth|hydration|render crash|navigation error|uncaught|React error/i.test(text);
    if (message.type() === 'error' || suspiciousWarning) {
      failures.push(`${message.type()}: ${text}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'document') {
      failures.push(`navigation request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`.trim());
    }
  });
  return () => expect(failures).toEqual([]);
}

async function expectAppRoute(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`/mybishbash${path.replace('/', '\\/')}$`));
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

async function assertInteractionCleanup(page: Page, { allowModal = false } = {}) {
  const report = await page.evaluate(({ allowModal }) => {
    const navButtons = Array.from(document.querySelectorAll<HTMLElement>('.bottom-nav [data-testid^="bottom-nav-"]'));
    const blockedButtons = navButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement | null;
      return {
        id: button.dataset.testid,
        topTag: top?.tagName ?? null,
        topTestId: top?.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? null,
        topClass: typeof top?.className === 'string' ? top.className : '',
        reachesButton: Boolean(top?.closest(`[data-testid="${button.dataset.testid}"]`)),
      };
    }).filter((item) => !item.reachesButton);

    const closedDrawers = Array.from(document.querySelectorAll<HTMLElement>('.expandable-collection-body-wrap[aria-hidden="true"]'))
      .map((el) => ({
        id: el.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? null,
        height: el.getBoundingClientRect().height,
        pointerEvents: getComputedStyle(el).pointerEvents,
      }));

    const blockers = Array.from(document.querySelectorAll<HTMLElement>(
      '.modal-backdrop, .premium-card-screen, .launcher-preparing-placeholder, .menu',
    )).map((el) => ({
      tag: el.tagName,
      testId: el.dataset.testid ?? null,
      className: String(el.className),
      pointerEvents: getComputedStyle(el).pointerEvents,
    }));

    const bodyOverflowLocked = ['hidden', 'clip'].includes(getComputedStyle(document.body).overflowY)
      || ['hidden', 'clip'].includes(getComputedStyle(document.documentElement).overflowY);

    return {
      blockedButtons,
      closedDrawers,
      blockers,
      bodyOverflowLocked,
      allowModal,
    };
  }, { allowModal });

  expect(report.closedDrawers.every((drawer) => drawer.pointerEvents === 'none')).toBe(true);
  if (!allowModal) {
    expect(report.blockedButtons).toEqual([]);
    expect(report.blockers).toEqual([]);
    expect(report.bodyOverflowLocked).toBe(false);
  } else {
    expect(report.blockers.length).toBeGreaterThan(0);
  }
}

async function tapNavAndAssert(page: Page, item: typeof navItems[number]) {
  await assertInteractionCleanup(page);
  await page.getByTestId(item.id).click();
  await expectAppRoute(page, item.path);
  if (item.panel) await expect(page.getByTestId(item.panel)).toBeVisible();
  await assertInteractionCleanup(page);
}

async function getAppScrollTop(page: Page) {
  return page.evaluate(() => Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop,
    document.querySelector<HTMLElement>('[data-testid="app-shell"]')?.scrollTop ?? 0,
  ));
}

async function runNavTapMatrix(page: Page, sourcePath: string) {
  await page.goto(`/mybishbash${sourcePath}`);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await assertInteractionCleanup(page);
  for (const item of navItems) {
    await tapNavAndAssert(page, item);
  }

  await page.goto(`/mybishbash${sourcePath}`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await assertInteractionCleanup(page);
  for (const item of navItems) {
    await tapNavAndAssert(page, item);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  }
}

async function openAndCloseLibrarySections(page: Page) {
  await page.goto('/mybishbash/library');
  await expect(page.getByTestId('library-personal-section-toggle')).toBeVisible();
  for (const section of ['personal', 'commitment', 'active-packs', 'do-instead']) {
    const toggle = page.getByTestId(`library-${section}-section-toggle`);
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId(`library-${section}-section`)).toBeVisible();
    await toggle.click();
  }
  await assertInteractionCleanup(page);
}

async function openAndCloseLibraryMenu(page: Page) {
  await page.goto('/mybishbash/library');
  await page.getByTestId('library-personal-section-toggle').click();
  const personalRow = page.getByTestId('library-row-personal-nav-card');
  await expect(personalRow).toBeVisible();
  await personalRow.getByRole('button', { name: 'Card options' }).click();
  await expect(page.locator('.menu')).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(page.locator('.menu')).toHaveCount(0);
  await assertInteractionCleanup(page);
}

async function openAndCloseComposer(page: Page) {
  await page.goto('/mybishbash/library');
  await page.getByTestId('create-card-button').click();
  await expect(page.getByTestId('card-composer')).toBeVisible();
  await assertInteractionCleanup(page, { allowModal: true });
  await page.getByTestId('card-composer').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await assertInteractionCleanup(page);
}

async function openAndCloseEditComposer(page: Page) {
  await page.goto('/mybishbash/library');
  await page.getByTestId('library-personal-section-toggle').click();
  const row = page.getByTestId('library-row-edit-nav-card');
  await expect(row).toBeVisible();
  await row.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await row.getByRole('button', { name: 'Card options' }).click();
  await page.locator('.menu').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('card-composer')).toBeVisible();
  await assertInteractionCleanup(page, { allowModal: true });
  await page.getByTestId('card-composer').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await assertInteractionCleanup(page);
}

test('pre-launch bottom nav tapability matrix and hit-test audit', async ({ page }) => {
  const assertNoRuntimeIssues = installRuntimeAudit(page);
  await seedState(page);

  for (const source of sourceScreens) {
    await runNavTapMatrix(page, source.path);
  }

  await page.goto('/mybishbash/library');
  await openAndCloseLibrarySections(page);
  for (const item of navItems) await tapNavAndAssert(page, item);

  await openAndCloseLibraryMenu(page);
  for (const item of navItems) await tapNavAndAssert(page, item);

  await openAndCloseComposer(page);
  for (const item of navItems) await tapNavAndAssert(page, item);

  await openAndCloseEditComposer(page);
  for (const item of navItems) await tapNavAndAssert(page, item);

  assertNoRuntimeIssues();
});

test('bottom navigation starts each destination at the top of the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await seedState(page);

  await page.goto('/mybishbash/library');
  await expect(page.getByTestId('library-panel')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await getAppScrollTop(page)).toBeGreaterThan(0);

  await page.getByTestId('bottom-nav-explore').click();
  await expectAppRoute(page, '/explore');
  await expect(page.getByTestId('explore-panel')).toBeVisible();
  await expect.poll(() => getAppScrollTop(page)).toBe(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await getAppScrollTop(page)).toBeGreaterThan(0);

  await page.getByTestId('bottom-nav-apps').click();
  await expectAppRoute(page, '/apps');
  await expect(page.getByTestId('apps-panel')).toBeVisible();
  await expect.poll(() => getAppScrollTop(page)).toBe(0);
});

test('pre-launch journey audit keeps bottom nav tappable', async ({ page }) => {
  const assertNoRuntimeIssues = installRuntimeAudit(page);
  await seedState(page);

  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog', { name: 'Pause MyBishBash?' })).toBeVisible();
  await assertInteractionCleanup(page, { allowModal: true });
  await page.getByTestId('pause-modal-close').click();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await page.getByTestId('dashboard-shortcut').click();
  await expectAppRoute(page, '/apps/safari');
  await tapNavAndAssert(page, navItems[1]);
  await tapNavAndAssert(page, navItems[0]);

  await openAndCloseLibrarySections(page);
  await openAndCloseLibraryMenu(page);
  await tapNavAndAssert(page, navItems[4]);

  await openAndCloseComposer(page);
  await tapNavAndAssert(page, navItems[1]);

  await page.goto('/mybishbash/explore');
  await page.getByTestId('explore-pack-card-encouraging-bible-verses').click();
  await expect(page.getByTestId('explore-pack-detail')).toBeVisible();
  await page.getByTestId('explore-install-button').click();
  await page.getByTestId('explore-detail-close').click();
  await tapNavAndAssert(page, navItems[1]);

  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('apps-interruptions-toggle-safari')).toBeVisible();
  await page.getByTestId('apps-interruptions-toggle-safari').click();
  await page.getByTestId('apps-interruptions-toggle-safari').click();
  await tapNavAndAssert(page, navItems[1]);

  assertNoRuntimeIssues();
});

test('pre-launch continue-to-app return journey keeps bottom nav tappable', async ({ page }) => {
  const assertNoRuntimeIssues = installRuntimeAudit(page);
  await seedState(page, { cards: [card('continue-nav-card', 'Continue nav card')] });

  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('card-action-done').click();
  const continueCard = page.getByTestId('continue-to-app-card');
  await expect(continueCard).toBeVisible();
  await continueCard.getByTestId('card-action-continue-to-safari').click();
  const attempts = await page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
  expect(attempts.some((attempt: { metadata?: { versionId?: string } }) => attempt.metadata?.versionId === 'safari')).toBe(true);

  await page.goto('/mybishbash/library');
  await tapNavAndAssert(page, navItems[3]);
  await tapNavAndAssert(page, navItems[0]);
  assertNoRuntimeIssues();
});

test('pre-launch mobile viewport interaction audit', async ({ page }) => {
  const assertNoRuntimeIssues = installRuntimeAudit(page);
  await seedState(page);

  for (const { width, height } of [
    { width: 360, height: 780 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize({ width, height });
    for (const source of sourceScreens) {
      await runNavTapMatrix(page, source.path);
    }
    await page.goto('/mybishbash/library');
    await openAndCloseLibrarySections(page);
    await openAndCloseLibraryMenu(page);
    await tapNavAndAssert(page, navItems[4]);
  }

  assertNoRuntimeIssues();
});

test('pre-launch repeated tap audit', async ({ page }) => {
  const assertNoRuntimeIssues = installRuntimeAudit(page);
  await seedState(page);

  for (const source of sourceScreens) {
    await page.goto(`/mybishbash${source.path}`);
    await expect(page.getByTestId('app-shell')).toBeVisible();
    for (let round = 0; round < 3; round += 1) {
      for (const item of navItems) {
        await tapNavAndAssert(page, item);
      }
    }
    await assertInteractionCleanup(page);
  }

  assertNoRuntimeIssues();
});
