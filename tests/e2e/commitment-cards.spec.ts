import { expect, test, type Page } from '@playwright/test';

const now = '2026-06-01T12:00:00.000Z';
const todayKey = '2026-06-01';
const yesterdayKey = '2026-05-31';
const yesterdayNow = '2026-05-31T12:00:00.000Z';
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
    commitmentLifecycleStatus: null,
    commitmentCheckInShownDate: null,
    commitmentCheckInResponse: null,
    commitmentCheckInResponseDate: null,
    commitmentCheckInResponseAt: null,
    commitmentEncouragementRequestedDate: null,
    commitmentEncouragementCompletedDate: null,
    commitmentClosedEarlyDate: null,
    commitmentReviewDueDate: null,
    commitmentReviewResponse: null,
    commitmentReviewResponseDate: null,
    commitmentReviewResponseAt: null,
    commitmentFinalOutcome: null,
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

async function gotoLibrary(page: Page, section: 'personal' | 'commitment' | 'active-packs' = 'personal') {
  await page.goto('/mybishbash/library');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId(`library-${section}-section-toggle`).click();
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

async function expectStoredEvent(page: Page, predicate: (event: any) => boolean) {
  await expect.poll(async () => {
    const events = await storedEvents(page);
    return events.some(predicate);
  }).toBe(true);
}

async function expectStoredCard(page: Page, predicate: (card: any) => boolean) {
  await expect.poll(async () => {
    const cards = await storedCards(page);
    return cards.some(predicate);
  }).toBe(true);
}

async function expectTextOrder(locator: ReturnType<Page['locator']>, firstText: string, secondText: string) {
  const text = await locator.innerText();
  const firstIndex = text.indexOf(firstText);
  const secondIndex = text.indexOf(secondText);
  expect(firstIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeGreaterThanOrEqual(0);
  expect(firstIndex).toBeLessThan(secondIndex);
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
  await expect(overlay.getByRole('heading', { name: /I will\s+go for a walk/ })).toBeVisible();
  await expect(overlay.getByTestId('card-action-i-will-commit-to-this')).toBeVisible();
});

test('saved prompts that already start with I will do not duplicate the prefix when rendered', async ({ page }) => {
  await seedE2EState(page, [commitmentCard({ promptText: 'I will read my Bible in the morning' })]);
  await gotoLauncher(page, 'safari');

  const overlay = page.getByTestId('card-overlay-personal');
  await expect(overlay.getByRole('heading', { name: /I will\s+read my Bible in the morning/ })).toBeVisible();
  await expect(overlay.getByText(/I will\s+I will/)).toHaveCount(0);
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
  await expect(overlay.getByText('How’s it going?')).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'go for a walk' })).toBeVisible();
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

  await gotoLibrary(page, 'commitment');

  await expect(page.getByTestId('library-row-evening-card').getByText('commitment')).toBeVisible();
  await expect(page.getByTestId('library-row-custom-later-card').getByText('custom timing')).toBeVisible();
  await expect(page.getByTestId('library-row-custom-now-card').getByText('custom timing')).toBeVisible();
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

  await expectStoredCard(page, (card) =>
    card.id === 'commitment-card' &&
    card.statusToday === 'doneToday' &&
    card.doneDate === todayKey &&
    card.commitmentStatusToday === 'made' &&
    card.commitmentDecisionDate === todayKey,
  );
  await expectStoredEvent(page, (event) => event.event_type === 'commitment_made');
  await expect(page.getByRole('heading', { name: /Nice choice\.\s+Keep this in mind today\./ })).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});

test('commitment accepted today does not reappear today', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      statusToday: 'doneToday',
      doneDate: todayKey,
      commitmentStatusToday: 'made',
      commitmentDecisionDate: todayKey,
      commitmentDecisionAt: now,
    }),
  ]);

  await gotoLauncher(page, 'safari');

  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expect(page.getByText('go for a walk')).toHaveCount(0);
});

test('commitment declined today does not reappear today', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      statusToday: 'doneToday',
      doneDate: todayKey,
      commitmentStatusToday: 'declined',
      commitmentDecisionDate: todayKey,
      commitmentDecisionAt: now,
    }),
  ]);

  await gotoLauncher(page, 'safari');

  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  await expect(page.getByText('go for a walk')).toHaveCount(0);
});

