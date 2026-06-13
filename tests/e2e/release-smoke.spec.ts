import { devices, expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
    __MYBISHBASH_LAUNCH_SESSION?: { entrySurface?: string; launcherId?: string | null };
    __MYBISHBASH_CARD_OVERLAY_MOUNTS?: Array<Record<string, unknown>>;
  }
}

const now = '2026-06-01T12:00:00.000Z';
const safariDesktopDestination = /^https:\/\/www\.google\.com$/;
const safariIOSDestination = /^x-safari-https:\/\/www\.google\.com$/;
const safariDestination = /^(https:\/\/www\.google\.com|x-safari-https:\/\/www\.google\.com)$/;
const safariMarketingDestination = /apple\.com\/safari/i;

type SeedOptions = {
  cards?: Array<Record<string, unknown>>;
  actionCards?: Array<Record<string, unknown>>;
  dislikedPackCardIds?: string[];
  launcherBehaviorSettings?: Record<string, Record<string, unknown>>;
  homeScreenVersions?: Record<string, Record<string, unknown>>;
  setupComplete?: boolean;
  testerMode?: boolean;
};

function smokeCard(id: string, promptText: string) {
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

function packSmokeCard(id: string, promptText: string, sourcePackId = 'e2e-pack') {
  return {
    ...smokeCard(id, promptText),
    sourcePackId,
    sourcePackTitle: 'E2E Pack',
    attribution: 'E2E Pack',
  };
}

function actionCard(id: string, title: string, launchUrl: string) {
  return {
    id,
    title,
    body: `${title} instead`,
    category: 'Action',
    launchUrl,
    hidden: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function commitmentCard(id: string, promptText: string, overrides: Record<string, unknown> = {}) {
  return {
    ...smokeCard(id, promptText),
    cardKind: 'commitment',
    dashboardTitle: 'Today’s Commitment',
    commitmentReason: 'Because I said I would.',
    commitmentTimingMode: 'day',
    commitmentDecisionDate: currentDateKey(),
    commitmentDecisionAt: now,
    ...overrides,
  };
}

function hiddenStarterActionCards() {
  return ['ac-1', 'ac-2', 'ac-3'].map((id) => ({
    id,
    source: 'starter',
    hidden: true,
    deletedAt: null,
    updatedAt: now,
  }));
}

function launcherSettings(interruptionOn: boolean) {
  return {
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    safari: { useInterruptionPack: interruptionOn, interruptionPaused: false, interruptionPackId: '' },
    youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
  };
}

function hiddenSafariInterruptionCardIds() {
  return [
    'Do you want the internet, or a little pause first?',
    'What were you hoping to find online just now?',
    'Could your attention belong to real life for one more minute?',
  ].map((promptText) => `safari-interruption:${promptText}`);
}

async function installConsoleErrorGuard(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (/^Failed to load resource:/i.test(message.text())) return;
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    const isSpaDocumentFallback = request.resourceType() === 'document' && response.status() === 404 && response.url().includes('/mybishbash/');
    if (isSpaDocumentFallback) return;
    errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function seedE2EState(page: Page, options: SeedOptions = {}) {
  const {
    actionCards = [],
    cards = [],
    dislikedPackCardIds = [],
    homeScreenVersions = {},
    launcherBehaviorSettings = launcherSettings(false),
    setupComplete = true,
    testerMode = false,
  } = options;
  await page.addInitScript(
    ({ seededActionCards, seededCards, seededDislikedPackCardIds, seededHomeScreenVersions, seededLauncherBehaviorSettings, seededSetupComplete, seededTesterMode }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', String(seededTesterMode));
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', String(seededSetupComplete));
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'E2E', timezone: 'Europe/London' }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.home-screen-versions.v1', JSON.stringify(seededHomeScreenVersions));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', JSON.stringify(seededDislikedPackCardIds));
      window.localStorage.setItem('mybishbash.action-cards.v1', JSON.stringify(seededActionCards));
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededLauncherBehaviorSettings));
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS.push({ href, metadata });
        return true;
      };
    },
    {
      seededActionCards: actionCards,
      seededCards: cards,
      seededDislikedPackCardIds: dislikedPackCardIds,
      seededHomeScreenVersions: homeScreenVersions,
      seededLauncherBehaviorSettings: launcherBehaviorSettings,
      seededSetupComplete: setupComplete,
      seededTesterMode: testerMode,
    },
  );
}

