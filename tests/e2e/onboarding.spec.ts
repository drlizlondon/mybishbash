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
  await expect(page.getByText('For the things you genuinely mean to do, but don’t always remember.')).toHaveCount(0);
  const firstScreenText = await page.locator('.onboarding-step').innerText();
  expect(firstScreenText).not.toMatch(/\bcues?\b/i);
  expect(firstScreenText).not.toMatch(/\bforget(?:ting)?\b/i);
  expect(firstScreenText).not.toMatch(/\bpersonal reminder\b/i);
  await expect(page.getByRole('heading', { name: 'Before your apps open' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 4500 });
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
  await expectPersonalCardsSuccessThenContinue(page);
  await expectCommitmentDemoThenContinue(page);
}

async function expectPersonalCardsSuccessThenContinue(page: Page) {
  await expect(page.getByRole('heading', { name: 'Great. Your Personal Cards are ready.' })).toBeVisible();
  await expect(page.getByText('You’ll now start seeing reminders about the things that matter to you before the apps you choose.')).toBeVisible();
  await expect(page.getByText('Personal Cards', { exact: true })).toBeVisible();
  await expect(page.getByText('help you remember.')).toBeVisible();
  await expect(page.getByText('Commitment Cards', { exact: true })).toBeVisible();
  await expect(page.getByText('help you follow through.')).toBeVisible();
  await expect(page.getByText('Next, let’s see how Commitment Cards help you keep commitments to yourself.')).toBeVisible();
  await expect(page.locator('.onboarding-personal-success-mark')).toHaveCount(0);
  await expect(page.getByTestId('personal-card-onboarding-preview')).toHaveCount(0);
  await expect(page.getByText('Have you taken your vitamins?')).toHaveCount(0);
  await expect(page.getByText('Have you eaten a vegetable today?')).toHaveCount(0);
  await expect(page.getByText('When')).toHaveCount(0);
  await expect(page.getByText('Where')).toHaveCount(0);
  await expect(page.getByText('myBishBash Home')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

async function expectCommitmentDemoThenContinue(page: Page) {
  await expect(page.getByRole('heading', { name: 'See how Commitment Cards work' })).toBeVisible();
  await expect(page.getByText('You won’t make one now. You can create Commitment Cards later in the app.')).toBeVisible();
  await expect(page.getByTestId('onboarding-commitment-demo')).toContainText('I will put my phone down during dinner tonight.');
  await expect(page.getByRole('button', { name: 'Replay demo' })).toBeVisible();
  await expect(page.getByText('You wrote this because:')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('I want to be more present with my family.')).toBeVisible();
  await expect(page.getByText('Later that evening...')).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('How did it go?')).toBeVisible({ timeout: 7000 });
  await expect(page.getByTestId('onboarding-commitment-success')).toContainText('Nice work.', { timeout: 9000 });
  await expect(page.getByTestId('onboarding-commitment-success')).toContainText('Commitment Cards help you keep commitments to yourself.');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

async function expectCommitmentDemoCardVisible(page: Page, expectedActions: string[]) {
  const layout = await page.evaluate((actions) => {
    const card = document.querySelector('.onboarding-commitment-demo-card');
    const phone = document.querySelector('.onboarding-commitment-demo-phone');
    const cardRect = card?.getBoundingClientRect();
    const phoneRect = phone?.getBoundingClientRect();
    const actionRects = actions.map((label) => {
      const button = Array.from(document.querySelectorAll('.onboarding-commitment-demo-button'))
        .find((candidate) => candidate.textContent?.trim() === label);
      const rect = button?.getBoundingClientRect();
      return {
        bottom: rect ? Math.round(rect.bottom) : null,
        label,
        top: rect ? Math.round(rect.top) : null,
      };
    });
    return {
      actions: actionRects,
      cardBottom: cardRect ? Math.round(cardRect.bottom) : null,
      cardTop: cardRect ? Math.round(cardRect.top) : null,
      phoneBottom: phoneRect ? Math.round(phoneRect.bottom) : null,
      phoneTop: phoneRect ? Math.round(phoneRect.top) : null,
      viewportHeight: window.innerHeight,
    };
  }, expectedActions);

  expect(layout.cardTop).not.toBeNull();
  expect(layout.cardBottom).not.toBeNull();
  expect(layout.phoneTop).not.toBeNull();
  expect(layout.phoneBottom).not.toBeNull();
  expect(layout.cardTop!).toBeGreaterThanOrEqual(layout.phoneTop! - 1);
  expect(layout.cardBottom!).toBeLessThanOrEqual(layout.viewportHeight);
  for (const action of layout.actions) {
    expect(action.top, `${action.label} top`).not.toBeNull();
    expect(action.bottom, `${action.label} bottom`).not.toBeNull();
    expect(action.top!).toBeGreaterThanOrEqual(layout.cardTop!);
    expect(action.bottom!).toBeLessThanOrEqual(layout.cardBottom!);
    expect(action.bottom!).toBeLessThanOrEqual(layout.viewportHeight);
  }
}

async function expectCommitmentCursorOnTarget(page: Page, stageClass: string, targetLabel: string) {
  await expect(page.locator(`.onboarding-auto-cursor.${stageClass}`)).toHaveCount(1);
  const geometry = await page.evaluate((label) => {
    const cursor = document.querySelector('.onboarding-auto-cursor');
    const target = Array.from(document.querySelectorAll('.onboarding-commitment-demo-button.cursor-target'))
      .find((button) => button.textContent?.trim() === label);
    const cursorRect = cursor?.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    const pointerTip = cursorRect
      ? {
          x: Math.round(cursorRect.left + 2),
          y: Math.round(cursorRect.top + 5),
        }
      : null;
    return {
      pointerTip,
      target: targetRect
        ? {
            bottom: Math.round(targetRect.bottom),
            left: Math.round(targetRect.left),
            right: Math.round(targetRect.right),
            top: Math.round(targetRect.top),
          }
        : null,
    };
  }, targetLabel);

  expect(geometry.pointerTip).not.toBeNull();
  expect(geometry.target).not.toBeNull();
  expect(geometry.pointerTip!.x).toBeGreaterThanOrEqual(geometry.target!.left - 4);
  expect(geometry.pointerTip!.x).toBeLessThanOrEqual(geometry.target!.right + 4);
  expect(geometry.pointerTip!.y).toBeGreaterThanOrEqual(geometry.target!.top - 4);
  expect(geometry.pointerTip!.y).toBeLessThanOrEqual(geometry.target!.bottom + 4);
}

async function expectIntroCursorHitsTarget(page: Page, targetLabel: string) {
  await expect(page.locator('.onboarding-demo-cursor')).toHaveCount(1);
  const geometry = await page.evaluate((label) => {
    const normalize = (value: string | null | undefined) => String(value ?? "").trim().replace(/[’‘]/g, "'");
    const cursor = document.querySelector('.onboarding-demo-cursor');
    const targets = Array.from(document.querySelectorAll('.onboarding-tutorial-demo button, .onboarding-demo-phone-app'));
    const target = targets.find((element) => normalize(element.textContent) === normalize(label));
    const cursorRect = cursor?.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    const pointerTip = cursorRect
      ? {
          x: Math.round(cursorRect.left + 2),
          y: Math.round(cursorRect.top + 5),
        }
      : null;
    return {
      pointerTip,
      target: targetRect
        ? {
            bottom: Math.round(targetRect.bottom),
            left: Math.round(targetRect.left),
            right: Math.round(targetRect.right),
            top: Math.round(targetRect.top),
          }
        : null,
    };
  }, targetLabel);

  expect(geometry.pointerTip).not.toBeNull();
  expect(geometry.target).not.toBeNull();
  expect(geometry.pointerTip!.x).toBeGreaterThanOrEqual(geometry.target!.left - 4);
  expect(geometry.pointerTip!.x).toBeLessThanOrEqual(geometry.target!.right + 4);
  expect(geometry.pointerTip!.y).toBeGreaterThanOrEqual(geometry.target!.top - 4);
  expect(geometry.pointerTip!.y).toBeLessThanOrEqual(geometry.target!.bottom + 4);
}

async function expectConfirmedSetupAndBackToInstall(page: Page, appName: string) {
  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'You’re set up' })).toBeVisible();
  await expect(page.getByText('Marked as installed')).toBeVisible();
  await expect(page.getByText('Marked as saved')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(new RegExp(`/mybishbash/install/${appName.toLowerCase()}/`));
  await expect(page.getByRole('heading', { name: `Add ${appName} with myBishBash` })).toBeVisible();
  await page.getByRole('button', { name: 'I’ve added it' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'You’re set up' })).toBeVisible();
}

