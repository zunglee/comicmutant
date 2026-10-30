import { devices, expect, test } from '@playwright/test';

// Regressions for the UI-UX Pro Max checklist audit (2026-10-30).

test('without JavaScript the intro curtain never covers the page', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.intro-curtain')).toBeHidden();
  await ctx.close();
});

test('on a phone the game can be started by touch', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/arena/fight?p1=bholu-pandey&p2=cato-wren');
  const start = page.getByRole('button', { name: 'Start' });
  await start.scrollIntoViewIfNeeded();
  // The tap must land on Start itself, not on whatever sits under it.
  const box = await start.boundingBox();
  if (!box) throw new Error('Start has no box');
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.textContent?.trim(),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe('Start');
  await start.tap();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await ctx.close();
});

test('a missing page keeps the site navigation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const res = await page.goto('/c/not-a-hero');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Lost in the multiverse' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Footer' })).toBeVisible();
  await ctx.close();
});

test('the arena opens with a ready CPU match', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Quick play vs CPU' })).toBeVisible();
  await page.getByRole('link', { name: /^Play Rumble Royale/ }).click();
  await expect(page).toHaveURL(/\/arena\/fight\?.*vs=cpu/);
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('gadget lab: picking a part highlights it', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/gadgets/batmobile');
  const parts = page.getByRole('list', { name: 'Parts' }).getByRole('button');
  await expect(parts).toHaveCount(6);
  await parts.nth(2).click();
  await expect(parts.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await ctx.close();
});
