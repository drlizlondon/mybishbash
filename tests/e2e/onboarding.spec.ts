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

async function expectTextOrder(locator: ReturnType<Page['locator']>, firstText: string, secondText: string) {
  const text = await locator.innerText();
  const firstIndex = text.indexOf(firstText);
  const secondIndex = text.indexOf(secondText);
  expect(firstIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeGreaterThanOrEqual(0);
  expect(firstIndex).toBeLessThan(secondIndex);
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

async function expectInterruptionDemoForApp(page: Page, appName: string, title: string, body: string) {
  await expect(page.getByText(`Would you like a Pause Card before ${appName} opens?`)).toBeVisible();
  const demo = page.getByTestId('onboarding-interruption-demo');
  await expect(demo).toContainText(title);
  await expect(demo).toContainText(body);
  await expect(demo.getByRole('button', { name: `Continue to ${appName}` })).toBeVisible();
  await expect(demo.getByRole('button', { name: 'Not now' })).toBeVisible();
  await expect(demo).toContainText('This is an example of a Pause Card.');
  await expect(demo).toContainText('Pause Cards');
  await expect(demo).not.toContainText(/interruption card/i);
  await expect(page.getByTestId('onboarding-interruption-toggle').getByRole('button', { name: 'On', exact: true })).toBeVisible();
  await expect(page.getByTestId('onboarding-interruption-toggle').getByRole('button', { name: 'Off', exact: true })).toBeVisible();
  await expect(demo).toContainText('You can change this later.');
  await expect(page.getByRole('button', { name: `Install ${appName} Launcher` })).toBeVisible();
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
  await page.getByRole('button', { name: 'Create your first card' }).click();
  await expect(page.getByRole('heading', { name: 'Things I genuinely mean to do, but don’t always remember.' })).toBeVisible();
  await page.getByRole('button', { name: /Take five minutes outside./ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Make plans. Not just reminders.' })).toBeVisible();
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByTestId('commitment-card-demo')).toContainText('TODAY’S COMMITMENT');
  await expect(page.getByTestId('commitment-card-demo')).toContainText('I will');
  await expect(page.getByTestId('commitment-card-demo')).toContainText('go to the gym today.');
  await page.getByRole('button', { name: 'I will commit to this' }).click();
  await expect(page.getByTestId('commitment-time-passage')).toContainText('Later...');
  await expect(page.getByTestId('commitment-time-passage')).toContainText('At the end, MyBishBash helps you reflect.');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('commitment-review-demo')).toContainText('How did it go?', { timeout: 4000 });
  await page.getByRole('button', { name: 'I nearly did it' }).click();
  await expect(page.getByRole('heading', { name: 'Commitment Cards help you follow through on the things that matter to you.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Install Your First MyBishBash App' })).toBeVisible();
  await expect(page.getByText('Choose an app you use regularly.')).toBeVisible();
  await page.getByRole('radio', { name: 'Instagram' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expectInterruptionDemoForApp(page, 'Instagram', 'Why Instagram?', 'Watch your own life, not someone else’s.');
  await page.getByTestId('onboarding-interruption-toggle').getByRole('button', { name: 'On', exact: true }).click();
  await page.getByRole('button', { name: 'Install Instagram Launcher' }).click();
  await expect(page.getByRole('heading', { name: 'Install Instagram Launcher' })).toBeVisible();
  await expect(page.getByText('See your Personal Cards before opening Instagram.')).toBeVisible();
  await page.getByRole('button', { name: 'Add Instagram Launcher' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/instagram\//);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'I’ve saved it' })).toBeVisible();
  await page.getByRole('button', { name: 'I’ve saved it' }).click();
  await expect(page.getByRole('heading', { name: 'Instagram Launcher Ready' })).toBeVisible();
  await expect(page.getByTestId('onboarding-protected-app-confirmation')).toContainText('Instagram is now ready to use with MyBishBash.');
  await page.getByRole('button', { name: 'Continue to Home' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
}

test('first-time user sees Personal Card onboarding before Home', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/home');

  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toBeVisible();
  await expect(page.getByTestId('home-panel')).toHaveCount(0);
  await expect(page.getByText('MyBishBash shows a personal reminder before selected apps')).toBeVisible();
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Have you taken your vitamins today?');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Have you put your sunscreen on today?');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Safari');
  await expect(page.getByTestId('onboarding-tutorial-demo')).not.toContainText('Safari opens');
  const actionLabels = await page.locator('.onboarding-demo-real-card-instagram .onboarding-real-card-actions button').allTextContents();
  expect(actionLabels).toEqual(['Done', 'I’ll do it now', 'Not done']);
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Not done');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('I’ll do it now');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Done');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Continue to Instagram');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Continue to WhatsApp');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('Instagram opens');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('WhatsApp opens');
  await expect(page.getByTestId('onboarding-tutorial-demo')).toContainText('For the things you genuinely mean to do.');
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 28000 });
  await expect(page.getByLabel('Local content editor')).toHaveCount(0);
});

test('skipping Personal Cards continues to Commitment Cards without creating cards', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Skip Personal Cards for now' }).click();
  await expect(page.getByRole('heading', { name: 'Make plans. Not just reminders.' })).toBeVisible();
  await expect(page.getByTestId('home-panel')).toHaveCount(0);

  const state = await page.evaluate(() => ({
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
  }));
  expect(state.setupComplete).not.toBe('true');
  expect(state.cards).toEqual([]);
  expect(state.profile.hasCompletedPersonalCardSetup).toBe(false);
});

test('Personal Card selection renders the clean card list in order without Live Preview', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();

  await expect(page.getByRole('heading', { name: 'Things I genuinely mean to do, but don’t always remember.' })).toBeVisible();
  await expect(page.getByText('Choose up to five. These will become your first Personal Cards.')).toBeVisible();
  await expect(page.getByText('0 of 5 selected')).toBeVisible();
  const counterBox = await page.locator('.onboarding-selection-count').boundingBox();
  const firstCardBox = await page.getByRole('button', { name: 'Have you taken your vitamins today?' }).boundingBox();
  expect(counterBox).not.toBeNull();
  expect(firstCardBox).not.toBeNull();
  expect((counterBox?.y ?? 0) + (counterBox?.height ?? 0)).toBeLessThanOrEqual((firstCardBox?.y ?? 0) + 1);
  await expect(page.getByText('Live Preview')).toHaveCount(0);
  await expect(page.getByTestId('personal-card-onboarding-preview')).toHaveCount(0);
  await expect(page.getByText('Choose the moment.')).toHaveCount(0);
  await expect(page.getByText('Choose where it belongs.')).toHaveCount(0);

  const expectedCards = [
    'Have you taken your vitamins today?',
    'Drink some water.',
    'Put your sunscreen on.',
    'Text Mum back.',
    'Take five minutes outside.',
    'Do the thing you’ve been putting off.',
    'Stand up and stretch for two minutes.',
    'Go to bed on time.',
    'Write my own',
  ];
  await expect(page.locator('.onboarding-idea-card strong')).toHaveText(expectedCards);
});

