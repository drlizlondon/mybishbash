import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
  }
}

const now = '2026-06-01T12:00:00.000Z';
const launchers = ['safari', 'youtube', 'instagram'] as const;
const layerOneModes = ['personal', 'pack', 'caught-up', 'interruption-direct'] as const;
const terminals = ['continue', 'home', 'action-exit', 'launcher-safari', 'launcher-youtube', 'launcher-instagram', 'manual-open', 'repeat-continue'] as const;
const destination = {
  safari: /^https:\/\/www\.google\.com$/,
  youtube: /^https:\/\/www\.youtube\.com/,
  instagram: /^https:\/\/www\.instagram\.com/,
};

type LauncherId = (typeof launchers)[number];
type LayerOneMode = (typeof layerOneModes)[number];
type Terminal = (typeof terminals)[number];

function card(id: string, promptText: string, sourcePackId: string | null = null) {
  return {
    id,
    promptText,
    dashboardTitle: promptText,
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening'],
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId,
    sourcePackTitle: sourcePackId ? 'Exhaustive Pack' : undefined,
    attribution: sourcePackId ? 'Exhaustive Pack' : undefined,
  };
}

function actionCard(id: string, title: string, launchUrl = 'https://example.com/exhaustive-action') {
  return { id, title, body: title, category: 'Action', launchUrl, hidden: false, deletedAt: null, createdAt: now, updatedAt: now };
}

async function seed(page: Page, launcherId: LauncherId, mode: LayerOneMode) {
  const cards = mode === 'personal'
    ? [card(`${launcherId}-personal`, `${launcherId} personal`)]
    : mode === 'pack'
      ? [card(`${launcherId}-pack`, `${launcherId} pack`, `${launcherId}-pack-source`)]
      : [];
  const interruptionOn = mode === 'interruption-direct';

  await page.addInitScript(
    ({ seededCards, seededActionCards, seededLauncherBehaviorSettings }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Exhaustive', timezone: 'Europe/London' }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', JSON.stringify(seededActionCards));
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededLauncherBehaviorSettings));
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    {
      seededCards: cards,
      seededActionCards: [
        { id: 'ac-1', source: 'starter', hidden: true, deletedAt: null, updatedAt: now },
        { id: 'ac-2', source: 'starter', hidden: true, deletedAt: null, updatedAt: now },
        { id: 'ac-3', source: 'starter', hidden: true, deletedAt: null, updatedAt: now },
        actionCard('exhaustive-action', 'Exhaustive action'),
      ],
      seededLauncherBehaviorSettings: Object.fromEntries(
        ['mybishbash', ...launchers].map((id) => [id, { useInterruptionPack: id === launcherId ? interruptionOn : false, interruptionPaused: false, interruptionPackId: '' }]),
      ),
    },
  );
}

async function attempts(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
}

async function arriveAtTerminal(page: Page, mode: LayerOneMode) {
  if (mode === 'personal') {
    await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
    await page.getByTestId('card-action-done').click();
    await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
    return;
  }
  if (mode === 'pack') {
    await expect(page.getByTestId('card-overlay-pack')).toBeVisible();
    await page.getByTestId('card-action-continue').click();
    await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
    return;
  }
  if (mode === 'caught-up') {
    await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
    return;
  }
  await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
}

async function exerciseTerminal(page: Page, launcherId: LauncherId, terminal: Terminal) {
  if (terminal === 'home') {
    await expect(page.getByTestId('dashboard-shortcut')).toBeVisible();
    await expect(page.getByLabel('Open dashboard')).toBeVisible();
    await expect(page.getByLabel('Go home')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Back (home|to MyBishBash)/ })).toHaveCount(0);
    return;
  }

  if (terminal === 'action-exit') {
    const chooseElse = page.getByTestId('card-action-do-something-else');
    if (await chooseElse.count()) await chooseElse.click();
    else return;
    await expect(page.getByTestId('card-overlay-action')).toBeVisible();
    const attemptsBeforeAction = (await attempts(page)).length;
    await page.getByTestId('card-action-i-ll-do-this').click();
    await expect(page.getByTestId('card-overlay-action')).toBeVisible();
    await expect(page.getByTestId('dashboard-shortcut')).toBeVisible();
    await expect(page.getByLabel('Open dashboard')).toBeVisible();
    await expect(page.getByLabel('Go home')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Back (home|to MyBishBash)/ })).toBeVisible();
    await expect(page.getByTestId(`card-action-continue-to-${launcherId}`).or(page.getByTestId('card-action-continue-to-app'))).toHaveCount(0);
    await expect.poll(async () => (await attempts(page)).length).toBe(attemptsBeforeAction + 1);
    const attemptList = await attempts(page);
    const attempt = attemptList.at(-1);
    expect(attempt.href).toBe('https://example.com/exhaustive-action');
    return;
  }

  if (terminal.startsWith('launcher-')) {
    const target = terminal.replace('launcher-', '');
    const fakeLauncher = page.getByTestId(`fake-launcher-${target}`);
    if (await fakeLauncher.count()) {
      await fakeLauncher.click();
      await expect.poll(async () => (await attempts(page)).length).toBe(1);
    }
    return;
  }

  const continueButton = page.getByTestId(`card-action-continue-to-${launcherId}`).or(page.getByTestId('card-action-continue-to-app'));
  await continueButton.click();
  await expect.poll(async () => (await attempts(page)).length).toBe(1);
  const [attempt] = await attempts(page);
  expect(attempt.href).toMatch(destination[launcherId]);
}

for (const launcherId of launchers) {
  for (const mode of layerOneModes) {
    for (const terminal of terminals) {
      test(`launcher exhaustive terminal: ${launcherId} / ${mode} / ${terminal}`, async ({ page }) => {
        await seed(page, launcherId, mode);
        await page.goto(`/mybishbash/intercept/${launcherId}`);
        await arriveAtTerminal(page, mode);
        await exerciseTerminal(page, launcherId, terminal);
      });
    }
  }
}
