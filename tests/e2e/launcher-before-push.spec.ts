import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
    __MYBISHBASH_LAUNCH_TIMINGS?: Array<{ label: string; t: number; payload: Record<string, unknown> }>;
  }
}

const now = '2026-06-01T12:00:00.000Z';
const destinationByLauncher = {
  safari: /^https:\/\/www\.google\.com$/,
  youtube: /^https:\/\/www\.youtube\.com/,
  instagram: /^https:\/\/www\.instagram\.com/,
};

type LauncherId = keyof typeof destinationByLauncher;
type CardKind = 'personal' | 'pack' | 'caught-up';
type TerminalAction = 'dashboard' | 'continue' | 'action-exit' | 'action-dashboard';

function personalCard(id: string, promptText: string) {
  return {
    id,
    promptText,
    dashboardTitle: promptText,
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
  };
}

function packCard(id: string, promptText: string, sourcePackId = 'qa-pack') {
  return {
    ...personalCard(id, promptText),
    sourcePackId,
    sourcePackTitle: 'QA Pack',
    attribution: 'QA Pack',
  };
}

function actionCard(id: string, title: string, launchUrl = '') {
  return {
    id,
    title,
    body: `${title} instead`,
    category: 'Action',
    launchUrl,
    hidden: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function hiddenStarterActionCards() {
  return ['ac-1', 'ac-2', 'ac-3'].map((id) => ({
    id,
    source: 'starter',
    hidden: true,
    deletedAt: null,
    updatedAt: now,
  }));
}

function launcherSettings(interruptionOn: boolean) {
  return {
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    safari: { useInterruptionPack: interruptionOn, interruptionPaused: false, interruptionPackId: '' },
    youtube: { useInterruptionPack: interruptionOn, interruptionPaused: false, interruptionPackId: '' },
    instagram: { useInterruptionPack: interruptionOn, interruptionPaused: false, interruptionPackId: '' },
  };
}

async function seedState(
  page: Page,
  {
    cards = [],
    actionCards = [],
    interruptionOn = false,
  }: {
    cards?: Array<Record<string, unknown>>;
    actionCards?: Array<Record<string, unknown>>;
    interruptionOn?: boolean;
  },
) {
  await page.addInitScript(
    ({ seededActionCards, seededCards, seededLauncherBehaviorSettings }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.removeItem('bishbash.launchTiming.v1');
      if (window.localStorage.getItem('mybishbash.before-push-seeded.v1') !== 'true') {
        window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
        window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Before Push', timezone: 'Europe/London' }));
        window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
        window.localStorage.setItem('mybishbash.event-log.v1', '[]');
        window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
        window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
        window.localStorage.setItem('mybishbash.action-cards.v1', JSON.stringify(seededActionCards));
        window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededLauncherBehaviorSettings));
        window.localStorage.setItem('mybishbash.before-push-seeded.v1', 'true');
      }
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_LAUNCH_TIMINGS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    {
      seededActionCards: actionCards,
      seededCards: cards,
      seededLauncherBehaviorSettings: launcherSettings(interruptionOn),
    },
  );
}

async function openLauncher(page: Page, launcherId: LauncherId = 'safari') {
  await page.goto(`/mybishbash/intercept/${launcherId}`);
}

async function routeToLauncherInWarmApp(page: Page, launcherId: LauncherId = 'safari') {
  return page.evaluate((id) => {
    window.__MYBISHBASH_LAUNCH_TIMINGS = [];
    window.localStorage.removeItem('bishbash.launchTiming.v1');
    const startedAt = performance.now();
    window.history.pushState({}, '', `/mybishbash/intercept/${id}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return startedAt;
  }, launcherId);
}

async function getLaunchTimings(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_LAUNCH_TIMINGS ?? []);
}

async function expectOverlay(page: Page, kind: CardKind) {
  const testId = kind === 'caught-up' ? 'card-overlay-empty' : `card-overlay-${kind}`;
  await expect(page.getByTestId(testId), `Expected ${kind} launcher overlay`).toBeVisible();
}

async function clickTerminal(page: Page, launcherId: LauncherId, action: TerminalAction) {
  if (action === 'dashboard') {
    await page.getByLabel('Open dashboard').click();
    await expect(page.getByTestId('app-shell'), 'Dashboard shortcut should return to MyBishBash').toBeVisible();
    await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(0);
    return;
  }

  if (action === 'continue') {
    const button = page
      .getByTestId(`card-action-continue-to-${launcherId}`)
      .or(page.getByTestId('card-action-continue-to-app'));
    await button.click();
    await expectDestinationAttempt(page, launcherId);
    return;
  }

  await page.getByTestId('card-action-do-something-else').click();
  await expect(page.getByTestId('card-overlay-action'), 'Action-card terminal should appear').toBeVisible();
  if (action === 'action-dashboard') {
    await page.getByLabel('Open dashboard').click();
    await expect(page.getByTestId('app-shell'), 'Action-card dashboard shortcut should return to MyBishBash').toBeVisible();
    await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(0);
    return;
  }

  await page.getByTestId('card-action-i-ll-do-this').click();
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href, 'Action-card terminal should open the action URL').toBe('https://example.com/before-push-action');
}

async function getNavigationAttempts(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
}

async function expectDestinationAttempt(page: Page, launcherId: LauncherId) {
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href, `${launcherId} should open its configured destination`).toMatch(destinationByLauncher[launcherId]);
  expect(attempt.metadata).toMatchObject({ versionId: launcherId });
}

async function completeFirstCard(page: Page, kind: 'personal' | 'pack') {
  if (kind === 'personal') {
    await page.getByTestId('card-overlay-personal').getByTestId('card-action-done').click();
  } else {
    await page.getByTestId('card-overlay-pack').getByTestId('card-action-continue').click();
  }
}

async function exerciseLayerOneFlow({
  page,
  name,
  kind,
  terminal,
  launcherId = 'safari',
  interruptionOn = false,
}: {
  page: Page;
  name: string;
  kind: 'personal' | 'pack';
  terminal: TerminalAction;
  launcherId?: LauncherId;
  interruptionOn?: boolean;
}) {
  const card = kind === 'personal'
    ? personalCard(`${name}-personal`, `${name} personal card`)
    : packCard(`${name}-pack`, `${name} pack card`);
  const actionCards = ['action-exit', 'action-dashboard'].includes(terminal)
    ? [...hiddenStarterActionCards(), actionCard('before-push-action', 'Before push action', 'https://example.com/before-push-action')]
    : [];

  await seedState(page, { cards: [card], actionCards, interruptionOn });
  await openLauncher(page, launcherId);
  await expectOverlay(page, kind);

  if (terminal === 'dashboard') {
    await clickTerminal(page, launcherId, terminal);
    return;
  }

  await completeFirstCard(page, kind);

  if (interruptionOn) {
    await expect(page.getByTestId('card-overlay-interruption'), `${name} should route to interruption`).toBeVisible();
  } else {
    await expect(page.getByTestId('continue-to-app-card'), `${name} should route to continue card`).toBeVisible();
  }

  await clickTerminal(page, launcherId, terminal);
}

const buttonBranches: Array<{
  name: string;
  kind?: 'personal' | 'pack';
  initial?: 'caught-up' | 'interruption';
  terminal: TerminalAction;
  interruptionOn?: boolean;
}> = [
  { name: 'personal card -> dashboard', kind: 'personal', terminal: 'dashboard' },
  { name: 'personal card -> continue to app', kind: 'personal', terminal: 'continue' },
  { name: 'pack card -> dashboard', kind: 'pack', terminal: 'dashboard' },
  { name: 'pack card -> continue to app', kind: 'pack', terminal: 'continue' },
  { name: 'caught-up -> continue to app', initial: 'caught-up', terminal: 'continue' },
  { name: 'interruption direct -> continue', initial: 'interruption', terminal: 'continue', interruptionOn: true },
  { name: 'interruption direct -> action card -> external/app exit', initial: 'interruption', terminal: 'action-exit', interruptionOn: true },
  { name: 'personal card -> interruption -> continue', kind: 'personal', terminal: 'continue', interruptionOn: true },
  { name: 'pack card -> interruption -> action card -> dashboard', kind: 'pack', terminal: 'action-dashboard', interruptionOn: true },
];

for (const branch of buttonBranches) {
  test(`before-push launcher button branch: ${branch.name}`, async ({ page }) => {
    if (branch.kind) {
      await exerciseLayerOneFlow({
        page,
        name: branch.name,
        kind: branch.kind,
        terminal: branch.terminal,
        interruptionOn: branch.interruptionOn,
      });
      return;
    }

    const actionCards = ['action-exit', 'action-dashboard'].includes(branch.terminal)
      ? [...hiddenStarterActionCards(), actionCard('before-push-action', 'Before push action', 'https://example.com/before-push-action')]
      : [];
    await seedState(page, { cards: [], actionCards, interruptionOn: branch.interruptionOn });
    await openLauncher(page);
    await expectOverlay(page, branch.initial ?? 'caught-up');
    await clickTerminal(page, 'safari', branch.terminal);
  });
}

for (const launcherId of Object.keys(destinationByLauncher) as LauncherId[]) {
  for (const interruptionOn of [false, true]) {
    test(`shared fake launcher template: ${launcherId}, interruption ${interruptionOn ? 'ON' : 'OFF'}, personal card continues to destination`, async ({ page }) => {
      await exerciseLayerOneFlow({
        page,
        name: `${launcherId}-${interruptionOn ? 'on' : 'off'}`,
        kind: 'personal',
        terminal: 'continue',
        launcherId,
        interruptionOn,
      });
    });
  }
}

test('before-push action card after Do Something Else resolves to a launcher continue state', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('action-flow-personal', 'Action flow personal')],
    actionCards: [...hiddenStarterActionCards(), actionCard('action-flow-no-url', 'Action flow no URL')],
    interruptionOn: true,
  });

  await openLauncher(page, 'instagram');
  await expectOverlay(page, 'personal');
  await completeFirstCard(page, 'personal');
  await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
  await page.getByTestId('card-action-do-something-else').click();
  await expect(page.getByTestId('card-overlay-action')).toBeVisible();
  await page.getByTestId('card-action-i-ll-do-this').click();
  await expect(page.getByTestId('card-overlay-action')).toBeVisible();
  await expect(page.getByTestId('card-action-continue-to-instagram')).toBeVisible();
  await page.getByTestId('card-action-continue-to-instagram').click();
  await expectDestinationAttempt(page, 'instagram');
});

test('before-push launcher state does not leak between sequential launches', async ({ page }) => {
  await seedState(page, {
    cards: [
      personalCard('personal-a', 'Personal A'),
      personalCard('personal-b', 'Personal B'),
      personalCard('personal-c', 'Personal C'),
      packCard('pack-a', 'Pack A', 'pack-a'),
      packCard('pack-b', 'Pack B', 'pack-b'),
    ],
    actionCards: [...hiddenStarterActionCards(), actionCard('sequence-action-a', 'Sequence action A')],
    interruptionOn: true,
  });

  await openLauncher(page, 'safari');
  await expect(page.getByTestId('card-overlay-personal').or(page.getByTestId('card-overlay-pack')), 'First launch should show a selectable card').toBeVisible();
  if (await page.getByTestId('card-overlay-personal').isVisible()) {
    await completeFirstCard(page, 'personal');
  } else {
    await completeFirstCard(page, 'pack');
  }
  await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
  await page.getByTestId('card-action-do-something-else').click();
  await expect(page.getByTestId('card-overlay-action')).toBeVisible();
  await page.getByLabel('Open dashboard').click();
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await openLauncher(page, 'safari');
  await expect(page.getByTestId('card-overlay-personal').or(page.getByTestId('card-overlay-pack')), 'Same launcher relaunch should show a fresh eligible card').toBeVisible();
  await page.getByLabel('Open dashboard').click();

  await openLauncher(page, 'youtube');
  await expect(page.getByTestId('card-overlay-personal').or(page.getByTestId('card-overlay-pack')), 'Different launcher sequence should show a valid card').toBeVisible();
  await page.getByLabel('Open dashboard').click();

  await openLauncher(page, 'instagram');
  await expect(page.getByTestId('card-overlay-personal').or(page.getByTestId('card-overlay-pack')), 'Pack/personal sequence should not inherit stale overlay state').toBeVisible();
  await page.getByLabel('Open dashboard').click();

  await openLauncher(page, 'youtube');
  await expect(page.getByTestId('card-overlay-personal').or(page.getByTestId('card-overlay-pack')), 'Personal/pack sequence should stay selectable').toBeVisible();
});

test('before-push caught-up on one launcher does not leak into another valid launcher', async ({ page }) => {
  await seedState(page, {
    cards: [],
    interruptionOn: false,
  });
  await openLauncher(page, 'safari');
  await expectOverlay(page, 'caught-up');
  await page.getByLabel('Open dashboard').click();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('create-card-button').click();
  await page.getByTestId('card-prompt-input').fill('Fresh after caught up');
  await page.getByTestId('save-card-button').click();
  await expect(page.getByText('Fresh after caught up')).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const cards = JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') || '[]');
        return cards.some((card: { promptText?: string }) => card.promptText === 'Fresh after caught up');
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const cards = JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') || '[]');
    const eligibleCards = cards.map((card: { promptText?: string; timingWindows?: string[] }) =>
      card.promptText === 'Fresh after caught up'
        ? { ...card, timingWindows: ['morning', 'day', 'evening', 'night'] }
        : card,
    );
    window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(eligibleCards));
  });

  await openLauncher(page, 'youtube');
  await expectOverlay(page, 'personal');
  await expect(page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Fresh after caught up' })).toBeVisible();
});

test('before-push action-card cycling is capped at three cards and terminal buttons still work', async ({ page }) => {
  await seedState(page, {
    cards: [],
    actionCards: [
      ...hiddenStarterActionCards(),
      actionCard('cycle-a', 'Cycle action A', 'https://example.com/cycle-a'),
      actionCard('cycle-b', 'Cycle action B', 'https://example.com/cycle-b'),
      actionCard('cycle-c', 'Cycle action C', 'https://example.com/cycle-c'),
      actionCard('cycle-d', 'Cycle action D', 'https://example.com/cycle-d'),
    ],
    interruptionOn: true,
  });

  await openLauncher(page);
  await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
  await page.getByTestId('card-action-do-something-else').click();
  await expect(page.getByTestId('card-overlay-action')).toBeVisible();

  const seen = new Set<string>();
  for (let index = 0; index < 3; index += 1) {
    const title = await page.getByTestId('card-overlay-action').locator('h2').textContent();
    expect(title, `Action-card cycle ${index + 1} should show a title`).toBeTruthy();
    seen.add(title ?? '');
    if (index < 2) {
      await page.getByTestId('card-action-another-idea').click();
    }
  }

  expect(seen.size, 'Another idea should move through distinct action cards before the cap').toBe(3);
  await expect(page.getByTestId('card-action-another-idea'), 'Another idea should disappear after three cards').toHaveCount(0);
  await page.getByTestId('card-action-i-ll-do-this').click();
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(1);
  const [attempt] = await getNavigationAttempts(page);
  expect(attempt.href, 'Terminal action-card button should still open the selected action URL').toMatch(/^https:\/\/example\.com\/cycle-/);
});

test('before-push launcher perceived performance stays inside cached-operation budgets', async ({ page }) => {
  await seedState(page, {
    cards: [
      personalCard('perf-personal', 'Performance personal'),
      packCard('perf-pack', 'Performance pack', 'perf-pack-source'),
    ],
    interruptionOn: false,
  });
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  const startedAt = await routeToLauncherInWarmApp(page, 'safari');
  const anyLauncherOverlay = page
    .getByTestId('card-overlay-empty')
    .or(page.getByTestId('card-overlay-personal'))
    .or(page.getByTestId('card-overlay-pack'))
    .or(page.getByTestId('card-overlay-interruption'))
    .or(page.getByTestId('continue-to-app-card'));
  await expect(anyLauncherOverlay, 'Launcher shell should be visible immediately').toBeVisible();
  const visibleAt = await page.evaluate(() => performance.now());
  const visibleMs = visibleAt - startedAt;

  await expect(page.getByTestId('card-overlay-personal').or(page.getByTestId('card-overlay-pack')), 'Cached cards should resolve to a final launcher overlay quickly').toBeVisible();
  const finalAt = await page.evaluate(() => performance.now());
  const finalMs = finalAt - startedAt;
  const timings = await getLaunchTimings(page);
  const labels = timings.map((entry) => entry.label);
  console.log(`[launcher-perf] visible=${visibleMs.toFixed(1)}ms final=${finalMs.toFixed(1)}ms labels=${labels.join(' > ')}`);

  expect(visibleMs, `tap/open to visible launcher overlay was ${visibleMs.toFixed(1)}ms`).toBeLessThanOrEqual(150);
  expect(finalMs, `tap/open to selected card/interruption/empty overlay was ${finalMs.toFixed(1)}ms`).toBeLessThanOrEqual(500);
  expect(labels).toContain('route detected');
  expect(labels).toContain('first overlay visible');
  expect(labels).toContain('auth ready');
  expect(labels).toContain('sync ready');
  expect(labels).toContain('tester status ready');
  expect(labels).toContain('card selection started');
  expect(labels).toContain('card selection finished');
  expect(labels).toContain('final overlay type rendered');
  expect(labels.filter((label) => label === 'card selection started'), 'One launcher activation should start selection once').toHaveLength(1);
  expect(labels.filter((label) => label === 'card selection finished'), 'One launcher activation should finish selection once').toHaveLength(1);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const events = JSON.parse(window.localStorage.getItem('mybishbash.event-log.v1') || '[]');
        return events.filter((event: { event_type?: string }) =>
          event.event_type === 'launcher_session_started' || event.event_type === 'launcher_weighted_session_started',
        ).length;
      }),
    )
    .toBe(1);

  const fullWaits = timings.filter((entry) => Number(entry.payload?.timeoutMs) >= 1800);
  expect(fullWaits, 'Cached launcher operation must not wait for the old 1800ms timeout').toEqual([]);
});
