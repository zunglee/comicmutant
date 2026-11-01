/**
 * Freefall quality gate: plays real runs in a browser with a keyboard bot (reads the live run through
 * the dev-only `window.__ff`), on desktop, a portrait phone and a landscape phone. Captures timed
 * screenshots, the result screen and a WebM per device for the critic.
 *
 * Usage (dev server running): pnpm tsx scripts/freefall-shots.ts <round> [base]
 *   → reports/game-shots/round-<round>/freefall/<device>/{00-start.png, 01.png…, 99-end.png, video.webm}
 */
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices, type Page } from '@playwright/test';

const [round = 'x', base = 'http://127.0.0.1:4323'] = process.argv.slice(2);
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { ...devices['iPhone 13'] },
  'phone-land': { ...devices['iPhone 13 landscape'] },
} as const;

/** Bot: 1/2/3 for the lane it believes (85% right), dives now and then, sidesteps rubble. */
async function botStep(page: Page) {
  return page.evaluate(() => {
    const run = (window as unknown as { __ff?: { core: Record<string, unknown> } }).__ff;
    if (!run) return { over: false, key: null };
    const c = run.core as unknown as {
      over: boolean;
      x: number;
      depth: number;
      gate?: { id: number; y: number; q: { correct: number } };
      debris: { x: number; y: number; w: number; hit: boolean }[];
    };
    const w = window as unknown as { __aim?: Record<number, number> };
    w.__aim ??= {};
    const g = c.gate;
    let key: string | null = null;
    if (g) {
      if (w.__aim[g.id] === undefined)
        w.__aim[g.id] = Math.random() < 0.85 ? g.q.correct : (g.q.correct + 1) % 3;
      const aim = w.__aim[g.id] as number;
      key = `Digit${aim + 1}`;
      for (const d of c.debris) {
        const dy = d.y - c.depth;
        if (
          !d.hit &&
          dy > 0 &&
          dy < 160 &&
          Math.abs(d.x - c.x) < d.w / 2 + 30 &&
          g.y - c.depth > 140
        )
          key = d.x > c.x ? 'ArrowLeft' : 'ArrowRight';
      }
    }
    return { over: c.over, key };
  });
}

async function play(device: keyof typeof DEVICES, out: string) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...DEVICES[device],
    recordVideo: { dir: out, size: DEVICES[device].viewport },
  });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: base }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/freefall`);
  const start = page.getByRole('button', { name: 'Start the dive' });
  await start.waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '00-start.png') });
  await start.click();
  let shot = 1;
  let next = Date.now() + 1500;
  let held: string | null = null;
  const t0 = Date.now();
  for (;;) {
    const s = await botStep(page);
    if (s.over || Date.now() - t0 > 150_000) break;
    if (s.key !== held) {
      if (held?.startsWith('Arrow')) await page.keyboard.up(held);
      if (s.key?.startsWith('Arrow')) await page.keyboard.down(s.key);
      else if (s.key) await page.keyboard.press(s.key);
      held = s.key;
    }
    if (Date.now() > next && shot <= 14) {
      await page.screenshot({ path: path.join(out, `${String(shot++).padStart(2, '0')}.png`) });
      next = Date.now() + 2500;
    }
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '99-end.png'), fullPage: false });
  await page.screenshot({ path: path.join(out, '99-end-full.png'), fullPage: true });
  await ctx.close();
  await browser.close();
  for (const f of readdirSync(out))
    if (f.endsWith('.webm')) renameSync(path.join(out, f), path.join(out, 'video.webm'));
}

for (const d of Object.keys(DEVICES) as (keyof typeof DEVICES)[]) {
  const out = path.join('reports/game-shots', `round-${round}`, 'freefall', d);
  mkdirSync(out, { recursive: true });
  await play(d, out);
  console.log(`${d}: done`);
}
