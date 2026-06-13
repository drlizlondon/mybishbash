import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __lastLauncherSelectionAudit?: {
      selected?: { id?: string; title?: string } | null;
      finalRenderedCard?: string;
      summaryCounts?: Record<string, number>;
    };
    __MYBISHBASH_LEGACY_PACK_LABELS?: string[];
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
    __MYBISHBASH_OVERLAY_DEBUG?: {
      route: { kind?: string; path?: string };
      overlay: { type?: string; origin?: string | null; launchSource?: string | null; versionId?: string | null; activationKey?: string | null } | null;
      launchSession: { entrySurface?: string; launcherId?: string | null; allowBackHome?: boolean };
      visibleDestinationChips: string[];
      selectedCtaLabels: string[];
    };
  }
}

const now = '2026-06-01T12:00:00.000Z';
const launcherIds = ['safari', 'instagram', 'youtube'] as const;
type LauncherId = (typeof launcherIds)[number];

function packCard(id: string, promptText: string, sourcePackId = 'downloaded-shell-pack') {
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
    sourcePackId,
    sourcePackTitle: 'Downloaded Shell Pack',
    attribution: 'Downloaded Shell Pack',
  };
}

function launcherSettings(interruptionOn: boolean) {
  return {
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    ...Object.fromEntries(
      launcherIds.map((launcherId) => [
        launcherId,
        { useInterruptionPack: launcherId === 'safari' ? interruptionOn : false, interruptionPaused: false, interruptionPackId: '' },
      ]),
    ),
  };
}

async function seedDownloadedShellState(page: Page, { interruptionOn = false } = {}) {
  await page.addInitScript(
    ({ seededCards, seededLauncherBehaviorSettings }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('bishbash.launchAudit.enabled', 'true');
      if (window.localStorage.getItem('mybishbash.downloaded-shell-seeded.v1') !== 'true') {
        window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
        window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Downloaded Shell', timezone: 'Europe/London' }));
        window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
        window.localStorage.setItem('mybishbash.event-log.v1', '[]');
        window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
        window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
        window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
        window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededLauncherBehaviorSettings));
        window.localStorage.setItem('mybishbash.downloaded-shell-seeded.v1', 'true');
      }
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    {
      seededCards: [
        packCard('downloaded-shell-pack-a', 'Downloaded shell pack A'),
        packCard('downloaded-shell-pack-b', 'Downloaded shell pack B'),
        packCard('downloaded-shell-pack-c', 'Downloaded shell pack C'),
      ],
      seededLauncherBehaviorSettings: launcherSettings(interruptionOn),
    },
  );
}

async function simulateStandaloneDisplayMode(page: Page) {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia?.bind(window);
    window.matchMedia = ((query: string) => {
      if (query === '(display-mode: standalone)') {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return originalMatchMedia
        ? originalMatchMedia(query)
        : ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as MediaQueryList);
    }) as typeof window.matchMedia;
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });
  });
}

async function installLauncherShell(page: Page, launcherId: LauncherId) {
  await page.addInitScript((installedLauncherId) => {
    window.localStorage.setItem(
      'mybishbash.installed-launcher-shell.v1',
      JSON.stringify({
        launcher_id: installedLauncherId,
        launch_path: `/intercept/${installedLauncherId}`,
        updated_at: '2026-06-01T12:00:00.000Z',
      }),
    );
  }, launcherId);
}

async function waitForLauncherCard(page: Page) {
  const launcherCard = page.getByTestId('card-overlay-pack').or(page.getByTestId('card-overlay-personal'));
  await expect(launcherCard, 'Downloaded shell open should render a selectable personal/pack card, not caught-up').toBeVisible();
  await expect(page.getByTestId('card-overlay-empty'), 'Downloaded shell open should not render caught-up while pack cards exist').toHaveCount(0);
}

async function installLegacyPackLabelObserver(page: Page) {
  await page.addInitScript(() => {
    window.__MYBISHBASH_LEGACY_PACK_LABELS = [];
    const recordLegacyLabels = () => {
      const text = document.body?.innerText ?? '';
      if (/\bDislike\b/.test(text)) window.__MYBISHBASH_LEGACY_PACK_LABELS?.push('Dislike');
      if (/\bLike\b/.test(text)) window.__MYBISHBASH_LEGACY_PACK_LABELS?.push('Like');
    };
    new MutationObserver(recordLegacyLabels).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    requestAnimationFrame(recordLegacyLabels);
  });
}

