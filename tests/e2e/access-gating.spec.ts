import { expect, test, type Page } from '@playwright/test';

const VALIDATED_GATE_ACCESS_CODE_KEY = 'mybishbash.validated-gate-access-code.v1';

async function seedAuthMock(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_AUTH_MOCK', 'true');
  });
}

async function seedGateCode(page: Page, code: string, validatedAt = Date.now()) {
  await page.addInitScript(({ key, code: accessCode, validatedAt: timestamp }) => {
    window.localStorage.setItem(key, JSON.stringify({
      accessCode,
      validatedAt: timestamp,
    }));
  }, { key: VALIDATED_GATE_ACCESS_CODE_KEY, code, validatedAt });
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
    window.localStorage.setItem('mybishbash.validated-gate-access-code.v1', JSON.stringify({
      accessCode: 'WELCOME',
      validatedAt: Date.now(),
    }));
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

  await expect(page.getByText('MyBishBash is invite-only right now.')).toBeVisible();
  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get MyBishBash' })).toHaveAttribute('href', '/mybishbash/invite');
  await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
});

test('expired validated gate code is blocked at signup', async ({ page }) => {
  await seedAuthMock(page);
  await seedGateCode(page, 'WELCOME', Date.now() - 25 * 60 * 60 * 1000);
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByText('MyBishBash is invite-only right now.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
  await expect(page.getByLabel('Access code')).toHaveCount(0);
});

test('valid code at gate allows signup without an access-code field', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/invite');

  await page.getByLabel('Access code').fill('WELCOME');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/download$/);

  await page.getByRole('button', { name: 'I’ve added MyBishBash' }).click();
  await expect(page.getByTestId('download-success-page')).toBeVisible();
  await page.getByRole('link', { name: 'I’ve opened MyBishBash' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);

  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toBeVisible({ timeout: 10000 });
  const signupAccess = await page.evaluate(() => JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_LAST_SIGNUP_ACCESS') ?? '{}'));
  expect(signupAccess.accessCode).toBe('WELCOME');
  expect(signupAccess.grant_reason).toBe('early_user');
  expect(signupAccess.tester_group).toBe('early_user');
});

test('signup with invalid remembered gate code is blocked', async ({ page }) => {
  await seedAuthMock(page);
  await seedGateCode(page, 'WRONG-CODE');
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByText('Your access code was not recognised.')).toBeVisible();
  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
});

test('different gate codes map through signup to their access group', async ({ page }) => {
  await seedAuthMock(page);
  await seedGateCode(page, 'TESTER');
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toBeVisible({ timeout: 10000 });
  const signupAccess = await page.evaluate(() => JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_LAST_SIGNUP_ACCESS') ?? '{}'));
  expect(signupAccess.accessCode).toBe('TESTER');
  expect(signupAccess.grant_reason).toBe('tester');
  expect(signupAccess.is_tester).toBe(true);
  expect(signupAccess.tester_group).toBe('tester');
});

test('existing approved user can log in without access code', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home');

  await expect(page.getByRole('heading', { name: 'MyBishBash' })).toBeVisible();
  await page.getByLabel('Email').fill('approved@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log In' }).click();

  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel('Access code')).toHaveCount(0);
});

test('login screen offers password reset help and triggers the reset flow', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home');

  await expect(page.getByRole('heading', { name: 'MyBishBash' })).toBeVisible();
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
    expect(dialog.message()).toContain('Log out of this MyBishBash profile?');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Log out' }).click();

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByLabel('Email').fill('new-shared-device-user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByLabel(/I agree to the Terms/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toBeVisible({ timeout: 10000 });
  const state = await page.evaluate(() => ({
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    cardPacks: JSON.parse(window.localStorage.getItem('mybishbash.card-packs.v1') ?? '[]'),
    actionCards: JSON.parse(window.localStorage.getItem('mybishbash.action-cards.v1') ?? '[]'),
    events: JSON.parse(window.localStorage.getItem('mybishbash.event-log.v1') ?? '[]'),
    offlineQueue: JSON.parse(window.localStorage.getItem('mybishbash.offline-event-queue.v1') ?? '[]'),
  }));

  expect(state.setupComplete).not.toBe('true');
  expect(state.profile.name).not.toBe('Previous Device User');
  expect(state.cards.some((card: Record<string, unknown>) => card.id === 'previous-user-card')).toBe(false);
  expect(state.cards.some((card: Record<string, unknown>) => card.promptText === 'Previous user private card')).toBe(false);
  expect(state.cardPacks.some((pack: Record<string, unknown>) => pack.id === 'previous-pack')).toBe(false);
  expect(state.actionCards.some((card: Record<string, unknown>) => card.id === 'previous-action')).toBe(false);
  expect(state.events.some((event: Record<string, unknown>) => event.id === 'previous-event')).toBe(false);
  expect(state.offlineQueue.some((event: Record<string, unknown>) => event.id === 'previous-queued-event')).toBe(false);
});

test('direct onboarding route cannot be accessed by unauthorised user', async ({ page }) => {
  await page.goto('/mybishbash/onboarding');

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MyBishBash' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
});

test('direct product route cannot be accessed by unauthorised user', async ({ page }) => {
  await page.goto('/mybishbash/apps');

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByTestId('apps-panel')).toHaveCount(0);
});
