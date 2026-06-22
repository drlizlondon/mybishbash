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
    entries[id] = { appEnabled: enabledSet.has(id), useInterruptionPack: enabledSet.has(id), interruptionPaused: false, interruptionPackId: '' };
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
    accessTier = 'free_core',
  }: {
    cards?: Array<Record<string, unknown>>;
    appIds?: string[];
    enabledAppIds?: string[];
    appPauses?: Record<string, string>;
    testerMode?: boolean;
    accessTier?: 'free_core' | 'founding_access' | 'free' | 'premium';
  } = {},
) {
  await page.addInitScript(
    ({ seededCards, seededSettings, seededAppPauses, seededTesterMode, seededAccessTier }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', seededTesterMode ? 'true' : 'false');
      window.localStorage.setItem('MYBISHBASH_E2E_ACCESS_TIER', seededAccessTier);
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
      seededAccessTier: accessTier,
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

test('pause-selects-30min — selecting 30 minutes writes a future expiry and navigates', async ({ page }) => {
  await seedState(page, { cards: [personalCard('p3', 'Pause 30 min card')] });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();

  await page.getByTestId('pause-app-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Tap "30 minutes"
  await page.getByRole('button', { name: '30 minutes' }).click();

  // Confirmation state is shown
  await expect(page.getByText(/Paused for 30 minutes/i)).toBeVisible();

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
  await expect(page.getByTestId('bottom-nav-apps')).toBeVisible();
  await expect(page.getByTestId('apps-list')).toBeVisible();
  await expect(page.getByTestId('apps-list')).toContainText('Your app');
  await expect(page.getByTestId('apps-list')).toContainText('No added apps yet.');
  await expect(page.getByTestId('apps-add-more')).toContainText('More apps');
  await expect(page.getByText('MyBishBash installed')).toHaveCount(0);
  await expect(page.getByTestId('create-card-button')).toHaveCount(0);
  await expect(page.getByTestId('apps-option-safari')).toContainText('Available');
  await expect(page.getByTestId('apps-option-safari').getByRole('button', { name: 'Add' })).toBeVisible();
  await expect(page.getByTestId('apps-option-safari').getByRole('button', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByTestId('apps-direct-open-safari')).toHaveCount(0);
  await expect(page.getByTestId('apps-test-shortcut-safari')).toHaveCount(0);
  await expect(page.getByText('Replace icon')).toHaveCount(0);
  await expect(page.getByText('Add shortcut')).toHaveCount(0);
  await expect(page.getByText('Home-screen shortcut coming soon.')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav-settings')).toHaveCount(0);
  await expect(page.getByTestId('settings-gear')).toBeVisible();
  const navLabels = await page.locator('.bottom-nav .nav-item span').allTextContents();
  expect(navLabels).toEqual(['Home', 'Library', 'Log', 'Explore', 'Apps']);
});

test('account-menu-opens-above-app-controls — account menu is the top layer', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps-account', 'Account menu card')], enabledAppIds: ['safari'], testerMode: false });
  await page.goto('/mybishbash/apps');

  await page.getByTestId('settings-gear').click();
  const menu = page.getByTestId('account-menu');
  await expect(menu).toBeVisible();

  const menuButtonsAreTopLayer = await menu.evaluate((element) => {
    const buttons = Array.from(element.querySelectorAll('button'));
    return buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(topElement?.closest('[data-testid="account-menu"]'));
    });
  });
  expect(menuButtonsAreTopLayer).toBe(true);
});

test('main Apps control centre shows all apps while preserving enabled state', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps-count-zero', 'Apps count zero')], appIds: ['safari', 'youtube'], enabledAppIds: [], testerMode: false });
  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('apps-list')).toContainText('Your app');
  await expect(page.getByTestId('apps-list')).toContainText('No added apps yet.');
  await expect(page.getByTestId('apps-option-safari')).toContainText('Available');
  await expect(page.getByTestId('apps-option-youtube')).toContainText('Available');

  await seedState(page, { cards: [personalCard('apps-count-one', 'Apps count one')], appIds: ['safari', 'youtube'], enabledAppIds: ['safari'], testerMode: false });
  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('protected-app-safari')).toContainText('✓ Enabled');
  await expect(page.getByTestId('apps-option-youtube')).toContainText('Locked');
  await expect(page.getByTestId('apps-option-youtube').getByRole('button', { name: 'Settings' })).toHaveCount(0);

  await seedState(page, { cards: [personalCard('apps-count-two', 'Apps count two')], appIds: ['safari', 'youtube'], enabledAppIds: ['safari', 'youtube'], testerMode: false });
  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('protected-app-safari')).toBeVisible();
  await expect(page.getByTestId('protected-app-youtube')).toBeVisible();
});