async function getNavigationAttempts(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
}

async function gotoApp(page: Page, path: string) {
  await page.goto(`/mybishbash${path}`);
}

async function navigateWithinApp(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', `/mybishbash${nextPath}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
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

async function expectNoConsoleErrors(errors: string[]) {
  expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
}

test('app loads into a safe entry state without console errors', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);

  await gotoApp(page, '/home');

  await expect(page.getByTestId('sync-screen').or(page.getByTestId('app-shell')).or(page.getByText(/Make MyBishBash your gentle pattern interrupt/i))).toBeVisible();
  await expectNoConsoleErrors(consoleErrors);
});

test('in-app fake launchers route to caught-up screen when no cards and no pause', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/apps/safari');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  // Tapping the protected-launch control with no active pause must enter the
  // card flow, not launch the real app directly.
  await page.getByTestId('apps-protected-launch-safari').click();
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  expect(await getNavigationAttempts(page)).toHaveLength(0);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);

  await expectNoConsoleErrors(consoleErrors);
});

test('Safari desktop fake launcher routes to caught-up screen when no cards and no pause', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/apps/safari');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('apps-protected-launch-safari').click();

  // No active pause → card flow → empty caught-up screen
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  expect(await getNavigationAttempts(page)).toHaveLength(0);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expectNoConsoleErrors(consoleErrors);
});

test('tester in-app fake launcher shortcuts enter card flow (no active pause)', async ({ page }) => {
  // Per product requirement: direct launch ONLY when there is an active, unexpired pause.
  // Tester mode does not bypass the card/intervention flow from the fake launcher bar.
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [
      packSmokeCard('tester-fake-launcher-pack-a', 'E2E tester fake launcher pack A'),
      packSmokeCard('tester-fake-launcher-pack-b', 'E2E tester fake launcher pack B'),
    ],
    launcherBehaviorSettings: launcherSettings(false),
    testerMode: true,
  });

  await gotoApp(page, '/apps/safari');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  // Tapping a protected launcher with no active pause must enter the card flow,
  // even in tester mode — direct launch only happens with an active pause.
  await page.getByTestId('apps-protected-launch-safari').click();
  await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
  expect(await getNavigationAttempts(page)).toHaveLength(0);

  await expectNoConsoleErrors(consoleErrors);
});

test('Safari iOS fake launcher routes to caught-up screen when no cards and no pause', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 12'] });
  const page = await context.newPage();
  await simulateStandaloneDisplayMode(page);
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/apps/safari');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('apps-protected-launch-safari').click();

  // No active pause → card flow → empty caught-up screen
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  expect(await getNavigationAttempts(page)).toHaveLength(0);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expectNoConsoleErrors(consoleErrors);
  await context.close();
});

test('intercept route shows interruption flow and does not auto-open destination', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [smokeCard('intercept-card', 'E2E intercept card')] });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'E2E intercept card' })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__MYBISHBASH_LAUNCH_SESSION?.entrySurface)).toBe('fake_launcher');
  await expect.poll(async () => page.evaluate(() => window.__MYBISHBASH_LAUNCH_SESSION?.launcherId ?? null)).toBe('safari');
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(0);
  await expectNoConsoleErrors(consoleErrors);
});

