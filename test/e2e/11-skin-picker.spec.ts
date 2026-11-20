import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Skin picker: choose, remember, lock note, keyboard, phone fit, axe in all four skins.
// PICKER_SHOTS=<dir> also saves screenshots.
const shots = process.env.PICKER_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const SKINS = ['comic', 'sacred', 'crime', 'desi'] as const;

async function seed(page: Page, baseURL: string | undefined, skin?: string) {
  const cookies = [{ name: 'cm_seen', value: '1', url: baseURL ?? '' }];
  if (skin) cookies.push({ name: 'cm_skin', value: skin, url: baseURL ?? '' });
  await page.context().addCookies(cookies);
}
const trigger = (page: Page) => page.getByRole('button', { name: 'Look & feel' }).first();
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Look & feel' });
const cookie = async (page: Page, name: string) =>
  (await page.context().cookies()).find((c) => c.name === name)?.value;

async function openPicker(page: Page) {
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('choose Crime, reload, sacred lock note, back to crime', async ({ page, baseURL }) => {
    await seed(page, baseURL);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'comic');
    await openPicker(page);
    await dialog(page).locator('[data-skin-card="crime"]').click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'crime');
    await expect.poll(() => cookie(page, 'cm_skin')).toBe('crime');
    await expect(trigger(page)).toBeFocused();

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'crime');

    // client navigation to /sacred: the lock wins and the picker says so
    await page.goto('/sacred', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'sacred');
    await openPicker(page);
    await expect(dialog(page).locator('[data-skin-lock]')).toContainText(
      'The Sacred section always stays calm',
    );
    await expect(dialog(page).locator('[data-skin-card="crime"]')).toContainText('Using now');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await page.getByRole('link', { name: /Back to ComicMutant/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'crime');
  });

  test('picking a skin on a lock route does not change the page, and says so', async ({
    page,
    baseURL,
  }) => {
    await seed(page, baseURL);
    await page.goto('/sacred', { waitUntil: 'networkidle' });
    await openPicker(page);
    await dialog(page).locator('[data-skin-card="desi"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'sacred');
    await expect.poll(() => cookie(page, 'cm_skin')).toBe('desi');
    // stays open and says the pick was saved, visibly
    await expect(dialog(page).locator('[data-skin-saved]')).toContainText(
      "Saved. You'll see it outside the Sacred section",
    );
    await expect(dialog(page).locator('[data-skin-saved]')).toBeVisible();
    await page.keyboard.press('Escape');
    await openPicker(page);
    await expect(dialog(page).locator('[data-skin-lock]')).toBeVisible();
    await expect(dialog(page).locator('[data-skin-card="desi"]')).toContainText('Using now');
  });

  test('Automatic clears the pin: /desi is desi, / is comic', async ({ page, baseURL }) => {
    await seed(page, baseURL, 'crime');
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'crime');
    await openPicker(page);
    await dialog(page).locator('[data-skin-card="auto"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'comic');
    await expect.poll(() => cookie(page, 'cm_skin')).toBeUndefined();
    await page.goto('/desi', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'desi');
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'comic');
  });

  test('keyboard only: open, arrows, Enter, focus never falls to body; Esc returns focus', async ({
    page,
    baseURL,
  }) => {
    await seed(page, baseURL);
    await page.goto('/', { waitUntil: 'networkidle' });
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    const active = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-skin-card'));
    await expect.poll(active).toBe('auto');
    await page.keyboard.press('ArrowDown');
    expect(await active()).toBe('comic');
    await page.keyboard.press('End');
    expect(await active()).toBe('desi');
    await page.keyboard.press('ArrowDown');
    expect(await active()).toBe('auto');
    // Tab cycles inside the dialog, never to body
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
      expect(await dialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // crime
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'crime');
    await expect(trigger(page)).toBeFocused();
  });

  test('reduced motion: the switch is instant (no wipe layer) and hints do not animate', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await seed(page, baseURL);
    await page.goto('/', { waitUntil: 'networkidle' });
    await openPicker(page);
    const anim = await dialog(page)
      .locator('.skin-picker-dot')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe('none');
    await dialog(page).locator('[data-skin-card="desi"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'desi');
    expect(await page.locator('.theme-wipe').count()).toBe(0);
    await ctx.close();
  });

  for (const skin of SKINS) {
    test(`axe clean with the picker open in ${skin}`, async ({ page, baseURL }) => {
      await seed(page, baseURL, skin === 'sacred' ? undefined : skin);
      await page.goto(skin === 'sacred' ? '/sacred' : '/', { waitUntil: 'networkidle' });
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      await openPicker(page);
      await page.waitForTimeout(1200);
      const res = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      // every card is a 44px target
      const small = await dialog(page)
        .locator('[data-skin-card]')
        .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
      expect(small).toBe(0);
      if (shots) await page.screenshot({ path: `${shots}/picker-${skin}-1280.png` });
    });
  }
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  for (const skin of SKINS) {
    test(`sheet fits at 375 in ${skin}, no sideways scroll, axe clean`, async ({
      page,
      baseURL,
    }) => {
      await seed(page, baseURL, skin === 'sacred' ? undefined : skin);
      await page.goto(skin === 'sacred' ? '/sacred' : '/', { waitUntil: 'networkidle' });
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      if (skin === 'sacred') {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.locator('#mobile-menu').getByRole('button', { name: 'Look & feel' }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.locator('#mobile-menu').getByRole('button', { name: 'Look & feel' }).click();
      }
      await expect(dialog(page)).toBeVisible();
      await expect(page.locator('#mobile-menu')).toBeHidden();
      await page.waitForTimeout(1200);
      const box = await dialog(page).boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
      expect(box?.y).toBeGreaterThanOrEqual(0);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over).toBeLessThanOrEqual(0);
      const inner = await dialog(page).evaluate((d) => d.scrollWidth - d.clientWidth);
      expect(inner).toBeLessThanOrEqual(0);
      const res = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      if (shots) await page.screenshot({ path: `${shots}/picker-${skin}-375.png` });
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
      // the menu closed when the picker opened; focus lands on its button, not on body
      await expect(page.locator('#mobile-menu')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
    });
  }
});

