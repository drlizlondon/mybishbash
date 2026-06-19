/**
 * Targeted e2e tests for the app-specific pause button implementation.
 *
 * All tests are self-contained: they seed localStorage via addInitScript and
 * capture navigation attempts through the same hook used by launcher-before-push.spec.ts.
 *
 * Requirements enforced:
 *  - Pause button only appears on intercept / fake-launcher flows
 *  - Tapping pause opens a duration modal (no Cancel button, X closes without pausing)
 *  - Selecting a duration writes a future expiry to localStorage and navigates to the app
 *  - Active pause causes the next intercept to bypass cards entirely (one navigation, no card)
 *  - Pause is per-app: pausing safari does not affect youtube
 *  - Expired pauses are ignored; cards are shown as normal
 *  - Normal card completion still routes to continue-to-app
 *
 * Regression guard (fake-launcher bypass regression):
 *  - Tapping a fake launcher icon with NO active pause must NOT go directly to the app;
 *    it must enter the MyBishBash card/intervention flow.
 *  - Tapping a fake launcher icon WITH an active pause bypasses cards and opens the app.
 *  - Expired pause does not grant bypass when tapped from the fake launcher bar.
 *  - Pause for safari does not bypass card flow for youtube.
 *  - Warm resume after bypass does not keep stale bypass state.
 */

import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __MYBISHBASH_NAVIGATION_ATTEMPTS?: Array<{ href: string; metadata: Record<string, unknown> }>;
    __MYBISHBASH_E2E_CAPTURE_NAVIGATION?: (href: string, metadata: Record<string, unknown>) => boolean;
    __MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH?: (versionId: string, source?: string) => void;
  }
}

const now = '2026-06-08T12:00:00.000Z';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function launcherSettings(appIds: string[], enabledAppIds: string[] = []) {
  const entries: Record<string, object> = {
    mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
  };
  const enabledSet = new Set(enabledAppIds);
  for (const id of appIds) {
    entries[id] = { useInterruptionPack: enabledSet.has(id), interruptionPaused: false, interruptionPackId: '' };
  }
  return entries;
}

/**
 * Seed localStorage before the app boots.
 *
 * @param appPauses  Optional map of appId → ISO expiry string to pre-populate pauses.
 */
async function seedState(
  page: Page,
  {
    cards = [],
    appIds = ['safari', 'youtube'],
    enabledAppIds = [],
    appPauses = {},
    testerMode = true,
  }: {
    cards?: Array<Record<string, unknown>>;
    appIds?: string[];
    enabledAppIds?: string[];
    appPauses?: Record<string, string>;
    testerMode?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({ seededCards, seededSettings, seededAppPauses, seededTesterMode }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', seededTesterMode ? 'true' : 'false');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'Pause Tester', timezone: 'Europe/London' }));
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem('mybishbash.launcher-behavior-settings.v1', JSON.stringify(seededSettings));
      window.localStorage.setItem('mybishbash.app-pauses.v1', JSON.stringify(seededAppPauses));
      // Capture navigation attempts instead of actually leaving the page.
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true; // returning true tells the app to suppress the real navigation
      };
    },
    {
      seededCards: cards,
      seededSettings: launcherSettings(appIds, enabledAppIds),
      seededAppPauses: appPauses,
      seededTesterMode: testerMode,
    },
  );
}

async function getNavigationAttempts(page: Page) {
  return page.evaluate(() => window.__MYBISHBASH_NAVIGATION_ATTEMPTS ?? []);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('pause-button-appears — pause button visible on intercept route', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p1', 'Pause test card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('pause-app-button')).toBeVisible();
});

test('pause-button-absent-home — pause button NOT shown on home screen', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p2', 'Home test card')] });
  await page.goto('/mybishbash/home');
  // The app-shell (home dashboard) should be visible
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('pause-app-button')).toHaveCount(0);
});

