import { expect, test, type Page } from '@playwright/test';

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

  await expect(page.getByText('MyBishBash is invite-only right now.')).toBeVisible();
  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get MyBishBash' })).toHaveAttribute('href', '/mybishbash/invite');
  await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toHaveCount(0);
});

test('demo mode can create an account without an access-code field', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/demo-signup');

  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible({ timeout: 10000 });
  const authState = await page.evaluate(() => ({
    authMock: window.localStorage.getItem('MYBISHBASH_E2E_AUTH_MOCK'),
    session: JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_AUTH_SESSION') ?? '{}'),
  }));
  expect(authState.authMock).toBe('true');
  expect(authState.session.user.email).toContain('@example.com');
});

test('expired validated gate code is blocked at signup', async ({ page }) => {
  await seedAuthMock(page);
  await seedSignupHandoff(page, 'WELCOME', Date.now() - 60 * 1000);
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
  const storedGateCode = await page.evaluate(() => window.localStorage.getItem('mybishbash.validated-gate-access-code.v1'));
  const storedHandoff = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), SIGNUP_HANDOFF_REFERENCE_KEY);
  expect(storedGateCode).toBeNull();
  expect(storedHandoff.handoffRef).toMatch(/^e2e-handoff-/);

  await page.getByRole('button', { name: 'I’ve added MyBishBash' }).click();
  await expect(page.getByTestId('download-success-page')).toBeVisible();
  await page.getByRole('link', { name: 'Create account without installing' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);

  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible({ timeout: 10000 });
  const signupAccess = await page.evaluate(() => JSON.parse(window.localStorage.getItem('MYBISHBASH_E2E_LAST_SIGNUP_ACCESS') ?? '{}'));
  expect(signupAccess.accessCode).toBe('WELCOME');
  expect(signupAccess.grant_reason).toBe('early_user');
  expect(signupAccess.tester_group).toBe('early_user');
});

test('signup with invalid remembered gate code is blocked', async ({ page }) => {
  await seedAuthMock(page);
  await seedSignupHandoff(page, 'WRONG-CODE');
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByText('Your access code was not recognised.')).toBeVisible();
  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toHaveCount(0);
});

test('different gate codes map through signup to their access group', async ({ page }) => {
  await seedAuthMock(page);
  await seedSignupHandoff(page, 'TESTER');
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible({ timeout: 10000 });
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
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByText('Finish creating your account in the browser tab')).toHaveCount(0);
  await expect(page.getByLabel('Access code')).toHaveCount(0);
  await fillSignup(page);

  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible({ timeout: 10000 });
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

  await expect(page.getByRole('heading', { name: 'Finish setting up MyBishBash' })).toBeVisible();
  await expect(page.getByText('We couldn’t find your access session. Enter your access code once more to finish creating your account in the app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create account in browser instead' })).toHaveAttribute('href', '/mybishbash/home?signup=1');
  await expect(page.getByRole('link', { name: 'Get MyBishBash' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Join waitlist' })).toHaveCount(0);
  await page.getByLabel('Access code').fill('NOPE');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('That access code didn’t work. Please check it and try again.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toHaveCount(0);

  await page.getByLabel('Access code').fill('WELCOME');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
});

test('existing approved user can log in without access code', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home');

  await expect(page.getByRole('heading', { name: 'MyBishBash' })).toBeVisible();
  await page.getByLabel('Email').fill('approved@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log In' }).click();

  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible({ timeout: 10000 });
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
  await page.goto('/mybishbash/invite');
  await page.getByLabel('Access code').fill('WELCOME');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  await page.getByRole('button', { name: 'I’ve added MyBishBash' }).click();
  await page.getByRole('link', { name: 'Create account without installing' }).click();
  await page.getByLabel('Email').fill('new-shared-device-user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByLabel(/I agree to the Terms/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible({ timeout: 10000 });
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
  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toHaveCount(0);
});

test('direct product route cannot be accessed by unauthorised user', async ({ page }) => {
  await page.goto('/mybishbash/apps');

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByTestId('apps-panel')).toHaveCount(0);
});