test('apps-pause-temporarily — Apps control centre uses the timed app pause flow', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps-pause', 'Apps pause card')], enabledAppIds: ['safari'] });
  await page.goto('/mybishbash/apps/safari');

  await expect(page.getByTestId('apps-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Pause for 30 minutes' }).click();
  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('Paused until');
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBe(0);
  const expiry = await page.evaluate(() => {
    const pauses = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
    return pauses['safari'] ?? null;
  });
  expect(expiry).toBeTruthy();
  expect(new Date(expiry).getTime()).toBeGreaterThan(Date.now());
});

test('apps-more-options — shows simple consumer app options and code link', async ({ page }) => {
  await seedState(page, { cards: [personalCard('apps-pack', 'Apps pack card')] });
  await page.goto('/mybishbash/apps');

  await expect(page.getByTestId('apps-more-options')).toContainText('More apps');
  await expect(page.getByTestId('apps-more-options')).toContainText('Bring myBishBash to more of the apps you use.');
  await expect(page.getByTestId('apps-more-options')).toContainText('WhatsApp');
  await expect(page.getByTestId('apps-more-options')).toContainText('Instagram');
  await expect(page.getByTestId('apps-more-options')).toContainText('YouTube');
  await expect(page.getByTestId('apps-more-options')).toContainText('Safari');
  await expect(page.getByRole('button', { name: 'Have a code?' })).toBeVisible();
  await expect(page.getByText('Slots')).toHaveCount(0);
  await expect(page.getByText('Entitlements')).toHaveCount(0);
});

test('apps-add-another-hides-enabled-apps — active apps do not duplicate in Add Another App', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-no-duplication', 'No duplication card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: ['whatsapp'],
    testerMode: false,
  });
  await page.goto('/mybishbash/apps');

  await expect(page.getByTestId('protected-app-whatsapp')).toContainText('✓ Enabled');
  await expect(page.getByTestId('protected-app-instagram')).toHaveCount(0);
  await expect(page.getByTestId('protected-app-youtube')).toHaveCount(0);
  await expect(page.getByTestId('protected-app-safari')).toHaveCount(0);
  await expect(page.getByTestId('apps-more-options')).toContainText('More apps');
  await expect(page.getByTestId('apps-more-options')).toContainText('Bring myBishBash to more of the apps you use.');
  await expect(page.getByTestId('apps-option-whatsapp')).toHaveCount(0);
  await expect(page.getByTestId('apps-option-instagram')).toBeVisible();
  await expect(page.getByTestId('apps-option-youtube')).toBeVisible();
  await expect(page.getByTestId('apps-option-safari')).toBeVisible();
});

test('apps-add-launcher-in-standalone-shows-safari-setup-interstitial', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-standalone-add', 'Standalone add card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: [],
    testerMode: false,
  });
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia?.bind(window);
    window.matchMedia = (query: string) => {
      if (query === '(display-mode: standalone)') {
        return {
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return nativeMatchMedia?.(query) ?? ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList);
    };
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });
  });
  await page.goto('/mybishbash/apps');

  await page.getByTestId('apps-option-action-instagram').click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(page.getByTestId('apps-setup-interstitial')).toBeVisible();
  await expect(page.getByText('Open in Safari to add this launcher')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open setup page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy setup link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I’ll do this later' })).toBeVisible();
  await expect(page.getByTestId('apps-setup-link')).toContainText('/mybishbash/install/instagram/');
  await page.getByRole('button', { name: 'Copy setup link' }).click();
  await expect(page.getByTestId('apps-setup-interstitial')).toContainText('/mybishbash/install/instagram/');
});

