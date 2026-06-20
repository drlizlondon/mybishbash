import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60000);

async function seedFirstRun(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('MYBISHBASH_E2E_ONBOARDING_SEEDED') === 'first-run') return;
    window.localStorage.setItem('MYBISHBASH_E2E_ONBOARDING_SEEDED', 'first-run');
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'false');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'New User', timezone: 'Europe/London' }));
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
      youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      whatsapp: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      chrome: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    }));
  });
}

async function seedSignupPreview(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_AUTH_MOCK', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
  });
}

async function fillSignup(page: Page) {
  await page.getByLabel('Email').fill(`strategy-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('password123');
  await page.getByLabel(/I agree to the Terms/i).check();
  await page.getByRole('button', { name: 'Create Account' }).click();
}

async function startOnboardingFromLandingSignup(page: Page) {
  await seedSignupPreview(page);
  await page.goto('/mybishbash/');

  await page.locator('.hero-actions .button.primary').click();
  await expect(page).toHaveURL(/\/mybishbash\/invite$/);
  await page.getByLabel('Access code').fill('WELCOME');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  await page.getByRole('button', { name: 'I’ve added MyBishBash' }).click();
  await expect(page.getByTestId('download-success-page')).toBeVisible();
  await page.getByRole('link', { name: 'Create account without installing' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: 'Create your MyBishBash account' })).toBeVisible();

  await fillSignup(page);
  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
  });
}

async function expectLogoBackedFirstApps(page: Page, expectedBasePath: string) {
  const appNames = await page.locator('.onboarding-protected-app-card strong').allTextContents();
  expect(appNames).toEqual(['Instagram', 'Safari', 'YouTube', 'WhatsApp']);
  await expect(page.locator('.onboarding-protected-app-card .onboarding-app-icon-fallback')).toHaveCount(0);

  const iconBoxes = await page.locator('.onboarding-protected-app-card img').evaluateAll((icons) =>
    icons.map((icon) => {
      const rect = icon.getBoundingClientRect();
      const style = window.getComputedStyle(icon);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        objectFit: style.objectFit,
        pathname: new URL((icon as HTMLImageElement).src).pathname,
      };
    }),
  );
  expect(iconBoxes).toEqual([
    { width: 96, height: 96, objectFit: 'contain', pathname: `${expectedBasePath}/icons/instagram-cover.jpg` },
    { width: 96, height: 96, objectFit: 'contain', pathname: `${expectedBasePath}/icons/apple-touch-icon.png` },
    { width: 96, height: 96, objectFit: 'contain', pathname: `${expectedBasePath}/icons/youtube-cover.png` },
    { width: 96, height: 96, objectFit: 'contain', pathname: `${expectedBasePath}/icons/whatsapp-cover.jpeg` },
  ]);
}

async function startStrategySetup(page: Page, path = '/mybishbash/onboarding') {
  await seedFirstRun(page);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Build your phone strategy' })).toBeVisible();
  await expect(page.getByText('MyBishBash helps you use your phone as a cue system')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start setting it up' })).toBeEnabled({ timeout: 7000 });
  await page.getByRole('button', { name: 'Start setting it up' }).click();
}

async function completeCoreSetup(page: Page, path = '/mybishbash/onboarding') {
  await startStrategySetup(page, path);

  await expect(page.getByRole('heading', { name: 'What do you want to reinforce?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  for (const area of ['Health Basics', 'Sleep', 'Phone Use', 'Punctuality']) {
    await page.getByRole('button', { name: area }).click();
  }
  await expect(page.getByText('3 of 3 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Punctuality' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Choose your first reminders' })).toBeVisible();
  await expect(page.getByText('Good cards are specific.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await expect(page.getByText('Do the thing you’ve been putting off.')).toHaveCount(0);
  await expect(page.getByText('What matters most today?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Have you drunk a glass of water today?' }).click();
  await page.getByRole('button', { name: 'Have you put your phone away for bedtime?' }).click();
  await expect(page.getByText('2 of 5 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Add a strategy pack' })).toBeVisible();
  await page.getByRole('radio', { name: 'Healthier Daily Basics' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Make one commitment' })).toBeVisible();
  await expect(page.getByText('Reminders keep things in mind.')).toBeVisible();
  await page.getByRole('radio', { name: 'I will drink water before my next coffee.' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function completeOnboardingToHome(page: Page, appName = 'Instagram') {
  await completeCoreSetup(page);

  await page.getByRole('radio', { name: appName }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: `What should appear before ${appName}?` })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to install' }).click();
  await expect(page).toHaveURL(new RegExp(`/mybishbash/install/${appName.toLowerCase()}/`));
  await page.getByRole('button', { name: 'I’ve added it' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'You’re in.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Home' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
}

test('signup route lands new users in strategy onboarding', async ({ page }) => {
  await startOnboardingFromLandingSignup(page);
  await expect(page.getByText('MyBishBash helps you use your phone as a cue system')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start setting it up' })).toBeEnabled({ timeout: 7000 });
});

test('strategy onboarding saves selected areas, personal cards, starter pack and starter commitment', async ({ page }) => {
  await completeCoreSetup(page);

  await expect(page.getByRole('heading', { name: 'Choose your first phone trigger' })).toBeVisible();
  await expect(page.getByText('Pick an app you open often.')).toBeVisible();
  await page.getByRole('button', { name: 'Choose an app later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);

  const state = await page.evaluate(() => ({
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    events: JSON.parse(window.localStorage.getItem('mybishbash.event-log.v1') ?? '[]'),
  }));

  expect(state.setupComplete).toBe('true');
  expect(state.profile.selectedStrategyAreaIds).toEqual(['health-basics', 'sleep', 'phone-use']);
  expect(state.profile.onboardingStarterPackId).toBe('healthier-daily-basics');
  expect(state.profile.onboardingStarterCommitmentId).toBe('water-before-coffee');
  expect(state.cards.some((card: Record<string, unknown>) => card.promptText === 'Have you drunk a glass of water today?' && !card.sourcePackId)).toBe(true);
  expect(state.cards.some((card: Record<string, unknown>) => card.sourcePackId === 'healthier-daily-basics')).toBe(true);
  expect(state.cards.some((card: Record<string, unknown>) => card.cardKind === 'commitment' && card.promptText === 'drink water before my next coffee')).toBe(true);
  expect(state.events.some((event: Record<string, unknown>) => event.event_type === 'pack_activated' && event.pack_id === 'healthier-daily-basics')).toBe(true);
});

test('phone trigger selection goes through app check-ins before install and saves preference', async ({ page }) => {
  await completeCoreSetup(page);

  await page.getByRole('radio', { name: 'Safari' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'What should appear before Safari?' })).toBeVisible();
  await expect(page.getByText('App Prompts are optional. They add an extra pause before Safari opens.')).toBeVisible();
  await expect(page.getByText('Personal reminders: On')).toBeVisible();
  await expect(page.getByTestId('onboarding-interruption-toggle').getByText('App-specific check-ins')).toBeVisible();
  await expect(page.getByTestId('onboarding-interruption-demo')).toContainText('What are you here to do?');
  await page.getByTestId('onboarding-interruption-toggle').getByRole('button', { name: 'On' }).click();
  await page.getByRole('button', { name: 'Continue to install' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/install\/safari\//);
  await expect(page.getByRole('heading', { name: 'Add Safari with MyBishBash' })).toBeVisible();
  await expect(page.getByText('Use it instead of the original Safari icon')).toBeVisible();
  await page.getByRole('button', { name: 'I’ve added it' }).click();
  await expect(page.getByText('You’re in.')).toBeVisible();
  await expect(page.getByText('Open your new Safari icon from your Home Screen')).toBeVisible();
  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'You’re in.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Home' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBe('safari');
  expect(state.profile.hasCompletedProtectedAppSetup).toBe(true);
  expect(state.launcherBehavior.safari.useInterruptionPack).toBe(true);
});

test('first app screen keeps logo-backed apps in order with consistent icon paths', async ({ page }) => {
  await completeCoreSetup(page);
  await expectLogoBackedFirstApps(page, '/mybishbash');

  await page.getByRole('radio', { name: 'WhatsApp' }).click();
  await expect(page.getByRole('radio', { name: 'Instagram' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'Safari' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'WhatsApp' })).toHaveAttribute('aria-checked', 'true');
});

test('app install path supports back navigation before saving setup', async ({ page }) => {
  await completeCoreSetup(page);

  await page.getByRole('radio', { name: 'Safari' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue to install' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/install\/safari\//);
  await expect(page.getByRole('heading', { name: 'Add Safari with MyBishBash' })).toBeVisible();
  await expect(page.getByText('Use it instead of the original Safari icon')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Choose your first phone trigger' })).toBeVisible();
  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBeUndefined();
  expect(state.launcherBehavior.safari?.useInterruptionPack).toBe(false);
});

test('home spotlight tour supports navigation and persists dismissal after strategy onboarding', async ({ page }) => {
  await completeOnboardingToHome(page, 'Instagram');
  await page.goto('/mybishbash/library');

  const tour = page.getByTestId('home-spotlight-tour');
  await expect(tour).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(tour.getByRole('link', { name: 'Skip' })).toBeVisible();
  await expect(tour.getByRole('button', { name: 'Previous spotlight step' })).toBeDisabled();
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/explore$/);
  await expect(tour.getByRole('heading', { name: 'Explore' })).toBeVisible();
  await tour.getByRole('button', { name: 'Previous spotlight step' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/explore$/);
  await expect(tour.getByRole('heading', { name: 'Explore' })).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(tour.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(tour.getByRole('heading', { name: 'You’re ready' })).toBeVisible();
  await tour.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);

  const profile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(profile.onboardingRoute).toBe('personal_card_play_by_play');
  expect(profile.hasCompletedHomeSpotlightTour).toBe(true);

  await page.reload();
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);
});

test('onboarding visible copy avoids old blocker and technical language', async ({ page }) => {
  await startStrategySetup(page);
  await page.getByRole('button', { name: 'Health Basics' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Have you drunk a glass of water today?' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip pack' }).click();
  await page.getByRole('button', { name: 'Skip commitment' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bPWA\b/i);
  expect(text).not.toMatch(/\bshell\b/i);
  expect(text).not.toMatch(/\bfake app\b/i);
  expect(text).not.toMatch(/\bPause Cards\b/i);
  expect(text).not.toMatch(/\binterruption card\b/i);
  expect(text).not.toContain('Before your apps open');
  expect(text).not.toContain('Do the thing you’ve been putting off.');
});

test('onboarding headlines fit mobile without mid-word splitting', async ({ page }) => {
  await seedFirstRun(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mybishbash/onboarding');

  const checks: Array<{ action?: () => Promise<void>; heading: string }> = [
    { heading: 'Build your phone strategy' },
    { action: () => page.getByRole('button', { name: 'Start setting it up' }).click(), heading: 'What do you want to reinforce?' },
    { action: async () => { await page.getByRole('button', { name: 'Health Basics' }).click(); await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Choose your first reminders' },
    { action: async () => { await page.getByRole('button', { name: 'Have you drunk a glass of water today?' }).click(); await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Add a strategy pack' },
    { action: async () => { await page.getByRole('button', { name: 'Skip pack' }).click(); }, heading: 'Make one commitment' },
    { action: async () => { await page.getByRole('button', { name: 'Skip commitment' }).click(); }, heading: 'Choose your first phone trigger' },
    { action: async () => { await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'What should appear before Instagram?' },
    { action: async () => { await page.getByRole('button', { name: 'Continue to install' }).click(); }, heading: 'Add Instagram with MyBishBash' },
  ];

  for (const check of checks) {
    if (check.action) await check.action();
    await expect(page.getByRole('heading', { name: check.heading })).toBeVisible();
    const box = await page.getByRole('heading', { name: check.heading }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(844 * 0.25);
    const styles = await page.getByRole('heading', { name: check.heading }).evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        wordBreak: style.wordBreak,
        hyphens: style.hyphens,
      };
    });
    expect(styles.wordBreak).not.toBe('break-all');
    expect(styles.hyphens).toBe('none');
  }
});
