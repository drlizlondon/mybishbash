import { expect, test, type Page } from '@playwright/test';

test.setTimeout(45000);

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

async function seedReturningUser(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('MYBISHBASH_E2E_ONBOARDING_SEEDED') === 'returning') return;
    window.localStorage.setItem('MYBISHBASH_E2E_ONBOARDING_SEEDED', 'returning');
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Returning User',
      timezone: 'Europe/London',
      onboardingCompletedAt: '2026-06-14T10:00:00.000Z',
      onboardingCompletedSection: 'personal_cards',
    }));
    window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify([
      {
        id: 'returning-card',
        cardKind: 'personal',
        promptText: 'Have you stretched today?',
        theme: 'Soft Bloom',
        icon: 'heart',
        statusToday: 'fresh',
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
  });
}

async function completePersonalCardOnboarding(page: Page) {
  await page.getByRole('button', { name: 'Make your own' }).click();
  await expect(page.getByRole('heading', { name: 'Things I genuinely mean to do, but don’t always remember.' })).toBeVisible();
  await page.getByRole('button', { name: /Take five minutes outside./ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Choose your first app' })).toBeVisible();
  await expect(page.getByText('Your Personal Cards can appear before the apps you already open.')).toBeVisible();
  await page.getByRole('radio', { name: 'Instagram' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Connect Instagram' })).toBeVisible();
  await expect(page.getByText('Show your Personal Cards before Instagram opens.')).toBeVisible();
  await page.getByRole('button', { name: 'Connect Instagram' }).click();
  await expect(page.getByText('Tap Add to Home Screen.')).toBeVisible();
  await page.getByRole('button', { name: 'I’ve added it' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
}

test('first-time user sees Personal Card onboarding before Home', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/home');

  await expect(page.getByRole('heading', { name: 'Before your apps open...' })).toBeVisible();
  await expect(page.getByTestId('home-panel')).toHaveCount(0);
  await expect(page.getByText('MyBishBash helps you use your phone differently')).toBeVisible();
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Have you taken your vitamins today?');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Have you put your sunscreen on today?');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Have you watered your plants?');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Not done');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('I’ll do it now');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Done');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Continue to Instagram');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Continue to WhatsApp');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Continue to Safari');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Instagram opens');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('WhatsApp opens');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Safari opens');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('For the things you genuinely mean to do.');
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 28000 });
  await expect(page.getByLabel('Local content editor')).toHaveCount(0);
});

test('user can defer card setup after an understanding step and reach Home without creating cards', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Set this up later' }).click();
  await expect(page.getByRole('heading', { name: 'You can set up your first card later.' })).toBeVisible();
  await expect(page.getByText('Personal Cards live in MyBishBash.')).toBeVisible();
  await expect(page.getByLabel('Personal Card example')).toContainText('What matters most today?');
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByTestId('home-spotlight-tour')).toBeVisible();

  const state = await page.evaluate(() => ({
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
  }));
  expect(state.setupComplete).toBe('true');
  expect(state.cards).toEqual([]);
  expect(state.profile.onboardingSkipped).toBe(true);
  expect(state.profile.onboardingCompletedSection).toBe('personal_cards');
});

test('Personal Card selection renders the clean card list in order without Live Preview', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Make your own' }).click();

  await expect(page.getByRole('heading', { name: 'Things I genuinely mean to do, but don’t always remember.' })).toBeVisible();
  await expect(page.getByText('Choose up to five. These will become your first Personal Cards.')).toBeVisible();
  await expect(page.getByText('0 of 5 selected')).toBeVisible();
  await expect(page.getByText('Live Preview')).toHaveCount(0);
  await expect(page.getByTestId('personal-card-onboarding-preview')).toHaveCount(0);
  await expect(page.getByText('Choose the moment.')).toHaveCount(0);
  await expect(page.getByText('Choose where it belongs.')).toHaveCount(0);

  const expectedCards = [
    'Have you taken your vitamins today?',
    'Have you drunk enough water today?',
    'Put your sunscreen on.',
    'Text Mum back.',
    'Take five minutes outside.',
    'Have you done the thing you’ve been avoiding?',
    'Stand up and stretch.',
    'Have you eaten properly today?',
    'Write my own',
  ];
  await expect(page.locator('.onboarding-idea-card strong')).toHaveText(expectedCards);
});

