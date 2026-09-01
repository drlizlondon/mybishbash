import { expect, test, devices } from '@playwright/test';
import { readIndexedDbJson } from '../tests/e2e/indexeddb.ts';

const requiredEnvVars = [
  'MYBISHBASH_STAGING_URL',
  'MYBISHBASH_EXISTING_TEST_EMAIL',
  'MYBISHBASH_EXISTING_TEST_PASSWORD',
  'MYBISHBASH_NEW_TEST_EMAIL',
  'MYBISHBASH_NEW_TEST_PASSWORD',
  'MYBISHBASH_NEW_TEST_ACCESS_CODE',
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
const stagingUrl = process.env.MYBISHBASH_STAGING_URL ?? '';
const allowProduction = process.env.MYBISHBASH_ALLOW_PRODUCTION_STAGING_TESTS === 'true';
const isProductionUrl = /(^https:\/\/drlizlondon\.github\.io\/mybishbash\/?$)|(^https:\/\/www\.mybishbash\.com\/?$)|(^https:\/\/mybishbash\.com\/?$)/i.test(stagingUrl.replace(/\/$/, ''));
const skipReason = missingEnvVars.length > 0
  ? `Missing required staging env vars: ${missingEnvVars.join(', ')}`
  : isProductionUrl && !allowProduction
    ? 'Refusing to run against production. Set MYBISHBASH_ALLOW_PRODUCTION_STAGING_TESTS=true only when intentionally testing production.'
    : null;

if (skipReason) {
  console.warn(`[staging-release] ${skipReason}`);
}

const report = {
  checks: [],
  qaCardName: '',
  qaEditedCardName: '',
};
const safariDesktopDestination = /^https:\/\/www\.google\.com$/i;
const safariIOSDestination = /^x-safari-https:\/\/www\.google\.com$/i;
const safariDestination = /^(https:\/\/www\.google\.com|x-safari-https:\/\/www\.google\.com)$/i;
const safariMarketingDestination = /apple\.com\/safari/i;
const directAppSmokeTargets = {
  safari: { label: 'Safari', expected: safariDestination },
  instagram: { label: 'Instagram', expected: /^instagram:\/\/app$/i },
  youtube: { label: 'YouTube', expected: /^youtube:\/\//i },
  whatsapp: { label: 'WhatsApp', expected: /^https:\/\/api\.whatsapp\.com\/send/i },
};

test.describe('myBishBash staging release E2E', () => {
  test.skip(Boolean(skipReason), skipReason ?? '');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(600000);

  test.afterAll(() => {
    console.log('\nRELEASE READINESS REPORT');
    console.log(`Staging URL: ${stagingUrl || 'not supplied'}`);
    console.log(`QA card name: ${report.qaCardName || 'not created'}`);
    console.log(`QA edited card name: ${report.qaEditedCardName || 'not edited'}`);
    report.checks.forEach((entry) => console.log(`${entry.status}: ${entry.name}`));
  });

  test('existing account login reaches Home with safe sync state', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD);
    await expectHomeOrSafeApp(page);
    await expectSafeSyncState(page);
    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Existing account login' });

    await context.close();
  });

  test('existing account renders Explore and HQ without auth bounce', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD, '/explore');
    await expect(page.getByTestId('explore-panel')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('sync-screen')).toHaveCount(0);
    await expect(page.getByLabel(/email/i)).toHaveCount(0);

    await navigateWithinStaging(page, '/hq');
    await expect(
      page.getByTestId('hq-generated-cover-preview')
        .or(page.getByText(/must be an admin/i))
        .or(page.getByTestId('app-shell')),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByLabel(/email/i)).toHaveCount(0);
    await expectNoCrashState(page);
    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Authenticated Explore/HQ render without auth bounce' });

    await context.close();
  });

  test('brand-new account signup or login reaches a safe app state', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await navigateWithinStaging(page, '/home');
    await waitForAppEntry(page);
    await switchToSignupIfNeeded(page);
    await fillAuthForm(page, {
      email: process.env.MYBISHBASH_NEW_TEST_EMAIL,
      password: process.env.MYBISHBASH_NEW_TEST_PASSWORD,
      accessCode: process.env.MYBISHBASH_NEW_TEST_ACCESS_CODE,
    });
    await page.getByRole('button', { name: /create|sign up|continue/i }).click();

    try {
      await expectHomeOnboardingOrSafeAuth(page, 15000);
    } catch {
      await openAndLogin(page, process.env.MYBISHBASH_NEW_TEST_EMAIL, process.env.MYBISHBASH_NEW_TEST_PASSWORD);
      await expectHomeOnboardingOrSafeAuth(page, 15000);
    }

    await expectNoCrashState(page);
    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Brand-new account signup/login' });

    await context.close();
  });

  test('Device A creates card and Device B confirms sync', async ({ browser }) => {
    const unique = new Date().toISOString().replace(/[:.]/g, '-');
    const cardName = `QA sync card ${unique}`;
    report.qaCardName = cardName;
    console.log(`QA sync card: ${cardName}`);

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const consoleErrorsA = installConsoleErrorGuard(pageA);
    const consoleErrorsB = installConsoleErrorGuard(pageB);
    const networkA = installSyncNetworkDiagnostics(pageA, 'Device A');
    const networkB = installSyncNetworkDiagnostics(pageB, 'Device B');

    await openAndLogin(pageA, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD);
    await openAndLogin(pageB, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD);

    await createCard(pageA, cardName);
    await waitForCardOnDevice(pageB, cardName, 'created card appears on Device B');
    logSyncNetworkDiagnostics(networkA);
    logSyncNetworkDiagnostics(networkB);

    await expectNoConsoleErrors(consoleErrorsA);
    await expectNoConsoleErrors(consoleErrorsB);
    report.checks.push({ status: 'PASS', name: 'Device A create and Device B sync' });

    await contextA.close();
    await contextB.close();
  });

  test('Apps direct-open test buttons open destinations without creating cards', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await installDestinationCapture(page);
    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD, '/apps');
    await expect(page.getByTestId('apps-panel')).toBeVisible();

    for (const [launcherId, expected] of Object.entries({
      safari: safariDesktopDestination,
      youtube: /^https:\/\/www\.youtube\.com/i,
      instagram: /^https:\/\/www\.instagram\.com/i,
    })) {
      await page.getByTestId('apps-select').selectOption(launcherId);
      const launcher = page.getByTestId(`apps-direct-open-${launcherId}`);
      await expect(launcher, `Test account needs ${launcherId} available in Apps`).toBeVisible();
      await launcher.click();
      const latest = await waitForDestinationAttempt(page);
      expect(latest.href, `${launcherId} should open configured destination`).toMatch(expected);
      await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
      await expect(page.getByTestId('continue-to-app-card')).toHaveCount(0);
      await page.evaluate(() => { window.__MYBISHBASH_STAGING_DESTINATIONS = []; });
    }

    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Apps direct-open test buttons open destinations' });

    await context.close();
  });

  test('/intercept/safari interrupts and continue-to-app is user-triggered', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await installDestinationCapture(page);
    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD, '/intercept/safari');

    await expectSafeInterceptState(page);
    await expect.poll(() => getDestinationAttempts(page), { message: 'Safari should not auto-open before user action' }).toHaveLength(0);
    await reachContinueToAppState(page);
    await clickContinueToApp(page);

    const latest = await waitForDestinationAttempt(page);
    expect(latest.href).toMatch(safariDestination);
    expect(latest.href).not.toMatch(safariMarketingDestination);
    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: '/intercept/safari interruption and continue-to-app' });

    await context.close();
  });

  for (const [launcherId, { label, expected }] of Object.entries(directAppSmokeTargets)) {
    test(`/intercept/${launcherId} in-card ${label} button opens the real app destination`, async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const consoleErrors = installConsoleErrorGuard(page);

      await installDestinationCapture(page);
      await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD);
      await navigateWithinStaging(page, `/intercept/${launcherId}`);
      const result = await openRealAppFromActiveCard(page, launcherId, label);
      const latest = result.latest;
      expect(latest.href, `${label} in-card app button should open the real destination`).toMatch(expected);
      expect(latest.href).not.toContain('/intercept/');
      expect(latest.href).not.toContain('/launch/');
      if (result.mode === 'personal') {
        expect(latest.metadata).toMatchObject({
          versionId: launcherId,
          source: 'in_card_app_button',
          reason: 'user_pressed_real_app_button',
        });
        await expect(page).toHaveURL(new RegExp(`/intercept/${launcherId}$`));
        await expect.poll(() => page.evaluate(() => window.__MYBISHBASH_CARD_OVERLAY_MOUNTS?.length ?? 0)).toBe(result.cardMountsBeforeTap);
        await expect(page.getByTestId('continue-to-app-card')).toHaveCount(0);
      }

      await expectNoConsoleErrors(consoleErrors);
      report.checks.push({ status: 'PASS', name: `/intercept/${launcherId} in-card ${label} direct button bypasses cards` });

      await context.close();
    });
  }

  test('fake launcher entry points still trigger cards instead of direct app opens', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await installDestinationCapture(page);
    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD, '/apps');
    await expect(page.getByTestId('apps-panel')).toBeVisible();

    for (const launcherId of ['safari', 'instagram', 'youtube']) {
      await page.getByTestId('apps-select').selectOption(launcherId);
      await page.getByTestId(`apps-protected-launch-${launcherId}`).click();
      await expectSafeInterceptState(page);
      await expect.poll(() => getDestinationAttempts(page), { message: `${launcherId} fake launcher should not directly open destination` }).toHaveLength(0);
      await navigateWithinStaging(page, '/apps');
      await expect(page.getByTestId('apps-panel')).toBeVisible();
    }

    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Fake launcher entry points still trigger cards' });

    await context.close();
  });

  test('return from real app does not loop', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await installDestinationCapture(page);
    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD, '/intercept/safari');
    await expectSafeInterceptState(page);
    await reachContinueToAppState(page);
    await clickContinueToApp(page);
    await waitForDestinationAttempt(page);

    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
    });
    await navigateWithinStaging(page, '/home');
    await expect(page.getByTestId('app-shell').or(page.getByTestId('continue-to-app-card')).or(page.getByTestId('card-overlay-empty')).or(page.getByTestId('card-overlay-personal'))).toBeVisible();
    const overlayCount = await page.getByTestId('card-overlay-personal').count() + await page.getByTestId('continue-to-app-card').count();
    expect(overlayCount, 'Return flow should settle into Home or one safe overlay, not a repeated card loop').toBeLessThanOrEqual(1);

    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Return from real app does not loop' });

    await context.close();
  });

  test('mobile Safari/PWA approximation', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPhone 12'],
    });
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await installDestinationCapture(page);
    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD, '/home');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.getByTestId('bottom-nav-apps').click();
    await expect(page.getByTestId('apps-panel')).toBeVisible();
    await navigateWithinStaging(page, '/intercept/safari');
    await expectSafeInterceptState(page);
    await navigateWithinStaging(page, '/apps/safari');
    await page.getByTestId('apps-direct-open-safari').click();
    const latest = await waitForDestinationAttempt(page);
    expect(latest.href).toMatch(safariDesktopDestination);
    expect(latest.href).not.toMatch(safariMarketingDestination);

    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Mobile Safari/PWA approximation' });

    await context.close();
  });
});