test.describe('in-card app button bypasses interruption flow', () => {
  const cases = [
    { launcherId: 'safari', label: 'Safari', expected: safariDestination },
    { launcherId: 'instagram', label: 'Instagram', expected: /^instagram:\/\/app$/ },
    { launcherId: 'youtube', label: 'YouTube', expected: /^youtube:\/\// },
    { launcherId: 'whatsapp', label: 'WhatsApp', expected: /^https:\/\/api\.whatsapp\.com\/send$/ },
  ];

  for (const { launcherId, label, expected } of cases) {
    test(`${label} button opens the real destination from an active card`, async ({ page }) => {
      const consoleErrors = await installConsoleErrorGuard(page);
      await seedE2EState(page, {
        cards: [smokeCard(`${launcherId}-direct-card`, `E2E ${label} direct card`)],
        homeScreenVersions: {
          [launcherId]: {
            availabilityStatus: 'public',
            enabled: true,
          },
        },
        testerMode: true,
      });

      await gotoApp(page, `/intercept/${launcherId}`);

      const overlay = page.getByTestId('card-overlay-personal');
      await expect(overlay).toBeVisible();
      await expect(overlay.getByRole('heading', { name: `E2E ${label} direct card` })).toBeVisible();
      await expect.poll(async () => page.evaluate(() => window.__MYBISHBASH_CARD_OVERLAY_MOUNTS?.length ?? 0)).toBe(1);

      await overlay.getByTestId(`fake-launcher-${launcherId}`).getByText(label, { exact: true }).click();

      await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
      const [attempt] = await getNavigationAttempts(page);
      expect(attempt.href).toMatch(expected);
      expect(attempt.href).not.toContain('/intercept/');
      expect(attempt.href).not.toContain('/launch/');
      expect(attempt.metadata).toMatchObject({
        versionId: launcherId,
        source: 'in_card_app_button',
        reason: 'user_pressed_real_app_button',
      });
      await expect(page).toHaveURL(new RegExp(`/mybishbash/intercept/${launcherId}$`));
      await expect.poll(async () => page.evaluate(() => window.__MYBISHBASH_CARD_OVERLAY_MOUNTS?.length ?? 0)).toBe(1);
      await expect(page.getByTestId('continue-to-app-card')).toHaveCount(0);
      await expectNoConsoleErrors(consoleErrors);
    });
  }
});

test('continue-to-app opens the destination from no-card intercept state', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/intercept/safari');
  await page.getByTestId('card-action-continue-to-app').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(safariDestination);
  expect(attempt.href).not.toMatch(safariMarketingDestination);
  expect(attempt.metadata).toMatchObject({
    versionId: 'safari',
    reason: 'user_pressed_continue_after_no_eligible_cards',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('normal Library opens personal cards separately from fake launcher behaviour', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [smokeCard('home-card', 'E2E home card')] });

  await gotoApp(page, '/library');
  await expect(page.getByTestId('library-personal-section-toggle')).toBeVisible();
  await page.getByTestId('library-personal-section-toggle').click();
  await page.getByTestId('library-row-home-card').click();

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'E2E home card' })).toBeVisible();
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(0);
  await expectNoConsoleErrors(consoleErrors);
});

