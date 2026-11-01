import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function axe(page: Page) {
  // Let whileInView entrances settle before measuring contrast.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  const r = await new AxeBuilder({ page }).disableRules(['region']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

const PAGES = [
  '/',
  '/roster',
  '/c/spider-man',
  '/c/shaktimaan',
  '/originals',
  '/themes',
  '/rumours',
  '/timeline',
  '/gadgets',
  '/freefall',
  '/gadgets/batmobile',
  '/versus',
  '/arena',
  '/about',
];

for (const path of PAGES) {
  test(`${path} renders with no serious a11y issues`, async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    await axe(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('mobile 375px has no horizontal scroll', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  for (const path of ['/', '/c/batman', '/themes', '/arena']) {
    await page.goto(path);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over, path).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});

test('dock switches theme instantly and the choice survives a reload (SSR, no flash)', async ({
  page,
}) => {
  await page.goto('/');
  const dock = page.getByRole('complementary', { name: 'Quick themes' });
  const second = dock.getByRole('button').nth(1);
  const name = (await second.getAttribute('title')) ?? '';
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  const c1 = await page.evaluate(() => document.documentElement.style.getPropertyValue('--c1'));
  await page.reload();
  const html = await (await page.request.get('/')).text();
  expect(html).toContain(`--c1:${c1.trim()}`);
  expect(name).not.toBe('');
});

test('theme shop lists everything but downloads a pack only on Get', async ({ page }) => {
  const packs: string[] = [];
  page.on('request', (r) => r.url().includes('/themes/pack/') && packs.push(r.url()));
  await page.goto('/themes');
  await expect(page.getByRole('heading', { name: 'Theme shop' })).toBeVisible();
  expect(packs).toHaveLength(0);
  await page.getByRole('button', { name: 'Get' }).first().click();
  await expect.poll(() => packs.length).toBe(1);
  await expect(page.getByRole('heading', { name: /My locker/ })).toBeVisible();
});

test('roster filters on the server and pages', async ({ page }) => {
  await page.goto('/roster?u=indian');
  const cards = page.locator('main li a[href^="/c/"]');
  await expect(cards.first()).toBeVisible();
  for (const href of await cards.evaluateAll((as) => as.map((a) => a.getAttribute('href'))))
    expect(href).toMatch(/^\/c\//);
  await page.goto('/roster?q=zzzzzz');
  await expect(page.getByText('Nobody matches')).toBeVisible();
});

test('join, post a take, react, and vote in a Versus', async ({ page }) => {
  const name = `fan_${Date.now() % 100000}`;
  await page.goto('/join?next=/c/batman');
  await page.getByLabel('Nickname').fill(name);
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Create & sign in' }).click();
  await expect(page).toHaveURL(/\/c\/batman/);
  // Unique per run, so a repeated run (or a retry) never matches an earlier take.
  const take = `Prep time is the real superpower here, says ${name}.`;
  await page.getByLabel('Your take').fill(take);
  await page.getByRole('button', { name: 'Post it' }).click();
  const bubble = page.locator('article.bubble', { hasText: take });
  await expect(bubble).toBeVisible();
  await bubble.getByRole('button', { name: /^FACTS/ }).click();
  await expect(bubble.getByRole('button', { name: /^FACTS/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Your take').fill('see http://spam.example');
  await page.getByRole('button', { name: 'Post it' }).click();
  await expect(page.getByText('No links')).toBeVisible();

  await page.goto('/versus');
  await page.locator('a[href^="/versus/"]').first().click();
  const team = page.getByRole('button', { name: /^I'm Team/ }).first();
  await team.click();
  await expect(page.getByRole('button', { name: /Team .* ✓/ })).toBeVisible();
});

test('cross-site POSTs are refused', async ({ request }) => {
  const r = await request.post('/api/vote', {
    headers: { Origin: 'https://evil.example' },
    form: { versus: '1', side: 'a' },
  });
  expect(r.status()).toBe(403);
});

test('security headers are set', async ({ request }) => {
  const r = await request.get('/');
  expect(r.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(r.headers()['x-content-type-options']).toBe('nosniff');
});
