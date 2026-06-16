import { expect, test, type Page } from '@playwright/test';

async function seedAuthMock(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_AUTH_MOCK', 'true');
  });
}

async function fillSignup(page: Page, { code }: { code?: string } = {}) {
  await page.getByLabel('Email').fill(`beta-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('password123');
  if (code !== undefined) {
    await page.getByLabel('Access code').fill(code);
  }
  await page.getByLabel(/I agree to the Terms/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();
}

test('signup without access code is blocked', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home?signup=1');

  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();
  await expect(page.getByText('MyBishBash is invite-only right now.')).toBeVisible();

  await fillSignup(page);

  await expect(page.getByTestId('sync-screen')).toBeVisible();
  await expect(page.getByLabel('Access code')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
});

test('signup with invalid access code is blocked', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home?signup=1');

  await fillSignup(page, { code: 'wrong-code' });

  await expect(page.getByText('Your access code was not recognised.')).toBeVisible();
  await expect(page.getByTestId('sync-screen')).toBeVisible();
});

test('signup with valid access code succeeds and reaches onboarding', async ({ page }) => {
  await seedAuthMock(page);
  await page.goto('/mybishbash/home?signup=1');

  await fillSignup(page, { code: 'BETA-VALID' });

  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toBeVisible({ timeout: 10000 });
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