test('apps-free-access-gate — free user cannot silently enable a second app', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-free-gate', 'Free gate card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: ['safari'],
    testerMode: false,
    accessTier: 'free_core',
  });
  await page.goto('/mybishbash/apps');

  await expect(page.getByTestId('protected-app-safari')).toContainText('✓ Enabled');
  await expect(page.getByTestId('apps-option-whatsapp')).toContainText('Locked');
  await expect(page.getByTestId('apps-option-action-whatsapp')).toHaveText('Unlock');
  await expect(page.getByTestId('apps-option-whatsapp').getByRole('button', { name: 'Use code' })).toBeVisible();
  await expect(page.getByTestId('apps-option-whatsapp').getByRole('button', { name: 'Settings' })).toHaveCount(0);
  await page.getByTestId('apps-option-action-whatsapp').click();

  await expect(page.getByTestId('apps-access-screen')).toBeVisible();
  await expect(page.getByText('Add myBishBash to more apps')).toBeVisible();
  await expect(page.getByText('Use myBishBash with more of the apps you open every day.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock More Apps' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Have a code?' })).toBeVisible();
  await expect(page.getByText('slot')).toHaveCount(0);
  await expect(page.getByText('entitlement')).toHaveCount(0);
  await expect(page.getByText('limit reached')).toHaveCount(0);

  const behavior = await page.evaluate(() => {
    const settings = JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}');
    return settings.whatsapp;
  });
  expect(behavior.appEnabled).toBe(false);
  expect(behavior.useInterruptionPack).toBe(false);
});

test('apps-code-flow — logged-in user can unlock more apps and continue to Apps', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-code-flow', 'Code flow card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: ['safari'],
    testerMode: false,
    accessTier: 'free_core',
  });
  await page.goto('/mybishbash/apps');

  await page.getByRole('button', { name: 'Have a code?' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(page.getByTestId('apps-code-screen')).toBeVisible();
  await page.getByLabel('Access code').fill('FULLMELON');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByTestId('apps-code-success')).toBeVisible();
  await expect(page.getByText('You now have access to more apps.')).toBeVisible();
  await expect(page.getByText('You can add myBishBash to more of the apps you use.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Apps' }).click();

  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await page.getByTestId('apps-option-action-whatsapp').click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/whatsapp\/$/);
  await expect(page.getByTestId('apps-access-screen')).toHaveCount(0);
});

test('apps-full-access — full-access user can enable multiple apps', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-full-access', 'Full access card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: ['safari'],
    testerMode: false,
    accessTier: 'founding_access',
  });
  await page.goto('/mybishbash/apps');

  await page.getByTestId('apps-option-action-whatsapp').click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/whatsapp\/$/);
  await page.goto('/mybishbash/apps/whatsapp?installed=1');
  await expect(page.getByTestId('apps-pause-status-whatsapp')).toContainText('myBishBash enabled');
  await expect(page.getByTestId('apps-interruptions-toggle-whatsapp')).not.toBeChecked();
  await expect(page.getByText('Who are you hoping to contact?')).toHaveCount(0);

  const behaviorAfterEnable = await page.evaluate(() => {
    const settings = JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}');
    return settings.whatsapp;
  });
  expect(behaviorAfterEnable.appEnabled).toBe(true);
  expect(behaviorAfterEnable.useInterruptionPack).toBe(false);

  await page.getByTestId('apps-interruptions-toggle-whatsapp').check();
  await expect(page.getByTestId('apps-prompt-preview-whatsapp')).toContainText('Who are you hoping to contact?');

  await page.getByTestId('apps-back-button').click();
  await expect(page.getByTestId('protected-app-safari')).toContainText('✓ Enabled');
  await expect(page.getByTestId('protected-app-whatsapp')).toContainText('✓ Enabled');
});

test('download-logged-in-copy — logged-in install advice does not use signup copy', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('download-logged-in-copy', 'Download copy card')],
    enabledAppIds: ['safari'],
    testerMode: false,
    accessTier: 'free_core',
  });
  await page.goto('/mybishbash/download');

  await expect(page.getByTestId('download-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Install myBishBash', exact: true })).toBeVisible();
  await expect(page.getByText('Add myBishBash to your Home Screen so it opens like an app.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'I’ve installed it' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue in Browser' })).toBeVisible();
  await expect(page.getByText('Before creating your account')).toHaveCount(0);
  await expect(page.getByText('Create account without installing')).toHaveCount(0);
});