test('launcher-origin card completion does not create an immediate card loop', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [smokeCard('loop-card', 'E2E loop card')] });

  await gotoApp(page, '/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('card-action-done').click();

  await expect(page.getByTestId('continue-to-app-card').or(page.getByTestId('card-action-continue-to-app')).or(page.getByTestId('app-shell'))).toBeVisible();
  await expect(page.getByText('E2E loop card')).toHaveCount(0);
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher with interruption off shows one Layer 1 card then ContinueToAppCard', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [smokeCard('tester-off-card', 'E2E tester interruption off card')],
    launcherBehaviorSettings: launcherSettings(false),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'E2E tester interruption off card' })).toBeVisible();
  await page.getByTestId('card-action-done').click();

  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  await expect(page.getByTestId('card-overlay-interruption')).toHaveCount(0);
  await page.getByTestId('card-action-continue-to-safari').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(safariDestination);
  expect(attempt.metadata).toMatchObject({
    versionId: 'safari',
    source: 'continue_card',
    reason: 'user_pressed_continue',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher with interruption off and no Layer 1 card shows caught-up with continue action', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [],
    launcherBehaviorSettings: launcherSettings(false),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await expect(page.getByText('See you later.')).toBeVisible();
  await page.getByTestId('card-action-continue-to-app').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(safariDestination);
  expect(attempt.metadata).toMatchObject({
    versionId: 'safari',
    reason: 'user_pressed_continue_after_no_eligible_cards',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher with interruption off shows active pack card instead of caught-up', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [packSmokeCard('pack-active-card', 'E2E active pack card')],
    launcherBehaviorSettings: launcherSettings(false),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
  await expect(page.getByTestId('card-overlay-pack').getByRole('heading', { name: 'E2E active pack card' })).toBeVisible();
  await expect(page.getByTestId('card-overlay-empty')).toHaveCount(0);
  await expect(page.getByText("You're all caught up.")).toHaveCount(0);
  await page.getByTestId('card-action-continue').click();

  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  await page.getByTestId('card-action-continue-to-safari').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(safariDestination);
  expect(attempt.metadata).toMatchObject({
    versionId: 'safari',
    source: 'continue_card',
    reason: 'user_pressed_continue',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher with exhausted personal cards still shows active pack card before caught-up', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  const futureNotYetUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await seedE2EState(page, {
    cards: [
      { ...smokeCard('exhausted-personal-card', 'E2E exhausted personal card'), notYetUntil: futureNotYetUntil },
      packSmokeCard('pack-after-exhausted-personal', 'E2E pack after exhausted personal'),
    ],
    launcherBehaviorSettings: launcherSettings(false),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
  await expect(page.getByTestId('card-overlay-pack').getByRole('heading', { name: 'E2E pack after exhausted personal' })).toBeVisible();
  await expect(page.getByTestId('card-overlay-empty')).toHaveCount(0);
  await expect(page.getByText("You're all caught up.")).toHaveCount(0);
  await page.getByTestId('card-action-continue').click();

  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  await expect(page.getByTestId('card-overlay-pack')).toHaveCount(0);
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher with interruption on shows Layer 1 card then interruption continue opens destination directly', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [smokeCard('tester-on-card', 'E2E tester interruption on card')],
    launcherBehaviorSettings: launcherSettings(true),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'E2E tester interruption on card' })).toBeVisible();
  await page.getByTestId('card-action-done').click();

  await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
  await expect(page.getByTestId('continue-to-app-card')).toHaveCount(0);
  await page.getByTestId('card-action-continue-to-safari').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(safariDestination);
  expect(attempt.metadata).toMatchObject({
    versionId: 'safari',
    source: 'interruption_card',
    reason: 'user_pressed_continue',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher with interruption on and no Layer 1 card shows interruption directly', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [],
    launcherBehaviorSettings: launcherSettings(true),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
  await expect(page.getByTestId('card-overlay-empty')).toHaveCount(0);
  await expect(page.getByText("You're all caught up.")).toHaveCount(0);
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(0);
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher with interruption on and no valid interruption skips caught-up and continues to app', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [],
    dislikedPackCardIds: hiddenSafariInterruptionCardIds(),
    launcherBehaviorSettings: launcherSettings(true),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  await expect(page.getByTestId('card-overlay-interruption')).toHaveCount(0);
  await expect(page.getByText("You're all caught up.")).toHaveCount(0);
  await page.getByTestId('card-action-continue-to-safari').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(safariDestination);
  expect(attempt.href).not.toMatch(/example\.com\/e2e-action/);
  expect(attempt.metadata).toMatchObject({
    versionId: 'safari',
    source: 'continue_card',
    reason: 'user_pressed_continue',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('tester personal-first launcher interruption alternative path opens action URL instead of fake launcher destination', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  const actionUrl = 'https://example.com/e2e-action';
  await seedE2EState(page, {
    actionCards: [...hiddenStarterActionCards(), actionCard('action-e2e', 'E2E action card', actionUrl)],
    cards: [smokeCard('tester-action-card', 'E2E tester action path card')],
    launcherBehaviorSettings: launcherSettings(true),
    testerMode: true,
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('card-action-done').click();
  await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
  await page.getByTestId('card-action-do-something-else').click();

  await expect(page.getByTestId('card-overlay-action')).toBeVisible();
  await expect(page.getByTestId('card-overlay-action').getByRole('heading', { name: 'E2E action card' })).toBeVisible();
  await page.getByTestId('card-action-i-ll-do-this').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toBe(actionUrl);
  expect(attempt.href).not.toMatch(safariDestination);
  expect(attempt.metadata).toMatchObject({
    source: 'action_card',
    cardId: 'action-e2e',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('basic card create, open, complete flow does not immediately reappear', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/home');
  await page.getByTestId('create-card-button').click();
  await page.getByTestId('card-prompt-input').fill('E2E created card');
  await page.getByTestId('save-card-button').click();

  await page.getByTestId('bottom-nav-library').click();
  await page.getByTestId('library-personal-section-toggle').click();
  const createdLibraryRow = page.locator('[data-testid^="library-row-"]').filter({ hasText: 'E2E created card' });
  await expect(createdLibraryRow).toBeVisible();
  await createdLibraryRow.click();
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('card-action-done').click();

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expect(page.getByTestId('home-dashboard-summary')).toContainText('All 1 personal card complete today.');
  await expectNoConsoleErrors(consoleErrors);
});

test('mobile viewport keeps bottom nav and fake launcher destination behaviour working', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('bottom-nav-apps').click();
  await expect(page.getByTestId('apps-panel')).toBeVisible();
  await page.getByTestId('bottom-nav-home').click();
  await expect(page.getByTestId('home-panel')).toBeVisible();

  await page.getByTestId('bottom-nav-apps').click();
  await page.getByTestId('apps-select').selectOption('instagram');
  await page.getByTestId('apps-protected-launch-instagram').click();
  // No active pause → card flow → empty caught-up screen
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  expect(await getNavigationAttempts(page)).toHaveLength(0);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expectNoConsoleErrors(consoleErrors);
});

test('Home empty states use calm copy without stacked zero language', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/home');
  const summary = page.getByTestId('home-dashboard-summary');
  await expect(summary).toContainText('You’re all clear today');
  await expect(summary).toContainText('Nothing needs your attention.');
  await expect(summary).toContainText('Commitments');
  await expect(summary).toContainText('You’re clear for now.');
  await expect(summary).toContainText('Create commitment');
  await expect(summary).not.toContainText('No personal cards today');
  await expect(summary).not.toContainText('No live commitment');
  await expect(summary).not.toContainText('0 live commitments');
  await expect(page.locator('.home-progress-number')).toHaveText('0');
  await expectNoConsoleErrors(consoleErrors);
});

test('Home commitment card distinguishes active and completed commitment states', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);

  await seedE2EState(page, {
    cards: [
      commitmentCard('active-commitment', 'go for a walk today', {
        commitmentStatusToday: 'made',
        statusToday: 'doneToday',
      }),
    ],
  });
  await gotoApp(page, '/home');
  await expect(page.getByTestId('home-live-commitment-card')).toContainText('Live commitment');
  await expect(page.getByTestId('home-live-commitment-card')).toContainText('go for a walk today');
  await expect(page.getByTestId('home-live-commitment-card')).toContainText('1 live commitment');

  await seedE2EState(page, {
    cards: [
      commitmentCard('completed-commitment', 'not eat snacks after dinner', {
        commitmentStatusToday: 'declined',
        statusToday: 'doneToday',
      }),
    ],
  });
  await gotoApp(page, '/home');
  const completedCard = page.getByTestId('home-live-commitment-card');
  await expect(completedCard).toContainText('Commitments complete');
  await expect(completedCard).toContainText('Nothing active right now.');
  await expect(completedCard).not.toContainText('No active commitments');
  await expect(completedCard).not.toContainText('0 live commitments');
  await expectNoConsoleErrors(consoleErrors);
});

test('warm launch after dashboard keeps fake launcher return target', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, {
    cards: [
      packSmokeCard('card-1', 'First task'),
      packSmokeCard('card-2', 'Second task'),
    ]
  });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
  // In fake_launcher, pack cards have 'Continue'. In home, they have 'Back to home'
  await expect(page.getByTestId('card-action-continue')).toBeVisible();
  await expect(page.getByTestId('card-action-back-to-home')).toHaveCount(0);

  await page.getByTestId('dashboard-shortcut').click();
  await expect(page).toHaveURL(/\/home/);

  await navigateWithinApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
  await expect(page.getByTestId('card-action-continue')).toBeVisible();
  await expect(page.getByTestId('card-action-back-to-home')).toHaveCount(0);

  await expectNoConsoleErrors(consoleErrors);
});
