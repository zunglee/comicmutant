import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

/*
 * Every registered skin, rendered for real (reports/skins-design.md S18-S21). The unit tests prove the
 * token pairs; this proves what the browser paints: text against the background it actually sits on,
 * the calm skins' animation floor, and that no Devanagari/Gurmukhi font downloads on an English page.
 *
 * The skin list is read from the registry source (its spec files import font assets Playwright cannot
 * load), so a 5th skin added to SKINS is covered with no edit here.
 */
const registry = readFileSync('app/skins/registry.ts', 'utf8');
const SKIN_IDS = (/export const SKINS = \{([^}]*)\}/.exec(registry)?.[1] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const isCalm = (id: string) => /calm:\s*true/.test(readFileSync(`app/skins/${id}.ts`, 'utf8'));

test('the registry lists the skins', () => {
  expect(SKIN_IDS.length).toBeGreaterThanOrEqual(4);
});

async function pinned(
  browser: Browser,
  baseURL: string | undefined,
  skin: string,
  reducedMotion: 'reduce' | 'no-preference' = 'reduce',
) {
  const ctx = await browser.newContext({ reducedMotion, viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([
    { name: 'cm_skin', value: skin, url: baseURL ?? '' },
    { name: 'cm_seen', value: '1', url: baseURL ?? '' },
  ]);
  return ctx;
}

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
};

for (const skin of SKIN_IDS) {
  test.describe(`skin ${skin}`, () => {
    test('axe color-contrast: zero violations on /, /roster, /about', async ({
      browser,
      baseURL,
    }) => {
      const ctx = await pinned(browser, baseURL, skin);
      const page = await ctx.newPage();
      const failures: string[] = [];
      for (const path of ['/', '/roster', '/about']) {
        await page.goto(path);
        await settle(page);
        await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
        const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
        for (const v of r.violations)
          for (const n of v.nodes)
            failures.push(
              `${path} ${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim()}`,
            );
      }
      await ctx.close();
      expect(failures, failures.slice(0, 15).join('\n')).toEqual([]);
    });

    test('no Devanagari or Gurmukhi font bytes on English pages', async ({ browser, baseURL }) => {
      const ctx = await pinned(browser, baseURL, skin);
      const page = await ctx.newPage();
      const fetched: string[] = [];
      page.on('response', (res) => {
        if (/(devanagari|gurmukhi)[^/]*\.woff2?(\?|$)/.test(res.url())) fetched.push(res.url());
      });
      for (const path of ['/', '/roster', '/about']) {
        await page.goto(path);
        await settle(page);
        // Only a page that shows the script may fetch its face.
        const indic = await page.evaluate(() => /[ऀ-ॿ਀-੿]/.test(document.body.innerText));
        if (indic) continue;
        expect(fetched, `${path} in ${skin}`).toEqual([]);
      }
      await ctx.close();
    });

    test('data-realm only on the Sacred routes', async ({ browser, baseURL }) => {
      const ctx = await pinned(browser, baseURL, skin);
      const page = await ctx.newPage();
      await page.goto('/');
      await expect(page.locator('html')).not.toHaveAttribute('data-realm', /.+/);
      await page.goto('/sacred');
      await expect(page.locator('html')).toHaveAttribute('data-realm', 'sacred');
      await ctx.close();
    });
  });

  if (!isCalm(skin)) continue;

  test(`calm skin ${skin}: no animation under 400 ms on /, /roster, /c/batman, /quiz`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const ctx = await pinned(browser, baseURL, skin, 'no-preference');
    const page = await ctx.newPage();
    const fast = new Set<string>();
    for (const path of ['/', '/roster', '/c/batman', '/quiz']) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
      // Sample while the page enters, while it scrolls (whileInView) and while a control is hovered.
      for (let k = 0; k < 12; k++) {
        if (k === 4) await page.mouse.wheel(0, 1600);
        if (k === 8)
          await page
            .locator('a.btn:visible, button.btn:visible')
            .first()
            .hover({ timeout: 2000 })
            .catch(() => undefined);
        const found = await page.evaluate(() =>
          document.getAnimations().flatMap((a) => {
            const d = Number(a.effect?.getTiming().duration ?? 0);
            if (!(d > 0 && d < 400)) return [];
            const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
            const name =
              (a as CSSAnimation).animationName ??
              (a as CSSTransition).transitionProperty ??
              'waapi';
            return [
              `${name} ${Math.round(d)}ms on ${el?.tagName.toLowerCase()}.${String(el?.className ?? '').split(' ')[0]}`,
            ];
          }),
        );
        for (const f of found) fast.add(`${path}: ${f}`);
        await page.waitForTimeout(200);
      }
    }
    await ctx.close();
    expect([...fast], [...fast].slice(0, 20).join('\n')).toEqual([]);
  });
}