test('commitment accepted yesterday appears again today', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      statusToday: 'doneToday',
      doneDate: yesterdayKey,
      lastShownAt: yesterdayNow,
      commitmentStatusToday: 'made',
      commitmentDecisionDate: yesterdayKey,
      commitmentDecisionAt: yesterdayNow,
    }),
  ]);

  await gotoLauncher(page, 'safari');

  const overlay = page.getByTestId('card-overlay-personal');
  await expect(overlay.getByText('TODAY’S COMMITMENT')).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'I will' })).toBeVisible();
  await expect(overlay.getByText('go for a walk')).toBeVisible();
  await expect(page.getByText('How’s it going?')).toHaveCount(0);
});

test('commitment declined yesterday appears again today', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      statusToday: 'doneToday',
      doneDate: yesterdayKey,
      lastShownAt: yesterdayNow,
      commitmentStatusToday: 'declined',
      commitmentDecisionDate: yesterdayKey,
      commitmentDecisionAt: yesterdayNow,
    }),
  ]);

  await gotoLauncher(page, 'safari');

  const overlay = page.getByTestId('card-overlay-personal');
  await expect(overlay.getByText('TODAY’S COMMITMENT')).toBeVisible();
  await expect(overlay.getByText('go for a walk')).toBeVisible();
});

test('Not this time shows motivation reminder before a final decision', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoLibrary(page, 'commitment');

  await page.getByTestId('library-row-commitment-card').click();
  await page.getByTestId('card-action-not-this-time').click();

  await expect(page.getByText('MESSAGE FROM YOURSELF')).toBeVisible();
  await expect(page.getByText('Before you decide...')).toBeVisible();
  await expect(page.getByText('You wrote this to yourself:')).toBeVisible();
  await expect(page.getByRole('heading', { name: /I will\s+go for a walk/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fresh air helps me reset.' })).toBeVisible();
  await expectTextOrder(page.getByTestId('card-overlay-personal'), 'go for a walk', 'Fresh air helps me reset.');
  await expect(page.getByTestId('card-action-i-ll-commit-after-all')).toBeVisible();
  await expect(page.getByTestId('card-action-not-this-time')).toBeVisible();
  await expectStoredCard(page, (card) => card.id === 'commitment-card' && !card.commitmentStatusToday);
});

test('I’ll commit after all records made and shows acknowledgement', async ({ page }) => {
  await seedE2EState(page, [commitmentCard({ commitmentCheckInEnabled: true, commitmentCheckInTime: '12:00' })]);
  await gotoLibrary(page, 'commitment');

  await page.getByTestId('library-row-commitment-card').click();
  await page.getByTestId('card-action-not-this-time').click();
  await page.getByTestId('card-action-i-ll-commit-after-all').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'made');
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_made')).toBe(true);
  await expect(page.getByRole('heading', { name: /Nice choice\.\s+We’ll check in later\./ })).toBeVisible();
  await expect(page.getByTestId('card-action-continue')).toBeVisible();
});

test('final Not this time from motivation records declined and shows soft acknowledgement', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoLibrary(page, 'commitment');

  await page.getByTestId('library-row-commitment-card').click();
  await page.getByTestId('card-action-not-this-time').click();
  await page.getByTestId('card-action-not-this-time').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'declined');
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_declined')).toBe(true);
  await expect(page.getByRole('heading', { name: /That’s okay\.\s+Another day\./ })).toBeVisible();
  await expect(page.getByTestId('card-action-continue')).toBeVisible();
});

test('Not this time without motivation records declined and does not automatically reappear', async ({ page }) => {
  await seedE2EState(page, [commitmentCard({ commitmentReason: '' })]);
  await gotoLauncher(page, 'safari');

  await page.getByTestId('card-action-not-this-time').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'declined');
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_declined')).toBe(true);
  await expect(page.getByRole('heading', { name: /That’s okay\.\s+Another day\./ })).toBeVisible();

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
  await expect(page.getByRole('heading', { name: /Nice choice\.\s+We’ll check in later\./ })).toBeVisible();
  await expect(page.getByTestId('card-action-continue')).toBeVisible();
  await expect(page.getByTestId('card-action-do-something-else')).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByText('How’s it going?')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'go for a walk' })).toBeVisible();
  await expectStoredEvent(page, (event) => event.event_type === 'commitment_check_in_generated');
});

