/**
 * Custom time-window e2e tests.
 *
 * Verifies that:
 *  - card eligibility respects the user's stored timing-window preferences
 *  - the default (hardcoded) windows work when no prefs are stored
 *  - malformed stored prefs fall back to defaults
 *  - the Settings UI saves new prefs and the change takes effect
 *
 * Time is fixed via page.clock.setFixedTime() — more reliable than overriding
 * window.Date manually.
 */

import { expect, test, type Page } from '@playwright/test';

// ── Types ────────────────────────────────────────────────────────────────────

type WindowDef = { id: string; label: string; start: number; end: number };

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DEFS: WindowDef[] = [
  { id: 'morning', label: 'Morning',        start: 5,  end: 12 },
  { id: 'day',     label: 'During the day', start: 12, end: 18 },
  { id: 'evening', label: 'Evening',        start: 18, end: 23 },
  { id: 'night',   label: 'At night',       start: 23, end: 5  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function card(id: string, promptText: string, timingWindows: string[]) {
  const ts = '2026-06-01T00:00:00.000Z';
  return {
    id,
    promptText,
    dashboardTitle: promptText,
    theme: 'Minimal',
    icon: 'heart',
    frequency: 'once_daily',
    timingWindows,
    paused: false,
    disliked: false,
    deletedAt: null,
    createdAt: ts,
    updatedAt: ts,
    sourcePackId: null,
  };
}

async function seedState(
  page: Page,
  {
    cards = [],
    windowPrefs = null,
    timezone = 'Europe/London',
  }: {
    cards?: Array<Record<string, unknown>>;
    windowPrefs?: WindowDef[] | null;
    timezone?: string;
  } = {},
) {
  await page.addInitScript(
    ({ seededCards, seededWindowPrefs, seededTimezone }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'false');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem(
        'mybishbash.profile.v1',
        JSON.stringify({ name: 'TW Tester', timezone: seededTimezone }),
      );
      window.localStorage.setItem('mybishbash.cards.v1', JSON.stringify(seededCards));
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem(
        'mybishbash.launcher-behavior-settings.v1',
        JSON.stringify({
          mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
          safari:     { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        }),
      );
      if (seededWindowPrefs) {
        window.localStorage.setItem(
          'mybishbash.timing-windows-prefs.v1',
          JSON.stringify(seededWindowPrefs),
        );
      }
      window.__MYBISHBASH_NAVIGATION_ATTEMPTS = [];
      window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
        window.__MYBISHBASH_NAVIGATION_ATTEMPTS?.push({ href, metadata });
        return true;
      };
    },
    { seededCards: cards, seededWindowPrefs: windowPrefs, seededTimezone: timezone },
  );
}

// ── Default window tests ───────────────────────────────────────────────────────

test('default morning window — card eligible at 07:00 BST', async ({ page }) => {
  await seedState(page, {
    cards: [card('tw1', 'Morning card', ['morning'])],
    timezone: 'Europe/London',
  });
  // 06:00 UTC = 07:00 BST (morning window 05–12)
  await page.clock.setFixedTime('2026-06-01T06:00:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Morning card' }),
  ).toBeVisible();
});

test('default windows — night-only card not eligible during business hours', async ({ page }) => {
  // A card scoped to ['night'] (23:00–05:00) should never be eligible during
  // normal test-run hours (09:00–18:00). No clock-mocking needed.
  await seedState(page, {
    cards: [card('tw2', 'Night only card', ['night'])],
    timezone: 'Europe/London',
  });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});

test('default day window — card eligible at 14:00 BST', async ({ page }) => {
  await seedState(page, {
    cards: [card('tw3', 'Day card', ['day'])],
    timezone: 'Europe/London',
  });
  // 13:00 UTC = 14:00 BST (day window 12–18)
  await page.clock.setFixedTime('2026-06-01T13:00:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Day card' }),
  ).toBeVisible();
});

test('default evening window — card eligible at 20:00 BST', async ({ page }) => {
  await seedState(page, {
    cards: [card('tw4', 'Evening card', ['evening'])],
    timezone: 'Europe/London',
  });
  // 19:00 UTC = 20:00 BST (evening window 18–23)
  await page.clock.setFixedTime('2026-06-01T19:00:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Evening card' }),
  ).toBeVisible();
});

