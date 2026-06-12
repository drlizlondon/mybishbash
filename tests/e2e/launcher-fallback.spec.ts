import { expect, test, type Page } from '@playwright/test';

/**
 * Timed web-fallback for silent custom-scheme failures (commit b8b130b).
 *
 * Chromium aborts navigation to an unregistered scheme (instagram://app)
 * silently — exactly the behaviour of iOS when the native app is not
 * installed — so these tests exercise the REAL failure path: the scheme
 * attempt no-ops, the 1.4s timer fires, and the https fallback navigates.
 *
 * Deliberately not covered here (manual device checks):
 *  - iOS with the app installed (timer must cancel on pagehide)
 *  - x-safari- behaviour in a standalone PWA on iOS 16 vs 17
 */

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function seedE2EState(page: Page, extraSeed: Record<string, string> = {}) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem('MYBISHBASH_E2E_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_E2E_TESTER_MODE', 'true');
    window.localStorage.setItem('MYBISHBASH_DEMO_MODE', 'true');
    window.localStorage.setItem('mybishbash.setup-complete.v1', 'true');
    window.localStorage.setItem('mybishbash.profile.v1', JSON.stringify({ name: 'E2E', timezone: 'Europe/London' }));
    window.localStorage.setItem('mybishbash.cards.v1', '[]');
    window.localStorage.setItem('mybishbash.event-log.v1', '[]');
    window.localStorage.setItem('mybishbash.offline-event-queue.v1', '[]');
    Object.entries(seed).forEach(([key, value]) => window.localStorage.setItem(key, value));
  }, extraSeed);
}

function stubDestination(page: Page, pattern: string, marker: string) {
  return page.route(pattern, (route) =>
    route.fulfill({ contentType: 'text/html', body: `<html><body data-stub="${marker}">${marker}</body></html>` }),
  );
}

test.describe('iOS custom-scheme failure recovers via timed web fallback', () => {
  test.use({ userAgent: IPHONE_UA });

  test('continue-to-app with no native app lands on web fallback via the timer', async ({ page }) => {
    // Continue-to-app (reason user_pressed_continue) is the path that prefers
    // the native scheme on iOS; settings taps and pause-bypass use the fast
    // web destination and never need the timer.
    await seedE2EState(page, {
      'mybishbash.launcher-behavior-settings.v1': JSON.stringify({
        instagram: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: '' },
      }),
    });
    await stubDestination(page, 'https://www.instagram.com/**', 'instagram-web');
    const consoleLines: string[] = [];
    page.on('console', (message) => consoleLines.push(message.text()));

    // No cards + interruptions off → caught-up screen. Continue renders as an
    // ANCHOR with href=instagram://app (anchor-default navigation path).
    await page.goto('/mybishbash/intercept/instagram');
    const continueLink = page.getByTestId('card-action-continue-to-app');
    await expect(continueLink).toHaveAttribute('href', 'instagram://app');
    await continueLink.click();

    // instagram://app is aborted silently; the 1.4s timer must recover.
    await expect(page.locator('[data-stub="instagram-web"]')).toBeVisible({ timeout: 6000 });

    // Prove the scheme was attempted and the TIMER did the recovery — i.e.
    // the iOS branch picked instagram://app, not a web-first branch.
    expect(consoleLines.some((line) => line.includes('instagram://app'))).toBe(true);
    expect(consoleLines.some((line) => line.includes('Native scheme did not open'))).toBe(true);
  });

  test('safari launcher in a browser tab opens https directly (x-safari stripped outside standalone)', async ({ page }) => {
    await seedE2EState(page);
    await stubDestination(page, 'https://www.google.com/**', 'google-web');
    await page.goto('/mybishbash/home');

    await page.evaluate(() => {
      (window as any).__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH('safari', 'settings_fake_launcher');
    });

    await expect(page.locator('[data-stub="google-web"]')).toBeVisible({ timeout: 6000 });
  });
});

test('HQ-created dynamic launcher opens its https web fallback', async ({ page }) => {
  await seedE2EState(page, {
    // Registered synchronously from cache in main.jsx before first render.
    'mybishbash.dynamic-launchers.v1': JSON.stringify([
      {
        id: 'testapp',
        isCustom: true,
        displayName: 'Test App',
        availabilityStatus: 'tester_only',
        webFallbackUrl: 'https://example.com/testapp',
      },
    ]),
  });
  await stubDestination(page, 'https://example.com/**', 'dynamic-web');
  await page.goto('/mybishbash/home');

  await page.evaluate(() => {
    (window as any).__MYBISHBASH_E2E_FAKE_LAUNCHER_LAUNCH('testapp', 'settings_fake_launcher');
  });

  // https destination navigates immediately — no timer involved.
  await expect(page.locator('[data-stub="dynamic-web"]')).toBeVisible({ timeout: 6000 });
});
