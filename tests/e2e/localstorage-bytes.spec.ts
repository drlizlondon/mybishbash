/**
 * Phase 4b behavioural invariant 1: persistence payloads are byte-identical.
 *
 * Drives a scripted session through the REAL app for every handler this phase
 * extracts, dumps the resulting localStorage, normalises only the genuinely
 * volatile parts (generated UUIDs), and compares against a baseline captured
 * at the pre-extraction commit.
 *
 * Expected diff at every Phase 4b commit: EMPTY. A non-empty diff is a rollback
 * trigger, not something to re-baseline. Re-baseline ONLY when a packet
 * deliberately changes a payload, and say so in the commit message.
 *
 *   Capture:  MYBISHBASH_BYTES_BASELINE=1 npx playwright test tests/e2e/localstorage-bytes.spec.ts
 *   Compare:  npm run test:localstorage-bytes
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/localstorage-bytes.baseline.json',
);
const CAPTURING = process.env.MYBISHBASH_BYTES_BASELINE === '1';

const now = '2026-06-01T12:00:00.000Z';
const todayKey = '2026-06-01';

/** Keys whose bytes this phase must not disturb. */
const TRACKED_KEYS = [
  'mybishbash.cards.v1',
  'mybishbash.event-log.v1',
  'mybishbash.offline-event-queue.v1',
  'mybishbash.action-cards.v1',
  'mybishbash.setup-complete.v1',
  'mybishbash.profile.v1',
];

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

function personalCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'personal-card',
    cardKind: 'personal',
    promptText: 'take a steady breath',
    dashboardTitle: 'take a steady breath',
    theme: 'Minimal',
    icon: 'heart',
    statusToday: 'fresh',
    frequency: 'once_daily',
    timingWindows: ['morning', 'day', 'evening', 'night'],
    paused: false,
    disliked: false,
    deletedAt: null,
    doneDate: null,
    lastShownAt: null,
    notYetUntil: null,
    createdAt: now,
    updatedAt: now,
    sourcePackId: null,
    ...overrides,
  };
}