function installConsoleErrorGuard(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (/^Failed to load resource:/i.test(message.text())) return;
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    if (response.status() === 406 && response.url().includes('/rest/v1/admin_users')) return;
    const request = response.request();
    const basePath = new URL(stagingUrl).pathname.replace(/\/$/, '');
    const isSpaDocumentFallback =
      request.resourceType() === 'document' &&
      response.status() === 404 &&
      basePath &&
      new URL(response.url()).pathname.startsWith(`${basePath}/`);
    if (isSpaDocumentFallback) return;
    errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectNoConsoleErrors(errors) {
  const allowed = errors.filter((message) => !/favicon|ResizeObserver loop limit exceeded|PGRST116|ADMIN CHECK ERROR/i.test(message));
  expect(allowed, `Unexpected console/page errors:\n${allowed.join('\n')}`).toEqual([]);
}

async function installDestinationCapture(page) {
  await page.addInitScript(() => {
    window.__MYBISHBASH_STAGING_DESTINATIONS = [];
    const record = (href, metadata = {}) => {
      window.__MYBISHBASH_STAGING_DESTINATIONS.push({ href: String(href), metadata });
    };
    window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION = (href, metadata) => {
      record(href, metadata);
      return true;
    };
    const originalAssign = window.location.assign.bind(window.location);
    try {
      Object.defineProperty(window.location, 'assign', {
        configurable: true,
        value: (href) => record(href, { source: 'location.assign' }),
      });
    } catch {
      window.__MYBISHBASH_ORIGINAL_ASSIGN = originalAssign;
    }
  });
}

async function getDestinationAttempts(page) {
  return page.evaluate(() => window.__MYBISHBASH_STAGING_DESTINATIONS ?? []);
}

async function waitForDestinationAttempt(page) {
  await expect.poll(() => getDestinationAttempts(page), { timeout: 5000 }).not.toHaveLength(0);
  const attempts = await getDestinationAttempts(page);
  return attempts[attempts.length - 1];
}

function appUrl(path = '/') {
  const url = new URL(stagingUrl);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
  url.search = '';
  return url.toString();
}

async function navigateWithinStaging(page, path) {
  await page.goto(appUrl(path));
}

async function openAndLogin(page, email, password, path = '/home') {
  if (path !== '/home') {
    await openAndLogin(page, email, password, '/home');
    await navigateWithinStaging(page, path);
    await waitForAppEntry(page);
    return;
  }

  await navigateWithinStaging(page, path);
  await waitForAppEntry(page);
  if (await page.getByTestId('app-shell').isVisible().catch(() => false)) return;
  if (await page.getByTestId('card-overlay-interruption').or(page.getByTestId('card-overlay-personal')).or(page.getByTestId('continue-to-app-card')).isVisible().catch(() => false)) return;

  await switchToLoginIfNeeded(page);
  await fillAuthForm(page, { email, password });
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 30000 });
}