test('Personal Card selection updates count, deselects, and enforces five-card limit', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Create your first card' }).click();

  await page.getByRole('button', { name: 'Have you taken your vitamins today?' }).click();
  await expect(page.getByText('1 of 5 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Have you taken your vitamins today?' }).click();
  await expect(page.getByText('0 of 5 selected')).toBeVisible();

  for (const name of [
    'Have you taken your vitamins today?',
    'Drink some water.',
    'Put your sunscreen on.',
    'Text Mum back.',
    'Take five minutes outside.',
  ]) {
    await page.getByRole('button', { name }).click();
  }
  await expect(page.getByText('5 of 5 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Do the thing you’ve been putting off.' }).click();
  await expect(page.getByText('You can choose up to five.')).toBeVisible();
  await expect(page.getByText('5 of 5 selected')).toBeVisible();
});

test('Personal Card selection counter stays visible while the list scrolls', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Create your first card' }).click();

  await page.getByRole('button', { name: 'Have you taken your vitamins today?' }).click();
  const counter = page.locator('.onboarding-selection-count');
  await expect(counter).toContainText('1 of 5 selected');
  await page.locator('.onboarding-idea-grid').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(counter).toBeVisible();
  await expect(counter).toContainText('1 of 5 selected');
  await expect(page.getByRole('button', { name: 'Write my own' })).toBeVisible();
  const ctaBox = await page.getByRole('button', { name: 'Continue' }).boundingBox();
  const writeOwnBox = await page.getByRole('button', { name: 'Write my own' }).boundingBox();
  expect(ctaBox).not.toBeNull();
  expect(writeOwnBox).not.toBeNull();
  expect((writeOwnBox?.y ?? 0) + (writeOwnBox?.height ?? 0)).toBeLessThanOrEqual((ctaBox?.y ?? 0) + 1);
});

