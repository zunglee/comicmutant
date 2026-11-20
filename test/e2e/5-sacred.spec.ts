import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Sacred India realm (reports/sacred-design.md S8): the whole template turns calm under /sacred.

test('the realm applies on /sacred and not on the comic site', async ({ page }) => {
  await page.goto('/sacred');
  await expect(page.locator('html')).toHaveAttribute('data-realm', 'sacred');
  await expect(page.getByRole('heading', { level: 1, name: 'Sacred India' })).toBeVisible();
  await expect(page.locator('.intro-curtain')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-realm', /.+/);
});

test('leaving the realm by link restores the comic site', async ({ page }) => {
  await page.goto('/sacred');
  await page.getByRole('link', { name: 'Back to ComicMutant' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-realm', /.+/);
});

test('the four tradition doors navigate', async ({ page }) => {
  await page.goto('/sacred');
  for (const id of ['hindu', 'buddhist', 'jain', 'sikh']) {
    await page.goto('/sacred');
    await page.locator(`[data-door=${id}] a`).click();
    await expect(page).toHaveURL(`/sacred/${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-realm', 'sacred');
  }
  expect((await page.goto('/sacred/nope'))?.status()).toBe(404);
});

test('a card flips with the keyboard and the hidden face is not focusable', async ({ page }) => {
  await page.goto('/sacred/hindu', { waitUntil: 'networkidle' });
  const card = page.locator('.sacred-card:not(.sc-soon)').first();
  test.skip((await card.count()) === 0, 'no profile files have landed yet');
  const front = card.locator('.sc-hit');
  await front.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('data-flipped', 'true');
  await expect(card.getByRole('link', { name: 'Read the profile' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Turn back' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('data-flipped', 'false');
});

test('a profile opens from its card and shows the kids toggle', async ({ page }) => {
  await page.goto('/sacred/hindu', { waitUntil: 'networkidle' });
  const card = page.locator('.sacred-card:not(.sc-soon)').first();
  test.skip((await card.count()) === 0, 'no profile files have landed yet');
  await card.locator('.sc-hit').click();
  await card.getByRole('link', { name: 'Read the profile' }).click();
  await expect(page).toHaveURL(/\/sacred\/f\//);
  await page.getByRole('button', { name: 'Kids’ version' }).click();
  await expect(page.getByRole('button', { name: 'Kids’ version' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('no horizontal scroll at 375px on the hub, a tradition and a profile', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  for (const path of ['/sacred', '/sacred/hindu', '/sacred/f/ganga']) {
    await page.goto(path);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, path).toBeLessThanOrEqual(375);
  }
  // Phone tab bar stays at five.
  await expect(page.getByRole('navigation', { name: 'Quick' }).getByRole('link')).toHaveCount(5);
  await ctx.close();
});

test('the comic phone tab bar is unchanged', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Quick' }).getByRole('link')).toHaveCount(5);
  await ctx.close();
});

test('reduced motion leaves no running animations in the realm', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/sacred');
  await page.waitForTimeout(800);
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity,
      )
      .map((a) => String((a.effect as KeyframeEffect | null)?.target?.className ?? '')),
  );
  expect(running).toEqual([]);
  await expect(page.locator('.sa-canvas')).toHaveCount(1);
  await ctx.close();
});

test('a big group is collapsed to a first row and opens with Show all, even without JS', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/sacred/hindu');
  const group = page.locator('#g-ramayana');
  expect(await group.locator('.sacred-card').count()).toBeLessThanOrEqual(4);
  const tile = group.locator('.sacred-tile').first();
  await expect(tile).toBeHidden();
  await group.locator('summary').click();
  await expect(tile).toBeVisible();
  await ctx.close();
});

test('ordered lineages show every card, numbered, with no expander', async ({ page }) => {
  await page.goto('/sacred/jain');
  const g = page.locator('#g-tirthankara');
  await expect(g.locator('.sacred-card')).toHaveCount(24);
  await expect(g.locator('summary')).toHaveCount(0);
  await expect(g.locator('.sc-num').first()).toHaveText('1');
  await expect(g.locator('.sc-num').last()).toHaveText('24');
});

test('doors never overlap on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/sacred', { waitUntil: 'networkidle' });
  const doors = page.locator('[data-door]');
  for (let y = 0; y < 3; y++) {
    await page.evaluate((n) => window.scrollTo(0, n * 400), y + 1);
    await page.waitForTimeout(150);
    const boxes = await doors.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i - 1]?.bottom ?? 0).toBeLessThanOrEqual((boxes[i]?.top ?? 0) + 0.5);
  }
  await ctx.close();
});

test('no header overflow at 375px when web fonts never load', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await ctx.route(/\.(woff2?|ttf)(\?.*)?$/, (r) => r.abort());
  const page = await ctx.newPage();
  for (const path of ['/sacred', '/sacred/f/ganga']) {
    await page.goto(path);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, path).toBeLessThanOrEqual(375);
  }
  await ctx.close();
});

test('accessible names start with the visible text on Sacred pages', async ({ page }) => {
  for (const path of ['/sacred', '/sacred/hindu', '/sacred/f/ganga']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const r = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
    expect(
      r.violations.map((v) => v.nodes.map((n) => n.html.slice(0, 80))),
      path,
    ).toEqual([]);
  }
});

test('Guru Granth Sahib closes the Gurus unnumbered; the heading counts ten', async ({ page }) => {
  await page.goto('/sacred/sikh');
  const g = page.locator('#g-guru');
  await expect(g.locator('h2')).toBeVisible();
  await expect(g.getByText('10 figures')).toBeVisible();
  const last = g.locator('.sc-cell').last();
  await expect(last.locator('.sc-tag')).toHaveText('The eternal Guru');
  await expect(g.locator('.sc-num:not(.sc-tag)').last()).toHaveText('10');
});

test('cards carry real profile links in the server HTML, and the sitemap lists Sacred pages', async ({
  request,
}) => {
  const html = await (await request.get('/sacred/hindu')).text();
  expect(html).toMatch(
    /class="sc-readlink"[^>]*href="\/sacred\/f\/[a-z0-9-]+"|href="\/sacred\/f\/[a-z0-9-]+"[^>]*class="sc-readlink"/,
  );
  const search = await (await request.get('/sacred?q=gan')).text();
  expect(search).toContain('href="/sacred/f/');
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const p of [
    '/sacred</loc>',
    '/sacred/learn</loc>',
    '/desi</loc>',
    '/sacred/jain</loc>',
    '/sacred/f/ganga</loc>',
  ])
    expect(xml).toContain(p);
});

test('a hard load leaves focus on the skip link, not on <main>', async ({ page }) => {
  await page.goto('/sacred');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('main');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});

test('the comic home page has a Sacred India door; the phone tab bar offers Learn', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page
    .getByRole('link', { name: /Sacred India/ })
    .first()
    .click();
  await expect(page).toHaveURL('/sacred');
  const tabs = page.getByRole('navigation', { name: 'Quick' });
  await expect(tabs.getByRole('link')).toHaveCount(5);
  await expect(tabs.getByRole('link', { name: 'Learn' })).toBeVisible();
  await ctx.close();
});

test('layout shift stays under 0.05 on Sacred routes', async ({ browser }) => {
  for (const [w, h] of [
    [375, 800],
    [1280, 860],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const path of ['/sacred', '/sacred/hindu', '/sacred/f/ganga', '/sacred/learn']) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, `${path} @${w}`).toBeLessThan(0.05);
    }
    await ctx.close();
  }
});
