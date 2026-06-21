import { expect, test, type Page } from '@playwright/test';

const SIGNUP_HANDOFF_REFERENCE_KEY = 'mybishbash.signup-handoff-ref.v1';
const E2E_SIGNUP_HANDOFFS_KEY = 'MYBISHBASH_E2E_SIGNUP_HANDOFFS';

async function seedAuthMock(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_AUTH_MOCK', 'true');
  });
}

async function seedGateCode(page: Page, code = 'WELCOME') {
  await page.addInitScript(({ handoffKey, handoffsKey, accessCode }) => {
    const handoffRef = `seeded-handoff-${accessCode.toLowerCase()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    window.localStorage.setItem(handoffKey, JSON.stringify({
      handoffRef,
      expiresAt,
    }));
    window.localStorage.setItem(handoffsKey, JSON.stringify({
      [handoffRef]: {
        accessCode,
        expiresAt,
        claimed: false,
      },
    }));
  }, { handoffKey: SIGNUP_HANDOFF_REFERENCE_KEY, handoffsKey: E2E_SIGNUP_HANDOFFS_KEY, accessCode: code });
}

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
  await seedAuthMock(page);
  await page.goto('/mybishbash/invite');

  await page.getByLabel('Access code').fill('  welcome  ');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Install myBishBash', exact: true })).toBeVisible();
  const gateAccess = await page.evaluate(() => window.localStorage.getItem('mybishbash.validated-gate-access-code.v1'));
  const handoff = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), SIGNUP_HANDOFF_REFERENCE_KEY);
  expect(gateAccess).toBeNull();
  expect(handoff.handoffRef).toMatch(/^e2e-handoff-/);
  expect(typeof handoff.expiresAt).toBe('string');
  const signupStartUrl = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('data-signup-start-url'));
  expect(signupStartUrl).toContain('/mybishbash/home?signup=1');
  expect(signupStartUrl).toContain('handoff=');
});

test('wrong rollout code shows retry and waitlist actions', async ({ page }) => {
  await seedAuthMock(page);
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
  await seedGateCode(page, 'WELCOME');
  await page.goto('/mybishbash/download');

  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Install myBishBash', exact: true })).toBeVisible();
});

test('download page presents Home Screen install flow before the success step', async ({ page }) => {
  await seedGateCode(page, 'WELCOME');
  await page.goto('/mybishbash/download');

  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Install myBishBash', exact: true })).toBeVisible();
  await expect(page.getByText('Add myBishBash to your Home Screen so it opens like an app.')).toBeVisible();
  await expect(page.getByText('On iPhone, use Safari.')).toBeVisible();
  await expect(page.getByText('On Android, use Chrome.')).toBeVisible();
  await expect(page.getByText('iPhone', { exact: true })).toBeVisible();
  await expect(page.getByText('Use Safari for the smoothest setup.')).toBeVisible();
  await expect(page.getByText('Open this page in Safari.', { exact: true })).toBeVisible();
  await expect(page.getByText('Tap Share.', { exact: true })).toBeVisible();
  await expect(page.getByText('Scroll down and tap Add to Home Screen.', { exact: true })).toBeVisible();
  await expect(page.getByText('Tap Add.', { exact: true })).toBeVisible();
  await expect(page.getByText('Can’t see Share? Tap the three dots (…) in Safari’s bottom toolbar, then tap Share.')).toBeVisible();
  await expect(page.getByText('Can’t see the three dots? Tap the website bar at the bottom of Safari first to show the toolbar.')).toBeVisible();
  await expect(page.getByText('Then open myBishBash from your Home Screen.').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /iPhone install options: tap Share/i })).toBeVisible();
  await expect(page.getByText('(…) → Share')).toBeVisible();
  await expect(page.getByText('Android', { exact: true })).toBeVisible();
  await expect(page.getByText('Use Chrome for the smoothest setup.')).toBeVisible();
  await expect(page.getByText('Open this page in Chrome.', { exact: true })).toBeVisible();
  await expect(page.getByText('Tap the three dots menu.', { exact: true })).toBeVisible();
  await expect(page.getByText('Tap Add to Home screen or Install app.', { exact: true })).toBeVisible();
  await expect(page.getByText('Tap Add or Install.', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Android install options: open Chrome/i })).toBeVisible();
  await expect(page.getByText('Next you’ll create your account.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Why install myBishBash first?' })).toBeVisible();
  await expect(page.getByText('It puts myBishBash on your phone like an app.')).toBeVisible();
  await expect(page.getByText('You can come back to Apps when you are ready to add more.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('PWA');
  await expect(page.locator('main')).not.toContainText('download');
  await expect(page.locator('main')).not.toContainText('Personal Cards before apps');
  await expect(page.locator('main')).not.toContainText('Reminders before apps');
  await expect(page.locator('main')).not.toContainText('working differently');
  await expect(page.locator('main')).not.toContainText('Shell');
  await expect(page.locator('main')).not.toContainText('Launcher');
  await expect(page.locator('main')).not.toContainText('Intercept');
  await expect(page.locator('main')).not.toContainText('Fake App');

  await page.getByRole('button', { name: 'I’ve installed it' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  await expect(page.getByTestId('download-success-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();
  await expect(page.getByText('Open myBishBash from your Home Screen and create your account.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create account here' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Can’t install it right now?' })).toBeVisible();
  await expect(page.getByText('Create your account here and use myBishBash in your browser for now.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue in Browser' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Next you’ll create your account');

  const installedProfile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(installedProfile.hasCompletedHomeScreenInstall).toBe(true);
  expect(installedProfile.hasSkippedHomeScreenInstallPrompt).toBe(false);
  expect(installedProfile.plan).toBe('free');

  await page.getByRole('link', { name: 'Continue in Browser' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);
});

test('download success fallback stores incomplete install state and continues to browser signup', async ({ page }) => {
  await seedGateCode(page, 'WELCOME');
  await page.goto('/mybishbash/download');

  await page.getByRole('button', { name: 'I’ve installed it' }).click();
  await expect(page.getByTestId('download-success-page')).toBeVisible();
  await page.getByRole('link', { name: 'Continue in Browser' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your myBishBash account' })).toBeVisible();
  await expect(page.getByLabel('Access code')).toHaveCount(0);

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
  await expect(page.getByText('Add myBishBash to your Home Screen')).toBeVisible();
  await expect(page.getByText('Create your first Personal Card')).toBeVisible();
  await expect(page.getByText('Choose your first app')).toBeVisible();
});

test('Home hides first app task when an app is already configured', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Existing App Tester',
      timezone: 'Europe/London',
      plan: 'free',
      hasCompletedHomeScreenInstall: true,
      hasCompletedPersonalCardSetup: false,
      hasCompletedProtectedAppSetup: false,
      hasCompletedHomeSpotlightTour: true,
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
      instagram: { appEnabled: true, useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      whatsapp: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      chrome: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    }));
  });

  await page.goto('/mybishbash/home');

  await expect(page.getByTestId('home-activation-checklist')).toBeVisible();
  await expect(page.getByText('Create your first Personal Card')).toBeVisible();
  await expect(page.getByText('Choose your first app')).toHaveCount(0);
});

test('Home first app task disappears immediately after enabling an app', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Enable App Tester',
      timezone: 'Europe/London',
      plan: 'free',
      hasCompletedHomeScreenInstall: true,
      hasCompletedPersonalCardSetup: false,
      hasCompletedProtectedAppSetup: false,
      hasCompletedHomeSpotlightTour: true,
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

  await expect(page.getByText('Choose your first app')).toBeVisible();
  await page.getByRole('button', { name: 'Choose your first app' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await page.getByTestId('protected-app-instagram').getByRole('button', { name: 'Settings' }).click();
  await page.getByTestId('apps-enable-instagram').click();
  await page.getByTestId('bottom-nav-home').click();
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByText('Choose your first app')).toHaveCount(0);
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