async function waitForAppEntry(page) {
  await expect(
    page.getByTestId('sync-screen')
      .or(page.getByTestId('app-shell'))
      .or(page.getByTestId('card-overlay-interruption'))
      .or(page.getByTestId('card-overlay-personal'))
      .or(page.getByTestId('continue-to-app-card'))
      .or(page.getByText(/Make myBishBash/i))
      .first(),
  ).toBeVisible({ timeout: 20000 });
}

async function switchToLoginIfNeeded(page) {
  if (await page.getByRole('button', { name: /log in/i }).isVisible().catch(() => false)) return;
  const loginSwitch = page.getByRole('button', { name: /log in/i }).or(page.getByText(/log in/i));
  if (await loginSwitch.first().isVisible().catch(() => false)) await loginSwitch.first().click();
}

async function switchToSignupIfNeeded(page) {
  if (await page.getByLabel(/access code/i).isVisible().catch(() => false)) return;
  const signupSwitch = page.getByRole('button', { name: /create account|sign up|new account/i }).or(page.getByText(/create account|sign up/i));
  if (await signupSwitch.first().isVisible().catch(() => false)) await signupSwitch.first().click();
}

async function fillAuthForm(page, { email, password, accessCode }) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  if (accessCode !== undefined && await page.getByLabel(/access code/i).isVisible().catch(() => false)) {
    await page.getByLabel(/access code/i).fill(accessCode);
    const legal = page.getByRole('checkbox');
    if (await legal.isVisible().catch(() => false)) await legal.check();
  }
}