test('apps-disabled-app-detail — unavailable app detail does not claim enabled', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-disabled', 'Disabled app card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: [],
    testerMode: false,
  });
  await page.goto('/mybishbash/apps/safari');

  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('myBishBash is not enabled for Safari yet');
  await expect(page.getByTestId('protected-app-safari')).not.toContainText('myBishBash enabled');
  await expect(page.getByTestId('apps-launcher-setup-safari')).toContainText('Add Safari with myBishBash');
  await expect(page.getByTestId('apps-launcher-setup-safari').locator('img')).toHaveAttribute('src', /apple-touch-icon\.png/);
  await expect(page.getByTestId('apps-enable-safari')).toHaveText('Open setup page');
  await expect(page.getByText('Prompt Preview')).toHaveCount(0);
  await expect(page.getByText('Example prompt')).toHaveCount(0);
  await expect(page.getByText('Add shortcut')).toHaveCount(0);
  await expect(page.getByText('Home-screen shortcut coming soon.')).toHaveCount(0);

  await page.getByTestId('apps-enable-safari').click();
  await expect(page).toHaveURL(/\/mybishbash\/install\/safari\/$/);
  await page.goto('/mybishbash/apps/safari?installed=1');
  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('myBishBash enabled');
  await expect(page.getByTestId('apps-interruptions-toggle-safari')).not.toBeChecked();
  await expect(page.getByText('Why are you opening Safari right now?')).toHaveCount(0);

  const behavior = await page.evaluate(() => {
    const settings = JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}');
    return settings.safari;
  });
  expect(behavior.appEnabled).toBe(true);
  expect(behavior.useInterruptionPack).toBe(false);
});

test('home onboarding setup uses Safari handoff in standalone PWA mode', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('home-setup-card', 'Home setup card')],
    appIds: ['youtube', 'instagram', 'safari'],
    enabledAppIds: [],
    testerMode: false,
  });
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia?.bind(window);
    window.matchMedia = (query: string) => {
      if (query === '(display-mode: standalone)') {
        return {
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return nativeMatchMedia?.(query) ?? ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList);
    };
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({
      name: 'Pause Tester',
      timezone: 'Europe/London',
      selectedProtectedApp: 'youtube',
      hasCompletedProtectedAppSetup: false,
      hasCompletedHomeSpotlightTour: true,
    }));
  });

  await page.goto('/mybishbash/home');

  await expect(page.getByTestId('home-onboarding-setup-card')).toContainText('Now add YouTube');
  await expect(page.getByTestId('home-onboarding-setup-card')).toContainText('You picked YouTube during onboarding.');
  await page.getByTestId('home-onboarding-setup-youtube').click();
  await expect(page).toHaveURL(/\/mybishbash\/home$/);
  await expect(page.getByTestId('apps-setup-interstitial')).toBeVisible();
  await expect(page.getByText('Open in Safari to add this launcher')).toBeVisible();
  await expect(page.getByTestId('apps-setup-link')).toContainText('/mybishbash/install/youtube/');
});

