import { expect, test, type Page } from '@playwright/test';

const DB_NAME = 'mybishbash';
const CARDS_KEY = 'mybishbash.cards.v1';
const ENGINE_KEY = 'mybishbash.storage-engine.v1';
const MIGRATION_META_KEY = 'migratedFromLocalStorage';
const SEED_SENTINEL_KEY = 'MYBISHBASH_E2E_STORAGE_MIGRATION_SEEDED';
const now = '2026-07-30T12:00:00.000Z';

type DbStoreName = 'kv' | 'meta';
type MigrationMeta = { at: string; appVersion: string };
type StoredCard = Record<string, unknown> & { id?: string; promptText?: string };

const migrationCard: StoredCard = {
  id: 'migration-card',
  cardKind: 'personal',
  promptText: 'Legacy migration card',
  dashboardTitle: 'Legacy migration card',
  theme: 'Minimal',
  icon: 'heart',
  frequency: 'once_daily',
  timingWindows: ['morning', 'day', 'evening', 'night'],
  statusToday: 'fresh',
  paused: false,
  disliked: false,
  deletedAt: null,
  doneDate: null,
  lastShownAt: null,
  notYetUntil: null,
  sourcePackId: null,
  createdAt: now,
  updatedAt: now,
};

const legacyCardsBytes = JSON.stringify([migrationCard]);

async function idbGet<T>(page: Page, storeName: DbStoreName, key: string): Promise<T | null> {
  return page.evaluate(
    ({ databaseName, requestedStore, requestedKey }) =>
      new Promise<T | null>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onupgradeneeded = () => {
          request.transaction?.abort();
        };
        request.onerror = () => reject(new Error(request.error?.message ?? 'IndexedDB open failed'));
        request.onsuccess = () => {
          const db = request.result;
          let transaction: IDBTransaction;
          try {
            transaction = db.transaction(requestedStore, 'readonly');
          } catch (error) {
            db.close();
            reject(error);
            return;
          }

          let value: T | null = null;
          const getRequest = transaction.objectStore(requestedStore).get(requestedKey);
          getRequest.onsuccess = () => {
            value = getRequest.result === undefined ? null : (getRequest.result as T);
          };
          transaction.oncomplete = () => {
            db.close();
            resolve(value);
          };
          transaction.onerror = () => {
            const message = transaction.error?.message ?? 'IndexedDB read failed';
            db.close();
            reject(new Error(message));
          };
          transaction.onabort = transaction.onerror;
        };
      }),
    { databaseName: DB_NAME, requestedStore: storeName, requestedKey: key },
  );
}

async function idbPutMany(page: Page, entries: Array<[string, string]>) {
  await page.evaluate(
    ({ databaseName, values }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onupgradeneeded = () => {
          request.transaction?.abort();
        };
        request.onerror = () => reject(new Error(request.error?.message ?? 'IndexedDB open failed'));
        request.onsuccess = () => {
          const db = request.result;
          let transaction: IDBTransaction;
          try {
            transaction = db.transaction('kv', 'readwrite');
          } catch (error) {
            db.close();
            reject(error);
            return;
          }

          const store = transaction.objectStore('kv');
          values.forEach(([key, value]) => store.put(value, key));
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            const message = transaction.error?.message ?? 'IndexedDB write failed';
            db.close();
            reject(new Error(message));
          };
          transaction.onabort = transaction.onerror;
        };
      }),
    { databaseName: DB_NAME, values: entries },
  );
}

function parseCards(raw: string | null): StoredCard[] {
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function readCardsFromIdb(page: Page) {
  return parseCards(await idbGet<string>(page, 'kv', CARDS_KEY));
}

async function readCardsFromLocalStorage(page: Page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), CARDS_KEY);
  return parseCards(raw);
}

function promptForCard(cards: StoredCard[], cardId: string) {
  return cards.find((card) => card.id === cardId)?.promptText ?? null;
}

async function expectCardInIdb(page: Page, cardId: string, promptText: string) {
  await expect
    .poll(async () => promptForCard(await readCardsFromIdb(page), cardId))
    .toBe(promptText);
}