test('check-in does not appear if the user declines the commitment', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentReason: '',
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);
  await gotoLauncher(page, 'safari');

  await page.getByTestId('card-action-not-this-time').click();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByText('How’s it going?')).toHaveCount(0);
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_check_in_generated')).toBe(false);
});

test('check-in is not generated for a commitment made yesterday', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      statusToday: 'doneToday',
      doneDate: yesterdayKey,
      lastShownAt: yesterdayNow,
      commitmentStatusToday: 'made',
      commitmentDecisionDate: yesterdayKey,
      commitmentDecisionAt: yesterdayNow,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);

  await gotoLauncher(page, 'safari');

  await expect(page.getByText('How’s it going?')).toHaveCount(0);
  await expect(page.getByTestId('card-overlay-personal').getByText('TODAY’S COMMITMENT')).toBeVisible();
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_check_in_generated')).toBe(false);
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
  await expect(page.getByText('How’s it going?')).toHaveCount(0);
});

test('in-progress check-in on track keeps commitment active and later shows review', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentLifecycleStatus: 'active',
      commitmentStatusToday: 'made',
      commitmentDecisionDate: '2026-06-01',
      commitmentDecisionAt: now,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);
  await gotoLauncher(page, 'safari');

  await expect(page.getByRole('button', { name: 'I’m on track' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I’m somewhat on track' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Let’s leave this for another day' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m on track' }).click();

  await expectStoredCard(page, (card) =>
    card.id === 'commitment-card' &&
    card.commitmentLifecycleStatus === 'active' &&
    card.commitmentCheckInResponse === 'on_track' &&
    card.commitmentCheckInResponseDate === '2026-06-01' &&
    card.commitmentReviewDueDate === '2026-06-01' &&
    !card.commitmentReviewResponse,
  );
  await expect(page.getByRole('heading', { name: /Good\.\s+Keep going\./ })).toBeVisible();

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  const reviewOverlay = page.getByTestId('card-overlay-personal');
  await expect(reviewOverlay).toContainText('How did it go?');
  await expectTextOrder(reviewOverlay, 'go for a walk', 'How did it go?');
  await expect(page.getByRole('button', { name: 'I did it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I nearly did it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I didn’t do it' })).toBeVisible();
});

test('in-progress check-in somewhat on track triggers encouragement and later review', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentLifecycleStatus: 'active',
      commitmentStatusToday: 'made',
      commitmentDecisionDate: '2026-06-01',
      commitmentDecisionAt: now,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);
  await gotoLauncher(page, 'safari');

  await page.getByRole('button', { name: 'I’m somewhat on track' }).click();
  const encouragementOverlay = page.getByTestId('card-overlay-personal');
  await expect(encouragementOverlay).toContainText('Reminder');
  await expect(encouragementOverlay.getByRole('heading', { name: /I will\s+go for a walk/ })).toBeVisible();
  await expect(encouragementOverlay).toContainText('You said you wanted to do this.');
  await expectTextOrder(encouragementOverlay, 'go for a walk', 'You said you wanted to do this.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expectStoredCard(page, (card) =>
    card.id === 'commitment-card' &&
    card.commitmentLifecycleStatus === 'active' &&
    card.commitmentCheckInResponse === 'somewhat_on_track' &&
    card.commitmentEncouragementRequestedDate === '2026-06-01' &&
    card.commitmentEncouragementCompletedDate === '2026-06-01' &&
    card.commitmentReviewDueDate === '2026-06-01',
  );

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  const reviewOverlay = page.getByTestId('card-overlay-personal');
  await expect(reviewOverlay).toContainText('How did it go?');
  await expectTextOrder(reviewOverlay, 'go for a walk', 'How did it go?');
});