test('pause-selects-30min — selecting 30 mins writes a future expiry and navigates', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p3', 'Pause 30 min card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Tap "30 mins"
  await page.getByRole('button', { name: '30 mins' }).click();

  // Confirmation state is shown
  await expect(page.getByText(/Paused for 30 mins/i)).toBeVisible();

  // Navigation attempt fires (after ~1400ms confirmation delay).
  // At least one attempt should be towards the safari destination.
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  const attempts = await getNavigationAttempts(page);
  expect(attempts.some((a) => (a.metadata as Record<string, unknown>)['versionId'] === 'safari')).toBe(true);

  // localStorage should have a future expiry for safari
  const expiry = await page.evaluate(() => {
    try {
      const map = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
      return map['safari'] ?? null;
    } catch { return null; }
  });
  expect(expiry).not.toBeNull();
  expect(new Date(expiry as string).getTime()).toBeGreaterThan(Date.now());
});

test('pause-bypasses-on-reopen — paused app navigates immediately, no card shown', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('p4', 'Bypass card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/intercept/safari');

  // Navigation attempt fires immediately — no card overlay
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBe(1);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);

  // Only ONE navigation attempt (ref guard prevents repeats)
  await page.waitForTimeout(1000);
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(1);
});

test('pause-does-not-affect-other-app — safari paused, youtube shows card normally', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('p5', 'Cross-app card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/intercept/youtube');

  // YouTube is not paused — card overlay should appear
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('pause-expires-restores-card — expired safari pause shows card as normal', async ({ page }) => {
  const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute in the past
  await seedState(page, {
    cards: [personalCard('p6', 'Expired pause card')],
    appPauses: { safari: pastExpiry },
  });
  await page.goto('/mybishbash/intercept/safari');

  // Expired pause → card is shown, no navigation bypass
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('x-button-does-not-pause — closing modal with X leaves no pause in localStorage', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p7', 'X close card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  // Open modal
  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Close with X
  await page.getByTestId('pause-modal-close').click();

  // Modal closes
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // No pause in localStorage for safari
  const expiry = await page.evaluate(() => {
    try {
      const map = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
      return map['safari'] ?? null;
    } catch { return null; }
  });
  expect(expiry).toBeNull();

  // Card is still visible
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('pause-modal-resets-when-card-overlay-key-changes', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('p-reset', 'Reset pause modal card')],
    appIds: ['safari', 'youtube'],
  });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog', { name: 'Pause MyBishBash?' })).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState({}, '', '/mybishbash/intercept/youtube');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page).toHaveURL(/\/mybishbash\/intercept\/youtube$/);
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Pause MyBishBash?' })).toHaveCount(0);
});

test('continue-card-after-normal-completion — Done on personal card shows continue-to-app', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p8', 'Completion card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  // Complete the card
  await page.getByTestId('card-overlay-personal').getByTestId('card-action-done').click();

  // Continue-to-app card must appear
  await expect(page.getByTestId('continue-to-app-card')).toBeVisible({ timeout: 5000 });
});

// ── Fake-launcher bypass regression guard ─────────────────────────────────────
// These tests call window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH (exposed only in
// E2E mode) to simulate a home-screen fake launcher tap without needing a real
// Supabase session. They directly guard against the regression where
// handleFakeLauncherLaunch unconditionally called openDestinationApp.

test('fake-launcher-no-pause-shows-card — fake launcher tap with no pause enters card flow', async ({ page }) => {
  await seedState(page, { cards: [personalCard('fl1', 'Fake launcher card')] });
  await page.goto('/mybishbash/home');

  // Wait for the E2E hook to be available (registered after first render).
  await page.waitForFunction(() => typeof window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH === 'function', { timeout: 5000 });

  // Trigger a fake launcher tap for safari with NO active pause.
  await page.evaluate(() => window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH?.('safari'));

  // The card overlay must appear — no direct navigation to the real app.
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });

  // No navigation attempt must have fired.
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('fake-launcher-with-pause-bypasses — fake launcher tap with active pause skips card flow', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('fl2', 'Bypass card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/home');

  await page.waitForFunction(() => typeof window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH === 'function', { timeout: 5000 });

  // Trigger fake launcher tap — safari IS paused, so direct launch expected.
  await page.evaluate(() => window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH?.('safari'));

  // A navigation attempt must fire directly — no card shown.
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});

