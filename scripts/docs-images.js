// Renders the README images in docs/ from the test fixture: `npm run docs:images`.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { renderCardSvg } from '../src/card.js';
import { findChrome, renderPng } from '../src/render.js';
import { formatSummary } from '../src/summary.js';
import { DEFAULT_THEME } from '../src/theme.js';
import { calebStats } from '../test/fixtures/caleb-stats.js';

const DOCS = resolve(import.meta.dirname, '../docs');
const SUMMARY_SIZE = '1000,905';

const THEMES = {
  default: DEFAULT_THEME,
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    accent: '#bd93f9',
    accentName: 'magenta',
  },
  'solarized-light': {
    background: '#fdf6e3',
    foreground: '#586e75',
    accent: '#268bd2',
    accentName: 'blue',
  },
};

// Example Claude share of each agent-era month's commits.
const CLAUDE_SHARES = {
  '2026-04': 0.35,
  '2026-05': 0.5,
  '2026-06': 0.62,
  '2026-07': 0.7,
  '2026-08': 0.74,
  '2026-09': 0.78,
};

// The fixture has PRs only; the rest are made-up example numbers.
function exampleStats() {
  const commitsMonthly = Object.fromEntries(
    Object.entries(calebStats.prs.monthly)
      .filter(([month]) => month >= '2024-01' && month <= '2026-09')
      .map(([month, prs]) => [month, Math.round(prs * 1.3)]),
  );
  const claudeMonthly = Object.fromEntries(
    Object.entries(CLAUDE_SHARES).map(([month, share]) => [
      month,
      Math.round(commitsMonthly[month] * share),
    ]),
  );
  return {
    ...calebStats,
    eraSource: 'trailers',
    commits: {
      ...calebStats.commits,
      monthly: commitsMonthly,
      yearly: {
        2011: 12,
        2016: 610,
        2017: 1840,
        2024: 1120,
        2025: 900,
        2026: 4200,
      },
      coauthored: { Claude: 0.64, Cursor: 0.03 },
      coauthoredMonthly: { Claude: claudeMonthly, Cursor: {} },
    },
    mergeHours: { before: 20, after: 6.2 },
    mergeRate: { before: 0.84, after: 0.91 },
    reviews: { before: 21, after: 48 },
    activeDays: { before: 17, after: 24 },
    afterHours: { before: 0.12, after: 0.31 },
    repos: { before: 14, after: 31 },
    languages: { before: 5, after: 9 },
    colors: { source: 'Ghostty', accentName: 'yellow' },
  };
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function terminalHtml(text) {
  return `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#fff}
.win{width:1000px;background:#17181c;border-radius:12px;overflow:hidden;font:15px/1.55 'SF Mono',Menlo,monospace;color:#ececec}
.bar{height:38px;background:#2a2b30;display:flex;align-items:center;gap:8px;padding-left:14px}
.bar i{width:12px;height:12px;border-radius:50%;display:block}
pre{margin:0;padding:22px 20px 26px;font:inherit;white-space:pre-wrap}
.prompt{color:#f5a524}</style>
<div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
<pre><span class="prompt">❯</span> /agent-era\n\n${escapeHtml(text)}</pre></div>`;
}

const chrome = findChrome();
if (!chrome) throw new Error('Chrome or Chromium is needed to render images');
const stats = exampleStats();

for (const [name, theme] of Object.entries(THEMES)) {
  await renderPng(renderCardSvg(stats, theme), join(DOCS, `card-${name}.png`), {
    chrome,
  });
}

const dir = await mkdtemp(join(tmpdir(), 'agent-era-docs-'));
try {
  const html = join(dir, 'summary.html');
  await writeFile(
    html,
    terminalHtml(formatSummary(stats, './agent-era-kayluhb.png')),
  );
  await promisify(execFile)(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--window-size=${SUMMARY_SIZE}`,
    `--screenshot=${join(DOCS, 'summary.png')}`,
    pathToFileURL(html).href,
  ]);
} finally {
  await rm(dir, { recursive: true, force: true });
}
console.log(`Wrote README images to ${DOCS}`);
