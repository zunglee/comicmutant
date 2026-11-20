import { type Browser, expect, type Page, test } from '@playwright/test';

// Learning widgets and the Learning Garden at /sacred/learn. `?fixture=1` feeds the games from
// test/fixtures/learn-figures.json (lab / dev only); `&widget=` previews the four widgets.
// Reduced motion keeps every transition instant, so nothing here waits on an animation.

test.describe.configure({ mode: 'serial' });

const GAMES = ['symbols', 'wheel', 'gurus', 'tirthankaras', 'garden', 'whoami'];

async function open(
  browser: Browser,
  baseURL: string | undefined,
  query: string,
  opts: { width?: number; reduce?: boolean } = {},
) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1000, height: 800 },
    reducedMotion: opts.reduce === false ? 'no-preference' : 'reduce',
  });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  await page.goto(`/sacred/learn?fixture=1${query}`);
  await page.waitForLoadState('networkidle'); // hydrated: handlers are attached
  return { ctx, page };
}

const noScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('fact deck navigates by keyboard and reacts (optimistic, server counts win)', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&widget=deck');
  await page.route('**/api/fact-react', (r) =>
    r.fulfill({
      json: { index: 0, whoa: 5, knew: 2, mine: 'whoa' },
    }),
  );
  const deck = page.getByTestId('fact-deck');
  await expect(page.getByTestId('fact-pos')).toHaveText('Fact 1 of 5');
  await deck.getByRole('group', { name: /Facts/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('fact-pos')).toHaveText('Fact 2 of 5');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('fact-pos')).toHaveText('Fact 1 of 5');
  await page.getByRole('button', { name: /Whoa, didn't know/ }).click();
  await expect(page.getByTestId('fact-note')).toHaveText('5 said whoa, 2 knew it');
  await expect(page.getByTestId('discovered')).toContainText('1');
  // The discovered counter survives a reload (localStorage).
  await page.reload();
  await expect(page.getByTestId('discovered')).toContainText('1');
  await ctx.close();
});

test('fact deck reverts on an error code and says so calmly', async ({ browser, baseURL }) => {
  const { ctx, page } = await open(browser, baseURL, '&widget=deck');
  await page.route('**/api/fact-react', (r) =>
    r.fulfill({ status: 429, json: { error: 'x', code: 'rate' } }),
  );
  await page.getByRole('button', { name: /Knew it/ }).click();
  await expect(page.getByTestId('fact-note')).toContainText('Easy there');
  await expect(page.getByRole('button', { name: /Knew it/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await ctx.close();
});

test('mini quiz gives warm feedback with the why, finishes privately, and retries', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&widget=quiz');
  const quiz = page.getByTestId('mini-quiz');
  await quiz.getByRole('button', { name: /Diya/ }).click();
  await expect(page.getByTestId('quiz-feedback')).toContainText('A diya is a small oil lamp');
  await quiz.getByRole('button', { name: 'Next question' }).click();
  await quiz.getByRole('button', { name: /Brick/ }).click(); // a miss: still warm
  await expect(page.getByTestId('quiz-feedback')).toContainText('The lotus is a flower');
  await quiz.getByRole('button', { name: 'See how I did' }).click();
  await expect(page.getByTestId('quiz-done')).toContainText('nobody else sees it');
  await quiz.getByRole('button', { name: 'Try again' }).click();
  await expect(quiz).toContainText('Question 1 of 2');
  await ctx.close();
});

test('story walk steps by keyboard', async ({ browser, baseURL }) => {
  const { ctx, page } = await open(browser, baseURL, '&widget=story');
  await expect(page.getByTestId('story-page')).toContainText('Scene 1 of 3');
  await page.getByRole('region', { name: /Story page/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('story-page')).toContainText('Scene 2 of 3');
  await ctx.close();
});

test('poll card renders results, marks your choice with words, allows a change', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&widget=poll');
  let votes = { a: 6, b: 3 };
  await page.route('**/api/poll', async (r) => {
    const { option } = r.request().postDataJSON() as { option: 'a' | 'b' };
    votes = { a: 6, b: 3 };
    votes[option] += 1;
    const total = votes.a + votes.b;
    await r.fulfill({
      json: {
        id: 'preview',
        question: 'Which story would you like to read next?',
        options: [
          { id: 'a', label: 'The lamp story', votes: votes.a },
          { id: 'b', label: 'The river story', votes: votes.b },
        ],
        total,
        mine: option,
      },
    });
  });
  // Results stay hidden until you have voted.
  await expect(page.getByTestId('poll-pct')).toHaveCount(0);
  await expect(page.getByText('Pick one to see how others chose')).toBeVisible();
  await page.getByRole('button', { name: /The river story/ }).click();
  await expect(page.getByTestId('poll-pct').first()).toHaveText('60% (6)');
  await expect(page.getByTestId('poll-pct').nth(1)).toContainText('Your choice');
  await page.getByRole('button', { name: /The lamp story/ }).click();
  await expect(page.getByTestId('poll-pct').first()).toContainText('Your choice');
  await expect(page.getByTestId('poll-pct').nth(1)).not.toContainText('Your choice');
  await ctx.close();
});

test('a game completes: Symbol Match, tap then tap', async ({ browser, baseURL }) => {
  const { ctx, page } = await open(browser, baseURL, '&game=symbols');
  await expect(page.getByTestId('match-name')).toHaveCount(5);
  const slugs = await page
    .getByTestId('match-name')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-slug')));
  for (const s of slugs) {
    await page.locator(`[data-testid=match-name][data-slug="${s}"]`).click();
    await page.locator(`[data-testid=match-emblem][data-slug="${s}"]`).click();
    // Focus must stay on a real control after a match (a disabled button would drop it to <body>).
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  }
  await expect(page.getByTestId('game-done')).toContainText('You matched all 5');
  await ctx.close();
});

const SHARED = ['Matsya', 'Kurma', 'Varaha', 'Narasimha', 'Vamana', 'Parashurama', 'Rama'];
async function placeAll(page: Page, names: string[]) {
  for (const n of names)
    await page
      .getByTestId('order-chip')
      .filter({ hasText: new RegExp(`^${n}$`) })
      .click();
}

test('Dashavatara: the Balarama list and the Buddha list are both accepted', async ({
  browser,
  baseURL,
}) => {
  for (const [rest, label] of [
    [['Balarama', 'Krishna', 'Kalki'], 'Balarama list'],
    [['Krishna', 'Gautama Buddha', 'Kalki'], 'Buddha list'],
  ] as const) {
    const { ctx, page } = await open(browser, baseURL, '&game=wheel');
    await expect(page.getByTestId('lists-note')).toContainText('Balarama is eighth');
    await page.getByRole('button', { name: 'Put them in order' }).click();
    await placeAll(page, [...SHARED, ...rest]);
    await expect(page.getByTestId('game-done')).toContainText(label);
    await ctx.close();
  }
});

test('Dashavatara: the ninth spoke shows both, and the Buddha card links to his page', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&game=wheel');
  await page.getByTestId('avatar').nth(8).click();
  const cards = page.getByTestId('avatar-card');
  await expect(cards).toContainText('Krishna');
  await expect(cards).toContainText('Gautama Buddha');
  await expect(cards.getByRole('link', { name: /Gautama Buddha/ })).toHaveAttribute(
    'href',
    '/sacred/f/gautama-buddha',
  );
  await ctx.close();
});

test('Fact Garden asks a question first: no flower until the figure is right', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&game=garden');
  const grow = page.getByTestId('garden-grow');
  await expect(grow).toHaveAttribute('aria-disabled', 'true');
  const text = await page.getByTestId('garden-text').innerText();
  expect(text).toContain('this figure');
  const guesses = page.getByTestId('garden-guess');
  // Try each option until one is right: wrong ones just mark themselves, calmly.
  for (let i = 0; i < 4 && (await grow.getAttribute('aria-disabled')) === 'true'; i++) {
    await guesses.nth(i).click();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  }
  await expect(grow).toHaveAttribute('aria-disabled', 'false');
  const fact = await page.getByTestId('garden-text').innerText();
  await grow.click();
  await expect(page.getByTestId('garden-count')).toContainText('1 flower');
  // The fact stays on screen, so the child sees "Flower planted" (S14 r2).
  await expect(grow).toContainText('Flower planted');
  await expect(page.getByTestId('garden-text')).toHaveText(fact);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  await ctx.close();
});

test('Who Am I: a wrong guess keeps focus on a control', async ({ browser, baseURL }) => {
  const { ctx, page } = await open(browser, baseURL, '&game=whoami');
  const g = page.getByTestId('guess');
  await expect(g).toHaveCount(4);
  const answerTagged = await g.allInnerTexts();
  expect(answerTagged.every((t) => /\(.+\)/.test(t))).toBe(true); // each choice carries a group tag
  for (let i = 0; i < 4; i++) {
    await g.nth(i).click();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    if ((await page.getByRole('button', { name: /Next riddle|Finish/ }).count()) > 0) break;
  }
  await ctx.close();
});

test('Tirthankara memory cards say where they are', async ({ browser, baseURL }) => {
  const { ctx, page } = await open(browser, baseURL, '&game=tirthankaras');
  await page.getByRole('button', { name: 'Memory pairs' }).click();
  await expect(page.getByTestId('memory-card').first()).toHaveAttribute(
    'aria-label',
    'Card 1 of 12, face down',
  );
  await ctx.close();
});

test('the Learning Garden lets the realm atmosphere show and uses the realm fonts', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '');
  const bg = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-lw=sacred]') as Element).backgroundColor,
  );
  expect(bg).toBe('rgba(0, 0, 0, 0)');
  const font = await page.evaluate(
    () => getComputedStyle(document.querySelector('.lw-title') as Element).fontFamily,
  );
  expect(font).toContain('Cormorant Garamond');
  await ctx.close();
});