test('fake-launcher-expired-pause-shows-card — expired pause does not grant bypass from fake launcher', async ({ page }) => {
  const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('fl3', 'Expired bypass card')],
    appPauses: { safari: pastExpiry },
  });
  await page.goto('/mybishbash/home');

  await page.waitForFunction(() => typeof window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH === 'function', { timeout: 5000 });

  await page.evaluate(() => window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH?.('safari'));

  // Expired pause → card flow, no navigation.
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('fake-launcher-app-specific — safari pause does not bypass card flow for youtube', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('fl4', 'Cross-app fake launcher card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/home');

  await page.waitForFunction(() => typeof window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH === 'function', { timeout: 5000 });

  // Tap youtube — safari is paused but youtube is not.
  await page.evaluate(() => window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH?.('youtube'));

  // YouTube card flow must be entered, no direct navigation.
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('fake-launcher-warm-resume-clears-bypass — revisiting home after bypass does not re-bypass', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('fl5', 'Warm resume card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/home');

  await page.waitForFunction(() => typeof window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH === 'function', { timeout: 5000 });

  // First tap — paused, direct bypass fires.
  await page.evaluate(() => window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH?.('safari'));
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);

  // Clear the pause so next tap should show cards.
  await page.evaluate(() => {
    const pauses = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
    delete pauses['safari'];
    window.localStorage.setItem('mybishbash.app-pauses.v1', JSON.stringify(pauses));
    window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
  });

  // Second tap — no pause now, must enter card flow.
  await page.evaluate(() => window.__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH?.('safari'));
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('apps-route-renders — /apps and Apps nav item are visible', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps1', 'Apps route card')], testerMode: false });
  await page.goto('/mybishbash/apps');

  await expect(page.getByTestId('apps-panel')).toBeVisible();
  await expect(page.getByTestId('apps-status-summary')).toContainText('No apps set up yet.');
  await expect(page.getByTestId('bottom-nav-apps')).toBeVisible();
  await expect(page.getByTestId('apps-list')).toBeVisible();
  await expect(page.getByTestId('protected-app-safari')).toContainText('Not set up');
  await expect(page.getByTestId('apps-direct-open-safari')).toHaveCount(0);
  await expect(page.getByTestId('apps-test-shortcut-safari')).toHaveCount(0);
  await expect(page.getByText('Replace icon')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav-settings')).toHaveCount(0);
  await expect(page.getByTestId('settings-gear')).toBeVisible();
  const navLabels = await page.locator('.bottom-nav .nav-item span').allTextContents();
  expect(navLabels).toEqual(['Home', 'Library', 'Log', 'Explore', 'Apps']);
});

test('apps-counts-configured-enabled-apps-only — zero, one, and multiple states', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps-count-zero', 'Apps count zero')], appIds: ['safari', 'youtube'], enabledAppIds: [], testerMode: false });
  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('apps-status-summary')).toContainText('No apps set up yet.');

  await seedState(page, { cards: [personalCard('apps-count-one', 'Apps count one')], appIds: ['safari', 'youtube'], enabledAppIds: ['safari'], testerMode: false });
  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('apps-status-summary')).toContainText('1 app set up.');
  await expect(page.getByTestId('protected-app-safari')).toContainText('Using MyBishBash');

  await seedState(page, { cards: [personalCard('apps-count-two', 'Apps count two')], appIds: ['safari', 'youtube'], enabledAppIds: ['safari', 'youtube'], testerMode: false });
  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('apps-status-summary')).toContainText('2 apps set up.');
});

test('apps-pause-temporarily — Apps control centre uses the timed app pause flow', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps-pause', 'Apps pause card')] });
  await page.goto('/mybishbash/apps/safari');

  await expect(page.getByTestId('apps-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Pause Temporarily' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '30 mins' }).click();
  await expect(page.getByText(/Paused for 30 mins/i)).toBeVisible();

  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  const expiry = await page.evaluate(() => {
    const pauses = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
    return pauses['safari'] ?? null;
  });
  expect(expiry).toBeTruthy();
  expect(new Date(expiry).getTime()).toBeGreaterThan(Date.now());
});