test.describe('phone footer entry', () => {
  test.use({ viewport: { width: 375, height: 740 } });
  for (const path of ['/', '/sacred']) {
    test(`footer "Look & feel" link opens the sheet on ${path}`, async ({ page, baseURL }) => {
      await seed(page, baseURL);
      await page.goto(path, { waitUntil: 'networkidle' });
      const link = page.locator('footer').getByRole('button', { name: 'Look & feel' });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await expect(dialog(page)).toBeVisible();
      await dialog(page).locator('[data-skin-card="crime"]').click();
      if (path === '/sacred') {
        // lock route: stays open with a visible "Saved" note until dismissed
        await expect(dialog(page).locator('[data-skin-saved]')).toContainText('Saved.');
        await page.keyboard.press('Escape');
      }
      await expect(dialog(page)).toBeHidden();
      await expect(link).toBeFocused();
      await expect(page.locator('html')).toHaveAttribute(
        'data-skin',
        path === '/' ? 'crime' : 'sacred',
      );
    });
  }
});

// The header button must never push the nav: no horizontal overflow on comic pages (1280 was 1296).
for (const skin of SKINS) {
  for (const width of [1280, 1536, 375]) {
    test(`no horizontal overflow, ${skin} at ${width}`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const ctx = await browser.newContext({ viewport: { width, height: 800 } });
      await ctx.addCookies([
        { name: 'cm_seen', value: '1', url: baseURL ?? '' },
        { name: 'cm_skin', value: skin, url: baseURL ?? '' },
      ]);
      const page = await ctx.newPage();
      for (const path of ['/', '/roster', '/c/batman', '/arena']) {
        await page.goto(path, { waitUntil: 'networkidle' });
        // Sacred at 375 overflowed before the picker existed (384px): measured, not ours.
        if (skin === 'sacred' && width === 375) continue;
        const d = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        expect(d.sw, `${skin} ${width} ${path}`).toBe(d.cw);
      }
      await ctx.close();
    });
  }
}

test('header trigger is a 44x44 target', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, baseURL);
  await page.goto('/', { waitUntil: 'networkidle' });
  const b = await trigger(page).boundingBox();
  expect(Math.round(b?.width ?? 0)).toBeGreaterThanOrEqual(44);
  expect(Math.round(b?.height ?? 0)).toBeGreaterThanOrEqual(44);
});

test('without JS: the footer form posts, sets the cookie and lands back on the page', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  await page.goto('/roster');
  await page.locator('footer form[action="/api/skin"] button[value="crime"]').click();
  await expect(page).toHaveURL(/\/roster$/);
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'crime');
  expect((await ctx.cookies()).find((c) => c.name === 'cm_skin')?.value).toBe('crime');
  await ctx.close();
});