async function expectOnlyLauncherChip(page: Page, launcherId: LauncherId) {
  const otherLaunchers = launcherIds.filter((id) => id !== launcherId);
  const packOverlay = page.getByTestId('card-overlay-pack');
  await expect(packOverlay.getByTestId(`fake-launcher-${launcherId}`)).toBeVisible();
  for (const otherLauncher of otherLaunchers) {
    await expect(packOverlay.getByTestId(`fake-launcher-${otherLauncher}`)).toHaveCount(0);
  }
}

async function expectFakeLauncherPackCard(page: Page, launcherId: LauncherId) {
  const packOverlay = page.getByTestId('card-overlay-pack');
  await expect(packOverlay).toBeVisible();
  await expect(packOverlay.getByRole('button', { name: 'Dislike' })).toHaveCount(0);
  await expect(packOverlay.getByRole('button', { name: 'Like', exact: true })).toHaveCount(0);
  await expect(packOverlay.getByRole('button', { name: 'I really like this one' })).toBeVisible();
  await expect(packOverlay.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(packOverlay.getByRole('button', { name: 'Back to home' })).toHaveCount(0);
  await expect(packOverlay.getByTestId('dashboard-shortcut')).toBeVisible();
  await expect(packOverlay.getByLabel('Open dashboard')).toBeVisible();
  await expect(packOverlay.locator('.premium-home-button')).toHaveCount(0);
  await expectOnlyLauncherChip(page, launcherId);
}

async function readOverlayDebug(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_OVERLAY_DEBUG ?? null);
}

async function expectSafariFakeLauncherPackContext(page: Page) {
  await expectFakeLauncherPackCard(page, 'safari');
  const debug = await readOverlayDebug(page);
  expect(debug).toMatchObject({
    overlay: {
      launchSource: 'fake_launcher',
      versionId: 'safari',
    },
    launchSession: {
      entrySurface: 'fake_launcher',
      launcherId: 'safari',
      allowBackHome: false,
    },
    visibleDestinationChips: ['safari'],
    selectedCtaLabels: ['I really like this one', 'Continue'],
  });
  for (const otherLauncher of launcherIds.filter((id) => id !== 'safari')) {
    await expect(page.getByTestId('card-overlay-pack').getByTestId(`fake-launcher-${otherLauncher}`)).toHaveCount(0);
  }
  return debug;
}

async function readTrace(page: Page) {
  return page.evaluate(() => {
    const audit = window.__lastLauncherSelectionAudit ?? null;
    const visible =
      document.querySelector('[data-testid="card-overlay-pack"]') ? 'pack'
        : document.querySelector('[data-testid="card-overlay-personal"]') ? 'personal'
          : document.querySelector('[data-testid="card-overlay-interruption"]') ? 'interruption'
            : document.querySelector('[data-testid="continue-to-app-card"]') ? 'continue'
              : document.querySelector('[data-testid="card-overlay-empty"]') ? 'caught-up'
                : 'none';
    return {
      visible,
      selectedId: audit?.selected?.id ?? null,
      selectedTitle: audit?.selected?.title ?? null,
      finalRenderedCard: audit?.finalRenderedCard ?? null,
      counts: audit?.summaryCounts ?? {},
    };
  });
}

async function completeRoundToHome(page: Page, round: number) {
  await waitForLauncherCard(page);
  const trace = await readTrace(page);
  console.log(
    `[downloaded-shell:${round}] card=${trace.visible} selected=${trace.selectedId ?? '(none)'} title="${trace.selectedTitle ?? ''}" counts=${JSON.stringify(trace.counts)}`,
  );

  if (await page.getByTestId('card-overlay-pack').isVisible()) {
    await page.getByTestId('card-overlay-pack').getByTestId('card-action-continue').click();
  } else {
    await page.getByTestId('card-overlay-personal').getByTestId('card-action-done').click();
  }

  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  await expect(page.getByTestId('continue-to-app-card').getByRole('button', { name: 'Back to MyBishBash' })).toHaveCount(0);
  await expect(page.getByTestId('continue-to-app-card').getByTestId('dashboard-shortcut')).toBeVisible();
  console.log(`[downloaded-shell:${round}] terminal=navigate-home-for-repeat`);
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
}