async function seedE2EState(page: Page, cards: Array<Record<string, unknown>> = []) {
  await page.addInitScript(({ seededCards, fixedNow }) => {
    const RealDate = Date;
    // addInitScript re-runs on EVERY navigation. Seed once, or each in-session
    // page load silently rewinds the very state we are measuring.
    const alreadySeeded = window.localStorage.getItem('MYBISHBASH_BYTES_SEEDED') === 'true';
    class FixedDate extends RealDate {
      constructor(...args: any[]) {
        super(...(args.length === 0 ? [fixedNow] : args));
      }
      static now() {
        return new RealDate(fixedNow).getTime();
      }
    }
    window.Date = FixedDate as DateConstructor;
    if (alreadySeeded) return;
    window.localStorage.setItem('MYBISHBASH_BYTES_SEEDED', 'true');

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

/**
 * Generated ids (crypto.randomUUID) and event ids are the only legitimately
 * volatile bytes. Replace them positionally so a *reordering* or a *missing*
 * record still shows as a diff, while a fresh uuid does not.
 */
function normalise(dump: Record<string, string | null>) {
  const seen = new Map<string, string>();
  const stableId = (value: string) => {
    if (!seen.has(value)) seen.set(value, `<id-${seen.size + 1}>`);
    return seen.get(value)!;
  };
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  const fallbackId = /\bmybishbash-\d+-[a-z0-9]{8}\b/gi;
  const out: Record<string, unknown> = {};
  for (const key of TRACKED_KEYS) {
    const raw = dump[key];
    if (raw == null) { out[key] = null; continue; }
    const masked = raw.replace(uuid, stableId).replace(fallbackId, stableId);
    try {
      out[key] = JSON.parse(masked);
    } catch {
      out[key] = masked;
    }
  }
  return out;
}

async function dump(page: Page) {
  // The cardsStore save is a 120ms trailing debounce; let it flush before
  // reading, otherwise the snapshot measures timing, not payload.
  await page.waitForTimeout(500);
  const raw = await page.evaluate((keys) => {
    const result: Record<string, string | null> = {};
    for (const key of keys) result[key] = window.localStorage.getItem(key);
    return result;
  }, TRACKED_KEYS);
  return normalise(raw);
}

const captured: Record<string, unknown> = {};

function record(name: string, snapshot: unknown) {
  captured[name] = snapshot;
  if (CAPTURING) return;
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  expect(
    snapshot,
    `localStorage bytes drifted for session "${name}". This is a Phase 4b rollback trigger.`,
  ).toEqual(baseline[name]);
}

test.afterAll(() => {
  if (!CAPTURING) return;
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  const existing = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...existing, ...captured }, null, 2)}\n`);
});

// Serial: every session writes the same baseline file section.
test.describe.configure({ mode: 'serial' });

/** A commitment that has been made today and whose check-in is now due. */
function checkInDueCard(overrides: Record<string, unknown> = {}) {
  return commitmentCard({
    statusToday: 'doneToday',
    doneDate: todayKey,
    lastShownAt: now,
    commitmentStatusToday: 'made',
    commitmentLifecycleStatus: 'active',
    commitmentDecisionDate: todayKey,
    commitmentDecisionAt: now,
    commitmentCheckInEnabled: true,
    commitmentCheckInTime: '09:00',
    ...overrides,
  });
}

test('bytes: handleSaveCard, handleDuplicateCard, handleResetItem, handleAction', async ({ page }) => {
  await seedE2EState(page, [personalCard()]);
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  // handleSaveCard — create a commitment card through the composer.
  await page.getByTestId('create-card-button').click();
  await page.getByRole('button', { name: 'Commitment Card' }).click();
  await page.getByTestId('commitment-text-input').fill('drink some water');
  await page.getByTestId('commitment-reason-input').fill('It keeps me steady.');
  await page.getByTestId('save-commitment-card-button').click();
  await expect(page.getByTestId('app-shell')).toBeVisible();

  // handleDuplicateCard + handleResetItem via the library row menu.
  await page.goto('/mybishbash/library');
  await page.getByTestId('library-personal-section-toggle').click();
  const row = page.getByTestId('library-row-personal-card');
  await expect(row).toBeVisible();
  await row.getByLabel('Card options').click();
  const duplicate = row.getByRole('button', { name: 'Duplicate', exact: true });
  await expect(duplicate).toBeVisible();
  await duplicate.dispatchEvent('click');
  // Assert the duplicate landed: a silent no-op here would under-cover the
  // handler while the snapshot still compared equal.
  await expect.poll(async () => page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('mybishbash.cards.v1') || '[]')
      .filter((card: any) => card.promptText === 'take a steady breath').length,
  )).toBe(2);

  await row.getByLabel('Card options').click();
  const reset = row.getByRole('button', { name: 'Reset for today', exact: true });
  await expect(reset).toBeVisible();
  await reset.dispatchEvent('click');

  // handleAction — complete the seeded personal card.
  await page.goto('/mybishbash/card/personal-card');
  await page.getByTestId('card-action-done').click();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);

  record('card-handlers', await dump(page));
});

test('bytes: handleCommitmentAction — commit', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await page.goto('/mybishbash/card/commitment-card');
  await page.getByTestId('card-action-i-will-commit-to-this').click();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  record('commitment-commit', await dump(page));
});

test('bytes: handleCommitmentAction — decline through the motivation screen', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await page.goto('/mybishbash/card/commitment-card');
  await page.getByTestId('card-action-not-this-time').click();
  await expect(page.getByTestId('card-action-i-ll-commit-after-all')).toBeVisible();
  await page.getByTestId('card-action-not-this-time').click();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  record('commitment-decline', await dump(page));
});

test('bytes: handleCommitmentAction — commit after all', async ({ page }) => {
  await seedE2EState(page, [commitmentCard()]);
  await page.goto('/mybishbash/card/commitment-card');
  await page.getByTestId('card-action-not-this-time').click();
  await page.getByTestId('card-action-i-ll-commit-after-all').click();
  await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
  record('commitment-commit-after-all', await dump(page));
});

/**
 * PACKET/REALITY NOTE (Phase 4b): the check-in, encouragement and review
 * overlays are not reachable through any UI surface the e2e suite can drive —
 * the existing commitment-cards spec only ever asserts their ABSENCE from
 * launcher flows, and no spec in the repo drives one positively. Their
 * persisted payloads are therefore asserted directly, and more precisely, by
 * the unit tests in src/features/commitments/useCommitmentActions.test.js.
 * Recorded rather than faked: inventing a surface to reach them would be a
 * behaviour change, which this phase forbids.
 */
