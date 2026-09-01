import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { build, preview } from "vite";

const EVENT_COUNT = 10_000;
const MIN_EVENT_LOG_BYTES = 2 * 1024 * 1024;
const MAX_EVENT_LOG_BYTES = 4 * 1024 * 1024;
const APP_SHELL_TEST_ID = "app-shell";
const BASE_PATH = "/mybishbash/";
const DB_NAME = "mybishbash";
const EVENT_LOG_KEY = "mybishbash.event-log.v1";
const MIGRATION_META_KEY = "migratedFromLocalStorage";
const MIGRATION_RETRY_REQUEST_KEY = "mybishbash.storage-migration-retry.v1";
const MIGRATION_RETRY_ACK_KEY = "mybishbash.storage-migration-retry-ack.v1";
const STORAGE_ENGINE_KEY = "mybishbash.storage-engine.v1";
const NAVIGATION_TIMEOUT_MS = 30_000;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const viteConfigPath = fileURLToPath(new URL("../vite.config.js", import.meta.url));
const publicDir = fileURLToPath(new URL("../public", import.meta.url));

const browserCases = [
  { label: "Chromium", browserType: chromium, thresholdMs: 1_000 },
  { label: "WebKit", browserType: webkit, thresholdMs: process.env.CI ? 1_500 : 1_000 },
];

async function hashDirectory(root) {
  const hash = createHash("sha256");

  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath);
      if (entry.isDirectory()) {
        hash.update(`directory:${relativePath}\0`);
        await visit(absolutePath);
      } else if (entry.isFile()) {
        hash.update(`file:${relativePath}\0`);
        hash.update(await readFile(absolutePath));
        hash.update("\0");
      }
    }
  }

  await visit(root);
  return hash.digest("hex");
}

async function closePreviewServer(server) {
  if (!server?.httpServer?.listening) return;
  await new Promise((resolve, reject) => {
    server.httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function createIsolatedPreview(outDir) {
  await build({
    root: repoRoot,
    configFile: viteConfigPath,
    base: BASE_PATH,
    publicDir: false,
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: true,
    },
  });

  const server = await preview({
    root: repoRoot,
    configFile: viteConfigPath,
    base: BASE_PATH,
    publicDir: false,
    logLevel: "warn",
    build: { outDir },
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
    },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string") {
    await closePreviewServer(server);
    throw new Error("Could not resolve the isolated preview server port");
  }

  return {
    server,
    appUrl: `http://127.0.0.1:${address.port}${BASE_PATH}home`,
    seedUrl: `http://127.0.0.1:${address.port}${BASE_PATH}__perf-seed`,
  };
}

async function seedLegacyEventLog(page, seedUrl) {
  await page.route(seedUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>perf seed</body></html>",
  }));
  await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });

  const seedEvidence = await page.evaluate(({ eventCount }) => {
    const baseTime = Date.parse("2026-07-30T12:00:00.000Z");
    const eventTypes = ["card_shown", "card_completed", "launcher_session_started", "pack_card_liked"];
    const appIds = ["safari", "youtube", "instagram"];
    const events = Array.from({ length: eventCount }, (_, index) => {
      const eventType = eventTypes[index % eventTypes.length];
      const appId = appIds[index % appIds.length];
      const sourceType = index % 4 === 3 ? "pack" : "personal";
      return {
        id: `perf-event-${index}`,
        created_at: new Date(baseTime - index * 1_000).toISOString(),
        event_type: eventType,
        user_id: "perf-user",
        source_type: sourceType,
        card_id: `perf-card-${index % 500}`,
        card_source: sourceType,
        app_id: appId,
        launcher_context: index % 2 === 0 ? "normal" : "intercept",
        action_taken: eventType.replace(/^card_/, ""),
        metadata: null,
      };
    });
    const eventLogBytes = JSON.stringify(events);

    window.localStorage.setItem("MYBISHBASH_E2E_MODE", "true");
    window.localStorage.setItem("MYBISHBASH_E2E_TESTER_MODE", "true");
    window.localStorage.setItem("MYBISHBASH_DEMO_MODE", "true");
    window.localStorage.setItem("mybishbash.setup-complete.v1", "true");
    window.localStorage.setItem(
      "mybishbash.profile.v1",
      JSON.stringify({ name: "10k event perf", timezone: "Europe/London" }),
    );
    window.localStorage.setItem("mybishbash.cards.v1", "[]");
    window.localStorage.setItem("mybishbash.home-screen-versions.v1", "{}");
    window.localStorage.setItem("mybishbash.event-log.v1", eventLogBytes);
    window.localStorage.setItem("mybishbash.offline-event-queue.v1", "[]");
    window.localStorage.setItem("mybishbash.disliked-pack-card-ids.v1", "[]");
    window.localStorage.setItem("mybishbash.action-cards.v1", "[]");
    window.localStorage.setItem(
      "mybishbash.launcher-behavior-settings.v1",
      JSON.stringify({
        mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
        safari: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
      }),
    );
    return { eventCount: events.length, eventLogBytes: new Blob([eventLogBytes]).size };
  }, { eventCount: EVENT_COUNT });

  await page.unroute(seedUrl);
  if (seedEvidence.eventCount !== EVENT_COUNT) {
    throw new Error(`Legacy seed created ${seedEvidence.eventCount} events; expected ${EVENT_COUNT}`);
  }
  if (seedEvidence.eventLogBytes < MIN_EVENT_LOG_BYTES || seedEvidence.eventLogBytes > MAX_EVENT_LOG_BYTES) {
    throw new Error(
      `Legacy 10k-event payload is ${seedEvidence.eventLogBytes} bytes; ` +
      `expected ${MIN_EVENT_LOG_BYTES}-${MAX_EVENT_LOG_BYTES} bytes`,
    );
  }
  return seedEvidence;
}