test('downloaded shell can be opened repeatedly from its manifest start URL', async ({ page }) => {
  await seedDownloadedShellState(page, { interruptionOn: false });

  for (let round = 1; round <= 3; round += 1) {
    console.log(`[downloaded-shell:${round}] open=/mybishbash/intercept/safari`);
    await page.goto('/mybishbash/intercept/safari');
    await completeRoundToHome(page, round);
    await page.waitForTimeout(2000);
  }
});

test('downloaded shell resume rebuilds the launcher flow on the same intercept route', async ({ page }) => {
  await seedDownloadedShellState(page, { interruptionOn: false });

  await page.goto('/mybishbash/intercept/safari');
  await completeRoundToHome(page, 1);
  await page.goto('/mybishbash/intercept/safari');
  await waitForLauncherCard(page);

  console.log('[downloaded-shell:lifecycle] simulate pagehide -> pageshow on /mybishbash/intercept/safari');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));

  await waitForLauncherCard(page);
  const trace = await readTrace(page);
  console.log(
    `[downloaded-shell:lifecycle] card=${trace.visible} selected=${trace.selectedId ?? '(none)'} title="${trace.selectedTitle ?? ''}" counts=${JSON.stringify(trace.counts)}`,
  );
  expect(trace.visible).toMatch(/^(pack|personal)$/);
  expect(trace.counts.eligiblePackCards).toBeGreaterThan(0);
});

test('tester standalone home launch recovers the installed Safari shell flow', async ({ page }) => {
  await simulateStandaloneDisplayMode(page);
  await seedDownloadedShellState(page, { interruptionOn: false });
  await installLauncherShell(page, 'safari');

  await page.goto('/mybishbash/home');
  await waitForLauncherCard(page);
  await expect(page).toHaveURL(/\/mybishbash\/intercept\/safari$/);
  await expect(page.getByTestId('card-overlay-pack').getByTestId('card-action-continue')).toBeVisible();
});

test('installed Safari shell pack card keeps fake launcher context for chips and CTA', async ({ page }) => {
  await simulateStandaloneDisplayMode(page);
  await seedDownloadedShellState(page, { interruptionOn: false });
  await installLauncherShell(page, 'safari');

  await page.goto('/mybishbash/home');
  await waitForLauncherCard(page);
  await expect(page).toHaveURL(/\/mybishbash\/intercept\/safari$/);
  await expectFakeLauncherPackCard(page, 'safari');

  const debug = await readOverlayDebug(page);
  expect(debug).toMatchObject({
    route: {
      kind: 'intercept',
      path: '/intercept/safari',
    },
    overlay: {
      type: 'reveal',
      origin: 'intercept',
      launchSource: 'fake_launcher',
      versionId: 'safari',
    },
    launchSession: {
      entrySurface: 'fake_launcher',
      launcherId: 'safari',
      allowBackHome: false,
    },
    visibleDestinationChips: ['safari'],
    selectedCtaLabels: ['I really like this one', 'Continue'],
  });
});

test('installed Safari shell repeat entry refreshes fake launcher card context after continuing to real app', async ({ page }) => {
  await simulateStandaloneDisplayMode(page);
  await seedDownloadedShellState(page, { interruptionOn: false });
  await installLauncherShell(page, 'safari');

  await page.goto('/mybishbash/intercept/safari');
  await waitForLauncherCard(page);
  const firstDebug = await expectSafariFakeLauncherPackContext(page);
  expect(firstDebug?.overlay).toMatchObject({
    type: 'reveal',
    origin: 'intercept',
    launchSource: 'fake_launcher',
    versionId: 'safari',
  });

  await page.getByTestId('card-overlay-pack').getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  await page.getByTestId('continue-to-app-card').getByRole('link', { name: /Continue to Safari/ }).click();
  await expect.poll(async () => page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.length ?? 0)).toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));

  await waitForLauncherCard(page);
  const secondDebug = await expectSafariFakeLauncherPackContext(page);
  expect(secondDebug?.overlay).toMatchObject({
    type: 'reveal',
    origin: 'intercept',
    launchSource: 'fake_launcher',
    versionId: 'safari',
  });
  expect(secondDebug?.overlay?.activationKey).toBeTruthy();
  expect(secondDebug?.overlay?.activationKey).not.toBe(firstDebug?.overlay?.activationKey);
});