async function expectHomeOrSafeApp(page) {
  await expect(page.getByTestId('app-shell').or(page.getByTestId('sync-screen')).or(page.getByText(/Make myBishBash/i))).toBeVisible({ timeout: 30000 });
}

async function expectHomeOnboardingOrSafeAuth(page, timeout = 10000) {
  await expect(page.getByTestId('app-shell').or(page.getByTestId('sync-screen')).or(page.getByText(/Make myBishBash|onboarding|check your email/i))).toBeVisible({ timeout });
}

async function expectNoCrashState(page) {
  await expect(page.getByText(/something went wrong|uncaught|application error/i)).toHaveCount(0);
}

async function expectSafeSyncState(page) {
  await expect(page.getByTestId('app-shell').or(page.getByTestId('sync-screen'))).toBeVisible({ timeout: 30000 });
}

async function createCard(page, cardName) {
  await navigateWithinStaging(page, '/home');
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await dismissBlockingHomeOverlays(page);
  const beforeSave = await collectCardDiagnostics(page, cardName);
  logCardDiagnostics('before save', beforeSave);
  const emptyOverlay = page.getByTestId('card-overlay-empty').first();
  if (await emptyOverlay.count() > 0) {
    await emptyOverlay.getByRole('button', { name: /create a mybishbash/i }).click();
  } else if (await page.getByTestId('overlay-create-card-button').isVisible().catch(() => false)) {
    await page.getByTestId('overlay-create-card-button').click();
  } else {
    await page.getByTestId('create-card-button').or(page.getByTestId('empty-create-card-button')).first().click();
  }
  await page.getByTestId('card-prompt-input').fill(cardName);
  console.log(`[staging-save] entered card prompt: ${cardName}`);
  const sharedStateSave = waitForSharedStateSave(page);
  await page.getByTestId('save-card-button').click();
  await expect(page.getByText(`Saved “${cardName}”.`)).toBeVisible({ timeout: 10000 });
  console.log(`[staging-save] toast shown for: ${cardName}`);
  const afterToast = await collectCardDiagnostics(page, cardName);
  logCardDiagnostics('after toast', afterToast);
  await navigateWithinStaging(page, '/library');
  await ensurePersonalCardsOpen(page);
  const afterLibraryNavigation = await collectCardDiagnostics(page, cardName);
  logCardDiagnostics('after library navigation', afterLibraryNavigation);
  await sharedStateSave;
  console.log(`[staging-save] cloud save observed for: ${cardName}`);
  await page.reload({ waitUntil: 'load' });
  await ensurePersonalCardsOpen(page);
  const afterReload = await collectCardDiagnostics(page, cardName);
  logCardDiagnostics('after reload', afterReload);
  await expect(libraryRow(page, cardName)).toBeVisible({ timeout: 10000 });
}

