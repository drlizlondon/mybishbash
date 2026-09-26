import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Marketing/consent-banner-vs-cta sweep, 2026-09-26 (mybishbash row):
// at 390x844 the old banner covered 24% of the viewport with truncated
// ("…") text, and even with no banner the hero CTA sat below the fold
// because the H1 wrapped to 5 lines. This spec locks in the fix: a compact
// bottom bar with the full sweep copy, and a hero that leaves "Get
// myBishBash" fully visible above it on first visit.
//
// The consent script (public/mbb-consent.js) only runs on the real
// production hostnames (mybishbash.app / www.mybishbash.app) — see its
// PRODUCTION_HOSTS gate. The e2e preview serves from 127.0.0.1, so most
// cases here intercept the script's own network request and serve a
// version with the test host added to that list (consent-gate skill's
// verification.md: "add the local host to PRODUCTION_HOSTS in a throwaway
// copy — never commit that edit" — done here at request time only, the
// committed file is untouched). One test proves the gate itself still
// blocks the *unmodified* script on a non-production host.

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSENT_SCRIPT_PATH = join(__dirname, '..', '..', 'public', 'mbb-consent.js');

function patchedConsentScript(): string {
  const original = readFileSync(CONSENT_SCRIPT_PATH, 'utf8');
  const patched = original.replace(
    "var PRODUCTION_HOSTS = ['mybishbash.app', 'www.mybishbash.app'];",
    "var PRODUCTION_HOSTS = ['mybishbash.app', 'www.mybishbash.app', '127.0.0.1'];",
  );
  if (patched === original) {
    throw new Error('consent-banner-hero-cta.spec: PRODUCTION_HOSTS pattern not found — script shape changed, update the test.');
  }
  return patched;
}

async function serveProductionHostGatedScript(page: Page) {
  const body = patchedConsentScript();
  await page.route('**/mbb-consent.js', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body }),
  );
}

const VIEWPORT = { width: 390, height: 844 };
const BANNER_SELECTOR = '#mbb-analytics-consent';
const PRIMARY_CTA_SELECTOR = '.hero-actions .button.primary';

test.describe('mybishbash first-visit phone: consent banner + hero CTA', () => {
  test('production-host gate: unmodified script does nothing on a non-production host', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto('/mybishbash/');
    await page.waitForTimeout(1000);
    await expect(page.locator(BANNER_SELECTOR)).toHaveCount(0);
    const analyticsScripts = await page.evaluate(() =>
      [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src)
        .filter((src) => /gtag|clarity|googletagmanager/i.test(src)),
    );
    expect(analyticsScripts).toEqual([]);
  });

  test('banner is a compact bar with the full sweep copy, not truncated, and the primary CTA is fully visible above it', async ({ page }) => {
    await serveProductionHostGatedScript(page);
    await page.setViewportSize(VIEWPORT);
    await page.goto('/mybishbash/');

    const banner = page.locator(BANNER_SELECTOR);
    await expect(banner).toBeVisible();

    const viewportHeight = VIEWPORT.height;
    const bannerBox = await banner.boundingBox();
    expect(bannerBox).not.toBeNull();
    const bannerHeightRatio = bannerBox!.height / viewportHeight;
    expect(bannerHeightRatio).toBeLessThanOrEqual(0.25);

    // No truncation: the text node must not be clipped in either axis, and
    // must contain the sweep's copy-ready sentence verbatim.
    const textNode = page.locator('#mbb-analytics-text');
    await expect(textNode).toContainText(
      'A quieter kind of analytics: it helps us improve myBishBash and stays off unless you allow it.',
    );
    const overflow = await textNode.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 1);

    // Privacy link kept.
    await expect(banner.locator('a[href="/privacy"]')).toContainText('Read our privacy policy');

    // Decline/Accept equal weight: same tag, side by side, same computed box
    // size and border/background style, nothing pre-selected.
    const declineBtn = banner.locator('[data-consent="denied"]');
    const acceptBtn = banner.locator('[data-consent="granted"]');
    await expect(declineBtn).toBeVisible();
    await expect(acceptBtn).toBeVisible();
    const [declineBox, acceptBox, declineStyle, acceptStyle] = await Promise.all([
      declineBtn.boundingBox(),
      acceptBtn.boundingBox(),
      declineBtn.evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, border: s.borderColor, borderWidth: s.borderWidth, color: s.color };
      }),
      acceptBtn.evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, border: s.borderColor, borderWidth: s.borderWidth, color: s.color };
      }),
    ]);
    expect(Math.abs(declineBox!.height - acceptBox!.height)).toBeLessThanOrEqual(1);
    expect(declineStyle).toEqual(acceptStyle);
    expect(await declineBtn.evaluate((el) => (el as HTMLButtonElement).matches(':default, [aria-pressed="true"], [autofocus]'))).toBe(false);
    expect(await acceptBtn.evaluate((el) => (el as HTMLButtonElement).matches(':default, [aria-pressed="true"], [autofocus]'))).toBe(false);

    // The hero primary CTA must be fully on-screen and not covered by the banner.
    const cta = page.locator(PRIMARY_CTA_SELECTOR);
    await expect(cta).toBeVisible();
    const ctaBox = await cta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox!.x).toBeGreaterThanOrEqual(0);
    expect(ctaBox!.y).toBeGreaterThanOrEqual(0);
    expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(VIEWPORT.width + 1);
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(viewportHeight + 1);
    // Not intersecting the banner: CTA's bottom edge sits above the banner's top edge.
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(bannerBox!.y + 1);

    // No horizontal overflow anywhere on the page.
    const pageOverflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(pageOverflow.clientWidth + 1);
  });

  test('decline: banner hides, no analytics requests, choice persists', async ({ page }) => {
    await serveProductionHostGatedScript(page);
    await page.setViewportSize(VIEWPORT);

    const analyticsRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/googletagmanager|google-analytics|clarity\.ms/i.test(url)) analyticsRequests.push(url);
    });

    await page.goto('/mybishbash/');
    await expect(page.locator(BANNER_SELECTOR)).toBeVisible();
    await page.locator('[data-consent="denied"]').click();
    await expect(page.locator(BANNER_SELECTOR)).toHaveCount(0);

    const stored = await page.evaluate(() => window.localStorage.getItem('mbb_analytics_consent_v1'));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).value).toBe('denied');

    await page.waitForTimeout(500);
    expect(analyticsRequests).toEqual([]);

    // Reload: banner must not reappear, still nothing loads.
    await serveProductionHostGatedScript(page);
    await page.reload();
    await expect(page.locator(BANNER_SELECTOR)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(analyticsRequests).toEqual([]);
  });

  test('accept: both analytics tags load', async ({ page }) => {
    await serveProductionHostGatedScript(page);
    await page.setViewportSize(VIEWPORT);
    await page.goto('/mybishbash/');
    await expect(page.locator(BANNER_SELECTOR)).toBeVisible();
    await page.locator('[data-consent="granted"]').click();
    await expect(page.locator(BANNER_SELECTOR)).toHaveCount(0);

    const stored = await page.evaluate(() => window.localStorage.getItem('mbb_analytics_consent_v1'));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).value).toBe('granted');

    await expect.poll(() =>
      page.evaluate(() => Boolean(document.querySelector('script[data-mbb-ga4]'))),
    ).toBe(true);
    await expect.poll(() =>
      page.evaluate(() => Boolean(document.querySelector('script[data-mbb-clarity]'))),
    ).toBe(true);
  });
});
