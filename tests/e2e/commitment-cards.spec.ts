import { expect, test, type Page } from '@playwright/test';

const now = '2026-06-01T12:00:00.000Z';
const launcherIds = ['safari', 'instagram', 'youtube'] as const;

function commitmentCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'commitment-card',
    cardKind: 'commitment',
    promptText: 'go for a walk',
    dashboardTitle: 'Today’s Commitment',
    commitmentReason: 'Fresh air helps me reset.',
    commitmentTimingMode: 'anytime',
    commitmentStartWindow: 'anytime',
    commitmentCustomStartTime: '',
    commitmentCustomEndTime: '',
    commitmentCheckInEnabled: false,
    commitmentCheckInTime: '',
    commitmentCheckInPendingDate: null,
    commitmentCheckInResponse: null,
    commitmentCheckInResponseDate: null,
    commitmentCheckInResponseAt: null,
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening', 'night'],
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
    ...overrides,
  };
}

function legacyCommitmentCard(overrides: Record<string, unknown> = {}) {
  const card = commitmentCard(overrides);
  delete card.cardKind;
  return card;
}

function personalCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'personal-card',
    promptText: 'take a steady breath',
    dashboardTitle: 'Personal Card',
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening'],
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
    ...overrides,
  };
}

function packCard(overrides: Record<string, unknown> = {}) {
  return {
    ...personalCard({
      id: 'pack-card',
      promptText: 'I will keep going',
      dashboardTitle: 'Today’s Commitment',
      sourcePackId: 'legacy-looking-pack',
      attribution: 'Test Pack',
    }),
    ...overrides,
  };
}

async function seedE2EState(page: Page, cards: Array<Record<string, unknown>> = []) {
  await page.addInitScript(({ seededCards, fixedNow }) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args: any[]) {
        super(...(args.length === 0 ? [fixedNow] : args));
      }
      static now() {
        return new RealDate(fixedNow).getTime();
      }
    }
    window.Date = FixedDate as DateConstructor;

    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'E2E', timezone: 'Europe/London' }));
    window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
    window.localStorage.setItem('mybishbash.event-log.v1', '[]');
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
    window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
    window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
    window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
      mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      whatsapp: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    }));
  }, { seededCards: cards, fixedNow: now });
}

async function gotoHome(page: Page) {
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

async function gotoLauncher(page: Page, launcherId = 'safari') {
  await page.goto(`/mybishbash/intercept/${launcherId}`);
}

async function navigateWithinApp(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', `/mybishbash${nextPath}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function storedCards(page: Page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') || '[]'));
}

async function storedEvents(page: Page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('mybishbash.event-log.v1') || '[]'));
}

async function expectStoredCard(page: Page, predicate: (card: any) => boolean) {
  await expect.poll(async () => {
    const cards = await storedCards(page);
    return cards.some(predicate);
  }).toBe(true);
}

async function fillCommitmentComposer(page: Page, text: string, reason = 'This matters to me today.') {
  await page.getByRole('button', { name: 'Commitment Card' }).click();
  await page.getByTestId('commitment-text-input').fill(text);
  await page.getByTestId('commitment-reason-input').fill(reason);
}

test('creates a Commitment Card through the real app card flow and preserves exact text', async ({ page }) => {
  await seedE2EState(page);
  await gotoHome(page);

  await page.getByTestId('create-card-button').click();
  await fillCommitmentComposer(page, 'avoid cheese', 'Cheese makes me feel sluggish.');
  await page.getByTestId('commitment-window-select').selectOption('evening');
  await page.getByTestId('save-commitment-card-button').click();

  await expectStoredCard(page, (card) =>
    card.cardKind === 'commitment' &&
    card.promptText === 'avoid cheese' &&
    card.commitmentReason === 'Cheese makes me feel sluggish.' &&
    card.commitmentTimingMode === 'evening' &&
    JSON.stringify(card.timingWindows) === JSON.stringify(['evening']),
  );
});

test('does not add, remove, or duplicate I will when saving commitment text', async ({ page }) => {
  await seedE2EState(page);
  await gotoHome(page);

  await page.getByTestId('create-card-button').click();
  await fillCommitmentComposer(page, 'I will not eat snacks', 'Exact wording matters.');
  await page.getByTestId('save-commitment-card-button').click();

  await expectStoredCard(page, (card) =>
    card.cardKind === 'commitment' &&
    card.promptText === 'I will not eat snacks',
  );
});

test('creates a Commitment Card from a fake shell flow using the same composer', async ({ page }) => {
  await seedE2EState(page);
  await gotoLauncher(page, 'safari');

  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  await page.getByTestId('overlay-create-card-button').click();
  await fillCommitmentComposer(page, 'read my Bible', 'I want to start with something steady.');
  await page.getByTestId('save-commitment-card-button').click();

  await expect(page).toHaveURL(/\/mybishbash\/intercept\/safari$/);
  await expectStoredCard(page, (card) =>
    card.cardKind === 'commitment' &&
    card.promptText === 'read my Bible' &&
    card.commitmentReason === 'I want to start with something steady.',
  );
});