async function dismissBlockingHomeOverlays(page) {
  const morningSummary = page.getByTestId('morning-summary');
  if (await morningSummary.isVisible().catch(() => false)) {
    await morningSummary.getByRole('button', { name: /continue to mybishbash|close/i }).first().click();
    await expect(morningSummary).toHaveCount(0, { timeout: 5000 });
  }
}

async function editCard(page, oldName, newName) {
  await navigateWithinStaging(page, '/library');
  await ensurePersonalCardsOpen(page);
  const card = libraryRow(page, oldName);
  await expect(card).toBeVisible({ timeout: 10000 });
  await openCardMenu(card);
  await page.getByRole('button', { name: /^edit$/i }).click();
  await page.getByTestId('card-prompt-input').fill(newName);
  await page.getByTestId('save-card-button').click();
  await expect(libraryRow(page, newName)).toBeVisible({ timeout: 10000 });
}

async function deleteCard(page, cardName) {
  await navigateWithinStaging(page, '/library');
  await ensurePersonalCardsOpen(page);
  const card = libraryRow(page, cardName);
  await expect(card).toBeVisible({ timeout: 10000 });
  await openCardMenu(card);
  await page.getByRole('button', { name: /^delete$/i }).click();
  await expect(libraryRow(page, cardName)).toHaveCount(0, { timeout: 10000 });
}

