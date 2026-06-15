import { expect, test } from '@playwright/test';

test('landing Get MyBishBash routes to the download page', async ({ page }) => {
  await page.goto('/mybishbash/');

  const primaryCta = page.locator('.hero-actions .button.primary');
  await expect(primaryCta).toHaveAttribute('href', '/mybishbash/download');
});

test('download page presents Home Screen install flow and continues to signup mode', async ({ page }) => {
  await page.goto('/mybishbash/download');

  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Add MyBishBash\s+to your Home Screen/ })).toBeVisible();
  await expect(page.getByText('To show your Personal Cards before the apps you use, MyBishBash needs to be on your Home Screen.')).toBeVisible();
  await expect(page.getByText('Tap Share')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add to Home Screen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open MyBishBash' })).toBeVisible();
  await expect(page.getByText('This is required for reminders to appear before your apps.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('PWA');
  await expect(page.locator('main')).not.toContainText('Shell');
  await expect(page.locator('main')).not.toContainText('Launcher');
  await expect(page.locator('main')).not.toContainText('Intercept');
  await expect(page.locator('main')).not.toContainText('Fake App');

  await page.getByRole('link', { name: 'I’ve added it' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();

  const profile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(profile.hasCompletedHomeScreenInstall).toBe(true);
  expect(profile.hasSkippedHomeScreenInstallPrompt).toBe(false);
  expect(profile.plan).toBe('free');
});

test('download skip stores incomplete install state and continues to signup mode', async ({ page }) => {
  await page.goto('/mybishbash/download');

  await page.getByRole('link', { name: 'I can’t do this right now' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();

  const profile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(profile.hasCompletedHomeScreenInstall).toBe(false);
  expect(profile.hasSkippedHomeScreenInstallPrompt).toBe(true);
  expect(profile.plan).toBe('free');
});

test('Home shows only incomplete activation checklist items', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Activation Tester',
      timezone: 'Europe/London',
      plan: 'free',
      hasSkippedHomeScreenInstallPrompt: true,
      hasCompletedHomeScreenInstall: false,
      hasCompletedPersonalCardSetup: false,
      hasCompletedProtectedAppSetup: false,
    }));
    window.localStorage.setItem('mybishbash.cards.v1', '[]');
    window.localStorage.setItem('mybishbash.card-packs.v1', '[]');
    window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
    window.localStorage.setItem('mybishbash.event-log.v1', '[]');
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
    window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
    window.localStorage.setItem('mybishbash.hidden-library-packs.v1', '[]');
    window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
      mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      whatsapp: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    }));
  });

  await page.goto('/mybishbash/home');

  await expect(page.getByTestId('home-activation-checklist')).toBeVisible();
  await expect(page.getByText('Finish setting up MyBishBash')).toBeVisible();
  await expect(page.getByText('Add MyBishBash to your Home Screen')).toBeVisible();
  await expect(page.getByText('Create your first Personal Card')).toBeVisible();
  await expect(page.getByText('Add your first protected app')).toBeVisible();
});