async function completeOnboardingToHome(page: Page, appName = 'Instagram') {
  await completeCoreSetup(page);

  await page.getByRole('radio', { name: appName }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Add an extra ${appName} prompt?` })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('home-panel')).toBeVisible();
}

test('signup route lands new users in Personal Cards onboarding', async ({ page }) => {
  await startOnboardingFromLandingSignup(page);
  await expect(page.getByText('myBishBash uses those moments')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 4500 });
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
  expect(state.profile.onboardingAppContext.label).toBe('Every app you choose');
  expect(state.profile.onboardingAppContext.place).toBe('apps');
  expect(state.profile.hasSeenCommitmentCardDemo).toBe(true);
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
  await expect(page.getByRole('button', { name: 'Have you eaten a vegetable today?' })).toBeVisible();
  await expect(page.getByText('Have you eaten something nourishing today?')).toHaveCount(0);
  await expect(suggestions.locator('.onboarding-idea-check')).toHaveCount(11);
  await expect(suggestions.filter({ hasText: 'Have you done something that counts towards your fitness today?' }).locator('.onboarding-idea-check')).toBeVisible();

  const visibleSuggestions = await suggestions.allTextContents();
  expect(visibleSuggestions).toHaveLength(11);
  const writeOwn = page.getByRole('button', { name: 'Write my own' });
  await writeOwn.scrollIntoViewIfNeeded();
  await expect(writeOwn).toBeVisible();
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
  await expectPersonalCardsSuccessThenContinue(page);
  await expectCommitmentDemoThenContinue(page);
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

test('phone trigger selection goes through App Prompt choice, then finishes without requiring launcher install', async ({ page }) => {
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
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBe('safari');
  expect(state.profile.hasCompletedProtectedAppSetup).toBe(false);
  expect(state.launcherBehavior.safari.useInterruptionPack).toBe(true);
  expect(state.launcherBehavior.safari.appEnabled).not.toBe(true);
});

test('pending install_started resumes on the App Prompt choice, not the removed instruction step', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'Add Safari to your Home Screen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open install page' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Where should myBishBash appear first?' })).toHaveCount(0);
});

test('first app screen keeps logo-backed apps in order with consistent icon paths', async ({ page }) => {
  await completeCoreSetup(page);
  await expectLogoBackedFirstApps(page, '/mybishbash');

  await page.getByRole('radio', { name: 'WhatsApp' }).click();
  await expect(page.getByRole('radio', { name: 'Instagram' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'Safari' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('radio', { name: 'WhatsApp' })).toHaveAttribute('aria-checked', 'true');
});

test('App Prompt choice can be backed out before saving setup', async ({ page }) => {
  await completeCoreSetup(page);

  await page.getByRole('radio', { name: 'Safari' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page.getByRole('heading', { name: 'Where should myBishBash appear first?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Safari to your Home Screen' })).toHaveCount(0);
  const state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    launcherBehavior: JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}'),
  }));
  expect(state.profile.selectedProtectedApp).toBeUndefined();
  expect(state.launcherBehavior.safari?.useInterruptionPack).toBe(false);
});

test('install pages stay as manual checkpoints in standalone display mode', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia?.bind(window);
    window.matchMedia = (query: string) => {
      if (query === '(display-mode: standalone)') {
        return {
          addEventListener: () => {},
          addListener: () => {},
          dispatchEvent: () => false,
          matches: true,
          media: query,
          onchange: null,
          removeEventListener: () => {},
          removeListener: () => {},
        } as MediaQueryList;
      }
      return nativeMatchMedia?.(query) ?? ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
      } as MediaQueryList);
    };
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });
  });

  for (const app of [
    { id: 'instagram', heading: 'Add Instagram with myBishBash' },
    { id: 'safari', heading: 'Add Safari with myBishBash' },
    { id: 'youtube', heading: 'Add YouTube with myBishBash' },
    { id: 'whatsapp', heading: 'Add WhatsApp with myBishBash' },
    { id: 'mybishbash', heading: 'myBishBash' },
  ]) {
    await page.goto(`/mybishbash/install/${app.id}/`);
    await expect(page).toHaveURL(new RegExp(`/mybishbash/install/${app.id}/?$`));
    await expect(page.locator('.install-copy h2').filter({ hasText: app.heading })).toBeVisible();
    if (app.id !== 'mybishbash') {
      await expect(page.locator('.install-copy p')).toContainText('This adds a Home Screen launcher for myBishBash.');
      await expect(page.locator('.install-copy p')).toContainText('it does not install or replace the real app.');
      await expect(page.getByText('Open this page in Safari.')).toBeVisible();
      await expect(page.getByText('Tap Share.')).toBeVisible();
      await expect(page.getByText('Tap Add to Home Screen.')).toBeVisible();
      await expect(page.getByText('Open this page in Chrome.')).toBeVisible();
      await expect(page.getByText('Tap the three dots.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy setup link' })).toBeVisible();
      await expect(page.getByText('If you cannot see Share, copy this link and open it in Safari.')).toBeVisible();
    }
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(new RegExp(`/mybishbash/install/${app.id}/?$`));
    await expect(page.locator('.install-copy h2').filter({ hasText: app.heading })).toBeVisible();
  }
});

test('onboarding back buttons move through the previous logical setup step', async ({ page }) => {
  await startStrategySetup(page);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Instagram to your Home Screen' })).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 4500 });
  await page.getByRole('button', { name: 'Set up my Personal Cards', exact: true }).click();
  await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Great. Your Personal Cards are ready.' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Let’s start with a few things you’d like to remember more often.' })).toBeVisible();
  await expect(page.getByText('1 of 5 selected')).toBeVisible();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Great. Your Personal Cards are ready.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'See how Commitment Cards work' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Great. Your Personal Cards are ready.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expectCommitmentDemoThenContinue(page);
  await expect(page.getByRole('heading', { name: 'Where should myBishBash appear first?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add an extra Instagram prompt?' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Where should myBishBash appear first?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Instagram to your Home Screen' })).toHaveCount(0);
});

test('skipping personal cards continues to Commitment Cards instead of ending onboarding', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 4500 });
  await page.getByRole('button', { name: 'I’ll do this later' }).click();
  await expect(page.getByRole('heading', { name: 'See how Commitment Cards work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You can set up your phone later.' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/mybishbash\/onboarding$/);

  let state = await page.evaluate(() => ({
    profile: JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'),
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
  }));
  expect(state.profile.hasCompletedPersonalCardSetup).toBe(false);
  expect(state.profile.onboardingSkipped).toBe(true);
  expect(state.setupComplete).toBe('false');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Instagram to your Home Screen' })).toHaveCount(0);

  await startStrategySetup(page);

  await page.getByRole('button', { name: 'Skip personal cards' }).click();
  await expect(page.getByRole('heading', { name: 'See how Commitment Cards work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You can set up your phone later.' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page.getByRole('heading', { name: 'Let’s start with a few things you’d like to remember more often.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Instagram to your Home Screen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open install page' })).toHaveCount(0);

  state = await page.evaluate(() => ({
    cards: JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') ?? '[]'),
    setupComplete: window.localStorage.getItem('mybishbash.setup-complete.v1'),
  }));
  expect(state.cards).toEqual([]);
  expect(state.setupComplete).toBe('false');
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
  await expect(page.getByTestId('home-onboarding-setup-card')).toContainText('Now add Instagram');
  await expect(page.getByTestId('home-onboarding-setup-card')).toContainText('You picked Instagram during onboarding.');
  await expect(page.getByTestId('home-onboarding-setup-card').locator('img')).toHaveAttribute('src', /instagram-cover\.jpg/);

  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/explore$/);
  await expect(tour.getByRole('heading', { name: 'Explore' })).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(tour.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(tour.getByRole('heading', { name: 'Now add Instagram' })).toBeVisible();
  await expect(tour).toContainText('You chose Instagram during onboarding.');
  await expect(page.getByTestId('apps-onboarding-setup-card')).toContainText('Now add Instagram');
  await expect(page.getByTestId('apps-onboarding-setup-card')).toContainText('You picked Instagram during onboarding.');
  await expect(page.getByTestId('apps-onboarding-setup-card').locator('img')).toHaveAttribute('src', /instagram-cover\.jpg/);
  await expect(page.getByTestId('apps-onboarding-setup-instagram')).toHaveText('Open setup page');
  await expect(page.getByTestId('apps-option-instagram')).toHaveCount(0);
  await tour.getByRole('button', { name: 'Add Instagram' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/instagram\/$/);

  const profile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.profile.v1') ?? '{}'));
  expect(profile.onboardingRoute).toBe('personal_card_play_by_play');
  expect(profile.hasCompletedHomeSpotlightTour).toBe(true);

  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('home-panel')).toBeVisible();
  await expect(page.getByTestId('home-spotlight-tour')).toHaveCount(0);
  await expect(page.getByTestId('home-onboarding-setup-card')).toContainText('Now add Instagram');
  await page.getByTestId('home-onboarding-setup-instagram').click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/instagram\/$/);
});

test('onboarding visible copy avoids old blocker and technical language', async ({ page }) => {
  await startStrategySetup(page);
  await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Great. Your Personal Cards are ready.' })).toBeVisible();

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
  expect(text).not.toContain('How’s it going?');
  expect(text).not.toContain('Before your apps open');
  expect(text).not.toContain('Do the thing you’ve been putting off.');
});

test('Personal Cards success transition is compact across phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await startStrategySetup(page);
    await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Great. Your Personal Cards are ready.' })).toBeVisible();
    await expect(page.getByText('help you remember.')).toBeVisible();
    await expect(page.getByText('help you follow through.')).toBeVisible();
    await expect(page.getByText('Next, let’s see how Commitment Cards help you keep commitments to yourself.')).toBeVisible();
    await expect(page.locator('.onboarding-personal-success-mark')).toHaveCount(0);
    await expect(page.getByTestId('personal-card-onboarding-preview')).toHaveCount(0);
    await expect(page.getByText('Have you taken your vitamins?')).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const heading = document.querySelector('.onboarding-personal-success-step h2');
      const action = Array.from(document.querySelectorAll('.onboarding-actions button'))
        .find((button) => button.textContent?.trim() === 'Continue');
      const bridge = document.querySelector('.onboarding-personal-success-bridge');
      const headingStyle = heading ? window.getComputedStyle(heading) : null;
      const actionRect = action?.getBoundingClientRect();
      const bridgeRect = bridge?.getBoundingClientRect();
      return {
        actionBottom: actionRect ? Math.round(actionRect.bottom) : null,
        actionTop: actionRect ? Math.round(actionRect.top) : null,
        bridgeBottom: bridgeRect ? Math.round(bridgeRect.bottom) : null,
        headingHyphens: headingStyle?.hyphens ?? null,
        headingWordBreak: headingStyle?.wordBreak ?? null,
        viewportHeight: window.innerHeight,
      };
    });

    expect(layout.headingWordBreak).not.toBe('break-all');
    expect(layout.headingHyphens).toBe('none');
    expect(layout.actionTop).not.toBeNull();
    expect(layout.actionBottom).not.toBeNull();
    expect(layout.bridgeBottom).not.toBeNull();
    expect(layout.actionTop!).toBeGreaterThan(layout.bridgeBottom!);
    expect(layout.actionBottom!).toBeLessThanOrEqual(layout.viewportHeight);
  }
});

test('Commitment Cards demo can replay and keeps option buttons fully visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startStrategySetup(page);
  await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expectPersonalCardsSuccessThenContinue(page);

  await expect(page.getByRole('heading', { name: 'See how Commitment Cards work' })).toBeVisible();
  await expect(page.getByText('You won’t make one now. You can create Commitment Cards later in the app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay demo' })).toBeVisible();
  await expect(page.getByTestId('onboarding-commitment-demo')).toContainText('I will put my phone down during dinner tonight.');
  await expectCommitmentDemoCardVisible(page, ['I’ll do it', 'Not today']);
  await page.waitForTimeout(1450);
  await expectCommitmentCursorOnTarget(page, 'commitment-tap', 'Not today');

  await expect(page.getByText('You wrote this because:')).toBeVisible({ timeout: 5000 });
  await expectCommitmentDemoCardVisible(page, ['I’ll do it', 'Leave it for another day']);
  await page.waitForTimeout(1400);
  await expectCommitmentCursorOnTarget(page, 'motivation-tap', 'I’ll do it');

  await expect(page.getByText('How did it go?')).toBeVisible({ timeout: 7000 });
  await expectCommitmentDemoCardVisible(page, ['I did it', 'Nearly', 'Not this time']);
  await page.waitForTimeout(1500);
  await expectCommitmentCursorOnTarget(page, 'review-tap', 'I did it');

  await expect(page.getByTestId('onboarding-commitment-success')).toContainText('Nice work.', { timeout: 9000 });
  await page.getByRole('button', { name: 'Replay demo' }).click();
  await expect(page.getByTestId('onboarding-commitment-demo')).toContainText('I will put my phone down during dinner tonight.');
  await expectCommitmentDemoCardVisible(page, ['I’ll do it', 'Not today']);
});

test('Personal Cards intro demo fits short 100 percent preview without scrolling', async ({ page }) => {
  await seedFirstRun(page);
  await page.setViewportSize({ width: 390, height: 562 });
  await page.goto('/mybishbash/onboarding');

  await expect(page.getByRole('heading', { name: 'Start with your Personal Cards' })).toBeVisible();
  const finalLineOpacityBeforeDemo = await page.locator('.onboarding-demo-final-line').evaluate((node) =>
    Number(window.getComputedStyle(node).opacity),
  );
  expect(finalLineOpacityBeforeDemo).toBeLessThan(0.1);
  await expect(page.getByText('Have you done something that counts towards your fitness today?')).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('For the things you genuinely mean to do.')).toBeVisible({ timeout: 36000 });
  await expect(page.getByRole('button', { name: 'Replay demo' })).toBeVisible({ timeout: 36000 });
  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 4500 });
  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'I’ll do this later' })).toBeVisible();

  const layout = await page.evaluate(() => {
    const getButton = (label: string) => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === label);
    const getBounds = (element: Element | undefined) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            bottom: Math.round(rect.bottom),
            top: Math.round(rect.top),
          }
        : null;
    };
    return {
      primary: getBounds(getButton('Set up my Personal Cards')),
      replay: getBounds(getButton('Replay demo')),
      secondary: getBounds(getButton('I’ll do this later')),
      viewportHeight: window.innerHeight,
    };
  });

  for (const [label, bounds] of Object.entries({
    primary: layout.primary,
    replay: layout.replay,
    secondary: layout.secondary,
  })) {
    expect(bounds, `${label} bounds`).not.toBeNull();
    expect(bounds!.top, `${label} top`).toBeGreaterThanOrEqual(0);
    expect(bounds!.bottom, `${label} bottom`).toBeLessThanOrEqual(layout.viewportHeight);
  }

  await page.getByRole('button', { name: 'Replay demo' }).click();
  await page.waitForTimeout(2800);
  await expectIntroCursorHitsTarget(page, 'Instagram');
  await page.waitForTimeout(25000);
  await expectIntroCursorHitsTarget(page, 'I’ll do it now');
});

test('Personal Cards intro demo keeps Replay and actions visible in side preview height', async ({ page }) => {
  await seedFirstRun(page);
  await page.setViewportSize({ width: 491, height: 611 });
  await page.goto('/mybishbash/onboarding');

  await expect(page.getByRole('button', { name: 'Set up my Personal Cards' })).toBeEnabled({ timeout: 4500 });
  await expect(page.getByText('For the things you genuinely mean to do.')).toBeVisible({ timeout: 36000 });
  await expect(page.getByRole('button', { name: 'Replay demo' })).toBeVisible({ timeout: 36000 });

  const layout = await page.evaluate(() => {
    const getButton = (label: string) => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === label);
    const getBounds = (element: Element | undefined) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            bottom: Math.round(rect.bottom),
            top: Math.round(rect.top),
          }
        : null;
    };
    return {
      primary: getBounds(getButton('Set up my Personal Cards')),
      replay: getBounds(getButton('Replay demo')),
      secondary: getBounds(getButton('I’ll do this later')),
      viewportHeight: window.innerHeight,
    };
  });

  for (const [label, bounds] of Object.entries({
    primary: layout.primary,
    replay: layout.replay,
    secondary: layout.secondary,
  })) {
    expect(bounds, `${label} bounds`).not.toBeNull();
    expect(bounds!.top, `${label} top`).toBeGreaterThanOrEqual(0);
    expect(bounds!.bottom, `${label} bottom`).toBeLessThanOrEqual(layout.viewportHeight);
  }
});

test('local onboarding editor panel can be moved and stays available across onboarding pages', async ({ page }) => {
  await seedFirstRun(page);
  await page.goto('/mybishbash/onboarding');

  const panel = page.locator('.edit-panel');
  const handle = page.getByRole('button', { name: 'Move editor' });
  await expect(panel).toBeVisible();
  await expect(handle).toBeVisible();

  const before = await panel.boundingBox();
  expect(before).not.toBeNull();
  await handle.click();
  await expect(page.getByRole('button', { name: 'Lock editor' })).toBeVisible();
  await page.mouse.move(120, 220);
  const after = await panel.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.round(after!.x)).not.toBe(Math.round(before!.x));
  expect(Math.round(after!.y)).not.toBe(Math.round(before!.y));

  await page.keyboard.press('ArrowRight');
  const nudged = await panel.boundingBox();
  expect(nudged).not.toBeNull();
  expect(Math.round(nudged!.x)).toBeGreaterThan(Math.round(after!.x));

  await page.getByRole('button', { name: 'Lock editor' }).click();
  await expect(page.getByRole('button', { name: 'Move editor' })).toBeVisible();

  await handle.click();
  await expect(page.getByRole('button', { name: 'Lock editor' })).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(page.getByRole('button', { name: 'Move editor' })).toBeVisible();

  await page.getByRole('button', { name: 'Set up my Personal Cards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Let’s start with a few things you’d like to remember more often.' })).toBeVisible();
  await expect(handle).toBeVisible();
});

test('onboarding headlines fit mobile without mid-word splitting', async ({ page }) => {
  await seedFirstRun(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mybishbash/onboarding');

  const checks: Array<{ action?: () => Promise<void>; heading: string }> = [
    { heading: 'Start with your Personal Cards' },
    { action: () => page.getByRole('button', { name: 'Set up my Personal Cards' }).click(), heading: 'Let’s start with a few things you’d like to remember more often.' },
    { action: async () => { await page.getByRole('button', { name: 'Have you taken your vitamins?' }).click(); await page.getByRole('button', { name: 'Continue' }).click(); }, heading: 'Great. Your Personal Cards are ready.' },
    { action: async () => { await page.getByRole('button', { name: 'Continue', exact: true }).click(); }, heading: 'See how Commitment Cards work' },
    { action: async () => { await expectCommitmentDemoThenContinue(page); }, heading: 'Where should myBishBash appear first?' },
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
