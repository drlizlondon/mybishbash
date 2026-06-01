import { expect, test, devices } from '@playwright/test';

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

test.describe('MyBishBash staging release E2E', () => {
  test.skip(Boolean(skipReason), skipReason ?? '');
  test.describe.configure({ mode: 'serial' });

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

  test('brand-new account signup or login reaches a safe app state', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await page.goto(stagingUrl);
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

  test('Device A create/edit/delete card and Device B confirms sync', async ({ browser }) => {
    const unique = new Date().toISOString().replace(/[:.]/g, '-');
    const cardName = `QA sync card ${unique}`;
    const editedName = `${cardName} edited`;
    report.qaCardName = cardName;
    report.qaEditedCardName = editedName;
    console.log(`QA sync card: ${cardName}`);

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const consoleErrorsA = installConsoleErrorGuard(pageA);
    const consoleErrorsB = installConsoleErrorGuard(pageB);

    await openAndLogin(pageA, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD);
    await openAndLogin(pageB, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD);

    await createCard(pageA, cardName);
    await waitForCardOnDevice(pageB, cardName, 'created card appears on Device B');

    await editCard(pageA, cardName, editedName);
    await waitForCardOnDevice(pageB, editedName, 'edited card appears on Device B');

    await deleteCard(pageA, editedName);
    await waitForCardAbsentOnDevice(pageB, editedName, 'deleted card disappears on Device B');

    await expectNoConsoleErrors(consoleErrorsA);
    await expectNoConsoleErrors(consoleErrorsB);
    report.checks.push({ status: 'PASS', name: 'Device A create/edit/delete card and Device B sync' });

    await contextA.close();
    await contextB.close();
  });

  test('Home fake launchers open destinations without creating cards', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = installConsoleErrorGuard(page);

    await installDestinationCapture(page);
    await openAndLogin(page, process.env.MYBISHBASH_EXISTING_TEST_EMAIL, process.env.MYBISHBASH_EXISTING_TEST_PASSWORD, '/home');

    for (const [launcherId, expected] of Object.entries({
      safari: safariDesktopDestination,
      youtube: /^https:\/\/www\.youtube\.com/i,
      instagram: /^https:\/\/www\.instagram\.com/i,
    })) {
      const launcher = page.getByTestId(`fake-launcher-${launcherId}`);
      await expect(launcher, `Test account needs ${launcherId} fake launcher enabled on /home`).toBeVisible();
      await launcher.click();
      const latest = await waitForDestinationAttempt(page);
      expect(latest.href, `${launcherId} should open configured destination`).toMatch(expected);
      await expect(page.getByTestId('card-overlay-personal')).toHaveCount(0);
      await expect(page.getByTestId('continue-to-app-card')).toHaveCount(0);
    }

    await expectNoConsoleErrors(consoleErrors);
    report.checks.push({ status: 'PASS', name: 'Home fake launchers open destinations' });

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
    await page.getByTestId('bottom-nav-settings').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await navigateWithinStaging(page, '/intercept/safari');
    await expectSafeInterceptState(page);
    await navigateWithinStaging(page, '/home');
    await page.getByTestId('fake-launcher-safari').click();
    const latest = await waitForDestinationAttempt(page);
    expect(latest.href).toMatch(safariIOSDestination);
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
    const request = response.request();
    const isSpaDocumentFallback = request.resourceType() === 'document' && response.status() === 404 && response.url().includes('/mybishbash/');
    if (isSpaDocumentFallback) return;
    errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectNoConsoleErrors(errors) {
  const allowed = errors.filter((message) => !/favicon|ResizeObserver loop limit exceeded/i.test(message));
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

async function openAndLogin(page, email, password, path = '/') {
  await navigateWithinStaging(page, path);
  await waitForAppEntry(page);
  if (await page.getByTestId('app-shell').isVisible().catch(() => false)) return;

  await switchToLoginIfNeeded(page);
  await fillAuthForm(page, { email, password });
  await page.getByRole('button', { name: /log in/i }).click();
  await expectHomeOrSafeApp(page);
}

async function waitForAppEntry(page) {
  await expect(page.getByTestId('sync-screen').or(page.getByTestId('app-shell')).or(page.getByText(/Make MyBishBash/i))).toBeVisible({ timeout: 20000 });
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
  await expect(page.getByTestId('app-shell').or(page.getByTestId('sync-screen')).or(page.getByText(/Make MyBishBash/i))).toBeVisible({ timeout: 30000 });
}

async function expectHomeOnboardingOrSafeAuth(page, timeout = 10000) {
  await expect(page.getByTestId('app-shell').or(page.getByTestId('sync-screen')).or(page.getByText(/Make MyBishBash|onboarding|check your email/i))).toBeVisible({ timeout });
}

async function expectNoCrashState(page) {
  await expect(page.getByText(/something went wrong|uncaught|application error/i)).toHaveCount(0);
}

async function expectSafeSyncState(page) {
  await expect(page.getByTestId('app-shell').or(page.getByTestId('sync-screen'))).toBeVisible({ timeout: 30000 });
}

async function createCard(page, cardName) {
  await navigateWithinStaging(page, '/home');
  await page.getByTestId('create-card-button').or(page.getByTestId('empty-create-card-button')).first().click();
  await page.getByTestId('card-prompt-input').fill(cardName);
  await page.getByTestId('save-card-button').click();
  await expect(page.getByRole('heading', { name: cardName })).toBeVisible({ timeout: 10000 });
}

async function editCard(page, oldName, newName) {
  await navigateWithinStaging(page, '/home');
  const card = page.getByRole('heading', { name: oldName }).locator('..').locator('..');
  await card.getByRole('button', { name: /card menu/i }).click();
  await page.getByRole('button', { name: /^edit$/i }).click();
  await page.getByTestId('card-prompt-input').fill(newName);
  await page.getByTestId('save-card-button').click();
  await expect(page.getByRole('heading', { name: newName })).toBeVisible({ timeout: 10000 });
}

async function deleteCard(page, cardName) {
  await navigateWithinStaging(page, '/home');
  const card = page.getByRole('heading', { name: cardName }).locator('..').locator('..');
  await card.getByRole('button', { name: /card menu/i }).click();
  await page.getByRole('button', { name: /^delete$/i }).click();
  await expect(page.getByRole('heading', { name: cardName })).toHaveCount(0, { timeout: 10000 });
}

async function waitForCardOnDevice(page, cardName, message) {
  await expect.poll(
    async () => {
      await navigateWithinStaging(page, '/home');
      return page.getByRole('heading', { name: cardName }).count();
    },
    { message, timeout: 90000, intervals: [1000, 2000, 3000, 5000] },
  ).toBeGreaterThan(0);
}

async function waitForCardAbsentOnDevice(page, cardName, message) {
  await expect.poll(
    async () => {
      await navigateWithinStaging(page, '/home');
      return page.getByRole('heading', { name: cardName }).count();
    },
    { message, timeout: 90000, intervals: [1000, 2000, 3000, 5000] },
  ).toBe(0);
}

async function expectSafeInterceptState(page) {
  await expect(
    page.getByTestId('card-overlay-personal')
      .or(page.getByTestId('card-overlay-interruption'))
      .or(page.getByTestId('card-overlay-empty'))
      .or(page.getByTestId('continue-to-app-card'))
      .or(page.getByText(/caught up|continue to safari|before you open|getting your card ready/i)),
  ).toBeVisible({ timeout: 30000 });
}

async function reachContinueToAppState(page) {
  if (await page.getByTestId('continue-to-app-card').isVisible().catch(() => false)) return;
  if (await page.getByTestId('card-action-continue-to-app').isVisible().catch(() => false)) return;
  const done = page.getByTestId('card-action-done');
  if (await done.isVisible().catch(() => false)) {
    await done.click();
    await expect(page.getByTestId('continue-to-app-card').or(page.getByTestId('card-action-continue-to-app'))).toBeVisible({ timeout: 10000 });
  }
}

async function clickContinueToApp(page) {
  const continueButton = page.getByTestId('continue-to-app-primary')
    .or(page.getByTestId('card-action-continue-to-app'))
    .or(page.getByRole('button', { name: /continue to safari|continue to app/i }));
  await continueButton.first().click();
}