test('in-progress check-in can close commitment early and prevents later review', async ({ page }) => {
  await seedE2EState(page, [
    commitmentCard({
      commitmentLifecycleStatus: 'active',
      commitmentStatusToday: 'made',
      commitmentDecisionDate: '2026-06-01',
      commitmentDecisionAt: now,
      commitmentCheckInEnabled: true,
      commitmentCheckInTime: '12:00',
    }),
  ]);
  await gotoLauncher(page, 'safari');

  await page.getByRole('button', { name: 'Let’s leave this for another day' }).click();
  await expect(page.getByRole('heading', { name: /That’s okay\.\s+We’ll leave this for another day\./ })).toBeVisible();
  await expectStoredCard(page, (card) =>
    card.id === 'commitment-card' &&
    card.commitmentLifecycleStatus === 'closed_early' &&
    card.commitmentCheckInResponse === 'closed_early' &&
    card.commitmentClosedEarlyDate === '2026-06-01' &&
    !card.commitmentReviewDueDate,
  );

  await page.getByTestId('dashboard-shortcut').click();
  await navigateWithinApp(page, '/intercept/youtube');
  await expect(page.getByText('How did it go?')).toHaveCount(0);
  await expect(page.getByText('How’s it going?')).toHaveCount(0);
});

const reviewOutcomeCases = [
  {
    label: 'I did it',
    response: 'did_it',
    finalOutcome: 'completed',
    expected: /You did it\.\s+Hold onto that\./,
  },
  {
    label: 'I nearly did it',
    response: 'nearly_did_it',
    finalOutcome: 'partially_completed',
    expected: /That still counts\.\s+You stayed close to it\./,
  },
  {
    label: 'I didn’t do it',
    response: 'didnt_do_it',
    finalOutcome: 'not_completed',
    expected: /That’s okay\.\s+You can try again another time\./,
  },
] as const;

for (const { label, response, finalOutcome, expected } of reviewOutcomeCases) {
  test(`end review response ${label} records ${finalOutcome}`, async ({ page }) => {
    await seedE2EState(page, [
      commitmentCard({
        commitmentLifecycleStatus: 'active',
        commitmentStatusToday: 'made',
        commitmentDecisionDate: '2026-06-01',
        commitmentDecisionAt: now,
        commitmentCheckInEnabled: true,
        commitmentCheckInTime: '12:00',
        commitmentCheckInResponse: 'on_track',
        commitmentCheckInResponseDate: '2026-06-01',
        commitmentCheckInResponseAt: now,
        commitmentReviewDueDate: '2026-06-01',
      }),
    ]);
    await gotoLauncher(page, 'safari');

    const reviewOverlay = page.getByTestId('card-overlay-personal');
    await expect(reviewOverlay).toContainText('How did it go?');
    await expectTextOrder(reviewOverlay, 'go for a walk', 'How did it go?');
    await page.getByRole('button', { name: label }).click();

    await expectStoredCard(page, (card) =>
      card.id === 'commitment-card' &&
      card.commitmentLifecycleStatus === 'reviewed' &&
      card.commitmentReviewResponse === response &&
      card.commitmentReviewResponseDate === '2026-06-01' &&
      card.commitmentFinalOutcome === finalOutcome,
    );
    await expect(page.getByRole('heading', { name: expected })).toBeVisible();
  });
}

test('long motivation reminder fits inside an iPhone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const longReason =
    'When I start the morning with this, I feel steadier, less reactive, and more like the person I keep saying I want to become. Even a small faithful start changes the tone of the day.';
  await seedE2EState(page, [
    commitmentCard({
      commitmentReason: longReason,
    }),
  ]);
  await gotoLauncher(page, 'safari');

  const commitmentOverlay = page.getByTestId('card-overlay-personal');
  await expect(commitmentOverlay).toContainText('I will go for a walk');

  await page.getByTestId('card-action-not-this-time').click();

  const titleBoxes = page.locator('.commitment-motivation-copy .premium-title-box');
  const buttons = page.locator('.premium-card-cta');
  await expect(page.getByText('Before you decide...')).toBeVisible();
  await expect(page.getByText('You wrote this to yourself:')).toBeVisible();
  await expect(page.getByText(longReason)).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal')).toContainText(longReason);
  await expect(titleBoxes).toHaveCount(2);
  await expect(titleBoxes.nth(0)).toBeVisible();
  await expect(titleBoxes.nth(1)).toBeVisible();
  await expect(buttons).toBeVisible();
  const reasonBox = await titleBoxes.nth(1).boundingBox();
  const buttonsBox = await buttons.boundingBox();
  expect(reasonBox).not.toBeNull();
  expect(buttonsBox).not.toBeNull();
  expect((reasonBox?.y ?? 0) + (reasonBox?.height ?? 0)).toBeLessThanOrEqual((buttonsBox?.y ?? 0) + 1);
});
