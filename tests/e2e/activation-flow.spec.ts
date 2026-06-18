import { expect, test } from '@playwright/test';

const ROLLOUT_ACCESS_KEY = 'mybishbash.rollout-download-access.v1';

test('landing Get MyBishBash opens the invite gate, not download', async ({ page }) => {
  await page.goto('/mybishbash/');

  const primaryCta = page.locator('.hero-actions .button.primary');
  await expect(primaryCta).toHaveAttribute('href', '/mybishbash/invite');
  await primaryCta.click();
  await expect(page).toHaveURL(/\/mybishbash\/invite$/);
  await expect(page.getByTestId('download-access-gate')).toBeVisible();
  await expect(page.getByText('MyBishBash is currently invite-only.')).toBeVisible();
});

test('WELCOME unlocks the existing download page', async ({ page }) => {
  await page.goto('/mybishbash/invite');

  await page.getByLabel('Access code').fill('  welcome  ');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Add MyBishBash\s+to your Home Screen/ })).toBeVisible();
  await expect(page.evaluate((key) => window.localStorage.getItem(key), ROLLOUT_ACCESS_KEY)).resolves.toBe('true');
});

test('wrong rollout code shows retry and waitlist actions', async ({ page }) => {
  await page.goto('/mybishbash/invite');

  await page.getByLabel('Access code').fill('NOPE');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('That code didn’t work. Please try again or join the waitlist.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join waitlist' })).toHaveAttribute('href', '/mybishbash/early-access');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('Access code')).toHaveValue('');
});

test('direct download without rollout access is blocked by invite gate', async ({ page }) => {
  await page.goto('/mybishbash/download');

  await expect(page.getByTestId('download-access-gate')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get MyBishBash' })).toBeVisible();
  await expect(page.getByTestId('download-page')).toHaveCount(0);
});

test('direct download after WELCOME is allowed', async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'true');
  }, ROLLOUT_ACCESS_KEY);
  await page.goto('/mybishbash/download');

  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Add MyBishBash\s+to your Home Screen/ })).toBeVisible();
});

test('download page presents Home Screen install flow and continues to signup mode', async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'true');
  }, ROLLOUT_ACCESS_KEY);
  await page.goto('/mybishbash/download');

  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Add MyBishBash\s+to your Home Screen/ })).toBeVisible();
  await expect(page.getByText('To show your Personal Cards before the apps you choose, MyBishBash needs to be on your Home Screen.')).toBeVisible();
  await expect(page.getByText('Tap Share')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add to Home Screen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open MyBishBash from your Home Screen' })).toBeVisible();
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
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'true');
  }, ROLLOUT_ACCESS_KEY);
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
  await expect(page.getByText('Your next step')).toBeVisible();
  await expect(page.getByText('Add MyBishBash to your Home Screen')).toBeVisible();
  await expect(page.getByText('Create your first Personal Card')).toBeVisible();
  await expect(page.getByText('Choose your first app')).toBeVisible();
});

test('Home hides activation checklist when setup is complete', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Complete Tester',
      timezone: 'Europe/London',
      plan: 'free',
      hasSkippedHomeScreenInstallPrompt: false,
      hasCompletedHomeScreenInstall: true,
      hasCompletedPersonalCardSetup: true,
      hasCompletedProtectedAppSetup: true,
      selectedProtectedApp: 'instagram',
      hasCompletedHomeSpotlightTour: true,
    }));
    window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify([
      {
        id: 'personal-card-1',
        cardKind: 'personal',
        promptText: 'Drink some water.',
        theme: 'Soft Bloom',
        icon: 'water',
        statusToday: 'pending',
        createdAt: '2026-06-14T10:00:00.000Z',
        updatedAt: '2026-06-14T10:00:00.000Z',
        lastShownAt: null,
        notYetUntil: null,
        doneDate: null,
        frequency: 'once_daily',
        timingWindows: ['day'],
        paused: false,
        deletedAt: null,
      },
    ]));
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

  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByTestId('home-activation-checklist')).toHaveCount(0);
  await expect(page.getByText('Your next step')).toHaveCount(0);
});