test('the hub ships counts only, never the figure data', async ({ request }) => {
  const hub = await (await request.get('/sacred/learn')).text();
  expect(hub.length).toBeLessThan(150_000);
  expect(hub).not.toContain('kidSummary');
});

test('fact reactions persist across reload and the same tap again clears them', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  const whoa = () => page.getByRole('button', { name: /Whoa, didn't know/ }).first();
  await page.goto('/sacred/f/ganesha');
  await page.waitForLoadState('networkidle');
  if ((await whoa().getAttribute('aria-pressed')) === 'true') {
    await whoa().click(); // start from a clean state
    await expect(whoa()).toHaveAttribute('aria-pressed', 'false');
  }
  await whoa().click();
  await expect(whoa()).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(whoa()).toHaveAttribute('aria-pressed', 'true');
  await whoa().click(); // same reaction again: the server toggles it off
  await expect(whoa()).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(whoa()).toHaveAttribute('aria-pressed', 'false');
  await ctx.close();
});

test('a "please reload" refusal reverts the optimistic reaction and says so', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&widget=deck');
  await page.route('**/api/fact-react', (r) =>
    r.fulfill({ status: 400, json: { error: 'Please reload and try again.', code: 'invalid' } }),
  );
  await page.getByRole('button', { name: /Knew it/ }).click();
  await expect(page.getByTestId('fact-note')).toHaveText('Please reload and try again.');
  await expect(page.getByRole('button', { name: /Knew it/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await ctx.close();
});

test('the hub renders without fixture data (games gate themselves; see unit tests)', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/sacred/learn?game=symbols'); // no fixture: whatever the content folder holds
  await expect(page.getByRole('heading', { level: 1, name: 'The Learning Garden' })).toBeVisible();
  void baseURL;
  await ctx.close();
});

test('reduced motion: nothing animates on the hub or in any game', async ({ browser, baseURL }) => {
  for (const g of ['', ...GAMES.map((x) => `&game=${x}`)]) {
    const { ctx, page } = await open(browser, baseURL, g);
    await page.waitForTimeout(300);
    const running = await page.evaluate(() =>
      (document.querySelector('main') as HTMLElement)
        .getAnimations({ subtree: true })
        .filter(
          (a) => a.playState === 'running' && (a.effect?.getTiming().iterations ?? 1) === Infinity,
        )
        .map((a) => (a as CSSAnimation).animationName ?? 'waapi'),
    );
    expect(running, `looping animations on ${g || 'hub'}`).toEqual([]);
    await ctx.close();
  }
});

test('calm motion is on by default: the wheel really turns', async ({ browser, baseURL }) => {
  const { ctx, page } = await open(browser, baseURL, '&game=wheel', { reduce: false });
  const turning = await page.evaluate(() =>
    (document.querySelector('main') as HTMLElement)
      .getAnimations({ subtree: true })
      .some((a) => (a as CSSAnimation).animationName === 'lw-turn'),
  );
  expect(turning).toBe(true);
  await ctx.close();
});

test('375 px: no horizontal scroll on the hub, every game and every widget', async ({
  browser,
  baseURL,
}) => {
  const qs = [
    '',
    ...GAMES.map((g) => `&game=${g}`),
    ...['deck', 'story', 'quiz', 'poll'].flatMap((w) => [
      `&widget=${w}`,
      `&widget=${w}&realm=comic`,
    ]),
  ];
  for (const q of qs) {
    const { ctx, page } = await open(browser, baseURL, q, { width: 375 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await noScroll(page), `horizontal scroll at 375px on "${q}"`).toBeLessThanOrEqual(0);
    await ctx.close();
  }
});

test('wheel at 375 px: no two avatar buttons overlap and none clips the viewport', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&game=wheel', { width: 375 });
  const boxes = await page
    .getByTestId('avatar')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  expect(boxes).toHaveLength(10);
  for (const b of boxes) {
    expect(b.left, 'clips the left edge').toBeGreaterThanOrEqual(0);
    expect(b.right, 'clips the right edge').toBeLessThanOrEqual(375);
    expect(b.height).toBeGreaterThanOrEqual(43.5);
    expect(b.width).toBeGreaterThanOrEqual(43.5);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const apart =
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart, `spokes ${i + 1} and ${j + 1} overlap`).toBe(true);
    }
  await ctx.close();
});

test('memory tiles show a flower face down and wrap long names at 375 px', async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await open(browser, baseURL, '&game=tirthankaras', { width: 375 });
  await page.getByRole('button', { name: 'Memory pairs' }).click();
  const tile = page.getByTestId('memory-card').first();
  await expect(tile.locator('svg')).toBeVisible();
  const box = await tile.locator('svg').boundingBox();
  expect(box?.width).toBeGreaterThan(20);
  // Flip every card in turn (two at a time) and check no text overflows its tile.
  const n = await page.getByTestId('memory-card').count();
  for (let i = 0; i < n; i += 2) {
    await page.getByTestId('memory-card').nth(i).click();
    await page
      .getByTestId('memory-card')
      .nth(i + 1)
      .click();
    const clipped = await page
      .getByTestId('memory-card')
      .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped).toBe(0);
    await page.waitForTimeout(1500); // the pair turns back over
  }
  await ctx.close();
});

