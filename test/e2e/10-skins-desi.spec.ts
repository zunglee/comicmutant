import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// The Desi heroes skin on /desi, an Indian character page and the shared pages: tokens, fonts, jaali
// backdrop, marigold dust, the saffron wipe, accessibility and the Sacred lock.

const PAGES = ['/desi', '/c/nagraj', '/c/shaktimaan', '/c/doga', '/roster', '/', '/quiz', '/arena'];

async function desiContext(
  browser: import('@playwright/test').Browser,
  baseURL: string | undefined,
  opts: { reduced: boolean; width: number },
) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width, height: 800 },
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addCookies([
    { name: 'cm_skin', value: 'desi', url: baseURL ?? '' },
    { name: 'cm_seen', value: '1', url: baseURL ?? '' },
  ]);
  return ctx;
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
}

for (const width of [1280, 375]) {
  test(`desi skin at ${width}px: tokens, no serious axe issues, no horizontal scroll`, async ({
    browser,
    baseURL,
  }) => {
    const ctx = await desiContext(browser, baseURL, { reduced: true, width });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await settle(page);
      const html = page.locator('html');
      await expect(html, path).toHaveAttribute('data-skin', 'desi');
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(over, `${path} horizontal overflow`).toBeLessThanOrEqual(0);
      const r = await new AxeBuilder({ page }).disableRules(['region']).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        bad.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target)}`),
        path,
      ).toEqual([]);
    }
    await ctx.close();
  });
}

test('desi tokens, fonts and jaali backdrop are applied', async ({ browser, baseURL }) => {
  const ctx = await desiContext(browser, baseURL, { reduced: true, width: 1280 });
  const page = await ctx.newPage();
  await page.goto('/desi', { waitUntil: 'networkidle' });
  const s = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      border: cs.getPropertyValue('--border-w').trim(),
      tilt: cs.getPropertyValue('--tilt').trim(),
      display: cs.getPropertyValue('--display-case').trim(),
      bodyBg: getComputedStyle(document.body).backgroundImage,
      yatra: document.fonts.check('16px "Yatra One"'),
      teko: document.fonts.check('16px "Teko"'),
    };
  });
  expect(s.border).toBe('3px');
  expect(s.tilt).toBe('1deg');
  expect(s.display).toBe('uppercase');
  // the jaali lattice: two crossing diagonals over the warm gradient
  expect((s.bodyBg.match(/linear-gradient/g) ?? []).length).toBeGreaterThanOrEqual(3);
  await page.waitForFunction(() => document.fonts.check('16px "Yatra One"'));
  expect(s.teko || (await page.evaluate(() => document.fonts.check('16px "Teko"')))).toBe(true);
  await ctx.close();
});

test('marigold dust drifts under rich FX, sits still under reduced motion', async ({
  browser,
  baseURL,
}) => {
  const snap = (page: Page) =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="marigold-dust"]');
      return c ? c.toDataURL() : null;
    });
  const live = await desiContext(browser, baseURL, { reduced: false, width: 1280 });
  const p1 = await live.newPage();
  await p1.goto('/desi', { waitUntil: 'networkidle' });
  await expect(p1.getByTestId('marigold-dust')).toBeAttached();
  const a = await snap(p1);
  await p1.waitForTimeout(700);
  const b = await snap(p1);
  expect(a).toBeTruthy();
  expect(b).not.toBe(a);
  await live.close();

  const still = await desiContext(browser, baseURL, { reduced: true, width: 1280 });
  const p2 = await still.newPage();
  await p2.goto('/desi', { waitUntil: 'networkidle' });
  await expect(p2.getByTestId('marigold-dust')).toBeAttached();
  const c = await snap(p2);
  await p2.waitForTimeout(700);
  expect(await snap(p2)).toBe(c);
  await still.close();
});

test('the saffron wipe has its sweep and the Sacred lock holds', async ({ browser, baseURL }) => {
  const ctx = await desiContext(browser, baseURL, { reduced: false, width: 1280 });
  const page = await ctx.newPage();
  await page.goto('/desi', { waitUntil: 'networkidle' });
  const anim = await page.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'theme-wipe';
    d.dataset.wipe = 'saffron';
    document.body.appendChild(d);
    const cs = getComputedStyle(d);
    const out = { name: cs.animationName, bg: cs.backgroundImage };
    d.remove();
    return out;
  });
  expect(anim.name).toBe('desi-wipe');
  expect(anim.bg).toContain('linear-gradient');

  await page.goto('/sacred', { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'sacred');
  await ctx.close();
});
