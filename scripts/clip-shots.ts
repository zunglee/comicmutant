// Quality-gate screenshots: one filmstrip PNG per clip kind per sample theme.
// Usage: pnpm tsx scripts/clip-shots.ts <round> <theme,...> [frames=0.15,0.6,1.2,2.1] [base]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [
  round = '1',
  themes = 'spider-man,shaktimaan,joker,goku',
  frames = '0.15,0.6,1.2,2.1',
  base = 'http://127.0.0.1:4323',
  kinds = '',
] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1520, height: 900 },
  deviceScaleFactor: 1,
});
await ctx.addCookies([{ name: 'cm_seen', value: '1', url: base }]);
const page = await ctx.newPage();
for (const t of themes.split(',')) {
  const dir = `reports/clip-shots/round-${round}/${t}`;
  mkdirSync(dir, { recursive: true });
  const res = await page.goto(`${base}/lab/clips?t=${t}&frames=${frames}&kinds=${kinds}`, {
    waitUntil: 'networkidle',
  });
  if (!res?.ok()) throw new Error(`lab page for ${t} answered ${res?.status()}`);
  // Site chrome (sticky header, dock, tab bar) must not cover the strips.
  await page.addStyleTag({
    content:
      'header, footer, aside, nav, .skip-link, canvas.fixed, [data-testid=loader] { display: none !important; }',
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('section[data-kind] canvas')].every(
      (c) => (c as HTMLCanvasElement).dataset.ready,
    ),
  );
  const sections = await page.locator('section[data-kind]').all();
  for (const s of sections) {
    const kind = await s.getAttribute('data-kind');
    await s.screenshot({ path: `${dir}/${kind}.png` });
  }
  // Review sheets: five kinds per image, so a critic sees a whole batch at once.
  const rects = await page.evaluate(() =>
    [...document.querySelectorAll('section[data-kind]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { y: r.top + window.scrollY, h: r.height };
    }),
  );
  for (let i = 0; i < rects.length; i += 5) {
    const group = rects.slice(i, i + 5);
    const top = group[0]?.y ?? 0;
    const last = group[group.length - 1];
    const height = last ? last.y + last.h - top : 0;
    await page.screenshot({
      path: `${dir}-sheet-${i / 5 + 1}.png`,
      fullPage: true,
      clip: { x: 0, y: top, width: 1520, height },
    });
  }
  console.log(`${t}: done`);
}
await browser.close();