async function installAppShellMeasurement(page) {
  await page.addInitScript(({ testId }) => {
    window.__MYBISHBASH_PERF_BOOT = null;
    let scheduled = false;

    const recordWhenVisible = () => {
      scheduled = false;
      const shell = document.querySelector(`[data-testid="${testId}"]`);
      if (!shell) return;

      const styles = window.getComputedStyle(shell);
      const bounds = shell.getBoundingClientRect();
      if (
        styles.display === "none" ||
        styles.visibility === "hidden" ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        return;
      }

      const navigation = performance.getEntriesByType("navigation")[0];
      window.__MYBISHBASH_PERF_BOOT = {
        navigationStart: navigation?.startTime ?? 0,
        shellVisibleAt: performance.now(),
      };
      observer.disconnect();
    };

    const scheduleCheck = () => {
      if (scheduled || window.__MYBISHBASH_PERF_BOOT) return;
      scheduled = true;
      window.requestAnimationFrame(recordWhenVisible);
    };

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document, { attributes: true, childList: true, subtree: true });
    scheduleCheck();
  }, { testId: APP_SHELL_TEST_ID });
}

async function readMigrationEvidence(page) {
  const databaseEvidence = await page.evaluate(({ databaseName, eventLogKey, migrationMetaKey }) =>
    new Promise((resolve, reject) => {
      let upgradeAttempted = false;
      const openRequest = indexedDB.open(databaseName);
      openRequest.onupgradeneeded = () => {
        upgradeAttempted = true;
        openRequest.transaction?.abort();
      };
      openRequest.onerror = () => reject(new Error(
        upgradeAttempted
          ? "IndexedDB migration database was not created"
          : openRequest.error?.message ?? "IndexedDB open failed",
      ));
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        let eventLogBytes;
        let migrationMarker;
        let transaction;
        try {
          transaction = database.transaction(["kv", "meta"], "readonly");
          const eventRequest = transaction.objectStore("kv").get(eventLogKey);
          const markerRequest = transaction.objectStore("meta").get(migrationMetaKey);
          eventRequest.onsuccess = () => {
            eventLogBytes = eventRequest.result;
          };
          markerRequest.onsuccess = () => {
            migrationMarker = markerRequest.result;
          };
        } catch (error) {
          database.close();
          reject(error);
          return;
        }

        transaction.oncomplete = () => {
          database.close();
          try {
            const events = JSON.parse(eventLogBytes ?? "null");
            resolve({
              eventCount: Array.isArray(events) ? events.length : -1,
              eventLogBytes: typeof eventLogBytes === "string" ? new Blob([eventLogBytes]).size : -1,
              firstEvent: Array.isArray(events) ? events[0] ?? null : null,
              migrationMarker: migrationMarker ?? null,
            });
          } catch (error) {
            reject(error);
          }
        };
        transaction.onerror = () => {
          const message = transaction.error?.message ?? "IndexedDB evidence read failed";
          database.close();
          reject(new Error(message));
        };
        transaction.onabort = transaction.onerror;
      };
    }),
  {
    databaseName: DB_NAME,
    eventLogKey: EVENT_LOG_KEY,
    migrationMetaKey: MIGRATION_META_KEY,
  });

  const controls = await page.evaluate(({ ackKey, engineKey, requestKey }) => {
    const request = window.localStorage.getItem(requestKey);
    const acknowledgement = window.localStorage.getItem(ackKey);
    return {
      engineOverride: window.localStorage.getItem(engineKey),
      retryPending: request !== null && request !== acknowledgement,
    };
  }, {
    ackKey: MIGRATION_RETRY_ACK_KEY,
    engineKey: STORAGE_ENGINE_KEY,
    requestKey: MIGRATION_RETRY_REQUEST_KEY,
  });

  return { ...databaseEvidence, ...controls };
}

