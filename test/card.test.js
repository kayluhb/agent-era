import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCardSvg } from '../src/card.js';
import { monthRange } from '../src/months.js';
import { DEFAULT_THEME } from '../src/theme.js';
import { calebStats } from './fixtures/caleb-stats.js';

test('renders the headline card for real data', () => {
  const svg = renderCardSvg(calebStats);
  for (const expected of [
    'width="1200"',
    'height="630"',
    '6.8×',
    '@kayluhb · pull requests',
    '>68<',
    '>462<',
  ]) {
    assert.ok(svg.includes(expected), `missing ${expected}`);
  }
});

test('draws 24 pre-era bars plus the full era months', () => {
  const svg = renderCardSvg(calebStats);
  assert.equal(svg.match(/<rect[^>]*data-bar/g).length, 30);
  assert.equal(svg.match(/data-era="true"/g).length, 6);
});

test('caps the bars at 60 months', () => {
  const longHistory = {
    ...Object.fromEntries(monthRange('2015-01', '2015-12').map((m) => [m, 5])),
    ...calebStats.prs.monthly,
  };
  const svg = renderCardSvg({
    ...calebStats,
    eraStart: '2023-01',
    prs: { ...calebStats.prs, monthly: longHistory },
  });
  assert.equal(svg.match(/<rect[^>]*data-bar/g).length, 60);
});

const tilesOf = (svg) =>
  [...svg.matchAll(/<g data-tile="(\w+)"/g)].map(([, key]) => key);

test('tiles show commits and lines when present', () => {
  const svg = renderCardSvg(calebStats);
  assert.ok(svg.includes('COMMITS / MO'));
  assert.ok(svg.includes('LINES / PR'));
  assert.ok(svg.includes('>70 → <') && svg.includes('>602<'));
  assert.ok(svg.includes('8.6× more'));
});

test('omits the commit and lines tiles when they are missing', () => {
  const svg = renderCardSvg({ ...calebStats, commits: null, lines: null });
  assert.ok(!svg.includes('COMMITS / MO'));
  assert.ok(!svg.includes('LINES / PR'));
  assert.deepEqual(tilesOf(svg), ['bestMonth', 'streak']);
});

test('without a multiplier the headline is the after rate', () => {
  const svg = renderCardSvg({
    ...calebStats,
    prs: { ...calebStats.prs, before: 0, multiplier: null },
  });
  assert.doesNotMatch(svg, /font-weight="800"[^>]*>[^<]*×/);
  assert.ok(svg.includes('PRs per month with AI agents'));
  assert.ok(svg.includes('>462/mo<'));
});

test('formats big numbers with thousands separators', () => {
  const svg = renderCardSvg({
    ...calebStats,
    prs: { ...calebStats.prs, after: 1234.4 },
  });
  assert.ok(svg.includes('>1,234<'));
});

test('escapes the login', () => {
  const svg = renderCardSvg({ ...calebStats, login: '<x&y>' });
  assert.ok(svg.includes('@&lt;x&amp;y&gt;'));
  assert.ok(!svg.includes('<x&y>'));
});

test('never puts org names on the card', () => {
  const svg = renderCardSvg({ ...calebStats, restrictedOrgs: ['acme-corp'] });
  assert.ok(!svg.includes('acme'));
});

test('a drop in output is not called "more"', () => {
  const svg = renderCardSvg({
    ...calebStats,
    prs: { ...calebStats.prs, before: 100, after: 60, multiplier: 0.6 },
  });
  assert.ok(svg.includes('0.6×'));
  assert.ok(!svg.includes('more PRs'));
});

test('bars start at the first active month for new users', () => {
  const svg = renderCardSvg({
    ...calebStats,
    eraStart: '2025-02',
    prs: { ...calebStats.prs, monthly: { '2026-08': 50, '2026-09': 50 } },
  });
  assert.equal(svg.match(/<rect[^>]*data-bar/g).length, 2);
});