async function showPersonalSection(page: Page) {
  const toggle = page.getByTestId('library-personal-section-toggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

async function editCard(page: Page, cardId: string, promptText: string) {
  await page.goto('/mybishbash/library');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await showPersonalSection(page);

  const row = page.getByTestId(`library-row-${cardId}`);
  await expect(row).toBeVisible();
  await row.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await row.getByRole('button', { name: 'Card options' }).click();
  await page.locator('.menu').getByRole('button', { name: 'Edit' }).dispatchEvent('click');
  await expect(page.getByTestId('card-composer')).toBeVisible();
  await page.getByTestId('card-prompt-input').fill(promptText);
  await page.getByTestId('save-card-button').click();
  await expect(page.getByTestId('card-composer')).toHaveCount(0);
  await expect(row).toContainText(promptText);
}

async function installUnownedE2EFlags(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
  });
}

async function seedLegacyStateOnce(page: Page) {
  await page.addInitScript(
    ({ cardsBytes, cardsKey, sentinelKey }) => {
      window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
      window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
      if (window.localStorage.getItem(sentinelKey) === 'true') return;

      window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
      window.localStorage.setItem(
        'mybishbash.profile.v1',
        JSON.stringify({ name: 'Migration E2E', timezone: 'Europe/London' }),
      );
      window.localStorage.setItem(cardsKey, cardsBytes);
      window.localStorage.setItem('mybishbash.event-log.v1', '[]');
      window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
      window.localStorage.setItem('mybishbash.disliked-pack-card-ids.v1', '[]');
      window.localStorage.setItem('mybishbash.action-cards.v1', '[]');
      window.localStorage.setItem(
        'mybishbash.launcher-behavior-settings.v1',
        JSON.stringify({
          mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
          safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
        }),
      );
      window.localStorage.setItem(sentinelKey, 'true');
    },
    { cardsBytes: legacyCardsBytes, cardsKey: CARDS_KEY, sentinelKey: SEED_SENTINEL_KEY },
  );
}

test('fresh install marks migration and persists a new card in IndexedDB across reload', async ({ page }) => {
  await installUnownedE2EFlags(page);
  await page.goto('/mybishbash/');
  await expect(page.locator('#hero-title')).toBeVisible();

  let marker: MigrationMeta | null = null;
  await expect
    .poll(async () => {
      marker = await idbGet<MigrationMeta>(page, 'meta', MIGRATION_META_KEY);
      return Boolean(marker?.at && marker?.appVersion);
    })
    .toBe(true);
  expect(Number.isNaN(Date.parse(marker!.at))).toBe(false);
  expect(marker!.appVersion.length).toBeGreaterThan(0);

  await idbPutMany(page, [
    ['mybishbash.setup-complete.v1', 'true'],
    ['mybishbash.profile.v1', JSON.stringify({ name: 'Fresh IDB', timezone: 'Europe/London' })],
    [CARDS_KEY, '[]'],
  ]);
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await page.getByTestId('create-card-button').click();
  await expect(page.getByTestId('card-composer')).toBeVisible();
  await page.getByTestId('card-prompt-input').fill('Fresh IDB card');
  await page.getByTestId('save-card-button').click();
  await expect(page.getByTestId('card-composer')).toHaveCount(0);

  let createdCardId: string | null = null;
  await expect
    .poll(async () => {
      const createdCard = (await readCardsFromIdb(page)).find((card) => card.promptText === 'Fresh IDB card');
      createdCardId = typeof createdCard?.id === 'string' ? createdCard.id : null;
      return createdCardId;
    })
    .toEqual(expect.any(String));
  await expectCardInIdb(page, createdCardId!, 'Fresh IDB card');
  expect(await page.evaluate((key) => window.localStorage.getItem(key), CARDS_KEY)).toBeNull();

  await page.reload();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.goto('/mybishbash/library');
  await showPersonalSection(page);
  await expect(
    page.locator('[data-testid^="library-row-"]').filter({ hasText: 'Fresh IDB card' }),
  ).toBeVisible();
  expect(await idbGet<MigrationMeta>(page, 'meta', MIGRATION_META_KEY)).toEqual(marker);
});

