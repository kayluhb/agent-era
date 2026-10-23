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

test('secondary row shows commits and lines when present', () => {
  const svg = renderCardSvg(calebStats);
  assert.ok(svg.includes('commits'));
  assert.ok(svg.includes('lines'));
  assert.ok(svg.includes('>70<') && svg.includes('>602<'));
});

test('omits the secondary row when commits and lines are missing', () => {
  const svg = renderCardSvg({ ...calebStats, commits: null, lines: null });
  assert.ok(!svg.includes('commits'));
  assert.ok(!svg.includes('lines'));
});

test('without a multiplier the headline is the after rate', () => {
  const svg = renderCardSvg({
    ...calebStats,
    prs: { ...calebStats.prs, before: 0, multiplier: null },
  });
  assert.ok(!svg.includes('×'));
  assert.ok(svg.includes('PRs per month with AI agents'));
  assert.ok(svg.includes('462/mo'));
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
  assert.match(svg, /fill="#777777"[^>]*>BEFORE</);
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

test('the secondary row shows the top highlights only', () => {
  const svg = renderCardSvg({
    ...calebStats,
    commits: { ...calebStats.commits, coauthored: { Claude: 0.41 } },
    mergeHours: { before: 20, after: 3.14 },
  });
  assert.ok(
    svg.includes(
      '>41%</tspan> of commits co-authored by Claude since Apr 2026',
    ),
  );
  assert.ok(svg.includes('median hours to merge'));
  assert.ok(!svg.includes('lines/PR'));
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
