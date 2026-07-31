import { expect, test, type Page } from '@playwright/test';
import { readIndexedDbValues } from './indexeddb';

const SIGNUP_HANDOFF_REFERENCE_KEY = 'mybishbash.signup-handoff-ref.v1';
const E2E_SIGNUP_HANDOFFS_KEY = 'MYBISHBASH_E2E_SIGNUP_HANDOFFS';

async function seedAuthMock(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_AUTH_MOCK', 'true');
  });
}

async function seedSignupHandoff(page: Page, code: string, expiresAt = Date.now() + 30 * 60 * 1000) {
  await page.addInitScript(({ handoffKey, handoffsKey, code: accessCode, expiresAt: expiry }) => {
    const handoffRef = `seeded-handoff-${accessCode.toLowerCase()}`;
    window.localStorage.setItem(handoffKey, JSON.stringify({
      handoffRef,
      expiresAt: new Date(expiry).toISOString(),
    }));
    window.localStorage.setItem(handoffsKey, JSON.stringify({
      [handoffRef]: {
        accessCode,
        expiresAt: new Date(expiry).toISOString(),
        claimed: false,
      },
    }));
  }, { handoffKey: SIGNUP_HANDOFF_REFERENCE_KEY, handoffsKey: E2E_SIGNUP_HANDOFFS_KEY, code, expiresAt });
}

