import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
  }
}

const AUTH_SESSION_KEY = 'MYBISHBASH_E2E_AUTH_SESSION';
const AUTH_MOCK_KEY = 'MYBISHBASH_E2E_AUTH_MOCK';
const FAIL_NEXT_ACCESS_PROFILE_KEY = 'MYBISHBASH_E2E_FAIL_NEXT_ACCESS_PROFILE';
const SEED_KEY = 'mybishbash.auth-session-persistence-seeded.v1';
const now = '2026-06-19T09:00:00.000Z';

function authSession(email = 'approved@example.com') {
  const normalizedEmail = email.toLowerCase();
  return {
    user: {
      id: `e2e-access-user:${normalizedEmail}`,
      email: normalizedEmail,
    },
  };
}

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

async function seedAppState(
  page: Page,
  {
    session = null,
    failNextAccessProfile = false,
  }: {
    session?: ReturnType<typeof authSession> | null;
    failNextAccessProfile?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({ seededSession, shouldFailNextAccessProfile, seededCard, keys, timestamp }) => {
      window.localStorage.setItem(keys.authMock, 'true');
      if (window.localStorage.getItem(keys.seed) !== 'true') {
        if (seededSession) {
          window.localStorage.setItem(keys.authSession, JSON.stringify(seededSession));
        }
        if (shouldFailNextAccessProfile) {
          window.localStorage.setItem(keys.failNextAccessProfile, 'true');
        }
        window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
        window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
          name: 'Session Tester',
          timezone: 'Europe/London',
          onboardingCompletedAt: timestamp,
        }));
        window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify([seededCard]));
        window.localStorage.setItem('mybishbash.event-log.v1', '[]');
        window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
        window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
        window.localStorage.setItem('mybishbash.card-packs.v1', '[]');
        window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
        window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
          mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
          safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
          instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
          youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        }));
        window.localStorage.setItem(keys.seed, 'true');
      }
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    {
      seededSession: session,
      shouldFailNextAccessProfile: failNextAccessProfile,
      seededCard: personalCard('session-card', 'Session persistence card'),
      keys: {
        authMock: AUTH_MOCK_KEY,
        authSession: AUTH_SESSION_KEY,
        failNextAccessProfile: FAIL_NEXT_ACCESS_PROFILE_KEY,
        seed: SEED_KEY,
      },
      timestamp: now,
    },
  );
}

async function logIn(page: Page, email = 'approved@example.com') {
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sync-screen')).toHaveCount(0);
}

async function expectSessionPresent(page: Page) {
  await expect.poll(
    () => page.evaluate((key) => Boolean(window.localStorage.getItem(key)), AUTH_SESSION_KEY),
  ).toBe(true);
}

async function expectSessionMissing(page: Page) {
  await expect.poll(
    () => page.evaluate((key) => Boolean(window.localStorage.getItem(key)), AUTH_SESSION_KEY),
  ).toBe(false);
}

test('login persists after reload', async ({ page }) => {
  await seedAppState(page);
  await logIn(page);
  await expectSessionPresent(page);

  await page.reload();

  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sync-screen')).toHaveCount(0);
  await expectSessionPresent(page);
});

test('login persists after closing and reopening the PWA route', async ({ page }) => {
  await seedAppState(page);
  await logIn(page);

  await page.goto('/mybishbash/home?source=pwa');

  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sync-screen')).toHaveCount(0);
  await expectSessionPresent(page);
});

test('login persists after opening an intercept shell route', async ({ page }) => {
  await seedAppState(page);
  await logIn(page);

  await page.goto('/mybishbash/intercept/safari');

  await expect(
    page.getByTestId('card-overlay-personal').or(page.getByRole('link', { name: 'Continue to Safari' })),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sync-screen')).toHaveCount(0);
  await expectSessionPresent(page);
});

test('login persists after showing and completing one card', async ({ page }) => {
  await seedAppState(page, { session: authSession() });
  await page.goto('/mybishbash/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('card-action-done').click();
  await expect.poll(() => page.evaluate(() => {
    const cards = JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]');
    return Boolean(cards.find((card: Record<string, unknown>) => card.id === 'session-card')?.doneDate);
  })).toBe(true);

  await expectSessionPresent(page);
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sync-screen')).toHaveCount(0);
});

test('login persists after pause and continue-to-app flows', async ({ page }) => {
  await seedAppState(page, { session: authSession() });
  await page.goto('/mybishbash/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('pause-app-button').click();
  await page.getByRole('button', { name: '30 mins' }).click();
  await expect.poll(
    () => page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.length ?? 0),
    { timeout: 5000 },
  ).toBeGreaterThan(0);
  await expectSessionPresent(page);

  await page.evaluate(() => {
    window.localStorage.setItem('mybishbash.app-pauses.v1', '{}');
    window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
  });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByRole('link', { name: 'Continue to Safari' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('link', { name: 'Continue to Safari' }).evaluate((element) => (element as HTMLElement).click());
  await expect.poll(
    () => page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.length ?? 0),
    { timeout: 5000 },
  ).toBeGreaterThan(0);
  await expectSessionPresent(page);
});

test('log out signs the user out globally across main app and shell routes', async ({ page }) => {
  await seedAppState(page, { session: authSession() });
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10000 });

  await page.evaluate(() => {
    window.history.pushState({}, '', '/mybishbash/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Log out of this MyBishBash profile?');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Log out' }).click();

  await expectSessionMissing(page);
  await expect(page.getByTestId('sync-screen')).toBeVisible({ timeout: 10000 });

  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('sync-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});

test('a transient profile load failure does not immediately clear auth', async ({ page }) => {
  await seedAppState(page, {
    session: authSession(),
    failNextAccessProfile: true,
  });

  await page.goto('/mybishbash/home');

  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sync-screen')).toHaveCount(0);
  await expectSessionPresent(page);
  const failureFlag = await page.evaluate((key) => window.localStorage.getItem(key), FAIL_NEXT_ACCESS_PROFILE_KEY);
  expect(failureFlag).toBeNull();
});
