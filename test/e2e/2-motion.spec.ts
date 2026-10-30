import { expect, test } from '@playwright/test';

test('first visit plays the intro, Skip ends it, the next page does not replay it', async ({
  page,
}) => {
  await page.goto('/');
  const loader = page.getByTestId('loader');
  await expect(loader).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(loader).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(loader).toBeHidden();
});

test('reduced motion: no intro, no transit, no atmosphere animation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('loader')).toBeHidden({ timeout: 2000 });
  await page.getByRole('link', { name: 'Roster' }).first().click();
  await expect(page).toHaveURL(/roster/);
  await expect(page.getByTestId('loader')).toBeHidden();
  await page.waitForTimeout(2500);
  const painted = await page.evaluate(() =>
    [...document.querySelectorAll('canvas.fixed')].some((c) => {
      const x = (c as HTMLCanvasElement).getContext('2d')?.getImageData(0, 0, 50, 50).data ?? [];
      return [...x].some((v, i) => i % 4 === 3 && v > 0);
    }),
  );
  expect(painted).toBe(false);
  await ctx.close();
});

test('a transit scene plays between pages and gets out of the way', async ({ page, context }) => {
  await context.addCookies([
    {
      name: 'cm_seen',
      value: '1',
      url: page.url() === 'about:blank' ? 'http://localhost:4345' : page.url(),
    },
  ]);
  await page.goto('/');
  await page.getByRole('link', { name: 'Arena' }).first().click();
  await expect(page).toHaveURL(/arena/);
  await expect(page.getByTestId('loader')).toBeHidden({ timeout: 3000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('typing "kapow" outside a field triggers the easter egg', async ({ page, context }) => {
  await context.addCookies([{ name: 'cm_seen', value: '1', url: 'http://localhost:4345' }]);
  await page.goto('/about');
  await page.waitForTimeout(500);
  await page.keyboard.type('kapow');
  await expect(page.getByText('KAPOW! You found an easter egg.')).toBeVisible();
});