test('Write my own opens input, validates, adds selected custom card, and persists it', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Create your first card' }).click();

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
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();
  await page.getByRole('button', { name: 'Choose an app later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);

  const cards = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'));
  expect(cards).toHaveLength(1);
  expect(cards[0].promptText).toBe('Water the basil.');
});

test('Write my own shows limit message when five cards are already selected', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.getByRole('button', { name: 'Create your first card' }).click();

  for (const name of [
    'Have you taken your vitamins today?',
    'Drink some water.',
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

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await expect(page.getByText('0 of 5 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();
  await page.getByRole('button', { name: 'Choose an app later' }).click();
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
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
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
  expect(state.profile.hasSeenCommitmentCardDemo).toBe(true);
  expect(state.profile.hasSkippedCommitmentCardDemo).toBe(false);
  expect(state.profile.selectedProtectedApp).toBe('instagram');
  expect(state.profile.hasCompletedProtectedAppSetup).toBe(true);
  expect(state.launcherBehavior.instagram.useInterruptionPack).toBe(true);
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
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
});

test('Personal Card onboarding copy renders without emoji or old future-you copy', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Text Mum back.' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  const onboardingText = await page.locator('.onboarding-flow-card').innerText();
  expect(onboardingText).not.toMatch(/[✅⭐🎉🚀✨❤️]/);
  expect(onboardingText).not.toContain('Choose what future you should say.');
  expect(onboardingText).not.toContain('interrupt autopilot');
  expect(onboardingText).not.toContain('Live Preview');
  expect(onboardingText).not.toContain('Choose the moment.');
  expect(onboardingText).not.toContain('Choose where it belongs.');
  expect(onboardingText).not.toContain('Personal Cards remind you. Commitment Cards follow up with you.');
  await expect(page.getByRole('heading', { name: 'Make plans. Not just reminders.' })).toBeVisible();
});

test('Commitment Cards demo appears after Personal Cards, can complete, and persists no commitment', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Take five minutes outside.' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Make plans. Not just reminders.' })).toBeVisible();
  await expect(page.getByText('When you accept a commitment, MyBishBash checks back later and asks how it went.')).toBeVisible();
  await expect(page.getByText('There’s another type of card.')).toHaveCount(0);
  await expect(page.getByText('Personal Cards remind you. Commitment Cards follow up with you.')).toHaveCount(0);
  await expect(page.getByTestId('commitment-card-demo-intro')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show me' }).click();

  const demoCard = page.getByTestId('commitment-card-demo');
  await expect(demoCard).toContainText('TODAY’S COMMITMENT');
  await expect(demoCard).toContainText('I will');
  await expect(demoCard).toContainText('go to the gym today.');
  await expect(page.getByRole('button', { name: 'I will commit to this' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not this time' })).toBeVisible();
  await page.getByRole('button', { name: 'Not this time' }).click();

  const motivationDemo = page.getByTestId('commitment-motivation-demo');
  await expect(motivationDemo).toContainText('MESSAGE FROM YOURSELF');
  await expectTextOrder(motivationDemo, 'go to the gym today.', 'I feel so good after a great workout at the gym.');
  await expect(motivationDemo).toContainText('I feel so good after a great workout at the gym.');
  await page.getByRole('button', { name: 'I’ll commit after all' }).click();

  await expect(page.getByTestId('commitment-time-passage')).toContainText('Later...');
  await expect(page.getByTestId('commitment-time-passage')).toContainText('At the end, MyBishBash helps you reflect.');
  await expect(page.getByTestId('commitment-check-in-demo')).toHaveCount(0);
  await expect(page.getByTestId('commitment-encouragement-demo')).toHaveCount(0);
  await expect(page.getByText('How’s it going?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next' }).click();
  const reviewDemo = page.getByTestId('commitment-review-demo');
  await expect(reviewDemo).toContainText('How did it go?', { timeout: 4000 });
  await expectTextOrder(reviewDemo, 'I will go to the gym today.', 'How did it go?');
  await expect(page.getByRole('button', { name: 'I did it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I nearly did it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I didn’t do it' })).toBeVisible();
  await page.getByRole('button', { name: 'I nearly did it' }).click();

  await expect(page.getByRole('heading', { name: 'Commitment Cards help you follow through on the things that matter to you.' })).toBeVisible();
  await expect(page.getByText('You won’t create any Commitment Cards during setup.')).toBeVisible();
  await expect(page.getByText('You can create them later when you’re using MyBishBash.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip Personal Cards for now' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Skip Commitment Cards' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create commitments now' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Install Your First MyBishBash App' })).toBeVisible();

  const state = await page.evaluate(() => ({
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
  }));
  expect(state.cards).toHaveLength(1);
  expect(state.cards.some((card: Record<string, unknown>) => card.cardKind === 'commitment' || String(card.promptText).includes('gym'))).toBe(false);
  expect(state.profile.hasSeenCommitmentCardDemo).toBe(true);
  expect(state.profile.hasSkippedCommitmentCardDemo).toBe(false);
});

test('Commitment Cards demo can be declined and persists no commitment', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByTestId('commitment-card-demo')).toContainText('TODAY’S COMMITMENT');
  await page.getByRole('button', { name: 'Not this time' }).click();

  const motivationDemo = page.getByTestId('commitment-motivation-demo');
  await expect(motivationDemo).toContainText('MESSAGE FROM YOURSELF');
  await expect(motivationDemo).toContainText('Before you decide...');
  await expect(motivationDemo).toContainText('You wrote this to yourself:');
  await expectTextOrder(motivationDemo, 'go to the gym today.', 'I feel so good after a great workout at the gym.');
  await expect(motivationDemo).toContainText('I feel so good after a great workout at the gym.');
  await expect(page.getByRole('button', { name: 'I’ll commit after all' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not this time' })).toBeVisible();
  await page.getByRole('button', { name: 'Not this time' }).click();

  await expect(page.getByRole('heading', { name: 'Commitment Cards help you follow through on the things that matter to you.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Install Your First MyBishBash App' })).toBeVisible();

  const state = await page.evaluate(() => ({
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
  }));
  expect(state.cards.some((card: Record<string, unknown>) => card.cardKind === 'commitment' || String(card.promptText).includes('gym'))).toBe(false);
  expect(state.profile.hasSeenCommitmentCardDemo).toBe(true);
  expect(state.profile.hasSkippedCommitmentCardDemo).toBe(false);
});

test('Commitment Cards demo back button returns to meaningful previous screens', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByTestId('commitment-card-demo')).toContainText('TODAY’S COMMITMENT');

  await page.getByRole('button', { name: 'I will commit to this' }).click();
  await expect(page.getByTestId('commitment-time-passage')).toContainText('Later...');
  await expect(page.getByTestId('commitment-time-passage')).toContainText('At the end, MyBishBash helps you reflect.');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('commitment-review-demo')).toContainText('How did it go?', { timeout: 4000 });
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByTestId('commitment-time-passage')).toContainText('Later...');
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByTestId('commitment-card-demo')).toContainText('TODAY’S COMMITMENT');
  await expect(page.getByRole('button', { name: 'I will commit to this' })).toBeVisible();

  await page.getByRole('button', { name: 'Not this time' }).click();
  await expect(page.getByTestId('commitment-motivation-demo')).toContainText('MESSAGE FROM YOURSELF');
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByTestId('commitment-card-demo')).toContainText('TODAY’S COMMITMENT');
});

