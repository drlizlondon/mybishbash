import { expect, test, type Page } from '@playwright/test';

type SeedOptions = {
  testerMode?: boolean;
  cards?: Array<Record<string, unknown>>;
};

const now = '2026-06-22T09:00:00.000Z';

function personalCard(id: string, promptText: string, theme = 'Minimal') {
  return {
    id,
    cardKind: 'personal',
    promptText,
    dashboardTitle: promptText,
    theme,
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening', 'night'],
    statusToday: 'fresh',
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
  };
}

async function seedState(page: Page, { testerMode = false, cards = [personalCard('settings-card', 'Settings card')] }: SeedOptions = {}) {
  await page.addInitScript(
    ({ seededTesterMode, seededCards, timestamp }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', seededTesterMode ? 'true' : 'false');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_AUTH_MOCK', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_AUTH_SESSION', JSON.stringify({
        user: { id: 'settings-polish-user', email: 'settings@example.com' },
      }));
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
        name: 'Settings User',
        timezone: 'Europe/London',
        onboardingCompletedAt: timestamp,
      }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.card-packs.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify({
        mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      }));
    },
    { seededTesterMode: testerMode, seededCards: cards, timestamp: now },
  );
}

test('normal user settings stay polished and hide tester-only controls on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedState(page);
  await page.goto('/mybishbash/settings');

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cards & Timing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apps / Access' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage apps' })).toHaveAttribute('href', '/mybishbash/apps');
  await expect(page.getByRole('link', { name: 'Access options' })).toHaveAttribute('href', '/mybishbash/access');
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/mybishbash/about');
  await expect(page.getByRole('heading', { name: 'Sign out' })).toBeVisible();

  await expect(page.getByTestId('tester-tools-settings-section')).toHaveCount(0);
  await expect(page.getByText('Auth Diagnostics')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh login session' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear all data from this device' })).toHaveCount(0);
  await expect(page.getByText('Morning Summary diagnostics')).toHaveCount(0);
  await expect(page.getByText('Raw summary/debug log')).toHaveCount(0);
  await expect(page.getByText('Mood')).toHaveCount(0);
});

test('tester settings show the separated Tester Tools area', async ({ page }) => {
  await seedState(page, { testerMode: true });
  await page.goto('/mybishbash/settings');

  await expect(page.getByTestId('tester-tools-settings-section')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tester Tools' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear all data from this device' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh login session' })).toBeVisible();
  await expect(page.getByText('Auth Diagnostics')).toBeVisible();
  await expect(page.getByText('Morning Summary diagnostics')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tester reports' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Diagnostics' })).toBeVisible();
});

test('timing controls remain available in Cards & Timing', async ({ page }) => {
  await seedState(page);
  await page.goto('/mybishbash/settings');

  await expect(page.getByRole('heading', { name: 'Cards & Timing' })).toBeVisible();
  await expect(page.getByTestId('timing-windows-settings-card')).toBeVisible();
  await expect(page.getByText('Choose when cards are most likely to appear.')).toBeVisible();
  await expect(page.getByText('Morning, afternoon and evening windows help myBishBash show cards at the right time.')).toBeVisible();
  for (const id of ['morning', 'day', 'evening', 'night']) {
    await expect(page.getByTestId(`tw-row-${id}`)).toBeVisible();
  }
});

test('hidden public theme controls do not break displaying or editing legacy themed cards', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('legacy-theme-card', 'Legacy rainbow card', 'Rainbow')],
  });
  await page.goto('/mybishbash/settings');
  await expect(page.getByText('Mood')).toHaveCount(0);

  await page.goto('/mybishbash/card/legacy-theme-card');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Legacy rainbow card' })).toBeVisible();

  await page.goto('/mybishbash/library');
  await page.getByTestId('library-personal-section-toggle').click();
  const row = page.getByTestId('library-row-legacy-theme-card');
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Card options' }).click();
  const editButton = page.locator('.menu').getByRole('button', { name: 'Edit' });
  await expect(editButton).toBeVisible();
  await editButton.dispatchEvent('click');
  await expect(page.getByTestId('card-composer')).toBeVisible();
  await page.getByTestId('save-card-button').click();
  await expect(page.getByText('Legacy rainbow card')).toBeVisible();
});