test('Personal Card selection updates count, deselects, and enforces five-card limit', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Make your own' }).click();

  await page.getByRole('button', { name: 'Have you taken your vitamins today?' }).click();
  await expect(page.getByText('1 of 5 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Have you taken your vitamins today?' }).click();
  await expect(page.getByText('0 of 5 selected')).toBeVisible();

  for (const name of [
    'Have you taken your vitamins today?',
    'Have you drunk enough water today?',
    'Put your sunscreen on.',
    'Text Mum back.',
    'Take five minutes outside.',
  ]) {
    await page.getByRole('button', { name }).click();
  }
  await expect(page.getByText('5 of 5 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Have you done the thing you’ve been avoiding?' }).click();
  await expect(page.getByText('You can choose up to five.')).toBeVisible();
  await expect(page.getByText('5 of 5 selected')).toBeVisible();
});

test('Write my own opens input, validates, adds selected custom card, and persists it', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Make your own' }).click();

  await page.getByRole('button', { name: 'Write my own' }).click();
  const customInput = page.getByPlaceholder('Write your own reminder…');
  await expect(customInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
  await customInput.fill('Water the basil.');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: /Water the basil./ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 of 5 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Write my own' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'I’ll do this later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);

  const cards = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'));
  expect(cards).toHaveLength(1);
  expect(cards[0].promptText).toBe('Water the basil.');
});

test('Write my own shows limit message when five cards are already selected', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Make your own' }).click();

  for (const name of [
    'Have you taken your vitamins today?',
    'Have you drunk enough water today?',
    'Put your sunscreen on.',
    'Text Mum back.',
    'Take five minutes outside.',
  ]) {
    await page.getByRole('button', { name }).click();
  }
  await page.getByRole('button', { name: 'Write my own' }).click();
  await page.getByPlaceholder('Write your own reminder…').fill('Book the dentist.');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Deselect one card first.')).toBeVisible();
  await expect(page.getByText('5 of 5 selected')).toBeVisible();
});

test('Continue with zero selected Personal Cards completes without creating cards', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Make your own' }).click();
  await expect(page.getByText('0 of 5 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'I’ll do this later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);

  const state = await page.evaluate(() => ({
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
  }));
  expect(state.setupComplete).toBe('true');
  expect(state.cards).toEqual([]);
});

test('user can complete Personal Card onboarding and reach Home', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await completePersonalCardOnboarding(page);

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your first Personal Card is ready.' })).toHaveCount(0);
  await expect(page.getByText('Throughout the day')).toHaveCount(0);
  await expect(page.getByText('MyBishBash Home')).toHaveCount(0);

  const state = await page.evaluate(() => ({
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    cardPacks: JSON.parse(window.localStorage.getItem('mybishbash.card-packs.v1') ?? '[]'),
    actionCards: JSON.parse(window.localStorage.getItem('mybishbash.action-cards.v1') ?? '[]'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
  }));

  expect(state.setupComplete).toBe('true');
  expect(state.cards).toHaveLength(1);
  expect(state.cards[0].promptText).toBe('Take five minutes outside.');
  expect(state.cards[0].timingWindows).toEqual(['day']);
  expect(state.cardPacks).toEqual([]);
  expect(state.actionCards.filter((card: Record<string, unknown>) => card.source === 'user')).toEqual([]);
  expect(state.profile.onboardingSkipped).toBe(false);
  expect(state.profile.onboardingRoute).toBe('personal_card_play_by_play');
  expect(state.profile.onboardingCompletedSection).toBe('personal_cards');
  expect(state.profile.onboardingLauncherId).toBe('mybishbash_home');
  expect(state.profile.onboardingLauncherId).not.toBe('safari');
  expect(state.profile.hasCompletedPersonalCardSetup).toBe(true);
  expect(state.profile.selectedProtectedApp).toBe('instagram');
  expect(state.profile.hasCompletedProtectedAppSetup).toBe(true);
  expect(state.profile.hasCompletedHomeSpotlightTour).toBe(false);
  expect(state.profile.onboardingAppContext).toMatchObject({
    id: 'mybishbash_home',
    label: 'MyBishBash Home',
    launcherId: null,
    place: 'home',
    timingWindows: ['day'],
  });
});