test('default night window — card eligible at 23:30 BST (wraps midnight)', async ({ page }) => {
  await seedState(page, {
    cards: [card('tw5', 'Night card', ['night'])],
    timezone: 'Europe/London',
  });
  // 22:30 UTC = 23:30 BST (night window 23–05)
  await page.clock.setFixedTime('2026-06-01T22:30:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Night card' }),
  ).toBeVisible();
});

test('default night window — card eligible at 00:30 BST (after midnight)', async ({ page }) => {
  await seedState(page, {
    cards: [card('tw6', 'After midnight card', ['night'])],
    timezone: 'Europe/London',
  });
  // 23:30 UTC = 00:30 BST next day (still night window, wraps midnight)
  await page.clock.setFixedTime('2026-06-01T23:30:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'After midnight card' }),
  ).toBeVisible();
});

// ── Custom window tests ────────────────────────────────────────────────────────

test('custom window — morning card not eligible when morning shifted to 02:00–03:00', async ({ page }) => {
  // Move "morning" to 02:00–03:00 so it never overlaps with business-hours test runs.
  // A morning-only card is therefore ineligible at any normal test-run hour.
  const unsocialPrefs: WindowDef[] = [
    { id: 'morning', label: 'Morning',        start: 2,  end: 3  },
    { id: 'day',     label: 'During the day', start: 3,  end: 21 },
    { id: 'evening', label: 'Evening',        start: 21, end: 23 },
    { id: 'night',   label: 'At night',       start: 23, end: 2  },
  ];
  await seedState(page, {
    cards: [card('tw7', 'Unsocial morning card', ['morning'])],
    windowPrefs: unsocialPrefs,
    timezone: 'Europe/London',
  });
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});

test('custom narrow morning (08–11) — card eligible at 08:30 BST', async ({ page }) => {
  const narrowPrefs: WindowDef[] = [
    { id: 'morning', label: 'Morning',        start: 8,  end: 11 },
    { id: 'day',     label: 'During the day', start: 11, end: 18 },
    { id: 'evening', label: 'Evening',        start: 18, end: 23 },
    { id: 'night',   label: 'At night',       start: 23, end: 8  },
  ];
  await seedState(page, {
    cards: [card('tw8', 'Narrow morning card', ['morning'])],
    windowPrefs: narrowPrefs,
    timezone: 'Europe/London',
  });
  // 07:30 UTC = 08:30 BST — inside custom morning 08–11
  await page.clock.setFixedTime('2026-06-01T07:30:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Narrow morning card' }),
  ).toBeVisible();
});

test('custom late-night window (01–06) — card eligible at 02:00 BST', async ({ page }) => {
  const latePrefs: WindowDef[] = [
    { id: 'morning', label: 'Morning',        start: 6,  end: 12 },
    { id: 'day',     label: 'During the day', start: 12, end: 18 },
    { id: 'evening', label: 'Evening',        start: 18, end: 1  },
    { id: 'night',   label: 'At night',       start: 1,  end: 6  },
  ];
  await seedState(page, {
    cards: [card('tw9', 'Late night card', ['night'])],
    windowPrefs: latePrefs,
    timezone: 'Europe/London',
  });
  // 01:00 UTC = 02:00 BST — inside custom night window 01–06
  await page.clock.setFixedTime('2026-06-01T01:00:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Late night card' }),
  ).toBeVisible();
});

// ── Malformed prefs fallback ──────────────────────────────────────────────────

test('malformed timing prefs fall back to defaults — morning card shown at 07:00 BST', async ({ page }) => {
  // Seed corrupt prefs string before the normal seedState runs.
  await page.addInitScript(() => {
    window.localStorage.setItem('mybishbash.timing-windows-prefs.v1', '"not-an-array"');
  });
  await seedState(page, {
    cards: [card('tw10', 'Fallback morning card', ['morning'])],
    timezone: 'Europe/London',
  });
  // 06:00 UTC = 07:00 BST — default morning window 05–12
  await page.clock.setFixedTime('2026-06-01T06:00:00.000Z');
  await page.goto('/mybishbash/intercept/safari');
  await expect(page.getByTestId('card-overlay-personal')).toBeVisible();
  await expect(
    page.getByTestId('card-overlay-personal').getByRole('heading', { name: 'Fallback morning card' }),
  ).toBeVisible();
});

