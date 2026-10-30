/**
 * Game quality gate: plays each Arena game against the CPU with a simple scripted "player"
 * (moves, attacks, jumps in bursts), captures timed screenshots and a WebM per game, and writes a
 * contact sheet per game for the critic.
 *
 * Usage (dev server running): pnpm tsx scripts/game-shots.ts <round> [games] [base]
 *   games: comma list of fight,badminton,football,quiz (default all)
 *   → reports/game-shots/round-<round>/<game>/{00-start.png, 01.png…, sheet.html, video.webm}
 */
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const [round = 'x', gamesArg = 'fight,badminton,football,quiz', base = 'http://127.0.0.1:4323'] =
  process.argv.slice(2);
const games = gamesArg.split(',');
const P1 = 'bholu-pandey';
const P2 = 'cato-wren';
const SHOTS = 10;
const GAP_MS = 1400;

/** One bot "beat": a burst of input the game understands. */
const BEATS: Record<string, string[][]> = {
  fight: [['d'], ['d', 'f'], ['f'], ['g'], ['s', 'f'], ['a'], ['w'], ['h'], ['d', 'g'], ['f']],
  badminton: [['d'], ['f'], ['a'], ['w', 'f'], ['g'], ['d'], ['f'], ['a', 'f']],
  football: [['d'], ['d'], ['f'], ['w'], ['a'], ['g'], ['d', 'f'], ['h']],
  quiz: [['1'], ['Enter'], ['2'], ['Enter'], ['3'], ['Enter'], ['4'], ['Enter']],
};

async function beat(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

async function play(game: string, out: string) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: out, size: { width: 1280, height: 800 } },
  });
  await ctx.addCookies([{ name: 'cm_seen', value: '1', url: base }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/arena/${game}?p1=${P1}&p2=${P2}&vs=cpu&d=normal`);
  const start = page.getByRole('button', { name: 'Start' });
  await start.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  const box = page.locator('section[aria-label] canvas').first();
  await page.screenshot({ path: path.join(out, '00-start.png') });
  await start.click();
  const beats = BEATS[game] ?? [['d']];
  let b = 0;
  for (let i = 1; i <= SHOTS; i++) {
    const until = Date.now() + GAP_MS;
    while (Date.now() < until) {
      await beat(page, beats[b++ % beats.length] ?? ['d'], 120 + (b % 3) * 80);
      await page.waitForTimeout(60);
    }
    await box.screenshot({ path: path.join(out, `${String(i).padStart(2, '0')}.png`) });
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '99-end.png') });
  await ctx.close();
  await browser.close();
  // Playwright names the video by a hash; give it a stable name.
  for (const f of readdirSync(out))
    if (f.endsWith('.webm')) renameSync(path.join(out, f), path.join(out, 'video.webm'));
  const imgs = readdirSync(out)
    .filter((f) => f.endsWith('.png'))
    .sort();
  writeFileSync(
    path.join(out, 'sheet.html'),
    `<!doctype html><meta charset="utf-8"><title>${game} r${round}</title><body style="background:#111;color:#eee;font:14px sans-serif">${imgs
      .map(
        (f) =>
          `<figure style="display:inline-block;margin:6px"><img src="${f}" width="420"><figcaption>${f}</figcaption></figure>`,
      )
      .join('')}<video src="video.webm" controls width="640"></video></body>`,
  );
}

for (const g of games) {
  const out = path.join('reports/game-shots', `round-${round}`, g);
  mkdirSync(out, { recursive: true });
  await play(g, out);
  console.log(`${g}: done`);
}