test('returning user does not see onboarding again', async ({ page }) => {
  await seedReturningUser(page);
  await page.goto('/mybishbash/home');

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before your apps open...' })).toHaveCount(0);
});

test('Personal Card onboarding copy renders without emoji or old future-you copy', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Make your own' }).click();
  await page.getByRole('button', { name: 'Text Mum back.' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  const onboardingText = await page.locator('.onboarding-flow-card').innerText();
  expect(onboardingText).not.toMatch(/[✅⭐🎉🚀✨❤️]/);
  expect(onboardingText).not.toContain('Choose what future you should say.');
  expect(onboardingText).not.toContain('interrupt autopilot');
  expect(onboardingText).not.toContain('Live Preview');
  expect(onboardingText).not.toContain('Choose the moment.');
  expect(onboardingText).not.toContain('Choose where it belongs.');
  await expect(page.getByRole('heading', { name: 'Choose your first app' })).toBeVisible();
});

test('first app screen shows three apps in order with consistent icon sizing and single selection', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Make your own' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  const appNames = await page.locator('.onboarding-protected-app-card strong').allTextContents();
  expect(appNames).toEqual(['Instagram', 'Safari', 'WhatsApp']);

  const iconBoxes = await page.locator('.onboarding-protected-app-card img, .onboarding-protected-app-card .onboarding-app-icon-fallback').evaluateAll((icons) =>
    icons.map((icon) => {
      const rect = icon.getBoundingClientRect();
      const style = window.getComputedStyle(icon);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        objectFit: style.objectFit,
      };
    }),
  );
  expect(iconBoxes).toEqual([
    { width: 96, height: 96, objectFit: 'contain' },
    { width: 96, height: 96, objectFit: 'contain' },
    { width: 96, height: 96, objectFit: 'contain' },
  ]);

  await page.getByRole('radio', { name: 'WhatsApp' }).click();
  await expect(page.getByRole('radio', { name: 'Instagram' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'Safari' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'WhatsApp' })).toHaveAttribute('aria-checked', 'true');
});

test('app setup can be skipped directly to Home and uses Connect language', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Make your own' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Safari' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Connect Safari' })).toBeVisible();
  await expect(page.getByText('Show your Personal Cards before Safari opens.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Safari' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Add .* shortcut/ })).toHaveCount(0);
  await expect(page.getByText('Tap Add to Home Screen.')).toHaveCount(0);

  await page.getByRole('button', { name: 'I’ll do this later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();

  const profile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(profile.selectedProtectedApp).toBe('safari');
  expect(profile.hasCompletedProtectedAppSetup).toBe(false);
});

test('Home spotlight tour can be skipped and does not reappear', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await completePersonalCardOnboarding(page);
  const tour = page.getByTestId('home-spotlight-tour');
  await expect(tour).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This is your day' })).toBeVisible();
  await tour.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);

  const profile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(profile.hasCompletedHomeSpotlightTour).toBe(true);

  await page.reload();
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);
});

test('Home spotlight tour can be completed and does not reappear', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await completePersonalCardOnboarding(page);
  const tour = page.getByTestId('home-spotlight-tour');
  await expect(tour).toBeVisible();

  for (const title of [
    'This is your day',
    'Create a Personal Card',
    'Connect more apps',
    'Try a Pack',
    'You’re ready',
  ]) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await tour.getByRole('button', { name: title === 'You’re ready' ? 'Done' : 'Next' }).click();
  }

  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);
});

test('onboarding headlines fit mobile without mid-word splitting', async ({ page }) => {
  await seedFirstRun(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mybishbash/onboarding');

  const checks: Array<{ action?: () => Promise<void>; heading: string }> = [
    { heading: 'Before your apps open...' },
    { action: () => page.getByRole('button', { name: 'Make your own' }).click(), heading: 'Things I genuinely mean to do, but don’t always remember.' },
    { action: async () => { await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Choose your first app' },
    { action: async () => { await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Connect Instagram' },
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