for (const launcherId of launcherIds) {
  test(`fake ${launcherId} launcher pack card keeps new CTA copy and one destination chip`, async ({ page }) => {
    await seedDownloadedShellState(page, { interruptionOn: false });

    await page.goto(`/mybishbash/intercept/${launcherId}`);
    await waitForLauncherCard(page);
    await expect(page).toHaveURL(new RegExp(`/mybishbash/intercept/${launcherId}$`));
    await expectFakeLauncherPackCard(page, launcherId);
  });

  test(`tester ${launcherId} installed shell keeps pack cards on Continue after home icon and launcher reopen`, async ({ page }) => {
    await seedDownloadedShellState(page, { interruptionOn: false });
    await installLauncherShell(page, launcherId);

    await page.goto(`/mybishbash/intercept/${launcherId}`);
    await waitForLauncherCard(page);
    await expect(page).toHaveURL(new RegExp(`/mybishbash/intercept/${launcherId}$`));
    await expectFakeLauncherPackCard(page, launcherId);

    await page.goto('/mybishbash/library');
    await expect(page).toHaveURL(/\/mybishbash\/library$/);
    await expect(page.getByTestId('library-active-packs-section-toggle')).toBeVisible();
    await page.getByTestId('library-active-packs-section-toggle').click();

    await page.getByTestId('library-row-downloaded-shell-pack').click();
    await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
    await expect(page.getByTestId('card-overlay-pack').getByTestId('card-action-continue')).toBeVisible();
    await expect(page.getByTestId('card-overlay-pack').getByRole('button', { name: 'Back to home' })).toHaveCount(0);

    await page.getByTestId('card-overlay-pack').getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
    await expect(page.getByTestId('continue-to-app-card').getByRole('button', { name: 'Back to MyBishBash' })).toHaveCount(0);
    await expect(page.getByTestId('continue-to-app-card').getByTestId('dashboard-shortcut')).toBeVisible();
    await page.goto('/mybishbash/home');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page).toHaveURL(/\/mybishbash\/home$/);

    await page.goto(`/mybishbash/intercept/${launcherId}`);
    await waitForLauncherCard(page);
    await expect(page).toHaveURL(new RegExp(`/mybishbash/intercept/${launcherId}$`));
    await expectFakeLauncherPackCard(page, launcherId);
  });
}

test('fake launcher first rendered frame never contains legacy pack labels', async ({ page }) => {
  await installLegacyPackLabelObserver(page);
  await seedDownloadedShellState(page, { interruptionOn: false });

  await page.goto('/mybishbash/intercept/safari');
  await waitForLauncherCard(page);
  await expectFakeLauncherPackCard(page, 'safari');

  const legacyLabels = await page.evaluate(() => window.__MYBISHBASH_LEGACY_PACK_LABELS ?? []);
  expect(legacyLabels).toEqual([]);
});

test('normal MyBishBash home pack browsing keeps Back to home neutral CTA', async ({ page }) => {
  await seedDownloadedShellState(page, { interruptionOn: false });

  await page.goto('/mybishbash/library');
  await expect(page.getByTestId('library-active-packs-section-toggle')).toBeVisible();
  await page.getByTestId('library-active-packs-section-toggle').click();
  await page.getByTestId('library-row-downloaded-shell-pack').click();

  await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
  await expect(page.getByTestId('card-overlay-pack').getByRole('button', { name: 'Back to home' })).toBeVisible();
  await expect(page.getByTestId('card-overlay-pack').getByRole('button', { name: 'Continue' })).toHaveCount(0);
  await expect(page.getByTestId('card-overlay-pack').locator('[data-testid^="fake-launcher-"]')).toHaveCount(0);
  await expect(page.getByTestId('card-overlay-pack').getByTestId('pause-app-button')).toHaveCount(0);
});