// ── Settings UI ───────────────────────────────────────────────────────────────

test('settings — time windows card is visible with all four rows', async ({ page }) => {
  await seedState(page, {});
  await page.goto('/mybishbash/settings');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('timing-windows-settings-card')).toBeVisible();
  for (const id of ['morning', 'day', 'evening', 'night']) {
    await expect(page.getByTestId(`tw-row-${id}`)).toBeVisible();
  }
  // Default start for morning should be 05:00
  await expect(page.getByTestId('tw-start-morning')).toHaveValue('05:00');
});

test('settings — reset to defaults restores 05:00 start for morning', async ({ page }) => {
  await seedState(page, {
    windowPrefs: [
      { id: 'morning', label: 'Morning',        start: 8,  end: 11 },
      { id: 'day',     label: 'During the day', start: 11, end: 18 },
      { id: 'evening', label: 'Evening',        start: 18, end: 23 },
      { id: 'night',   label: 'At night',       start: 23, end: 8  },
    ],
  });
  await page.goto('/mybishbash/settings');
  await expect(page.getByTestId('timing-windows-settings-card')).toBeVisible();
  // Custom value is displayed
  await expect(page.getByTestId('tw-start-morning')).toHaveValue('08:00');
  // Reset
  await page.getByTestId('tw-reset-btn').click();
  await expect(page.getByTestId('tw-start-morning')).toHaveValue('05:00');
});

test('settings — saving non-contiguous windows shows validation error', async ({ page }) => {
  await seedState(page, {});
  await page.goto('/mybishbash/settings');
  await expect(page.getByTestId('timing-windows-settings-card')).toBeVisible();
  // Create a gap: morning ends at 10, day still starts at 12 → gap at 10–12
  await page.getByTestId('tw-end-morning').fill('10:00');
  await page.getByTestId('tw-save-btn').click();
  await expect(page.getByTestId('tw-error')).toBeVisible();
  await expect(page.getByTestId('tw-saved')).toHaveCount(0);
});

test('settings — saving valid custom windows shows confirmation', async ({ page }) => {
  await seedState(page, {});
  await page.goto('/mybishbash/settings');
  await expect(page.getByTestId('timing-windows-settings-card')).toBeVisible();
  // Set a valid contiguous set: morning 08–12, day 12–18, evening 18–23, night 23–08
  await page.getByTestId('tw-start-morning').fill('08:00');
  await page.getByTestId('tw-end-night').fill('08:00');
  await page.getByTestId('tw-save-btn').click();
  await expect(page.getByTestId('tw-saved')).toBeVisible();
  await expect(page.getByTestId('tw-error')).toHaveCount(0);
});

test('settings — narrowing morning to 02:00–03:00 makes morning card ineligible at any business hour', async ({ page }) => {
  // Card eligible with default prefs at some hours; after saving narrow custom
  // prefs (morning = 02:00–03:00), it becomes ineligible at any business-hour run.
  await seedState(page, {
    cards: [card('tw11', 'Settings effect card', ['morning'])],
    timezone: 'Europe/London',
  });
  // Fix the clock inside the DEFAULT morning window (06:00 UTC = 07:00 BST)
  // so the card would be eligible if the saved custom prefs were ignored —
  // this is what makes the assertion meaningful at any wall-clock run time.
  await page.clock.setFixedTime('2026-06-01T06:00:00.000Z');
  await page.goto('/mybishbash/settings');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  // Save custom prefs: move "morning" to 02:00–03:00 (night becomes 23:00–02:00)
  await expect(page.getByTestId('timing-windows-settings-card')).toBeVisible();
  await page.getByTestId('tw-start-morning').fill('02:00');
  await page.getByTestId('tw-end-morning').fill('03:00');
  await page.getByTestId('tw-start-day').fill('03:00');
  await page.getByTestId('tw-end-night').fill('02:00');
  await page.getByTestId('tw-save-btn').click();
  await expect(page.getByTestId('tw-saved')).toBeVisible();

  // Navigate to intercept — morning card is now ineligible at any business-hour run
  await page.evaluate(() => {
    window.history.pushState({}, '', '/mybishbash/intercept/safari');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByTestId('card-overlay-empty')).toBeVisible();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
});