async function waitForCardOnDevice(page, cardName, message) {
  await expect.poll(async () => {
    await navigateWithinStaging(page, '/library');
    await ensurePersonalCardsOpen(page);
    const count = await libraryRow(page, cardName).count();
    if (count > 0) return count;
    await page.reload({ waitUntil: 'load' });
    await ensurePersonalCardsOpen(page);
    return libraryRow(page, cardName).count();
  }, { message, timeout: 150000, intervals: [1000, 2000, 5000] }).toBeGreaterThan(0);
}

async function waitForCardAbsentOnDevice(page, cardName, message) {
  await navigateWithinStaging(page, '/library');
  await ensurePersonalCardsOpen(page);
  await expect(libraryRow(page, cardName), message).toHaveCount(0, { timeout: 150000 });
}

function libraryRow(page, cardName) {
  return page.locator('[data-testid^="library-row-"]').filter({ hasText: cardName }).first();
}

async function ensurePersonalCardsOpen(page) {
  const toggle = page.getByTestId('library-personal-section-toggle');
  await expect(toggle).toBeVisible({ timeout: 10000 });
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
}

async function collectCardDiagnostics(page, cardName) {
  const cards = await readIndexedDbJson(page, 'mybishbash.cards.v1', []);
  const matchingCards = cards.filter(
    (card) => card?.promptText === cardName || card?.dashboardTitle === cardName,
  );
  const uiDiagnostics = await page.evaluate((targetCardName) => {
    const visibleRows = Array.from(document.querySelectorAll('[data-testid^="library-row-"]'));
    const personalToggle = document.querySelector('[data-testid="library-personal-section-toggle"]');
    const personalCountText = personalToggle?.parentElement?.innerText ?? '';
    return {
      visibleRowCount: visibleRows.length,
      visibleMatchCount: visibleRows.filter((row) => row.textContent?.includes(targetCardName)).length,
      personalExpanded: personalToggle?.getAttribute('aria-expanded') ?? null,
      personalCountText,
      path: window.location.pathname,
    };
  }, cardName);
  return {
    persistedCardCount: cards.length,
    persistedMatchCount: matchingCards.length,
    persistedMatchIds: matchingCards.map((card) => card.id),
    ...uiDiagnostics,
  };
}

function logCardDiagnostics(label, diagnostics) {
  console.log(`[staging-save] ${label}: ${JSON.stringify(diagnostics)}`);
}

function installSyncNetworkDiagnostics(page, label) {
  const records = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!/\/rest\/v1\/(mybishbash_state|bishbash_state)|\/auth\/v1\//.test(url)) return;
    records.push({
      label,
      method: response.request().method(),
      status: response.status(),
      url: url.replace(/\?.*$/, ''),
    });
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!/\/rest\/v1\/(mybishbash_state|bishbash_state)|\/auth\/v1\//.test(url)) return;
    records.push({
      label,
      method: request.method(),
      failed: true,
      url: url.replace(/\?.*$/, ''),
      errorText: request.failure()?.errorText ?? 'unknown',
    });
  });
  return records;
}

function logSyncNetworkDiagnostics(records) {
  console.log(`[staging-save] network: ${JSON.stringify(records)}`);
}

