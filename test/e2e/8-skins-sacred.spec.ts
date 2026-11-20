import { expect, test } from '@playwright/test';

// The Sacred realm is a locked skin (reports/skins-design.md T4, sacred-design.md S8): a visitor who
// pinned another skin still sees the calm realm on /sacred, and gets their choice back on leaving.
// No picker is used: the pin is the `cm_skin` cookie the picker would set.

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: 'cm_skin', value: 'crime', url: baseURL ?? '' },
    { name: 'cm_seen', value: '1', url: baseURL ?? '' },
  ]);
});

const skin = (page: import('@playwright/test').Page) =>
  page.locator('html').getAttribute('data-skin');

test('a pinned crime skin still sees sacred on /sacred, with the realm tokens', async ({
  page,
}) => {
  await page.goto('/sacred');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'sacred');
  await expect(page.locator('html')).toHaveAttribute('data-realm', 'sacred');
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      bg: cs.getPropertyValue('--bg').trim(),
      radius: cs.getPropertyValue('--radius-m').trim(),
      scheme: cs.colorScheme,
    };
  });
  expect(t).toEqual({ bg: '#fbf5e6', radius: '18px', scheme: 'light' });
  // A realm heading is the serif display face; a button is the pill.
  const h1 = await page
    .getByRole('heading', { level: 1 })
    .evaluate((e) => getComputedStyle(e).fontFamily);
  expect(h1).toContain('Cormorant Garamond');
  const r = await page
    .locator('.btn')
    .first()
    .evaluate((e) => getComputedStyle(e).borderTopLeftRadius);
  expect(Number.parseFloat(r)).toBeGreaterThan(100);
});

test('leaving the realm restores the pinned skin, returning locks it again', async ({ page }) => {
  await page.goto('/sacred');
  await page.getByRole('link', { name: 'Back to ComicMutant' }).click();
  await expect(page).toHaveURL('/');
  await expect.poll(() => skin(page)).toBe('crime');
  await expect(page.locator('html')).not.toHaveAttribute('data-realm', /.+/);
  await page.goto('/sacred/hindu');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'sacred');
});

test('sacred stays calm: no horizontal scroll at 375 px and fonts preload once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const res = await page.goto('/sacred');
  expect(res?.status()).toBe(200);
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  const hrefs = await page
    .locator('link[rel=preload][as=font]')
    .evaluateAll((l) => l.map((e) => (e as HTMLLinkElement).href));
  expect(hrefs.length).toBe(3);
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(hrefs.some((h) => h.includes('mukta-latin-600'))).toBe(true);
});
