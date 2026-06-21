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
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/mybishbash\/download$/);
  await page.getByRole('button', { name: 'I’ve installed it' }).click();
  await expect(page.getByTestId('download-success-page')).toBeVisible();
  await page.getByRole('link', { name: 'Continue in Browser' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home\?signup=1$/);
  await expect(page.getByRole('heading', { name: /Create your .* account/ })).toBeVisible();

  await fillSignup(page);
  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible({ timeout: 10000 });
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
    { width: 58, height: 58, objectFit: 'contain', pathname: `${expectedBasePath}/icons/instagram-cover.jpg` },
    { width: 58, height: 58, objectFit: 'contain', pathname: `${expectedBasePath}/icons/apple-touch-icon.png` },
    { width: 58, height: 58, objectFit: 'contain', pathname: `${expectedBasePath}/icons/youtube-cover.png` },
    { width: 58, height: 58, objectFit: 'contain', pathname: `${expectedBasePath}/icons/whatsapp-cover.jpeg` },
  ]);
}

async function startStrategySetup(page: Page, path = '/mybishbash/onboarding') {
  await seedFirstRun(page);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible();
  await expect(page.getByText('myBishBash uses those moments')).toBeVisible();
  const tutorialDemo = page.getByTestId('onboarding-tutorial-demo');
  await expect(tutorialDemo.getByText('Example Personal Card')).toHaveCount(0);
  await expect(tutorialDemo.getByText('Have you done something that counts towards your fitness today?')).toBeVisible({ timeout: 7000 });
  await expect(tutorialDemo.getByText('Instagram opens')).toBeVisible({ timeout: 7000 });
  await expect(tutorialDemo.getByText('WhatsApp opens')).toBeVisible({ timeout: 13000 });
  await expect(tutorialDemo.getByText('For the things you genuinely mean to do.')).toBeVisible({ timeout: 13000 });
  await expect(page.getByText('For the things you genuinely mean to do, but don’t always remember.')).toHaveCount(0);
  const firstScreenText = await page.locator('.onboarding-step').innerText();
  expect(firstScreenText).not.toMatch(/\bcues?\b/i);
  expect(firstScreenText).not.toMatch(/\bforget(?:ting)?\b/i);
  expect(firstScreenText).not.toMatch(/\bpersonal reminder\b/i);
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 13000 });
  await page.getByRole('button', { name: 'Set up my Personal Cards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Let’s start with a few things you’d like to remember more often.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What would you like to remember?' })).toHaveCount(0);
}

