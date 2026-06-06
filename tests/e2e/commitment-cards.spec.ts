import { expect, test, type Page } from '@playwright/test';

const now = '2026-06-01T12:00:00.000Z';

function commitmentCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'commitment-card',
    cardKind: 'commitment',
    promptText: 'Go for a walk',
    dashboardTitle: "Today’s Commitment",
    commitmentReason: 'Fresh air helps me reset.',
    commitmentStartWindow: 'morning',
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
    }));
  }, { seededCards: cards, fixedNow: now });
}

async function gotoHome(page: Page) {
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();
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

test('creates a Commitment Card through the personal card flow and previews before save', async ({ page }) => {
  await seedE2EState(page);
  await gotoHome(page);

  await page.getByTestId('create-card-button').click();
  await page.getByRole('button', { name: 'Commitment Card' }).click();
  await page.getByTestId('commitment-text-input').fill('Be smoke-free');
  await page.getByTestId('commitment-reason-input').fill('My lungs and patience matter today.');
  await page.getByTestId('commitment-window-select').selectOption('evening');

  const preview = page.getByTestId('commitment-preview');
  await expect(preview.getByText("Today’s Commitment")).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Be smoke-free' })).toBeVisible();
  await expect(preview.getByText('I will commit to this today')).toBeVisible();
  await expect(preview.getByText("I don’t think I can commit to this today")).toBeVisible();
  await expect(page.getByTestId('commitment-self-check').getByText('Does this read naturally with the choices below?')).toBeVisible();

  await page.getByTestId('save-commitment-card-button').click();

  await expectStoredCard(page, (card) =>
    card.cardKind === 'commitment' &&
    card.promptText === 'Be smoke-free' &&
    card.dashboardTitle === "Today’s Commitment" &&
    card.commitmentReason === 'My lungs and patience matter today.' &&
    card.commitmentStartWindow === 'evening' &&
    JSON.stringify(card.timingWindows) === JSON.stringify(['evening', 'night']),
  );
});

test('shows a Commitment Card after its selected window and records first-choice commit', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoHome(page);

  await page.getByTestId('home-card-commitment-card').click();
  await expect(page.getByText("Today’s Commitment")).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Go for a walk' })).toBeVisible();
  await page.getByTestId('card-action-i-will-commit-to-this-today').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'made');
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_made')).toBe(true);
});

test('first cannot-commit choice opens the message from yourself screen', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoHome(page);

  await page.getByTestId('home-card-commitment-card').click();
  await page.getByTestId('card-action-i-don-t-think-i-can-commit-to-this-today').click();

  await expect(page.getByText('Message from yourself')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fresh air helps me reset.' })).toBeVisible();
  await expect(page.getByTestId('card-action-i-ll-commit-after-all')).toBeVisible();
  await expect(page.getByTestId('card-action-i-still-don-t-think-i-can-commit-today')).toBeVisible();
});

test('second screen commit after all records commitment made', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoHome(page);

  await page.getByTestId('home-card-commitment-card').click();
  await page.getByTestId('card-action-i-don-t-think-i-can-commit-to-this-today').click();
  await page.getByTestId('card-action-i-ll-commit-after-all').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'made');
  const events = await storedEvents(page);
  expect(events.some((event: any) => event.event_type === 'commitment_made' && event.metadata?.decisionSource === 'commit_after_all')).toBe(true);
});

test('second screen still cannot commit records commitment declined', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await gotoHome(page);

  await page.getByTestId('home-card-commitment-card').click();
  await page.getByTestId('card-action-i-don-t-think-i-can-commit-to-this-today').click();
  await page.getByTestId('card-action-i-still-don-t-think-i-can-commit-today').click();

  await expectStoredCard(page, (card) => card.id === 'commitment-card' && card.commitmentStatusToday === 'declined');
  const events = await storedEvents(page);
  expect(events.some((event: Record<string, unknown>) => event.event_type === 'commitment_declined')).toBe(true);
});

test('marks a Commitment Card as upcoming before its selected window', async ({ page }) => {
  await seedE2EState(page, [commitmentCard({ timingWindows: ['night'], commitmentStartWindow: 'night' })]);
  await gotoHome(page);

  await expect(page.getByTestId('home-card-commitment-card').getByText('upcoming')).toBeVisible();
});