const terminal = {
  background: '#000000',
  foreground: '#eeeeee',
  accent: '#8ad15c',
  accentName: 'green',
};
const fillsOf = (svg, pattern) =>
  [...svg.matchAll(pattern)].map((m) => m[0].match(/fill="([^"]+)"/)[1]);

test('uses the default charcoal and amber theme when given none', () => {
  const svg = renderCardSvg(calebStats);
  assert.match(svg, /<rect width="1200" height="630" fill="#16171a"/);
  assert.deepEqual(
    [...new Set(fillsOf(svg, /<rect[^>]*data-era="true"[^>]*>/g))],
    [DEFAULT_THEME.accent],
  );
  assert.ok(!svg.includes('linearGradient'));
});

test('paints the card in the terminal theme', () => {
  const svg = renderCardSvg(calebStats, terminal);
  assert.match(svg, /<rect width="1200" height="630" fill="#000000"/);
  // Era bars use the accent; earlier bars are 20% of the way from background to text.
  assert.deepEqual(
    [...new Set(fillsOf(svg, /<rect[^>]*data-era="true"[^>]*>/g))],
    ['#8ad15c'],
  );
  assert.deepEqual(
    [...new Set(fillsOf(svg, /<rect[^>]*data-era="false"[^>]*>/g))],
    ['#303030'],
  );
  // The after number is in the accent; labels are halfway between background and text.
  assert.match(svg, /fill="#8ad15c"[^>]*>462</);
  assert.match(svg, /fill="#777777"[^>]*>COMMITS \/ MO</);
});

test('draws a dot grid in the text color', () => {
  const svg = renderCardSvg(calebStats, terminal);
  assert.match(svg, /<pattern[^>]*>.*<circle[^>]*fill="#eeeeee"/s);
});

test('sets labels in a monospace font', () => {
  const svg = renderCardSvg(calebStats);
  assert.match(svg, /font-family='[^']*monospace'[^>]*>@kayluhb/);
});

const barsOf = (svg) =>
  [
    ...svg.matchAll(/<rect data-bar[^>]*x="([\d.]+)"[^>]*width="([\d.]+)"/g),
  ].map(([, x, width]) => ({ x: Number(x), width: Number(width) }));

test('chartFrom starts the chart at that month, past the 60-bar cap', () => {
  const svg = renderCardSvg({ ...calebStats, chartFrom: '2016-01' });
  // Jan 2016 through Sep 2026, the last full month.
  assert.equal(barsOf(svg).length, 129);
  assert.equal(svg.match(/data-era="true"/g).length, 6);
});

test('a long chart still fits between the margins without overlapping', () => {
  const bars = barsOf(renderCardSvg({ ...calebStats, chartFrom: '2016-01' }));
  for (const [i, bar] of bars.entries()) {
    assert.ok(bar.width > 0, `bar ${i} has no width`);
    if (i > 0) assert.ok(bar.x > bars[i - 1].x + bars[i - 1].width - 0.1);
  }
  const last = bars.at(-1);
  assert.ok(last.x + last.width <= 1140.1);
});

test('the tiles show the top picks, six at most', () => {
  const svg = renderCardSvg({
    ...calebStats,
    commits: { ...calebStats.commits, coauthored: { Claude: 0.41 } },
    mergeHours: { before: 20, after: 3.14 },
  });
  assert.deepEqual(tilesOf(svg), [
    'coauthoredClaude',
    'commits',
    'mergeHours',
    'lines',
    'bestMonth',
    'streak',
  ]);
  assert.ok(svg.includes('>41%<'));
  assert.ok(svg.includes('of agent-era commits'));
  assert.ok(svg.includes('6.4× faster'));
});

// Commits per month for the chart, and Claude co-authoring half of each era month.
const months = monthRange('2024-04', '2026-09');
const commitMonthly = Object.fromEntries(months.map((m) => [m, 100]));
const half = Object.fromEntries(
  months.filter((m) => m >= '2026-04').map((m) => [m, 50]),
);
const withCommits = (coauthoredMonthly) => ({
  ...calebStats,
  commits: {
    ...calebStats.commits,
    monthly: commitMonthly,
    coauthored: { Claude: 0.5 },
    coauthoredMonthly,
  },
});