async function completeCoreSetup(page: Page, path = '/mybishbash/onboarding') {
  await startStrategySetup(page, path);

  await expect(page.getByText('Choose up to 5. You can edit them or write your own.')).toBeVisible();
  await expect(page.getByText('0 of 5 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await expect(page.getByTestId('onboarding-personal-card-suggestion')).toHaveCount(11);
  await expect(page.getByText('Do the thing you’ve been putting off.')).toHaveCount(0);
  await expect(page.getByText('What matters most today?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click();
  await page.getByRole('button', { name: 'Have you done something that counts towards your fitness today?' }).click();
  await expect(page.getByText('2 of 5 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

async function completeOnboardingToHome(page: Page, appName = 'Instagram') {
  await completeCoreSetup(page);

  await page.getByRole('radio', { name: appName }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Add an extra ${appName} prompt?` })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/mybishbash/install/${appName.toLowerCase()}/`));
  await page.getByRole('button', { name: 'I’ve added it' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'You’re set up' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
}

test('signup route lands new users in Personal Cards onboarding', async ({ page }) => {
  await startOnboardingFromLandingSignup(page);
  await expect(page.getByText('myBishBash uses those moments')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 13000 });
});

test('Personal Cards onboarding saves selected cards without starter packs or commitments', async ({ page }) => {
  await completeCoreSetup(page);

  await expect(page.getByRole('heading', { name: 'Where should myBishBash appear first?' })).toBeVisible();
  await expect(page.getByText('Choose one app you open often. You can add more later.')).toBeVisible();
  await page.getByRole('button', { name: 'Choose an app later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);

  const state = await page.evaluate(() => ({
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    events: JSON.parse(window.localStorage.getItem('mybishbash.event-log.v1') ?? '[]'),
  }));

  expect(state.setupComplete).toBe('true');
  expect(state.profile.selectedStrategyAreaIds).toEqual([]);
  expect(state.profile.onboardingStarterPackId).toBeNull();
  expect(state.profile.onboardingStarterCommitmentId).toBeNull();
  expect(state.cards.some((card: Record<string, unknown>) => card.promptText === 'Have you taken your vitamins?' && !card.sourcePackId)).toBe(true);
  expect(state.cards.some((card: Record<string, unknown>) => card.promptText === 'Have you done something that counts towards your fitness today?' && !card.sourcePackId)).toBe(true);
  expect(state.cards.some((card: Record<string, unknown>) => card.sourcePackId)).toBe(false);
  expect(state.cards.some((card: Record<string, unknown>) => String(card.cardKind ?? '').startsWith('commitment'))).toBe(false);
  expect(state.events.some((event: Record<string, unknown>) => event.event_type === 'pack_activated')).toBe(false);
});

test('personal card suggestions appear directly without category selection', async ({ page }) => {
  await startStrategySetup(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const suggestions = page.getByTestId('onboarding-personal-card-suggestion');
  await expect(page.getByRole('heading', { name: 'What would you like to remember?' })).toHaveCount(0);
  await expect(page.getByText('Choose up to 3 areas. We’ll suggest Personal Cards next.')).toHaveCount(0);
  await expect(page.getByText('0 of 5 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await expect(suggestions).toHaveCount(11);
  await expect(page.getByRole('button', { name: 'Have you done something that counts towards your fitness today?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Have you got your bag ready for tomorrow?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Have you taken your medication?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Write my own' })).toBeVisible();

  const visibleSuggestions = await suggestions.allTextContents();
  expect(visibleSuggestions).toHaveLength(11);
  const visibility = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="onboarding-personal-card-suggestion"]'));
    const actions = document.querySelector('.onboarding-actions');
    const lastCard = cards.at(-1);
    if (!lastCard || !actions) return null;
    const cardBox = lastCard.getBoundingClientRect();
    const actionBox = actions.getBoundingClientRect();
    return {
      lastCardBottom: Math.round(cardBox.bottom),
      actionTop: Math.round(actionBox.top),
    };
  });
  expect(visibility).not.toBeNull();
  expect(visibility!.lastCardBottom).toBeLessThanOrEqual(visibility!.actionTop);
  for (const weakCopy of [
    'Have you done something productive today?',
    'Have you looked after yourself today?',
    'Have you done enough for your health today?',
    'Have you made progress on your goals today?',
    'Have you been disciplined today?',
    'Have you connected with someone you love?',
    'Have you sent that one message you’ve been meaning to send?',
  ]) {
    expect(visibleSuggestions.join('\n')).not.toContain(weakCopy);
    await expect(page.getByText(weakCopy)).toHaveCount(0);
  }
});

test('faith/reflection onboarding does not create or launch a starter Commitment Card', async ({ page }) => {
  await startStrategySetup(page);
  await page.getByRole('button', { name: 'Have you reflected on something you’re grateful for?' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Where should myBishBash appear first?' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose an app later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);

  const state = await page.evaluate(() => ({
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    overlayType: document.querySelector('[data-testid="card-overlay-personal"], [data-testid="card-overlay-commitment"]')?.getAttribute('data-testid') ?? null,
  }));
  expect(state.cards.some((card: Record<string, unknown>) => String(card.cardKind ?? '').startsWith('commitment'))).toBe(false);
  expect(state.cards.some((card: Record<string, unknown>) => String(card.promptText ?? '').includes('pray before I go to sleep'))).toBe(false);
  expect(state.overlayType).toBeNull();
});

test('personal card selection is required before continuing', async ({ page }) => {
  await startStrategySetup(page);
  await expect(page.getByText('Choose at least one area so we can suggest cards that fit you.')).toHaveCount(0);
  await expect(page.getByTestId('onboarding-personal-card-suggestion')).toHaveCount(11);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click();
  await expect(page.getByText('1 of 5 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('personal card setup caps selected and custom cards at 5 total', async ({ page }) => {
  await startStrategySetup(page);

  for (const name of [
    'Have you taken your vitamins?',
    'Have you drunk enough water?',
    'Have you done something that counts towards your fitness today?',
    'Have you taken your medication?',
  ]) {
    await page.getByRole('button', { name }).click();
  }
  await expect(page.getByText('4 of 5 selected')).toBeVisible();

  await page.getByRole('button', { name: 'Write my own' }).click();
  await page.getByPlaceholder('Write your own reminder…').fill('Have you packed tomorrow’s lunch?');
  await page.locator('.onboarding-custom-card').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('5 of 5 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Have you packed tomorrow’s lunch?' })).toBeVisible();

  await page.getByRole('button', { name: 'Have you stretched today?' }).click();
  await expect(page.getByText('You can choose up to five.')).toBeVisible();
  await expect(page.getByText('5 of 5 selected')).toBeVisible();
});

test('phone trigger selection goes through App Prompt choice, then install instructions, and saves preference', async ({ page }) => {
  await completeCoreSetup(page);

  await page.getByRole('radio', { name: 'Safari' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Add an extra Safari prompt?' })).toBeVisible();
  await expect(page.getByText('App Prompts add one extra question before Safari opens.')).toBeVisible();
  await expect(page.getByText('This is an example of an App Prompt.')).toBeVisible();
  await expect(page.getByText('Your Personal Cards')).toHaveCount(0);
  await expect(page.getByText('Personal Cards before Safari: On')).toHaveCount(0);
  const appPromptToggle = page.getByTestId('onboarding-interruption-toggle');
  await expect(appPromptToggle.getByText('Extra Safari App Prompt')).toBeVisible();
  await expect(page.getByTestId('onboarding-interruption-demo')).toContainText('What are you here to do?');
  await appPromptToggle.getByRole('button', { name: 'On' }).click();
  await expect(appPromptToggle.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
  await appPromptToggle.getByRole('button', { name: 'Off' }).click();
  await expect(appPromptToggle.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  await appPromptToggle.getByRole('button', { name: 'On' }).click();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/safari\//);
  await expect(page.getByRole('heading', { name: 'Add Safari with myBishBash' })).toBeVisible();
  await page.getByRole('button', { name: 'I’ve added it' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'You’re set up' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBe('safari');
  expect(state.profile.hasCompletedProtectedAppSetup).toBe(true);
  expect(state.launcherBehavior.safari.useInterruptionPack).toBe(true);
});

test('pending install_started resumes before the removed install instruction step', async ({ page }) => {
  await seedFirstRun(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('mybishbash.onboarding-protected-app-setup-pending.v1', JSON.stringify({
      appId: 'safari',
      status: 'install_started',
      useInterruptionCard: true,
      updatedAt: new Date().toISOString(),
    }));
  });
  await page.goto('/mybishbash/onboarding');

  await expect(page.getByRole('heading', { name: 'Add an extra Safari prompt?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Where should myBishBash appear first?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Add Safari with myBishBash' })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page).toHaveURL(/\/mybishbash\/install\/safari\//);
  await expect(page.getByRole('heading', { name: 'Add Safari with myBishBash' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Add an extra Safari prompt?' })).toBeVisible();
  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBeUndefined();
  expect(state.launcherBehavior.safari?.useInterruptionPack).toBe(false);
});

test('home spotlight tour supports navigation and persists dismissal after Personal Cards onboarding', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bPWA\b/i);
  expect(text).not.toMatch(/\bshell\b/i);
  expect(text).not.toMatch(/\bfake app\b/i);
  expect(text).not.toMatch(/\bPause Cards\b/i);
  expect(text).not.toMatch(/\binterruption card\b/i);
  expect(text).not.toMatch(/\bPersonal reminders\b/i);
  expect(text).not.toMatch(/\bApp-specific check-ins\b/i);
  expect(text).not.toContain('Add a strategy pack');
  expect(text).not.toContain('Make one commitment');
  expect(text).not.toContain('Before your apps open');
  expect(text).not.toContain('Do the thing you’ve been putting off.');
});

test('onboarding headlines fit mobile without mid-word splitting', async ({ page }) => {
  await seedFirstRun(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mybishbash/onboarding');

  const checks: Array<{ action?: () => Promise<void>; heading: string }> = [
    { heading: 'Start with your Personal Cards' },
    { action: () => page.getByRole('button', { name: 'Set up my Personal Cards' }).click(), heading: 'Let’s start with a few things you’d like to remember more often.' },
    { action: async () => { await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click(); await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Where should myBishBash appear first?' },
    { action: async () => { await page.getByRole('button', { name: 'Continue', exact: true }).click(); }, heading: 'Add an extra Instagram prompt?' },
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
