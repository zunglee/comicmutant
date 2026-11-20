/**
 * Token police (reports/skins-design.md T2). Components take colour, font, easing and radius from
 * skin tokens (app/skins/types.ts SKIN_VAR_NAMES), never raw values. This scans app/** and counts
 * violations per file against test/token-police.baseline.json. The baseline can only go DOWN:
 *   - a file's count rises, or a file with violations is not in the baseline  -> fail
 *   - counts only fall                                                         -> pass (and prints the total)
 * After you remove violations, lower the baseline:  UPDATE_BASELINE=1 pnpm vitest run test/token-police.test.ts
 *
 * Violations: raw hex colours, rgb(/hsl( literals, named colours (style attrs, CSS, bg-white...),
 * `font-family` / JSX fontFamily, `cubic-bezier(`, hard-coded radius (px, rounded-sm..full: use
 * rounded-skin-s|m|l|pill, or `round` for a true circle), duration-NNN / ease-* classes
 * (duration-skin-fast|base|slow), Motion `duration:` literals (listed for T-core's useSkinMotion).
 * Not scanned: app/skins/**, app/lib/theme/**, app/lib/clips/**, app/game/**, canvas files (a 2D
 * canvas cannot read CSS variables), and the `html[data-realm="sacred"]` / `.sacred-*` / `.sc-*`
 * region of app.css (T-sacred deletes it). A line carrying `token-ok` is skipped, and so is anything
 * between `token-ok:start` and `token-ok:end` comments: use it only for canvas drawing calls and the
 * :root fallback block, which has to hold the raw values.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'token-police.baseline.json');
const EXCLUDE_DIRS = ['app/skins/', 'app/lib/theme/', 'app/lib/clips/', 'app/game/'];
const CANVAS_FILES = ['app/components/atmosphere.tsx', 'app/components/sprite.tsx'];
/** app.css: everything from the sacred realm banner down is T-sacred's. */
const SACRED_MARK = '/* Sacred realm ---';

const NAMED =
  'white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|cyan|magenta|silver|gold|navy|teal|maroon|lime|aqua';
const RULES: { id: string; re: RegExp }[] = [
  {
    id: 'hex',
    re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g,
  },
  { id: 'rgb/hsl', re: /\b(?:rgb|hsl)a?\(/g },
  {
    id: 'named colour',
    re: new RegExp(
      `\\b(?:color|background(?:Color)?|background-color|border(?:-?[cC]olor)?|fill|stroke|outline-color|box-shadow)\\s*[:=]\\s*\\{?['"]?(?:${NAMED})\\b`,
      'g',
    ),
  },
  {
    id: 'named colour class',
    re: /\b(?:bg|text|border|fill|stroke|ring|shadow|from|to|via)-(?:white|black)(?![\w-])/g,
  },
  { id: 'font-family', re: /font-family\s*:(?!\s*var\()/g },
  { id: 'fontFamily', re: /fontFamily\s*[:=]\s*\{?\s*(?!['"]?var\()['"]/g },
  { id: 'cubic-bezier', re: /cubic-bezier\(/g },
  { id: 'radius px', re: /border-radius\s*:\s*\d+(?:\.\d+)?px/g },
  { id: 'borderRadius', re: /borderRadius\s*:\s*['"]?\d/g },
  { id: 'rounded px', re: /rounded-\[\d+(?:\.\d+)?px\]/g },
  {
    id: 'rounded fixed',
    re: /(?<![\w-])rounded(?:-[trbl]{1,2})?-(?:xs|sm|md|lg|xl|2xl|3xl|full)(?![\w-])/g,
  },
  { id: 'duration class', re: /(?<![\w-])duration-\d+(?![\w-])/g },
  { id: 'ease class', re: /(?<![\w-])ease-(?:in|out|in-out|linear)(?![\w-])/g },
  { id: 'motion duration', re: /\bduration\s*:\s*[\d.]/g },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(p) ? [p] : [];
  });
}

const byRule: Record<string, number> = {};

function scan(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const abs of walk(path.join(ROOT, 'app'))) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (EXCLUDE_DIRS.some((d) => rel.startsWith(d)) || CANVAS_FILES.includes(rel)) continue;
    if (rel.endsWith('.d.ts') || rel.includes('/+types/') || rel.startsWith('app/.server/'))
      continue;
    let lines = readFileSync(abs, 'utf8').split('\n');
    if (rel === 'app/app.css') {
      const at = lines.findIndex((l) => l.startsWith(SACRED_MARK));
      if (at >= 0) lines = lines.slice(0, at);
    }
    let n = 0;
    let off = false;
    for (const line of lines) {
      if (line.includes('token-ok:start')) off = true;
      if (off || line.includes('token-ok')) {
        if (line.includes('token-ok:end')) off = false;
        continue;
      }
      for (const { id, re } of RULES) {
        const k = (line.match(re) ?? []).length;
        n += k;
        byRule[id] = (byRule[id] ?? 0) + k;
      }
    }
    if (n > 0) out[rel] = n;
  }
  return out;
}

describe('token police', () => {
  const now = scan();
  const total = Object.values(now).reduce((a, b) => a + b, 0);

  it('writes the baseline when asked', () => {
    if (process.env.UPDATE_BASELINE) {
      const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
    }
    expect(true).toBe(true);
  });

  it('never rises above the baseline', () => {
    const base: Record<string, number> = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
    const worse = Object.entries(now)
      .filter(([f, n]) => n > (base[f] ?? 0))
      .map(([f, n]) => `${f}: ${base[f] ?? 'new file'} -> ${n}`);
    console.log(
      `token police: ${total} violations (baseline ${baseTotal}) in ${Object.keys(now).length} files`,
    );
    expect(worse, `raw values crept back in. Use skin tokens:\n${worse.join('\n')}`).toEqual([]);
  });
});