function assertHealthyMigration(label, evidence, expectedMarker = null) {
  if (evidence.eventCount !== EVENT_COUNT) {
    throw new Error(`${label}: IndexedDB contains ${evidence.eventCount} events; expected ${EVENT_COUNT}`);
  }
  if (evidence.eventLogBytes < MIN_EVENT_LOG_BYTES || evidence.eventLogBytes > MAX_EVENT_LOG_BYTES) {
    throw new Error(
      `${label}: IndexedDB event payload is ${evidence.eventLogBytes} bytes; ` +
      `expected ${MIN_EVENT_LOG_BYTES}-${MAX_EVENT_LOG_BYTES} bytes`,
    );
  }
  if (
    evidence.firstEvent?.event_type !== "card_shown" ||
    typeof evidence.firstEvent?.id !== "string" ||
    Number.isNaN(Date.parse(evidence.firstEvent?.created_at ?? ""))
  ) {
    throw new Error(`${label}: IndexedDB event payload does not match the eventLog.js test shape`);
  }
  if (
    !evidence.migrationMarker?.at ||
    Number.isNaN(Date.parse(evidence.migrationMarker.at)) ||
    !evidence.migrationMarker?.appVersion
  ) {
    throw new Error(`${label}: IndexedDB migration marker is missing or invalid`);
  }
  if (expectedMarker && JSON.stringify(evidence.migrationMarker) !== JSON.stringify(expectedMarker)) {
    throw new Error(`${label}: the measured boot unexpectedly re-ran localStorage migration`);
  }
  if (evidence.engineOverride !== null) {
    throw new Error(`${label}: storage kill switch was unexpectedly set to ${evidence.engineOverride}`);
  }
  if (evidence.retryPending) {
    throw new Error(`${label}: migration retry is pending, so the app may have fallen back to localStorage`);
  }
}

async function readBootDuration(page, label) {
  await page.waitForFunction(() => {
    const measurement = window.__MYBISHBASH_PERF_BOOT;
    return Number.isFinite(measurement?.navigationStart) && Number.isFinite(measurement?.shellVisibleAt);
  });
  const measurement = await page.evaluate(() => window.__MYBISHBASH_PERF_BOOT);
  const durationMs = measurement?.shellVisibleAt - measurement?.navigationStart;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error(`${label}: app-shell visibility timing was not captured`);
  }
  return durationMs;
}

async function measureBrowser({ appUrl, seedUrl }, { label, browserType, thresholdMs }) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    const seedEvidence = await seedLegacyEventLog(page, seedUrl);
    await installAppShellMeasurement(page);

    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.getByTestId(APP_SHELL_TEST_ID).waitFor({ state: "visible" });
    const migrationBootMs = await readBootDuration(page, `${label} migration boot`);
    const firstEvidence = await readMigrationEvidence(page);
    assertHealthyMigration(`${label} migration boot`, firstEvidence);

    await page.reload({ waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.getByTestId(APP_SHELL_TEST_ID).waitFor({ state: "visible" });
    const measuredBootMs = await readBootDuration(page, `${label} measured boot`);
    const secondEvidence = await readMigrationEvidence(page);
    assertHealthyMigration(`${label} measured boot`, secondEvidence, firstEvidence.migrationMarker);

    console.log(
      `[perf-boot] ${label}: migration=${migrationBootMs.toFixed(1)}ms, ` +
      `second-load=${measuredBootMs.toFixed(1)}ms, events=${EVENT_COUNT}, ` +
      `payload=${(seedEvidence.eventLogBytes / 1024 / 1024).toFixed(2)}MiB, limit=<${thresholdMs}ms`,
    );
    return { label, measuredBootMs, thresholdMs };
  } finally {
    await browser.close();
  }
}

const publicHashBefore = await hashDirectory(publicDir);
const temporaryRoot = await mkdtemp(join(tmpdir(), "mybishbash-perf-boot-"));
let previewServer = null;

try {
  const previewContext = await createIsolatedPreview(join(temporaryRoot, "dist"));
  previewServer = previewContext.server;

  const results = [];
  for (const browserCase of browserCases) {
    results.push(await measureBrowser(previewContext, browserCase));
  }

  const failures = results.filter(({ measuredBootMs, thresholdMs }) => measuredBootMs >= thresholdMs);
  if (failures.length > 0) {
    throw new Error(failures
      .map(({ label, measuredBootMs, thresholdMs }) =>
        `${label} second-load boot ${measuredBootMs.toFixed(1)}ms is not below ${thresholdMs}ms`)
      .join("; "));
  }

  console.log("[perf-boot] PASS 10k-event second-load boot gate");
} finally {
  try {
    await closePreviewServer(previewServer);
  } finally {
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
    } finally {
      const publicHashAfter = await hashDirectory(publicDir);
      if (publicHashAfter !== publicHashBefore) {
        throw new Error("The perf gate modified public/; generated artefacts must remain untouched");
      }
    }
  }
}