test('legacy import keeps IndexedDB authoritative and round-trips genuine kill-switch edits', async ({ page }) => {
  // This deliberately performs five full document boots plus edits in both
  // engines; WebKit needs more than the suite's 30s default under load.
  test.setTimeout(60_000);
  await seedLegacyStateOnce(page);
  await page.goto('/mybishbash/home');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await page.goto('/mybishbash/library');
  await showPersonalSection(page);
  await expect(page.getByTestId('library-row-migration-card')).toContainText('Legacy migration card');

  const marker = await idbGet<MigrationMeta>(page, 'meta', MIGRATION_META_KEY);
  expect(marker).toEqual({ at: expect.any(String), appVersion: expect.any(String) });
  expect(promptForCard(await readCardsFromIdb(page), 'migration-card')).toBe('Legacy migration card');

  await editCard(page, 'migration-card', 'IDB edit survives reload');
  await expectCardInIdb(page, 'migration-card', 'IDB edit survives reload');
  expect(promptForCard(await readCardsFromLocalStorage(page), 'migration-card')).toBe(
    'Legacy migration card',
  );

  // Re-presenting the unchanged legacy bytes must not overwrite newer IDB state.
  await page.evaluate(
    ({ key, staleBytes }) => window.localStorage.setItem(key, staleBytes),
    { key: CARDS_KEY, staleBytes: legacyCardsBytes },
  );
  await page.reload();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await showPersonalSection(page);
  await expect(page.getByTestId('library-row-migration-card')).toContainText('IDB edit survives reload');
  expect(await idbGet<MigrationMeta>(page, 'meta', MIGRATION_META_KEY)).toEqual(marker);
  expect(promptForCard(await readCardsFromLocalStorage(page), 'migration-card')).toBe(
    'Legacy migration card',
  );

  await editCard(page, 'migration-card', 'Newer IDB edit');
  await expectCardInIdb(page, 'migration-card', 'Newer IDB edit');
  expect(promptForCard(await readCardsFromLocalStorage(page), 'migration-card')).toBe(
    'Legacy migration card',
  );

  const decoyCards = (await readCardsFromIdb(page)).map((card) =>
    card.id === 'migration-card'
      ? { ...card, promptText: 'IDB decoy — must not render', dashboardTitle: 'IDB decoy — must not render' }
      : card,
  );
  await idbPutMany(page, [[CARDS_KEY, JSON.stringify(decoyCards)]]);
  expect(promptForCard(await readCardsFromIdb(page), 'migration-card')).toBe('IDB decoy — must not render');
  expect(promptForCard(await readCardsFromLocalStorage(page), 'migration-card')).toBe('Legacy migration card');

  await page.evaluate((key) => window.localStorage.setItem(key, 'localstorage'), ENGINE_KEY);
  await page.reload();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await showPersonalSection(page);
  await expect(page.getByTestId('library-row-migration-card')).toContainText('Legacy migration card');
  await expect(page.getByText('IDB decoy — must not render')).toHaveCount(0);
  expect(promptForCard(await readCardsFromLocalStorage(page), 'migration-card')).toBe('Legacy migration card');
  expect(promptForCard(await readCardsFromIdb(page), 'migration-card')).toBe('IDB decoy — must not render');

  await editCard(page, 'migration-card', 'Legacy-mode edit survives return');
  expect(promptForCard(await readCardsFromLocalStorage(page), 'migration-card')).toBe(
    'Legacy-mode edit survives return',
  );
  expect(promptForCard(await readCardsFromIdb(page), 'migration-card')).toBe('IDB decoy — must not render');

  await page.evaluate((key) => window.localStorage.removeItem(key), ENGINE_KEY);
  await page.reload();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await showPersonalSection(page);
  await expect(page.getByTestId('library-row-migration-card')).toContainText(
    'Legacy-mode edit survives return',
  );
  await expectCardInIdb(page, 'migration-card', 'Legacy-mode edit survives return');
  expect(promptForCard(await readCardsFromLocalStorage(page), 'migration-card')).toBe(
    'Legacy-mode edit survives return',
  );
});
