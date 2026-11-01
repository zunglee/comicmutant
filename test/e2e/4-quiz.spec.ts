import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

// Fact Frenzy at phone width. Reduced motion keeps every transition instant, so nothing here waits on
// an animation: each step waits for the element it needs.

test.describe.configure({ mode: 'serial' });

async function phone(browser: Browser, baseURL: string | undefined) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  return { ctx, page: await ctx.newPage() };
}

const nextButton = (page: Page) =>
  page.getByRole('button', { name: /Next question|See my results/ });

/** Plays one question by keyboard and waits for its reveal. Returns true on the last question. */
async function answer(page: Page, i: number, key: string): Promise<boolean> {
  await expect(page.locator(`h2[id="qz-q-${i}"]`)).toBeVisible();
  await page.keyboard.press(key);
  await expect(nextButton(page)).toBeVisible();
  return /results/i.test((await nextButton(page).innerText()) ?? '');
}

async function startFromIntro(page: Page, name: RegExp = /Let's go!|RESUME/) {
  await page.getByRole('button', { name }).click();
}

test('the hub renders: five universe cards, one Tab stop each, no serious axe issues', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await phone(browser, baseURL);
  await page.goto('/quiz');
  await expect(page.getByRole('heading', { level: 1, name: 'Fact Frenzy' })).toBeVisible();
  const cards = page.locator('#universes ul > li a');
  await expect(cards).toHaveCount(5);

  // Park focus on the section heading, then Tab: the next five stops are the five cards, in order.
  await page.locator('#qz-uni').evaluate((el) => el.setAttribute('tabindex', '-1'));
  await page.locator('#qz-uni').focus();
  const hrefs: (string | null)[] = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    hrefs.push(await page.evaluate(() => document.activeElement?.getAttribute('href') ?? null));
  }
  expect(hrefs).toEqual([
    '/quiz/play?mode=universe&u=marvel',
    '/quiz/play?mode=universe&u=dc',
    '/quiz/play?mode=universe&u=indian',
    '/quiz/play?mode=universe&u=anime',
    '/quiz/play?mode=universe&u=other',
  ]);
  // Nothing else inside the universe list takes focus (no dead stops on the list items).
  expect(await page.locator('#universes li[tabindex]').count()).toBe(0);

  const res = await new AxeBuilder({ page }).disableRules(['region']).analyze();
  expect(
    res.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes[0]?.target}`),
  ).toEqual([]);
  await ctx.close();
});

test('a guest plays a whole Marvel game by keyboard to the end screen, without sideways scroll', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await phone(browser, baseURL);
  await page.goto('/quiz/play?mode=universe&u=marvel');
  await startFromIntro(page);
  const keys = ['1', '2', '3', '4'];
  for (let i = 0; i < 10; i++) {
    const last = await answer(page, i, keys[i % 4] as string);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    await page.keyboard.press('Enter');
    if (last) break;
  }
  await expect(page.locator('#qz-end')).toBeVisible();
  // The screen-reader line carries the real score; the visible number counts up to it.
  await expect(page.getByText(/Final score \d+\. \d+ of \d+ right\./)).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await ctx.close();
});

test('on every question the reveal ends above the pinned Next bar', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await phone(browser, baseURL);
  await page.goto('/quiz/play?mode=universe&u=dc');
  await startFromIntro(page);
  let checked = 0;
  for (let i = 0; i < 10; i++) {
    const last = await answer(page, i, ['1', '2', '3', '4'][(i * 3) % 4] as string);
    // The page scrolls just enough after the reveal lands: wait for the boxes to settle clear.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const panel = document.querySelector('[data-reveal]')?.getBoundingClientRect();
            const bar = document.querySelector('[data-nextbar]')?.getBoundingClientRect();
            return panel && bar ? Math.round(panel.bottom - bar.top) : 9999;
          }),
        { timeout: 4000, message: `question ${i + 1}: reveal overlaps the Next bar` },
      )
      .toBeLessThanOrEqual(0);
    checked++;
    await page.keyboard.press('Enter');
    if (last) break;
  }
  expect(checked).toBe(10);
  await ctx.close();
});

test('reloading a daily mid-game offers Resume and continues on the same question', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await phone(browser, baseURL);
  await page.goto('/quiz/play?mode=daily');
  await startFromIntro(page, /Let's go!/);
  await answer(page, 0, '1');
  await page.keyboard.press('Enter');
  await expect(page.locator('h2[id="qz-q-1"]')).toBeVisible();

  await page.reload();
  const resume = page.getByRole('button', { name: 'RESUME' });
  await expect(resume).toBeVisible();
  await expect(page.getByText(/Your daily is open: question 2 of 10/)).toBeVisible();
  await expect(page.getByRole('button', { name: "Let's go!" })).toHaveCount(0);
  await resume.click();
  await expect(page.locator('h2[id="qz-q-1"]')).toBeVisible();
  await expect(page.getByText('Welcome back!')).toBeVisible();
  await ctx.close();
});

test('a guest daily reveal is blind: locked in, nothing marked right or wrong', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await phone(browser, baseURL);
  await page.goto('/quiz/play?mode=daily');
  await startFromIntro(page, /Let's go!/);
  await answer(page, 0, '2');
  const reveal = page.locator('[data-reveal]');
  await expect(reveal).toContainText('LOCKED IN!');
  await expect(reveal).not.toContainText(/Right!|Not quite/);
  await expect(page.locator('.qz-opt[data-state="right"]')).toHaveCount(0);
  await expect(page.locator('.qz-opt[data-state="wrong"]')).toHaveCount(0);
  await expect(page.locator('.qz-opt[data-state="picked"]')).toHaveCount(1);
  await expect(page.locator('#qz-hud').getByText('Blind run', { exact: true })).toBeVisible();
  await ctx.close();
});