async function fillSignup(page: Page) {
  await page.getByLabel('Email').fill(`beta-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('password123');
  await page.getByLabel(/I agree to the Terms/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();
}

async function seedSharedDeviceExistingAccount(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_AUTH_MOCK', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Previous Device User',
      timezone: 'Europe/London',
      onboardingCompletedAt: '2026-06-01T09:00:00.000Z',
    }));
    window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify([
      {
        id: 'previous-user-card',
        cardKind: 'personal',
        promptText: 'Previous user private card',
        dashboardTitle: 'Previous user private card',
        theme: 'Soft Bloom',
        icon: 'heart',
        statusToday: 'fresh',
        createdAt: '2026-06-01T09:00:00.000Z',
        updatedAt: '2026-06-01T09:00:00.000Z',
        frequency: 'once_daily',
        timingWindows: ['day'],
        paused: false,
        deletedAt: null,
      },
    ]));
    window.localStorage.setItem('mybishbash.card-packs.v1', JSON.stringify([{ id: 'previous-pack', name: 'Previous pack', cards: [] }]));
    window.localStorage.setItem('mybishbash.action-cards.v1', JSON.stringify([{ id: 'previous-action', title: 'Previous action', source: 'user' }]));
    window.localStorage.setItem('mybishbash.event-log.v1', JSON.stringify([
      {
        id: 'previous-event',
        event_type: 'card_completed',
        action_taken: 'done',
        created_at: '2026-06-01T10:00:00.000Z',
      },
    ]));
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', JSON.stringify([{ id: 'previous-queued-event' }]));
  });
}

test('direct signup without validated gate code is blocked', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByText('myBishBash is invite-only right now.')).toBeVisible();
  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get myBishBash' })).toHaveAttribute('href', '/mybishbash/invite');
  await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toHaveCount(0);
});

test('production preview does not expose the dev-only demo signup bypass', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/demo-signup');

  await expect(page).toHaveURL(/\/mybishbash\/demo-signup$/);
  await expect(page.getByRole('heading', { name: 'myBishBash' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
});

test('expired validated gate code is blocked at signup', async ({ page }) => {
  await seedAuthMock(page);
  await seedSignupHandoff(page, 'WELCOME', Date.now() - 60 * 1000);
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByText('myBishBash is invite-only right now.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
  await expect(page.getByLabel('Access code')).toHaveCount(0);
});

test('valid code at gate allows signup without an access-code field', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/invite');

  await page.getByLabel('Access code').fill('WELCOME');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  const storedGateCode = await page.evaluate(() => window.localStorage.getItem('mybishbash.validated-gate-access-code.v1'));
  const storedHandoff = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), SIGNUP_HANDOFF_REFERENCE_KEY);
  expect(storedGateCode).toBeNull();
  expect(storedHandoff.handoffRef).toMatch(/^e2e-handoff-/);

  await page.getByRole('button', { name: 'I’ve installed it' }).click();
  await expect(page.getByTestId('download-success-page')).toBeVisible();
  await page.getByRole('link', { name: 'Continue in Browser' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);

  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible({ timeout: 10000 });
  const signupAccess = await page.evaluate(() => JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_LAST_SIGNUP_ACCESS') ?? '{}'));
  expect(signupAccess.accessCode).toBe('WELCOME');
  expect(signupAccess.grant_reason).toBe('early_user');
  expect(signupAccess.tester_group).toBe('early_user');
});

test('signup with invalid remembered gate code is blocked', async ({ page }) => {
  await seedAuthMock(page);
  await seedSignupHandoff(page, 'WRONG-CODE');
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByText('Your access code was not recognised.')).toBeVisible();
  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toHaveCount(0);
});

test('different gate codes map through signup to their access group', async ({ page }) => {
  await seedAuthMock(page);
  await seedSignupHandoff(page, 'TESTER');
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible({ timeout: 10000 });
  const signupAccess = await page.evaluate(() => JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_LAST_SIGNUP_ACCESS') ?? '{}'));
  expect(signupAccess.accessCode).toBe('TESTER');
  expect(signupAccess.grant_reason).toBe('tester');
  expect(signupAccess.is_tester).toBe(true);
  expect(signupAccess.tester_group).toBe('tester');
});

test('installed PWA signup with handoff query opens the create-account form', async ({ page }) => {
  await seedAuthMock(page);
  await page.addInitScript(({ handoffKey, handoffsKey }) => {
    const handoffRef = 'installed-handoff-welcome';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    window.localStorage.setItem(handoffsKey, JSON.stringify({
      [handoffRef]: {
        accessCode: 'WELCOME',
        expiresAt,
        claimed: false,
      },
    }));
  }, { handoffKey: SIGNUP_HANDOFF_REFERENCE_KEY, handoffsKey: E2E_SIGNUP_HANDOFFS_KEY });

  await page.goto(`/mybishbash/home?signup=1&handoff=installed-handoff-welcome&handoffExpires=${encodeURIComponent(new Date(Date.now() + 30 * 60 * 1000).toISOString())}`);

  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toBeVisible();
  await expect(page.getByText('Finish creating your account in the browser tab')).toHaveCount(0);
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible({ timeout: 10000 });
  const signupAccess = await page.evaluate(() => JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_LAST_SIGNUP_ACCESS') ?? '{}'));
  expect(signupAccess.accessCode).toBe('WELCOME');
});

test('standalone missing-handoff recovery validates code before showing signup', async ({ page }) => {
  await seedAuthMock(page);
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    window.matchMedia = (query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  });

  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Finish setting up myBishBash' })).toBeVisible();
  await expect(page.getByText('We couldn’t find your access session. Enter your access code once more to finish creating your account in the app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to browser setup' })).toHaveAttribute('href', '/mybishbash/download');
  await expect(page.getByRole('link', { name: 'Get myBishBash' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Join waitlist' })).toHaveCount(0);
  await page.getByLabel('Access code').fill('NOPE');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('That access code didn’t work. Please check it and try again.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toHaveCount(0);

  await page.getByLabel('Access code').fill('WELCOME');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
});

test('existing approved user can log in without access code', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home');

  await expect(page.getByRole('heading', { name: 'myBishBash' })).toBeVisible();
  await page.getByLabel('Email').fill('approved@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log In' }).click();

  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel('Access code')).toHaveCount(0);
});

test('login screen offers password reset help and triggers the reset flow', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home');

  await expect(page.getByRole('heading', { name: 'myBishBash' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeDisabled();

  await page.getByLabel('Email').fill('reset-me@example.com');
  await page.getByRole('button', { name: 'Forgot password?' }).click();

  await expect(page.getByText('Password reset email sent.')).toBeVisible();
  const resetRequest = await page.evaluate(() => JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_LAST_PASSWORD_RESET') ?? '{}'));
  expect(resetRequest.email).toBe('reset-me@example.com');
  expect(resetRequest.redirectTo).toBe(page.url());
});

test('shared device logout clears prior account state before a new signup starts onboarding', async ({ page }) => {
  await seedSharedDeviceExistingAccount(page);
  await page.goto('/mybishbash/home');

  await page.getByLabel('Email').fill('previous@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10000 });

  await page.evaluate(() => {
    window.history.pushState({}, '', '/mybishbash/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Log out of this myBishBash profile?');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await page.goto('/mybishbash/invite');
  await page.getByLabel('Access code').fill('WELCOME');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  await page.getByRole('button', { name: 'I’ve installed it' }).click();
  await page.getByRole('link', { name: 'Continue in Browser' }).click();
  await page.getByLabel('Email').fill('new-shared-device-user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByLabel(/I agree to the Terms/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible({ timeout: 10000 });
  await expect.poll(async () => {
    const values = await readIndexedDbValues<string>(page, [
      'mybishbash.setup-complete.v1',
      'mybishbash.profile.v1',
      'mybishbash.cards.v1',
      'mybishbash.card-packs.v1',
      'mybishbash.action-cards.v1',
      'mybishbash.event-log.v1',
      'mybishbash.offline-event-queue.v1',
    ]);
    const parse = <T,>(key: string, fallback: T): T => {
      const raw = values[key];
      return raw === null ? fallback : JSON.parse(raw) as T;
    };
    const profile = parse<Record<string, unknown>>('mybishbash.profile.v1', {});
    const cards = parse<Array<Record<string, unknown>>>('mybishbash.cards.v1', []);
    const cardPacks = parse<Array<Record<string, unknown>>>('mybishbash.card-packs.v1', []);
    const actionCards = parse<Array<Record<string, unknown>>>('mybishbash.action-cards.v1', []);
    const events = parse<Array<Record<string, unknown>>>('mybishbash.event-log.v1', []);
    const offlineQueue = parse<Array<Record<string, unknown>>>('mybishbash.offline-event-queue.v1', []);
    return {
      setupComplete: values['mybishbash.setup-complete.v1'] === 'true',
      previousProfile: profile.name === 'Previous Device User',
      previousCardId: cards.some((card) => card.id === 'previous-user-card'),
      previousCardText: cards.some((card) => card.promptText === 'Previous user private card'),
      previousPack: cardPacks.some((pack) => pack.id === 'previous-pack'),
      previousAction: actionCards.some((card) => card.id === 'previous-action'),
      previousEvent: events.some((event) => event.id === 'previous-event'),
      previousQueuedEvent: offlineQueue.some((event) => event.id === 'previous-queued-event'),
    };
  }).toEqual({
    setupComplete: false,
    previousProfile: false,
    previousCardId: false,
    previousCardText: false,
    previousPack: false,
    previousAction: false,
    previousEvent: false,
    previousQueuedEvent: false,
  });
});

test('direct onboarding route cannot be accessed by unauthorised user', async ({ page }) => {
  await page.goto('/mybishbash/onboarding');

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'myBishBash' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toHaveCount(0);
});

test('direct product route cannot be accessed by unauthorised user', async ({ page }) => {
  await page.goto('/mybishbash/apps');

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByTestId('apps-panel')).toHaveCount(0);
});
