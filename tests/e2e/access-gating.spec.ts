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

  await page.getByRole('link', { name: 'I can’t do this right now' }).click();
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
