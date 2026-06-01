import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
  }
}

const now = '2026-06-01T12:00:00.000Z';

type SeedOptions = {
  cards?: Array<Record<string, unknown>>;
  setupComplete?: boolean;
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

async function installConsoleErrorGuard(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function seedE2EState(page: Page, options: SeedOptions = {}) {
  const { cards = [], setupComplete = true } = options;
  await page.addInitScript(
    ({ seededCards, seededSetupComplete }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', String(seededSetupComplete));
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'E2E', timezone: 'Europe/London' }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
        mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      }));
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS.push({ href, metadata });
        return true;
      };
    },
    { seededCards: cards, seededSetupComplete: setupComplete },
  );
}

async function getNavigationAttempts(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
}

async function gotoApp(page: Page, path: string) {
  await page.goto(`/mybishbash${path}`);
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

test('in-app fake launchers open real destinations without showing interruption cards', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  const expectedDestinations = {
    safari: /^https:\/\/www\.google\.com/,
    youtube: /^https:\/\/www\.youtube\.com/,
    instagram: /^https:\/\/www\.instagram\.com/,
  };

  for (const [launcherId, expectedDestination] of Object.entries(expectedDestinations)) {
    await page.getByTestId(`fake-launcher-${launcherId}`).click();
    await expect.poll(async () => (await getNavigationAttempts(page)).length).toBeGreaterThan(0);
    const attempts = await getNavigationAttempts(page);
    const latest = attempts[attempts.length - 1];
    expect(latest.href).toMatch(expectedDestination);
    expect(latest.metadata).toMatchObject({
      versionId: launcherId,
      reason: 'fake_launcher_icon_clicked',
    });
    await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
    await expect(page.getByTestId('card-overlay-empty')).toHaveCount(0);
  }

  await expectNoConsoleErrors(consoleErrors);
});

test('intercept route shows interruption flow and does not auto-open destination', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [smokeCard('intercept-card', 'E2E intercept card')] });

  await gotoApp(page, '/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'E2E intercept card' })).toBeVisible();
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(0);
  await expectNoConsoleErrors(consoleErrors);
});

test('continue-to-app opens the destination from no-card intercept state', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/intercept/safari');
  await page.getByTestId('card-action-continue-to-app').click();

  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(/google\.com|x-safari-/);
  expect(attempt.metadata).toMatchObject({
    versionId: 'safari',
    reason: 'user_pressed_continue_after_no_eligible_cards',
  });
  await expectNoConsoleErrors(consoleErrors);
});

test('normal Home opens personal cards separately from fake launcher behaviour', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [smokeCard('home-card', 'E2E home card')] });

  await gotoApp(page, '/home');
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await page.getByTestId('home-card-home-card').click();

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

test('basic card create, open, complete flow does not immediately reappear', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/home');
  await page.getByTestId('create-card-button').click();
  await page.getByTestId('card-prompt-input').fill('E2E created card');
  await page.getByTestId('save-card-button').click();

  await expect(page.getByText('E2E created card')).toBeVisible();
  await page.getByText('E2E created card').click();
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('card-action-done').click();

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'E2E created card' })).toBeVisible();
  await expectNoConsoleErrors(consoleErrors);
});

test('mobile viewport keeps bottom nav and fake launcher destination behaviour working', async ({ page }) => {
  const consoleErrors = await installConsoleErrorGuard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedE2EState(page, { cards: [] });

  await gotoApp(page, '/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('bottom-nav-settings').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByTestId('bottom-nav-home').click();
  await expect(page.getByTestId('home-panel')).toBeVisible();

  await page.getByTestId('fake-launcher-instagram').click();
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href).toMatch(/^https:\/\/www\.instagram\.com/);
  expect(attempt.metadata).toMatchObject({
    versionId: 'instagram',
    reason: 'fake_launcher_icon_clicked',
  });
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expectNoConsoleErrors(consoleErrors);
});
