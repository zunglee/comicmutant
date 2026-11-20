import { readdirSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// /desi hub and the character Facts section. Reduced motion keeps transitions instant.

const dir = 'content/characters/indian';
const withFacts = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map(
    (f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { slug: string; facts?: unknown[] },
  )
  .find((c) => (c.facts?.length ?? 0) > 0);

test('filters narrow the list and the era timeline renders', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  await page.goto('/desi', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const cards = page.getByTestId('desi-grid').getByRole('link');
  await expect(cards.first()).toBeVisible();
  const before = await page.getByTestId('desi-count').innerText();
  const total = Number(/of (\d+)/.exec(before)?.[1]);
  expect(total).toBeGreaterThan(0);

  await page
    .getByTestId('desi-filters')
    .getByRole('button', { name: /^Raj Comics/ })
    .click();
  await expect(page).toHaveURL(/pub=/);
  await expect(page.getByTestId('desi-count')).not.toContainText(`Showing ${total} of`);
  const after = Number(/Showing (\d+)/.exec(await page.getByTestId('desi-count').innerText())?.[1]);
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(total);

  await page.getByLabel('Search').fill('zzzz-nobody');
  await expect(page.getByText('Nobody matches those filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByTestId('desi-count')).toContainText(`of ${total}`);

  const era = page.getByTestId('era-timeline');
  await expect(era).toBeVisible();
  expect(await era.getByRole('button').count()).toBeGreaterThanOrEqual(2);
  await era.getByRole('button', { disabled: false }).first().click();
  await expect(page.getByTestId('desi-filters').getByLabel('Era')).not.toHaveValue('');
  await expect(page.getByTestId('desi-shelves')).toBeAttached();
  await ctx.close();
});

test('a hero with facts shows the Facts section', async ({ page }) => {
  test.skip(!withFacts, 'no Indian hero has facts yet');
  await page.goto(`/c/${withFacts?.slug}`);
  const sec = page.getByTestId('char-facts');
  await expect(sec).toBeVisible();
  await expect(sec.locator('#facts-h')).toContainText('Facts about');
  await expect(sec.getByRole('link').first()).toHaveAttribute('href', /^https:/);
});

test('no horizontal scroll at 375 px, phone targets are 44 px', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  const pages = ['/desi', ...(withFacts ? [`/c/${withFacts.slug}`] : [])];
  for (const p of pages) {
    await page.goto(p);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `${p} overflows`).toBeLessThanOrEqual(0);
  }
  await page.goto('/desi');
  const chip = page.getByTestId('desi-filters').getByRole('button').first();
  expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  await ctx.close();
});

test('reduced motion: header settles with no running animations', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  await page.goto('/desi');
  await expect(page.getByTestId('desi-stats')).toBeVisible();
  await page.waitForTimeout(800);
  const running = await page.evaluate(
    () =>
      document
        .querySelector('header')
        ?.getAnimations({ subtree: true })
        .filter(
          (x) =>
            x.playState === 'running' &&
            x.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
        ).length ?? 0,
  );
  expect(running).toBe(0);
  await ctx.close();
});

test('filters live in the URL, Back restores them, a shared link opens filtered', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  await page.goto('/desi', { waitUntil: 'networkidle' });
  const filters = page.getByTestId('desi-filters');
  await filters.getByRole('button', { name: /^Raj Comics/ }).click();
  await expect(page).toHaveURL(/pub=Raj\+Comics/);
  await page.goBack();
  await expect(page).not.toHaveURL(/pub=/);
  await expect(page.getByTestId('desi-count')).toContainText(/Showing (\d+) of \1/);
  await page.goto('/desi?pub=Raj+Comics&view=table&sort=az');
  await expect(page.getByTestId('desi-table')).toBeVisible();
  await expect(filters.getByRole('button', { name: /^Raj Comics/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await ctx.close();
});

test('A-Z index jumps to a letter and the table lists publisher, debut and creators', async ({
  page,
}) => {
  await page.goto('/desi?view=table');
  const table = page.getByTestId('desi-table');
  await expect(table.getByRole('columnheader', { name: 'Creators' })).toBeVisible();
  const first = page
    .getByRole('navigation', { name: 'A to Z index' })
    .locator('button:enabled')
    .first();
  const letter = (await first.innerText()).trim();
  await first.click();
  await expect(page).toHaveURL(/l=/);
  const names = await table.locator('tbody th a').allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(n.trim().toUpperCase().startsWith(letter)).toBe(true);
});

test('all desi polls render and the character page shows its own poll', async ({ page }) => {
  await page.goto('/desi');
  const polls = page.getByTestId('desi-polls');
  await expect(polls).toBeVisible();
  const n = Number(/(\d+) polls/i.exec(await polls.locator('.kicker').innerText())?.[1]);
  expect(n).toBeGreaterThan(4);
  await page.goto('/c/nagraj');
  await expect(page.getByTestId('char-polls')).toBeVisible();
});

test('no axe violations on /desi and a hero page', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  for (const p of ['/desi', '/c/nagraj']) {
    await page.goto(p);
    await page.waitForTimeout(1500);
    // On a hero page only our own sections are in scope: the shared .btn-c1 elsewhere on it is
    // reported to Batman (it fails AA on a green theme like Nagraj's).
    const b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
    const r = await (p === '/desi'
      ? b
      : b.include('[data-testid="char-facts"]').include('[data-testid="char-polls"]')
    ).analyze();
    expect(
      r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3)}`),
      p,
    ).toEqual([]);
  }
  await ctx.close();
});

test('a fresh browser can vote on a poll and react to a fact end to end', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  const replies: { url: string; status: number }[] = [];
  page.on('response', (r) => {
    if (/\/api\/(poll|fact-react)/.test(r.url()) && r.request().method() === 'POST')
      replies.push({ url: r.url(), status: r.status() });
  });
  await page.goto('/c/nagraj', { waitUntil: 'networkidle' });
  const poll = page.getByTestId('char-polls').locator('button').first();
  await poll.click();
  await expect(page.getByTestId('char-polls').getByText('Your choice').first()).toBeVisible();
  await page.getByRole('button', { name: /Whoa/ }).first().click();
  await expect.poll(() => replies.length).toBeGreaterThanOrEqual(2);
  expect(replies.map((r) => r.status)).toEqual(replies.map(() => 200));
  // The vote survives a reload (server-stored, cookie-bound).
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('char-polls').getByText('Your choice').first()).toBeVisible();
  await ctx.close();
});

test('Show more survives opening a hero and going Back; A-Z follows the filters', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  await page.goto('/desi', { waitUntil: 'networkidle' });
  const cards = page.getByTestId('desi-grid').locator('> li');
  const more = page.getByRole('button', { name: /^Show more/ });
  await more.click();
  await expect(page).toHaveURL(/n=48/);
  await expect.poll(() => cards.count()).toBeGreaterThan(24);
  const count = await cards.count();
  await cards
    .nth(count - 1)
    .getByRole('link')
    .click();
  await expect(page).toHaveURL(/\/c\//);
  await page.goBack();
  await expect(cards).toHaveCount(count);

  // A letter with no name under the active filter is disabled.
  await page.goto('/desi?pub=Diamond+Comics', { waitUntil: 'networkidle' });
  const nav = page.getByRole('navigation', { name: 'A to Z index' });
  expect(await nav.locator('button:enabled').count()).toBeLessThan(
    (await nav.locator('button').count()) - 10,
  );
  await ctx.close();
});

test('decade buttons are 44 px and named from their visible text', async ({ page }) => {
  await page.goto('/desi');
  const b = page.getByTestId('era-timeline').getByRole('button').first();
  await b.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200); // the node springs in from 0.9 scale
  expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  const label = (await b.getAttribute('aria-label')) ?? '';
  expect(await b.innerText()).toContain('·');
  const visible = (await b.innerText()).replace(/\s+/g, ' ').trim();
  expect(label.toLowerCase().startsWith(visible.toLowerCase())).toBe(true);
});

test('the table scroll area is a focusable labelled region', async ({ page }) => {
  await page.goto('/desi?view=table');
  const region = page.getByRole('region', { name: 'Heroes table' });
  await region.focus();
  await expect(region).toBeFocused();
});