test('charts commits split by agent co-authorship', () => {
  const svg = renderCardSvg(withCommits({ Claude: half, Cursor: {} }));
  assert.ok(svg.includes('COMMITS OVER TIME'));
  assert.ok(svg.includes('>WITH CLAUDE<'));
  assert.ok(svg.includes('>SOLO<'));
  const agentBars = [
    ...svg.matchAll(/<rect data-agent[^>]*height="([\d.]+)"/g),
  ];
  assert.equal(agentBars.length, 6);
  // Era bars are the solo color; the co-authored half is the accent, drawn over them.
  const [era] = [
    ...svg.matchAll(
      /<rect data-bar data-era="true"[^>]*height="([\d.]+)"[^>]*fill="([^"]+)"/g,
    ),
  ];
  assert.notEqual(era[2], DEFAULT_THEME.accent);
  assert.equal(Number(agentBars[0][1]), Number(era[1]) / 2);
});

test('more than one agent is keyed as agents', () => {
  const svg = renderCardSvg(withCommits({ Claude: half, Cursor: half }));
  assert.ok(svg.includes('>WITH AGENTS<'));
});

test('commits with no agent trailers are not split', () => {
  const svg = renderCardSvg(withCommits({ Claude: {}, Cursor: {} }));
  assert.ok(svg.includes('COMMITS OVER TIME'));
  assert.ok(!svg.includes('data-agent'));
  assert.ok(!svg.includes('>SOLO<'));
});

test('charts PRs when commits were skipped', () => {
  const svg = renderCardSvg({ ...calebStats, commits: null });
  assert.ok(svg.includes('PRS OVER TIME'));
  assert.ok(svg.includes('>WITH AGENTS<'));
});

test('labels the y-axis in round steps', () => {
  const ticks = [
    ...renderCardSvg(calebStats).matchAll(/<text data-tick[^>]*>([\d,]+)</g),
  ].map(([, n]) => n);
  // The busiest month has 628 PRs.
  assert.deepEqual(ticks, ['0', '200', '400', '600']);
});

test('labels where the chart starts, ends and the era begins', () => {
  const svg = renderCardSvg(calebStats);
  assert.ok(svg.includes('>Apr 2024<'));
  assert.ok(svg.includes('>Sep 2026<'));
  assert.match(svg, /fill="#f5a524">Apr 2026</);
  assert.ok(svg.includes('data-era-line'));
});

test('footnotes the stats that missed the tiles, drops included', () => {
  const svg = renderCardSvg({
    ...calebStats,
    reviews: { before: 14, after: 12 },
    activeDays: { before: 17, after: 21 },
    afterHours: { before: 0.12, after: 0.31 },
  });
  assert.match(
    svg,
    /data-footnote[^>]*>reviews given 14 → 12\/mo {2}· {2}active days 17 → 21\/mo {2}· {2}PRs opened 6pm–6am 12% → 31%</,
  );
});

test('no footnote without those stats', () => {
  assert.ok(!renderCardSvg(calebStats).includes('data-footnote'));
});

const yearsOf = (svg) =>
  [...svg.matchAll(/<text data-year[^>]*>(\d{4})</g)].map(([, year]) => year);

test('labels each year under the chart', () => {
  // Apr 2024 through Sep 2026.
  assert.deepEqual(yearsOf(renderCardSvg(calebStats)), ['2025', '2026']);
});

test('a long chart skips year labels that would crowd', () => {
  const years = yearsOf(renderCardSvg({ ...calebStats, chartFrom: '2016-01' }));
  assert.equal(years[0], '2016');
  assert.ok(years.includes('2026'));
  assert.ok(years.length >= 6 && years.length <= 11);
});
