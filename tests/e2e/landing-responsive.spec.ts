import { expect, test } from '@playwright/test';

const phoneViewports = [
  { name: 'narrow 320px phone', width: 320, height: 740 },
  { name: 'small 360px phone', width: 360, height: 780 },
  { name: 'standard 390px phone', width: 390, height: 844 },
  { name: 'large 430px phone', width: 430, height: 932 },
];

const textSelectors = [
  '.hero-title',
  '.hero-title-line',
  '.hero-copy',
  '.hero-copy p',
  '.hero-actions',
  '.button',
  '.proof-item',
  '.proof-item h2',
  '.proof-item p',
  '.statement-strip p',
  '.section-title',
  '.section-lede',
  '.hiw-step',
  '.hiw-step-title',
  '.hiw-step-copy',
  '.mech-card',
  '.mech-title',
  '.mech-copy',
  '.price-card',
  '.price-features li',
  '.faq-item',
  '.faq-q button',
  '.final-title',
  '.final-copy',
];

for (const viewport of phoneViewports) {
  test(`landing page copy does not clip on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/mybishbash/');
    await expect(page.locator('#hero-title')).toBeVisible();

    const pageOverflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(pageOverflow.clientWidth + 1);

    const overflowing = await page.evaluate((selectors) => {
      return selectors.flatMap((selector) => {
        return [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((element) => {
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            return element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
          })
          .map((element) => ({
            selector,
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }));
      });
    }, textSelectors);

    expect(overflowing).toEqual([]);
  });
}
