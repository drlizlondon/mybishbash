import type { Page } from '@playwright/test';

const DB_NAME = 'mybishbash';

export async function readIndexedDbValue<T>(page: Page, key: string, storeName = 'kv'): Promise<T | null> {
  return page.evaluate(
    ({ databaseName, requestedKey, requestedStore }) =>
      new Promise<T | null>((resolve, reject) => {
        let upgradeAttempted = false;
        const openRequest = indexedDB.open(databaseName);
        openRequest.onupgradeneeded = () => {
          upgradeAttempted = true;
          openRequest.transaction?.abort();
        };
        openRequest.onerror = () => reject(new Error(
          upgradeAttempted
            ? 'IndexedDB database was not created before the assertion'
            : openRequest.error?.message ?? 'IndexedDB open failed',
        ));
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          let transaction: IDBTransaction;
          try {
            transaction = database.transaction(requestedStore, 'readonly');
          } catch (error) {
            database.close();
            reject(error);
            return;
          }

          let value: T | null = null;
          const getRequest = transaction.objectStore(requestedStore).get(requestedKey);
          getRequest.onsuccess = () => {
            value = getRequest.result === undefined ? null : (getRequest.result as T);
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(value);
          };
          transaction.onerror = () => {
            const message = transaction.error?.message ?? 'IndexedDB read failed';
            database.close();
            reject(new Error(message));
          };
          transaction.onabort = transaction.onerror;
        };
      }),
    { databaseName: DB_NAME, requestedKey: key, requestedStore: storeName },
  );
}

export async function readIndexedDbValues<T = unknown>(
  page: Page,
  keys: string[],
  storeName = 'kv',
): Promise<Record<string, T | null>> {
  return page.evaluate(
    ({ databaseName, requestedKeys, requestedStore }) =>
      new Promise<Record<string, T | null>>((resolve, reject) => {
        let upgradeAttempted = false;
        const openRequest = indexedDB.open(databaseName);
        openRequest.onupgradeneeded = () => {
          upgradeAttempted = true;
          openRequest.transaction?.abort();
        };
        openRequest.onerror = () => reject(new Error(
          upgradeAttempted
            ? 'IndexedDB database was not created before the assertion'
            : openRequest.error?.message ?? 'IndexedDB open failed',
        ));
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          let transaction: IDBTransaction;
          try {
            transaction = database.transaction(requestedStore, 'readonly');
          } catch (error) {
            database.close();
            reject(error);
            return;
          }

          const values = Object.fromEntries(requestedKeys.map((key) => [key, null])) as Record<string, T | null>;
          const store = transaction.objectStore(requestedStore);
          for (const key of requestedKeys) {
            const getRequest = store.get(key);
            getRequest.onsuccess = () => {
              values[key] = getRequest.result === undefined ? null : (getRequest.result as T);
            };
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(values);
          };
          transaction.onerror = () => {
            const message = transaction.error?.message ?? 'IndexedDB read failed';
            database.close();
            reject(new Error(message));
          };
          transaction.onabort = transaction.onerror;
        };
      }),
    { databaseName: DB_NAME, requestedKeys: keys, requestedStore: storeName },
  );
}

export async function readIndexedDbJson<T>(page: Page, key: string, fallback: T): Promise<T> {
  const raw = await readIndexedDbValue<string>(page, key);
  if (raw === null) return fallback;
  return JSON.parse(raw) as T;
}