async function waitForSharedStateSave(page) {
  await page.waitForResponse((response) => {
    const method = response.request().method();
    return /\/rest\/v1\/(mybishbash_state|bishbash_state)/.test(response.url()) &&
      ['POST', 'PATCH', 'PUT'].includes(method) &&
      response.status() >= 200 &&
      response.status() < 300;
  }, { timeout: 15000 });
}

async function openCardMenu(card) {
  const menuButton = card.locator('.collection-preview-menu-trigger').last();
  await expect(menuButton).toBeVisible({ timeout: 5000 });
  await menuButton.click({ force: true, timeout: 5000 });
}

async function expectSafeInterceptState(page) {
  await expect(
    page.getByTestId('card-overlay-personal')
      .or(page.getByTestId('card-overlay-interruption'))
      .or(page.getByTestId('card-overlay-empty'))
      .or(page.getByTestId('continue-to-app-card'))
      .or(page.getByText(/caught up|continue to safari|before you open|getting your card ready/i))
      .first(),
  ).toBeVisible({ timeout: 30000 });
}

async function reachContinueToAppState(page) {
  if (await page.getByTestId('continue-to-app-card').isVisible().catch(() => false)) return;
  if (await page.getByTestId('card-action-continue-to-app').isVisible().catch(() => false)) return;
  if (await page.getByRole('link', { name: /continue to safari|continue to app/i }).isVisible().catch(() => false)) return;
  const done = page.getByTestId('card-action-done');
  if (await done.isVisible().catch(() => false)) {
    await done.click();
    await expect(
      page.getByTestId('continue-to-app-card')
        .or(page.getByTestId('card-action-continue-to-app'))
        .or(page.getByRole('link', { name: /continue to safari|continue to app/i }))
        .first(),
    ).toBeVisible({ timeout: 10000 });
  }
}

async function clickContinueToApp(page) {
  const continueButton = page.getByTestId('continue-to-app-primary')
    .or(page.getByTestId('card-action-continue-to-app'))
    .or(page.getByRole('button', { name: /continue to safari|continue to app/i }))
    .or(page.getByRole('link', { name: /continue to safari|continue to app/i }));
  await continueButton.first().click();
}

async function openRealAppFromActiveCard(page, launcherId, label) {
  const personalOverlay = page.getByTestId('card-overlay-personal');
  const appPackOverlay = page.getByTestId('card-overlay-interruption');
  await expect(
    personalOverlay
      .or(appPackOverlay)
      .first(),
  ).toBeVisible({ timeout: 30000 });
  await expect.poll(() => getDestinationAttempts(page), { message: `${label} should not auto-open before user action` }).toHaveLength(0);
  await page.evaluate(() => { window.__MYBISHBASH_CARD_OVERLAY_MOUNTS = window.__MYBISHBASH_CARD_OVERLAY_MOUNTS ?? []; });

  if (await personalOverlay.isVisible().catch(() => false)) {
    const appButton = personalOverlay.getByTestId(`fake-launcher-${launcherId}`).getByText(label, { exact: true });
    await expect(appButton, `${label} in-card app-name button should be visible`).toBeVisible({ timeout: 10000 });
    const cardMountsBeforeTap = await page.evaluate(() => window.__MYBISHBASH_CARD_OVERLAY_MOUNTS?.length ?? 0);
    await appButton.click();
    const latest = await waitForDestinationAttempt(page);
    return { latest, mode: 'personal', cardMountsBeforeTap };
  }

  const continueButton = appPackOverlay
    .getByRole('button', { name: new RegExp(`continue to ${label}`, 'i') })
    .or(appPackOverlay.getByRole('link', { name: new RegExp(`continue to ${label}`, 'i') }));
  await expect(continueButton.first(), `${label} app pack continue button should be visible`).toBeVisible({ timeout: 10000 });
  await continueButton.first().click();
  const latest = await waitForDestinationAttempt(page);
  return { latest, mode: 'app-pack', cardMountsBeforeTap: null };
}