// Keyboard fuzz: Tab / Shift+Tab / Enter only, 110 steps per game and for MiniQuiz. After every key
// the focus must be on a real control, never <body> (a control that unmounts must hand focus on).
test('keyboard fuzz: focus is never lost to <body> in any game or the quiz', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(420_000);
  const targets: [string, string][] = [
    ['&game=symbols', 'game-symbols'],
    ['&game=wheel', 'game-wheel'],
    ['&game=gurus', 'game-gurus'],
    ['&game=tirthankaras', 'game-tirthankaras'],
    ['&game=garden', 'game-garden'],
    ['&game=whoami', 'game-whoami'],
    ['&widget=quiz', 'mini-quiz'],
  ];
  for (const [q, id] of targets) {
    const { ctx, page } = await open(browser, baseURL, q);
    const root = page.getByTestId(id);
    await expect(root).toBeVisible();
    const home = async () => {
      // "All games" leaves for the hub (focus must land on the tile); carry on from there.
      const scope = page.locator('main');
      await scope
        .locator('button:not([aria-disabled="true"]):not([disabled])')
        .first()
        .focus({ timeout: 8000 });
    };
    await home();
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let step = 0; step < 110; step++) {
      const r = rnd();
      await page.keyboard.press(r < 0.45 ? 'Enter' : r < 0.85 ? 'Tab' : 'Shift+Tab');
      const st = await page.evaluate(
        () =>
          new Promise<{ tag?: string; leave: boolean }>((res) =>
            requestAnimationFrame(() => {
              const a = document.activeElement as HTMLElement | null;
              res({ tag: a?.tagName, leave: a?.tagName === 'A' || !a?.closest('main') });
            }),
          ),
      );
      expect(
        st.tag,
        `${id}: focus fell to <body> at step ${step} (key roll ${r.toFixed(2)})`,
      ).not.toBe('BODY');
      if (st.leave) await home(); // links open pages and tabs; stay inside the game
    }
    await ctx.close();
  }
});

test('S17: cookies cleared mid-page, the reaction still counts (heal, then retry)', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  const page = await ctx.newPage();
  const whoa = () => page.getByRole('button', { name: /Whoa, didn't know/ }).first();
  await page.goto('/sacred/f/ganesha');
  await page.waitForLoadState('networkidle');
  if ((await whoa().getAttribute('aria-pressed')) === 'true') {
    await whoa().click(); // start clean
    await expect(whoa()).toHaveAttribute('aria-pressed', 'false');
  }
  await ctx.clearCookies();
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: baseURL ?? '' }]);
  await whoa().click();
  await expect(whoa()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('fact-note')).not.toContainText('reload');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(whoa()).toHaveAttribute('aria-pressed', 'true'); // counted under the new cookies
  await whoa().click();
  await expect(whoa()).toHaveAttribute('aria-pressed', 'false');
  await ctx.close();
});