test('apps-choose-pack — opens Explore without silently activating an app pack', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps-pack', 'Apps pack card')] });
  await page.goto('/mybishbash/apps/safari');

  await page.getByRole('button', { name: 'Choose Pack' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/explore$/);

  const safariBehavior = await page.evaluate(() => {
    const behavior = JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}');
    return behavior.safari;
  });
  expect(safariBehavior.useInterruptionPack).toBe(false);
});

test('home-no-global-fake-launchers — Home no longer shows all fake app shortcut buttons', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps2', 'Quiet home card')] });
  await page.goto('/mybishbash/home');

  await expect(page.getByTestId('home-dashboard-summary')).toBeVisible();
  await expect(page.getByTestId('fake-launcher-safari')).toHaveCount(0);
  await expect(page.getByTestId('fake-launcher-youtube')).toHaveCount(0);
  await expect(page.getByTestId('fake-launcher-instagram')).toHaveCount(0);
});

test('apps-pause-status-and-end-pause — paused app is visible and can resume MyBishBash', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('apps3', 'Resume card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/apps/safari');

  await expect(page.getByTestId('apps-pause-safari')).toBeVisible();
  await expect(page.getByTestId('apps-pause-status-safari')).toContainText(/left|soon/i);

  await page.getByTestId('apps-end-pause-safari').click();
  await expect(page.getByTestId('apps-pause-safari')).toHaveCount(0);
  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('None');

  const expiry = await page.evaluate(() => {
    const pauses = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
    return pauses['safari'] ?? null;
  });
  expect(expiry).toBeNull();

  await page.getByTestId('apps-protected-launch-safari').click();
  await expect(page).toHaveURL(/\/mybishbash\/intercept\/safari$/);
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('apps-protected-launch-paused — active pause bypasses only that app', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('apps4', 'App-specific protected launch card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/apps/safari');

  await page.getByTestId('apps-protected-launch-safari').click();
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBe(1);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);

  await page.evaluate(() => { window.__MYBISHBASH_NAVIGATION_ATTEMPTS = []; });
  await page.goto('/mybishbash/apps/youtube');
  await page.getByTestId('apps-protected-launch-youtube').click();

  await expect(page).toHaveURL(/\/mybishbash\/intercept\/youtube$/);
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('fake-shell-dashboard shortcut opens source app settings', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps5', 'Manage this app card')] });
  await page.goto('/mybishbash/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('manage-app-link')).toHaveCount(0);
  await page.getByTestId('dashboard-shortcut').click();

  await expect(page).toHaveURL(/\/mybishbash\/apps\/safari$/);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('protected-app-safari')).toBeVisible();
  await expect(page.getByTestId('apps-interruptions-toggle-safari')).toBeVisible();
});

test('settings-no-app-behaviour-owner — Settings no longer owns app behaviour management', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps6', 'Settings ownership card')] });
  await page.goto('/mybishbash/settings');

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('apps-list')).toHaveCount(0);
  await expect(page.getByText('Home Screen Shortcuts')).toHaveCount(0);
});

test('no-button-overlap — pause button does not cover dashboard button on mobile viewport', async ({ page }) => {
  // Use a narrow iPhone-style viewport where overlap is most likely.
  await page.setViewportSize({ width: 390, height: 844 });
  await seedState(page, { cards: [personalCard('p9', 'Overlap test card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  const dashBox = await page.getByTestId('dashboard-shortcut').boundingBox();
  const pauseBox = await page.getByTestId('pause-app-button').boundingBox();

  expect(dashBox).not.toBeNull();
  expect(pauseBox).not.toBeNull();

  // Verify no vertical overlap: pause button top must be at or below dashboard bottom.
  const dashBottom = dashBox!.y + dashBox!.height;
  expect(pauseBox!.y).toBeGreaterThanOrEqual(dashBottom - 2); // 2px tolerance for sub-pixel rounding
});