test('apps-app-prompts-toggle — prompts off does not disable the app', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-prompts-toggle', 'Prompts toggle card')],
    enabledAppIds: ['safari'],
    testerMode: false,
  });
  await page.goto('/mybishbash/apps/safari');

  const promptsToggle = page.getByTestId('apps-interruptions-toggle-safari');
  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('myBishBash enabled');
  await promptsToggle.uncheck();
  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('myBishBash enabled');
  await expect(page.getByText('Pause for 30 minutes')).toBeVisible();

  const behavior = await page.evaluate(() => {
    const settings = JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}');
    return settings.safari;
  });
  expect(behavior.appEnabled).toBe(true);
  expect(behavior.useInterruptionPack).toBe(false);

  await page.evaluate(() => { window.__MYBISHBASH_NAVIGATION_ATTEMPTS = []; });
  await page.evaluate(() => {
    window.history.pushState({}, '', '/mybishbash/intercept/safari');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('card-overlay-personal')).toContainText('Prompts toggle card');
  await expect.poll(async () => (await getNavigationAttempts(page)).length).toBe(0);

  await page.goto('/mybishbash/apps');
  await expect(page.getByTestId('protected-app-safari')).toContainText('✓ Enabled');
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
    enabledAppIds: ['safari'],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/apps/safari');

  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('Paused until');
  const behaviorWhilePaused = await page.evaluate(() => {
    const settings = JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}');
    return settings.safari;
  });
  expect(behaviorWhilePaused.appEnabled).toBe(true);

  await page.getByTestId('apps-end-pause-inline-safari').click();
  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('myBishBash enabled');

  const expiry = await page.evaluate(() => {
    const pauses = JSON.parse(window.localStorage.getItem('mybishbash.app-pauses.v1') ?? '{}');
    return pauses['safari'] ?? null;
  });
  expect(expiry).toBeNull();

  await page.getByTestId('apps-test-shortcut-safari').click();
  await expect(page).toHaveURL(/\/mybishbash\/intercept\/safari$/);
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('apps-remove-app — removing an app disables it without using prompt state as enabled state', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-remove', 'Remove app card')],
    enabledAppIds: ['safari'],
    testerMode: false,
  });
  await page.goto('/mybishbash/apps/safari');

  await expect(page.getByTestId('apps-pause-status-safari')).toContainText('myBishBash enabled');
  await page.getByRole('button', { name: 'Remove App' }).click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(page.getByTestId('protected-app-safari')).toHaveCount(0);
  await expect(page.getByTestId('apps-option-safari')).toContainText('Available');

  const behavior = await page.evaluate(() => {
    const settings = JSON.parse(window.localStorage.getItem('mybishbash.launcher-behavior-settings.v1') ?? '{}');
    return settings.safari;
  });
  expect(behavior.appEnabled).toBe(false);
  expect(behavior.useInterruptionPack).toBe(false);
});

test('apps-expired-pause-visually-resumes — Apps page clears expired pause without navigation', async ({ page }) => {
  const shortExpiry = new Date(Date.now() + 1500).toISOString();
  await seedState(page, {
    cards: [personalCard('apps-expiry', 'Expiry card')],
    enabledAppIds: ['safari'],
    appPauses: { safari: shortExpiry },
    testerMode: false,
  });
  await page.goto('/mybishbash/apps');

  const safariRow = page.getByTestId('protected-app-safari');
  await expect(safariRow).toContainText('Paused until');
  await expect(safariRow).toContainText('✓ Enabled', { timeout: 5000 });
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
});

test('apps-protected-launch-paused — active pause bypasses only that app', async ({ page }) => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await seedState(page, {
    cards: [personalCard('apps4', 'App-specific protected launch card')],
    appPauses: { safari: futureExpiry },
  });
  await page.goto('/mybishbash/apps/safari');

  await page.getByTestId('apps-test-shortcut-safari').click();
  await expect.poll(async () => (await getNavigationAttempts(page)).length, { timeout: 5000 }).toBe(1);
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);

  await page.evaluate(() => { window.__MYBISHBASH_NAVIGATION_ATTEMPTS = []; });
  await page.goto('/mybishbash/apps/youtube');
  await page.getByTestId('apps-test-shortcut-youtube').click();

  await expect(page).toHaveURL(/\/mybishbash\/intercept\/youtube$/);
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible({ timeout: 5000 });
  const attempts = await getNavigationAttempts(page);
  expect(attempts).toHaveLength(0);
});

