import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCardSvg } from '../src/card.js';
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
    '#1b1340',
    '#e2557a',
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
  const longHistory = { '2015-01': 5, ...calebStats.prs.monthly };
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