test('live preview updates with real button-style actions as the user types', async ({ page }) => {
  await seedE2EState(page);
  await gotoHome(page);

  await page.getByTestId('create-card-button').click();
  await page.getByRole('button', { name: 'Commitment Card' }).click();
  await page.getByTestId('commitment-text-input').fill('not eat snacks after dinner');

  const preview = page.getByTestId('commitment-preview');
  await expect(preview.getByText('TODAY’S COMMITMENT')).toBeVisible();
  await expect(preview.getByText('I will', { exact: true })).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'not eat snacks after dinner' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'I will commit to this' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Not this time' })).toBeVisible();
  await expect(page.getByTestId('commitment-self-check').getByText('Does this sound right?')).toBeVisible();
});

test('Commitment Cards are eligible in fake shell flows anywhere Personal Cards are eligible', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);

  for (const launcherId of launcherIds) {
    await gotoLauncher(page, launcherId);
    await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
    await expect(page.getByTestId('card-overlay-personal').getByText('TODAY’S COMMITMENT')).toBeVisible();
    await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'I will' })).toBeVisible();
    await expect(page.getByTestId('card-overlay-personal').getByText('go for a walk')).toBeVisible();
    await page.getByTestId('dashboard-shortcut').click();
    await expect(page.getByTestId('app-shell')).toBeVisible();
  }
});

test('legacy dashboard-title commitment cards render as Commitment Cards', async ({ page }) => {
  await seedE2EState(page, [legacyCommitmentCard()]);
  await gotoLauncher(page, 'safari');

  const overlay = page.getByTestId('card-overlay-personal');
  await expect(overlay.getByText('TODAY’S COMMITMENT')).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'I will' })).toBeVisible();
  await expect(overlay.getByText('go for a walk')).toBeVisible();
  await expect(overlay.getByTestId('card-action-i-will-commit-to-this')).toBeVisible();
});

test('legacy commitment cards produce check-ins after the selected time', async ({ page }) => {
  await seedE2EState(page, [
    legacyCommitmentCard({
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
      commitmentStatusToday: 'made',
      commitmentDecisionDate: '2026-06-01',
      commitmentDecisionAt: now,
    }),
  ]);
  await gotoLauncher(page, 'safari');

  const overlay = page.getByTestId('card-overlay-personal');
  await expect(overlay.getByText('CHECK-IN')).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'You committed to:' })).toBeVisible();
  await expect(overlay.getByText('go for a walk')).toBeVisible();
  await expect(overlay.getByText('How’s it going?')).toBeVisible();
});

test('normal Personal Cards without commitment fields stay Personal Cards', async ({ page }) => {
  await seedE2EState(page, [personalCard()]);
  await gotoLauncher(page, 'safari');

  const overlay = page.getByTestId('card-overlay-personal');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText('TODAY’S COMMITMENT')).toHaveCount(0);
  await expect(overlay.getByRole('heading', { name: 'take a steady breath' })).toBeVisible();
  await expect(overlay.getByTestId('card-action-done')).toBeVisible();
});

test('pack cards with commitment-looking text are not reclassified as Commitment Cards', async ({ page }) => {
  await seedE2EState(page, [packCard()]);
  await gotoLauncher(page, 'safari');

  const overlay = page.getByTestId('card-overlay-pack');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'I will keep going' })).toBeVisible();
  await expect(page.getByTestId('card-action-i-will-commit-to-this')).toHaveCount(0);
});

test('Commitment Card preset and custom timing controls eligibility', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({ id: 'evening-card', promptText: 'call Mum', commitmentTimingMode: 'evening', timingWindows: ['evening'] }),
    commitmentCard({
      id: 'custom-later-card',
      promptText: 'stretch at tea time',
      commitmentTimingMode: 'custom',
      timingWindows: ['morning', 'day', 'evening', 'night'],
      commitmentCustomStartTime: '15:00',
      commitmentCustomEndTime: '16:00',
    }),
    commitmentCard({
      id: 'custom-now-card',
      promptText: 'drink water before lunch',
      commitmentTimingMode: 'custom',
      timingWindows: ['morning', 'day', 'evening', 'night'],
      commitmentCustomStartTime: '12:30',
      commitmentCustomEndTime: '13:30',
    }),
  ]);

  await gotoHome(page);

  await expect(page.getByTestId('home-card-evening-card').getByText('upcoming')).toBeVisible();
  await expect(page.getByTestId('home-card-custom-later-card').getByText('upcoming')).toBeVisible();
  await expect(page.getByTestId('home-card-custom-now-card').getByText('ready')).toBeVisible();
});

