import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
    __MYBISHBASH_CARD_OVERLAY_MOUNTS?: Array<{ variant: string; at: string; route: string }>;
    __MYBISHBASH_CONTINUE_CARD_MOUNTS?: Array<{ appName: string; href: string; at: string; route: string }>;
    __MYBISHBASH_VISIBLE_OVERLAY_SEQUENCE?: string[];
    __MYBISHBASH_VISIBLE_OVERLAY_OBSERVER?: MutationObserver;
  }
}

const now = '2026-06-01T12:00:00.000Z';
const safariDestination = /^(https:\/\/www\.google\.com|x-safari-https:\/\/www\.google\.com)$/;

type OverlayStep = {
  type: string;
  title: string | null;
  greeting: string | null;
  subtitle: string | null;
  actions: string[];
};

function personalCard(id: string, title: string) {
  return {
    id,
    promptText: title,
    dashboardTitle: title,
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

function packCard(id: string, title: string) {
  return {
    ...personalCard(id, title),
    sourcePackId: 'qa-active-pack',
    sourcePackTitle: 'QA Active Pack',
    attribution: 'QA Active Pack',
  };
}

function launcherSettings(interruptionOn: boolean) {
  return {
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    safari: { useInterruptionPack: interruptionOn, interruptionPaused: false, interruptionPackId: '' },
    youtube: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
    instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
  };
}

async function seedLauncherQaState(
  page: Page,
  {
    cards,
    interruptionOn,
  }: {
    cards: Array<Record<string, unknown>>;
    interruptionOn: boolean;
  },
) {
  await page.addInitScript(
    ({ seededCards, seededLauncherBehaviorSettings }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Launcher QA', timezone: 'Europe/London' }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededLauncherBehaviorSettings));
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    {
      seededCards: cards,
      seededLauncherBehaviorSettings: launcherSettings(interruptionOn),
    },
  );
}

async function openFromFakeHomeLauncher(page: Page) {
  await page.goto('/mybishbash/safari/index.html');
  await expect(page.getByRole('link', { name: 'Open Safari launcher' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Safari launcher' }).click();
  await expect(page).toHaveURL(/\/mybishbash(?:-preview)?\/intercept\/safari$/);
  await expect(page.getByText('Getting your card ready...', { exact: true })).toHaveCount(0);
  await expect(page.getByText('One moment.', { exact: true })).toHaveCount(0);
}

async function readVisibleStep(page: Page): Promise<OverlayStep> {
  return page.evaluate(() => {
    const selectors = [
      ['personal', '[data-testid="card-overlay-personal"]'],
      ['pack', '[data-testid="card-overlay-pack"]'],
      ['interruption', '[data-testid="card-overlay-interruption"]'],
      ['continue-to-app', '[data-testid="continue-to-app-card"]'],
      ['caught-up', '[data-testid="card-overlay-empty"]'],
      ['action-card', '[data-testid="card-overlay-action"]'],
    ] as const;

    for (const [type, selector] of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      return {
        type,
        title: node.querySelector('h1,h2,h3')?.textContent?.trim() || null,
        greeting: node.querySelector('.premium-greeting')?.textContent?.trim() || null,
        subtitle: node.querySelector('.premium-subtitle')?.textContent?.trim() || null,
        actions: Array.from(node.querySelectorAll('button')).map((button) => button.textContent?.trim() || '').filter(Boolean),
      };
    }

    return {
      type: 'none',
      title: null,
      greeting: null,
      subtitle: null,
      actions: [],
    };
  });
}

async function installVisibleOverlayObserver(page: Page) {
  await page.evaluate(() => {
    const selectors = [
      ['personal', '[data-testid="card-overlay-personal"]'],
      ['pack', '[data-testid="card-overlay-pack"]'],
      ['interruption', '[data-testid="card-overlay-interruption"]'],
      ['continue-to-app', '[data-testid="continue-to-app-card"]'],
      ['caught-up', '[data-testid="card-overlay-empty"]'],
      ['action-card', '[data-testid="card-overlay-action"]'],
    ] as const;

    function visibleOverlay() {
      for (const [type, selector] of selectors) {
        if (document.querySelector(selector)) return type;
      }
      return 'none';
    }

    window.__MYBISHBASH_VISIBLE_OVERLAY_SEQUENCE = [];
    let last = '';
    const record = () => {
      const next = visibleOverlay();
      if (next !== last) {
        window.__MYBISHBASH_VISIBLE_OVERLAY_SEQUENCE?.push(next);
        last = next;
      }
    };

    window.__MYBISHBASH_VISIBLE_OVERLAY_OBSERVER?.disconnect();
    window.__MYBISHBASH_VISIBLE_OVERLAY_OBSERVER = new MutationObserver(record);
    window.__MYBISHBASH_VISIBLE_OVERLAY_OBSERVER.observe(document.body, { childList: true, subtree: true });
    record();
  });
}

async function traceLauncherFlow({
  page,
  name,
  cards,
  firstOverlay,
  firstActionTestId,
  interruptionOn,
}: {
  page: Page;
  name: string;
  cards: Array<Record<string, unknown>>;
  firstOverlay: 'personal' | 'pack';
  firstActionTestId: string;
  interruptionOn: boolean;
}) {
  const trace: OverlayStep[] = [];
  await seedLauncherQaState(page, { cards, interruptionOn });

  await openFromFakeHomeLauncher(page);
  await expect(page.getByTestId(`card-overlay-${firstOverlay}`)).toBeVisible();
  trace.push(await readVisibleStep(page));

  await page.getByTestId(`card-overlay-${firstOverlay}`).getByTestId(firstActionTestId).click();

  if (interruptionOn) {
    await expect(page.getByTestId('card-overlay-interruption')).toBeVisible();
    trace.push(await readVisibleStep(page));
    await page.getByTestId('card-action-continue-to-safari').click();
  } else {
    await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
    trace.push(await readVisibleStep(page));
    await page.getByTestId('card-action-continue-to-safari').click();
  }

  await expect.poll(async () => (await page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? [])).length).toBe(1);
  const [attempt] = await page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
  expect(attempt.href).toMatch(safariDestination);

  console.log(`\n[launcher-flow-trace] ${name}`);
  for (const [index, step] of trace.entries()) {
    console.log(`${index + 1}. ${step.type}: ${step.title ?? '(no title)'}`);
    if (step.greeting) console.log(`   greeting: ${step.greeting}`);
    if (step.subtitle) console.log(`   subtitle: ${step.subtitle}`);
    console.log(`   actions: ${step.actions.join(' | ') || '(none)'}`);
  }
  console.log(`3. destination: ${attempt.href}`);
}

test('QA trace: fake home launcher, interruption OFF, personal card then continue-to-app', async ({ page }) => {
  await traceLauncherFlow({
    page,
    name: 'interruption OFF / personal first',
    cards: [personalCard('qa-personal-off', 'QA personal card before continue')],
    firstOverlay: 'personal',
    firstActionTestId: 'card-action-done',
    interruptionOn: false,
  });
});

test('QA trace: fake home launcher, interruption ON, personal card then interruption', async ({ page }) => {
  await traceLauncherFlow({
    page,
    name: 'interruption ON / personal first',
    cards: [personalCard('qa-personal-on', 'QA personal card before interruption')],
    firstOverlay: 'personal',
    firstActionTestId: 'card-action-done',
    interruptionOn: true,
  });
});

test('QA trace: fake home launcher, interruption OFF, pack card then continue-to-app', async ({ page }) => {
  await traceLauncherFlow({
    page,
    name: 'interruption OFF / pack first',
    cards: [packCard('qa-pack-off', 'QA pack card before continue')],
    firstOverlay: 'pack',
    firstActionTestId: 'card-action-continue',
    interruptionOn: false,
  });
});

test('QA trace: fake home launcher, interruption ON, pack card then interruption', async ({ page }) => {
  await traceLauncherFlow({
    page,
    name: 'interruption ON / pack first',
    cards: [packCard('qa-pack-on', 'QA pack card before interruption')],
    firstOverlay: 'pack',
    firstActionTestId: 'card-action-continue',
    interruptionOn: true,
  });
});

test('fake launcher reveal-to-continue does not flicker when an update is available', async ({ page }) => {
  await page.route('**/version.json?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: 'preview-newer-than-current',
        sourceSha: 'newer-than-current',
        builtAt: now,
      }),
    });
  });
  await seedLauncherQaState(page, {
    cards: [personalCard('qa-no-flicker', 'QA no flicker before continue')],
    interruptionOn: false,
  });

  await openFromFakeHomeLauncher(page);
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByText('Update available')).toHaveCount(0);

  await installVisibleOverlayObserver(page);
  let documentLoads = 0;
  page.on('load', () => {
    documentLoads += 1;
  });
  await page.waitForLoadState('networkidle');
  documentLoads = 0;

  await page.getByTestId('card-action-done').click();

  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  await expect(page.getByText('Update available')).toHaveCount(0);
  await expect(page).toHaveURL(/\/mybishbash(?:-preview)?\/intercept\/safari$/);

  const sequence = await page.evaluate(() => window.__MYBISHBASH_VISIBLE_OVERLAY_SEQUENCE ?? []);
  expect(sequence).toEqual(['personal', 'continue-to-app']);

  const continueMounts = await page.evaluate(() => window.__MYBISHBASH_CONTINUE_CARD_MOUNTS ?? []);
  expect(continueMounts).toHaveLength(1);

  const overlayMounts = await page.evaluate(() => window.__MYBISHBASH_CARD_OVERLAY_MOUNTS ?? []);
  expect(overlayMounts.filter((mount) => mount.variant === 'personal')).toHaveLength(1);
  expect(documentLoads, 'reveal-to-continue should not trigger a document reload').toBe(0);
});
