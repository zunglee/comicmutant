import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Crime city skin (picker only): every page renders sanely, sacred stays sacred, no horizontal scroll,
// no serious/critical axe issue. CRIME_SHOTS=<dir> also saves screenshots.

const PAGES = ['/', '/roster', '/c/batman', '/arena', '/quiz', '/themes', '/timeline', '/desi'];
const shots = process.env.CRIME_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

async function open(page: Page, baseURL: string | undefined, path: string) {
  await page.context().addCookies([
    { name: 'cm_skin', value: 'crime', url: baseURL ?? '' },
    { name: 'cm_seen', value: '1', url: baseURL ?? '' },
  ]);
  await page.goto(path, { waitUntil: 'networkidle' });
}

for (const width of [1280, 375]) {
  test.describe(`crime at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 375 ? 740 : 800 } });
    for (const path of PAGES) {
      test(`${path} renders, no sideways scroll, axe clean`, async ({ page, baseURL }) => {
        await open(page, baseURL, path);
        await expect(page.locator('html')).toHaveAttribute('data-skin', 'crime');
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, 'horizontal overflow px').toBeLessThanOrEqual(0);
        // whileInView rows (home.tsx:293 starts at opacity 0.4) and entrance slides must settle first.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1500);
        const res = await new AxeBuilder({ page }).analyze();
        const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
        if (shots)
          await page.screenshot({
            path: `${shots}/${path === '/' ? 'home' : path.replace(/\W+/g, '_')}-${width}.png`,
          });
      });
    }
  });
}

test('the neon-rain canvas mounts and paints; still frame under reduced motion', async ({
  browser,
  baseURL,
}) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const ctx = await browser.newContext({ reducedMotion });
    await ctx.addCookies([
      { name: 'cm_skin', value: 'crime', url: baseURL ?? '' },
      { name: 'cm_seen', value: '1', url: baseURL ?? '' },
    ]);
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    const canvas = page.locator('canvas.cr-canvas');
    await expect(canvas).toBeAttached();
    await page.waitForTimeout(2500);
    const painted = await canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
      if (!d) return 0;
      let n = 0;
      for (let i = 3; i < d.length; i += 4 * 13) if (d[i] !== 0) n++;
      return n;
    });
    expect(painted, `painted pixels (${reducedMotion})`).toBeGreaterThan(0);
    await ctx.close();
  }
});

test('/sacred stays sacred and calm', async ({ page, baseURL }) => {
  await open(page, baseURL, '/sacred');
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'sacred');
  await expect(page.locator('canvas.cr-canvas')).toHaveCount(0);
});

test('equipped character themes only tint accents', async ({ page, baseURL }) => {
  await open(page, baseURL, '/c/batman');
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  );
  expect(bg).toBe('#090c14');
});

test('buttons carry the angled cut; glitch wipe is styled', async ({ page, baseURL }) => {
  await open(page, baseURL, '/');
  const clip = await page
    .locator('.btn')
    .first()
    .evaluate((el) => getComputedStyle(el).clipPath);
  expect(clip).toContain('polygon');
  const anim = await page.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'theme-wipe';
    d.dataset.wipe = 'glitch';
    document.body.appendChild(d);
    const n = getComputedStyle(d).animationName;
    d.remove();
    return n;
  });
  expect(anim).toBe('crime-glitch');
});