test('custom start and end time window is saved exactly from the composer', async ({ page }) => {
  await seedE2EState(page);
  await gotoHome(page);

  await page.getByTestId('create-card-button').click();
  await fillCommitmentComposer(page, 'be patient with the children');
  await page.getByTestId('commitment-window-select').selectOption('custom');
  await page.getByTestId('commitment-start-time-input').fill('16:00');
  await page.getByTestId('commitment-end-time-input').fill('19:30');
  await page.getByTestId('save-commitment-card-button').click();

  await expectStoredCard(page, (card) =>
    card.cardKind === 'commitment' &&
    card.promptText === 'be patient with the children' &&
    card.commitmentTimingMode === 'custom' &&
    card.commitmentCustomStartTime === '16:00' &&
    card.commitmentCustomEndTime === '19:30',
  );
});

test('commit path records made and prevents same-day reappearance', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoLauncher(page, 'safari');

  await page.getByTestId('card-action-i-will-commit-to-this').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'made');
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_made')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Thanks for making a commitment to yourself.' })).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});

test('Not this time path shows the second screen', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoHome(page);

  await page.getByTestId('home-card-commitment-card').click();
  await page.getByTestId('card-action-not-this-time').click();

  await expect(page.getByText('MESSAGE FROM YOURSELF')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fresh air helps me reset.' })).toBeVisible();
  await expect(page.getByTestId('card-action-i-ll-commit-after-all')).toBeVisible();
  await expect(page.getByTestId('card-action-not-this-time')).toBeVisible();
});

test('second screen commit after all records commitment made', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoHome(page);

  await page.getByTestId('home-card-commitment-card').click();
  await page.getByTestId('card-action-not-this-time').click();
  await page.getByTestId('card-action-i-ll-commit-after-all').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'made');
  const events = await storedEvents(page);
  expect(events.some((event: any) => event.event_type === 'commitment_made' && event.metadata?.decisionSource === 'commit_after_all')).toBe(true);
});

test('second screen Not this time records declined and does not automatically reappear', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoLauncher(page, 'safari');

  await page.getByTestId('card-action-not-this-time').click();
  await page.getByTestId('card-action-not-this-time').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'declined');
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_declined')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Thanks for the update.' })).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});

test('optional check-in can be added during Commitment Card creation', async ({ page }) => {
  await seedE2EState(page);
  await gotoHome(page);

  await page.getByTestId('create-card-button').click();
  await fillCommitmentComposer(page, 'go for a walk');
  await page.getByTestId('commitment-check-in-toggle').getByRole('button', { name: 'Yes' }).click();
  await page.getByTestId('commitment-check-in-time-input').fill('20:30');
  await page.getByTestId('save-commitment-card-button').click();

  await expectStoredCard(page, (card) =>
    card.cardKind === 'commitment' &&
    card.promptText === 'go for a walk' &&
    card.commitmentCheckInEnabled === true &&
    card.commitmentCheckInTime === '20:30',
  );
});

test('check-in appears only after the user commits and the selected time has arrived', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);
  await gotoLauncher(page, 'safari');

  await page.getByTestId('card-action-i-will-commit-to-this').click();
  await expect(page.getByRole('heading', { name: 'Thanks for making a commitment to yourself.' })).toBeVisible();
  await expect(page.getByTestId('card-action-continue-to-safari')).toBeVisible();
  await expect(page.getByTestId('card-action-do-something-else')).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByText('CHECK-IN')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You committed to:' })).toBeVisible();
  await expect(page.getByText('go for a walk')).toBeVisible();
  await expect(page.getByText('How’s it going?')).toBeVisible();
});

test('check-in does not appear if the user declines the commitment', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);
  await gotoLauncher(page, 'safari');

  await page.getByTestId('card-action-not-this-time').click();
  await page.getByTestId('card-action-not-this-time').click();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByText('CHECK-IN')).toHaveCount(0);
});

test('check-in waits until the selected check-in time', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentStatusToday: 'made',
      commitmentDecisionDate: '2026-06-01',
      commitmentDecisionAt: now,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '15:00',
    }),
  ]);

  await gotoLauncher(page, 'safari');
  await expect(page.getByText('CHECK-IN')).toHaveCount(0);
});

test('check-in response labels and completion return to normal launcher choices', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentStatusToday: 'made',
      commitmentDecisionDate: '2026-06-01',
      commitmentDecisionAt: now,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);
  await gotoLauncher(page, 'safari');

  await expect(page.getByRole('button', { name: 'Going perfectly' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Could be better' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not going well' })).toBeVisible();
  await page.getByRole('button', { name: 'Could be better' }).click();

  await expectStoredCard(page, (card) =>
    card.id === 'commitment-card' &&
    card.commitmentCheckInResponse === 'Could be better' &&
    card.commitmentCheckInResponseDate === '2026-06-01',
  );
  await expect(page.getByRole('heading', { name: 'Thanks for the update.' })).toBeVisible();
  await expect(page.getByTestId('card-action-continue-to-safari')).toBeVisible();
  await expect(page.getByTestId('card-action-do-something-else')).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByText('CHECK-IN')).toHaveCount(0);
});