test('Commitment Cards demo can be skipped and continues to first app selection', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Make plans. Not just reminders.' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();
  await expect(page.getByRole('heading', { name: 'Install Your First MyBishBash App' })).toBeVisible();

  const profile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(profile.hasSeenCommitmentCardDemo).toBe(false);
  expect(profile.hasSkippedCommitmentCardDemo).toBe(true);
});

test('first app screen shows logo-backed apps in order with consistent icon sizing and single selection', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();

  await expectLogoBackedFirstApps(page, '/mybishbash');

  await page.getByRole('radio', { name: 'WhatsApp' }).click();
  await expect(page.getByRole('radio', { name: 'Instagram' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'Safari' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'WhatsApp' })).toHaveAttribute('aria-checked', 'true');
});

test('first app icon URLs use the preview base path when served under mybishbash-preview', async ({ page }) => {
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  await page.route('**/mybishbash-preview/icons/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: transparentPng,
    });
  });
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');
  await page.evaluate(() => {
    window.history.replaceState({}, '', '/mybishbash-preview/onboarding');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();

  await expectLogoBackedFirstApps(page, '/mybishbash-preview');
});

test('app setup can be skipped directly to Home and uses launcher install language', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();
  await page.getByRole('radio', { name: 'Safari' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expectInterruptionDemoForApp(page, 'Safari', 'What are you here to do?', 'Open Safari with a reason, not a rabbit hole.');
  await page.getByTestId('onboarding-interruption-toggle').getByRole('button', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: 'Install Safari Launcher' }).click();
  await expect(page.getByRole('heading', { name: 'Install Safari Launcher' })).toBeVisible();
  await expect(page.getByText('See your Personal Cards before opening Safari.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Safari Launcher' })).toBeVisible();
  await expect(page.getByText('Add the Safari launcher to your Home Screen.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Add .* shortcut/ })).toHaveCount(0);
  await expect(page.getByText('Tap Add to Home Screen.')).toBeVisible();

  await page.getByRole('button', { name: 'Choose an app later' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();

  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBe('safari');
  expect(state.profile.hasCompletedProtectedAppSetup).toBe(false);
  expect(state.launcherBehavior.safari.useInterruptionPack).toBe(false);
});

const appInterruptionCases = [
  {
    appName: 'Instagram',
    title: 'Why Instagram?',
    body: 'Watch your own life, not someone else’s.',
  },
  {
    appName: 'Safari',
    title: 'What are you here to do?',
    body: 'Open Safari with a reason, not a rabbit hole.',
  },
  {
    appName: 'YouTube',
    title: 'Are you choosing this?',
    body: 'Watch with intention, not by accident.',
  },
  {
    appName: 'WhatsApp',
    title: 'Quick check',
    body: 'Is this message important right now?',
  },
] as const;

for (const { appName, title, body } of appInterruptionCases) {
  test(`selecting ${appName} shows its app-specific interruption demo`, async ({ page }) => {
    await seedFirstRun(page);
    await page.goto('/mybishbash/onboarding');

    await page.getByRole('button', { name: 'Create your first card' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();
    await page.getByRole('radio', { name: appName }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expectInterruptionDemoForApp(page, appName, title, body);
  });
}

test('WhatsApp setup opens the real launcher install page and confirms after manual save', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await page.getByRole('button', { name: 'Create your first card' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();
  await page.getByRole('radio', { name: 'WhatsApp' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expectInterruptionDemoForApp(page, 'WhatsApp', 'Quick check', 'Is this message important right now?');
  await page.getByTestId('onboarding-interruption-toggle').getByRole('button', { name: 'On', exact: true }).click();
  await page.getByRole('button', { name: 'Install WhatsApp Launcher' }).click();
  await expect(page.getByRole('heading', { name: 'Install WhatsApp Launcher' })).toBeVisible();
  await expect(page.getByText('See your Personal Cards before opening WhatsApp.')).toBeVisible();
  await expect(page.getByText('Add the WhatsApp launcher to your Home Screen.')).toBeVisible();
  await expect(page.locator('.onboarding-install-step-marker')).toHaveText(['1', '2', '3', '4', '5']);
  await expect(page.getByText('Tap Add WhatsApp Launcher.')).toBeVisible();
  await expect(page.getByText('Return to MyBishBash to continue.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add WhatsApp Launcher' })).toBeVisible();
  await page.locator('.onboarding-step-body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const returnStepBox = await page.getByText('Return to MyBishBash to continue.', { exact: true }).boundingBox();
  const addLauncherBox = await page.getByRole('button', { name: 'Add WhatsApp Launcher' }).boundingBox();
  expect(returnStepBox).not.toBeNull();
  expect(addLauncherBox).not.toBeNull();
  expect((returnStepBox?.y ?? 0) + (returnStepBox?.height ?? 0)).toBeLessThanOrEqual((addLauncherBox?.y ?? 0) + 1);

  await page.getByRole('button', { name: 'Add WhatsApp Launcher' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/whatsapp\//);
  await page.goBack();

  await expect(page.getByRole('button', { name: 'I’ve saved it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I’ve added it' })).toHaveCount(0);
  await page.getByRole('button', { name: 'I’ve saved it' }).click();
  await expect(page.getByRole('heading', { name: 'WhatsApp Launcher Ready' })).toBeVisible();
  await expect(page.getByTestId('onboarding-protected-app-confirmation')).toContainText('WhatsApp is now ready to use with MyBishBash.');
  await expect(page.getByText('Move the MyBishBash WhatsApp launcher to where WhatsApp normally sits on your Home Screen. Put the original WhatsApp app in a folder so you open MyBishBash first.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Home' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBe('whatsapp');
  expect(state.profile.hasCompletedProtectedAppSetup).toBe(true);
  expect(state.launcherBehavior.whatsapp.useInterruptionPack).toBe(true);
});

test('Today card opens a filtered Library view and shows the correct zero-card empty state', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'No Cards',
      timezone: 'Europe/London',
      plan: 'free',
      hasCompletedHomeSpotlightTour: true,
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
  });

  await page.goto('/mybishbash/home');
  await page.getByTestId('home-progress-card').click();
  await expect(page).toHaveURL(/\/mybishbash\/library$/);
  await expect(page.getByTestId('today-personal-library')).toBeVisible();
  await expect(page.getByTestId('today-personal-empty')).toContainText('No Personal Cards yet.');
  await expect(page.getByRole('button', { name: 'Create Personal Card' })).toBeVisible();
  await expect(page.getByText('You’re all clear today.')).toHaveCount(0);
});

test('Home spotlight tour can be skipped and does not reappear', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await completePersonalCardOnboarding(page);
  const tour = page.getByTestId('home-spotlight-tour');
  await expect(tour).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(tour).not.toContainText(/1 of \d/);
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

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Personal Cards' })).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Commitments' })).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
  await page.getByTestId('bottom-nav-explore').click();
  await expect(page).toHaveURL(/\/mybishbash\/explore$/);
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await page.getByTestId('bottom-nav-apps').click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(page.getByRole('heading', { name: 'You’re ready' })).toBeVisible();
  await tour.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);
});

test('onboarding visible copy avoids technical setup terms', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  const assertNoTechnicalTerms = async () => {
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\bPWA\b/i);
    expect(text).not.toMatch(/\bshell\b/i);
    expect(text).not.toMatch(/\bintercept\b/i);
    expect(text).not.toMatch(/\bfake app\b/i);
    expect(text).not.toMatch(/\blauncherContext\b/i);
    expect(text).not.toMatch(/\bshared state\b/i);
    expect(text).not.toMatch(/\bconfig ID\b/i);
    expect(text).not.toMatch(/\binterruption card\b/i);
    expect(text).not.toMatch(/\bMYBISHBASH\b/);
  };

  await assertNoTechnicalTerms();
  await page.getByRole('button', { name: 'Create your first card' }).click();
  await assertNoTechnicalTerms();
  await page.getByRole('button', { name: 'Continue' }).click();
  await assertNoTechnicalTerms();
  await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click();
  await assertNoTechnicalTerms();
  await page.getByRole('button', { name: 'Continue' }).click();
  await assertNoTechnicalTerms();
});

test('onboarding headlines fit mobile without mid-word splitting', async ({ page }) => {
  await seedFirstRun(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mybishbash/onboarding');

  const checks: Array<{ action?: () => Promise<void>; heading: string }> = [
    { heading: 'Before your apps open' },
    { action: () => page.getByRole('button', { name: 'Create your first card' }).click(), heading: 'Things I genuinely mean to do, but don’t always remember.' },
    { action: async () => { await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Make plans. Not just reminders.' },
    { action: async () => { await page.getByRole('button', { name: 'Skip Commitment Cards for now' }).click(); }, heading: 'Install Your First MyBishBash App' },
    { action: async () => { await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Before Instagram opens' },
    { action: async () => { await page.getByRole('button', { name: 'Install Instagram Launcher' }).click(); }, heading: 'Install Instagram Launcher' },
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
