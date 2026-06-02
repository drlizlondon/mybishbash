import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __lastLauncherSelectionAudit?: {
      selected?: { id?: string; title?: string } | null;
      finalRenderedCard?: string;
      summaryCounts?: Record<string, number>;
    };
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
  }
}

const now = '2026-06-01T12:00:00.000Z';

function packCard(id: string, promptText: string, sourcePackId = 'downloaded-shell-pack') {
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
    sourcePackTitle: 'Downloaded Shell Pack',
    attribution: 'Downloaded Shell Pack',
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

async function seedDownloadedShellState(page: Page, { interruptionOn = false } = {}) {
  await page.addInitScript(
    ({ seededCards, seededLauncherBehaviorSettings }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('bishbash.launchAudit.enabled', 'true');
      if (window.localStorage.getItem('mybishbash.downloaded-shell-seeded.v1') !== 'true') {
        window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
        window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Downloaded Shell', timezone: 'Europe/London' }));
        window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
        window.localStorage.setItem('mybishbash.event-log.v1', '[]');
        window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
        window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
        window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
        window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededLauncherBehaviorSettings));
        window.localStorage.setItem('mybishbash.downloaded-shell-seeded.v1', 'true');
      }
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    {
      seededCards: [
        packCard('downloaded-shell-pack-a', 'Downloaded shell pack A'),
        packCard('downloaded-shell-pack-b', 'Downloaded shell pack B'),
        packCard('downloaded-shell-pack-c', 'Downloaded shell pack C'),
      ],
      seededLauncherBehaviorSettings: launcherSettings(interruptionOn),
    },
  );
}

async function waitForLauncherCard(page: Page) {
  const launcherCard = page.getByTestId('card-overlay-pack').or(page.getByTestId('card-overlay-personal'));
  await expect(launcherCard, 'Downloaded shell open should render a selectable personal/pack card, not caught-up').toBeVisible();
  await expect(page.getByTestId('card-overlay-empty'), 'Downloaded shell open should not render caught-up while pack cards exist').toHaveCount(0);
}

async function readTrace(page: Page) {
  return page.evaluate(() => {
    const audit = window.__lastLauncherSelectionAudit ?? null;
    const visible =
      document.querySelector('[data-testid="card-overlay-pack"]') ? 'pack'
        : document.querySelector('[data-testid="card-overlay-personal"]') ? 'personal'
          : document.querySelector('[data-testid="card-overlay-interruption"]') ? 'interruption'
            : document.querySelector('[data-testid="continue-to-app-card"]') ? 'continue'
              : document.querySelector('[data-testid="card-overlay-empty"]') ? 'caught-up'
                : 'none';
    return {
      visible,
      selectedId: audit?.selected?.id ?? null,
      selectedTitle: audit?.selected?.title ?? null,
      finalRenderedCard: audit?.finalRenderedCard ?? null,
      counts: audit?.summaryCounts ?? {},
    };
  });
}

async function completeRoundToHome(page: Page, round: number) {
  await waitForLauncherCard(page);
  const trace = await readTrace(page);
  console.log(
    `[downloaded-shell:${round}] card=${trace.visible} selected=${trace.selectedId ?? '(none)'} title="${trace.selectedTitle ?? ''}" counts=${JSON.stringify(trace.counts)}`,
  );

  if (await page.getByTestId('card-overlay-pack').isVisible()) {
    await page.getByTestId('card-overlay-pack').getByTestId('card-action-continue').click();
  } else {
    await page.getByTestId('card-overlay-personal').getByTestId('card-action-done').click();
  }

  await expect(page.getByTestId('continue-to-app-card')).toBeVisible();
  console.log(`[downloaded-shell:${round}] terminal=back-to-mybishbash`);
  await page.getByTestId('card-action-back-to-mybishbash').click();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
}

test('downloaded shell can be opened repeatedly from its manifest start URL', async ({ page }) => {
  await seedDownloadedShellState(page, { interruptionOn: false });

  for (let round = 1; round <= 3; round += 1) {
    console.log(`[downloaded-shell:${round}] open=/mybishbash/intercept/safari`);
    await page.goto('/mybishbash/intercept/safari');
    await completeRoundToHome(page, round);
    await page.waitForTimeout(2000);
  }
});

test('downloaded shell resume rebuilds the launcher flow on the same intercept route', async ({ page }) => {
  await seedDownloadedShellState(page, { interruptionOn: false });

  await page.goto('/mybishbash/intercept/safari');
  await completeRoundToHome(page, 1);
  await page.goto('/mybishbash/intercept/safari');
  await waitForLauncherCard(page);

  console.log('[downloaded-shell:lifecycle] simulate pagehide -> pageshow on /mybishbash/intercept/safari');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));

  await waitForLauncherCard(page);
  const trace = await readTrace(page);
  console.log(
    `[downloaded-shell:lifecycle] card=${trace.visible} selected=${trace.selectedId ?? '(none)'} title="${trace.selectedTitle ?? ''}" counts=${JSON.stringify(trace.counts)}`,
  );
  expect(trace.visible).toMatch(/^(pack|personal)$/);
  expect(trace.counts.eligiblePackCards).toBeGreaterThan(0);
});
