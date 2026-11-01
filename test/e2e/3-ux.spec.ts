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

test('freefall: a guest can dive on a phone and pause; site chrome steps aside', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  await ctx.addCookies([
    { name: 'cm_seen', value: '1', url: test.info().project.use.baseURL ?? '' },
  ]);
  const page = await ctx.newPage();
  await page.goto('/freefall');
  await page.getByRole('button', { name: 'Start the dive' }).tap();
  const pause = page.getByRole('button', { name: 'Pause' });
  await expect(pause).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-in-game', '');
  // Dive/Brake are pointer-only (aria-hidden); keys cover them for assistive tech.
  await expect(page.locator('button', { hasText: /^Dive$/ })).toBeVisible();
  await pause.tap();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  // Paused keeps the full-screen dive layout (no jump); the menu offers practice, not a re-dive.
  await expect(page.locator('html')).toHaveAttribute('data-in-game', '');
  await expect(page.getByRole('button', { name: 'Restart as practice' })).toBeVisible();
  await ctx.close();
});

test('freefall: posting needs an account and a verifiable run', async ({ request, baseURL }) => {
  const headers = { origin: baseURL ?? '' };
  const start = await request.post('/api/freefall/start', {
    headers,
    data: { mode: 'practice', level: 'easy' },
  });
  const { token } = (await start.json()) as { token: string };
  expect(token).toBeTruthy();
  const guest = await request.post('/api/freefall/submit', { headers, data: { token, log: [] } });
  expect(guest.status()).toBe(401);
  const bad = await request.post('/api/freefall/start', { headers, data: { mode: 'x' } });
  expect(bad.status()).toBe(400);
});