test('fake-shell-dashboard shortcut opens only the source app settings with route to main Apps', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps5', 'Manage this app card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mybishbash.installed-launcher-shell.v1',
      JSON.stringify({
        launcher_id: 'safari',
        launch_path: '/intercept/safari',
        updated_at: '2026-06-01T12:00:00.000Z',
      }),
    );
  });
  await page.goto('/mybishbash/intercept/safari');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('manage-app-link')).toHaveCount(0);
  await page.getByTestId('dashboard-shortcut').click();

  await expect(page).toHaveURL(/\/mybishbash\/apps\/safari$/);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('protected-app-safari')).toBeVisible();
  await expect(page.getByTestId('protected-app-whatsapp')).toHaveCount(0);
  await expect(page.getByTestId('protected-app-instagram')).toHaveCount(0);
  await expect(page.getByTestId('protected-app-youtube')).toHaveCount(0);
  await expect(page.getByTestId('apps-interruptions-toggle-safari')).toBeVisible();
  await expect(page.getByTestId('apps-manage-all')).toHaveText('Manage all apps');
  await expect(page.getByText('Pause for 30 minutes')).toBeVisible();
  await expect(page.getByText('Example prompt')).toBeVisible();
  await expect(page.getByTestId('bottom-nav-home')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav-library')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav-log')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav-explore')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav-apps')).toHaveCount(0);
  await expect(page.getByTestId('settings-gear')).toHaveCount(0);
  await expect(page.getByText('Add Another App')).toHaveCount(0);
  await expect(page.getByText('Have a code?')).toHaveCount(0);
  await expect(page.getByText('Premium')).toHaveCount(0);
  await expect(page.getByText('Help')).toHaveCount(0);
  await expect(page.getByText('Remove App')).toHaveCount(0);
  await expect(page.getByText('Test controls')).toHaveCount(0);

  await page.getByTestId('apps-manage-all').click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(page.getByTestId('protected-app-safari')).toBeVisible();
  await expect(page.getByTestId('protected-app-whatsapp')).toBeVisible();
  await expect(page.getByTestId('protected-app-instagram')).toBeVisible();
  await expect(page.getByTestId('protected-app-youtube')).toBeVisible();
});

test('WhatsApp shell only shows WhatsApp controls', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('apps-whatsapp-shell', 'WhatsApp shell card')],
    appIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
    enabledAppIds: ['safari', 'whatsapp', 'instagram', 'youtube'],
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mybishbash.installed-launcher-shell.v1',
      JSON.stringify({
        launcher_id: 'whatsapp',
        launch_path: '/intercept/whatsapp',
        updated_at: '2026-06-01T12:00:00.000Z',
      }),
    );
  });
  await page.goto('/mybishbash/intercept/whatsapp');

  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('dashboard-shortcut').click();

  await expect(page).toHaveURL(/\/mybishbash\/apps\/whatsapp$/);
  await expect(page.getByTestId('protected-app-whatsapp')).toBeVisible();
  await expect(page.getByTestId('protected-app-safari')).toHaveCount(0);
  await expect(page.getByTestId('protected-app-instagram')).toHaveCount(0);
  await expect(page.getByTestId('protected-app-youtube')).toHaveCount(0);
  await expect(page.getByTestId('apps-manage-all')).toHaveText('Manage all apps');
});

test('main app cards do not inherit stale app context after Manage all apps', async ({ page }) => {
  await seedState(page, {
    cards: [personalCard('today-shell-leak', 'Today shell leak card')],
    appIds: ['whatsapp', 'instagram'],
    enabledAppIds: ['whatsapp', 'instagram'],
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mybishbash.installed-launcher-shell.v1',
      JSON.stringify({
        launcher_id: 'whatsapp',
        launch_path: '/intercept/whatsapp',
        updated_at: '2026-06-01T12:00:00.000Z',
      }),
    );
    window.sessionStorage.setItem(
      'mybishbash.active-protected-app-context.v1',
      JSON.stringify({
        launcherId: 'instagram',
        updatedAt: Date.now(),
      }),
    );
  });

  await page.goto('/mybishbash/intercept/whatsapp');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await page.getByTestId('dashboard-shortcut').click();

  await expect(page).toHaveURL(/\/mybishbash\/apps\/whatsapp$/);
  await expect(page.getByTestId('protected-app-whatsapp')).toBeVisible();
  await expect(page.getByTestId('protected-app-instagram')).toHaveCount(0);
  await expect(page.getByTestId('bottom-nav-home')).toHaveCount(0);

  await page.getByTestId('apps-manage-all').click();
  await expect(page).toHaveURL(/\/mybishbash\/apps$/);
  await expect(page.getByTestId('active-protected-app-bypass')).toHaveCount(0);

  await page.getByTestId('bottom-nav-home').click();
  await expect(page.getByTestId('home-progress-card')).toBeVisible();
  await page.getByTestId('home-progress-card').click();
  await expect(page.getByTestId('today-personal-card-today-shell-leak')).toBeVisible();
  await page.getByTestId('today-personal-card-today-shell-leak').click();

  await expect(page).toHaveURL(/\/mybishbash\/card\/today-shell-leak$/);
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(page.getByTestId('fake-launcher-instagram')).toHaveCount(0);
  await expect(page.getByTestId('fake-launcher-whatsapp')).toHaveCount(0);
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
