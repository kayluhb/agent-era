import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSummary } from '../src/summary.js';
import { calebStats } from './fixtures/caleb-stats.js';

test('summarizes the headline, era, commits and output path', () => {
  const text = formatSummary(calebStats, '/tmp/agent-era-kayluhb.png');
  for (const expected of [
    '6.8×',
    '68 → 462 PRs/month',
    'Agent era: Apr 2026 (detected)',
    'commits on default branches',
    '/tmp/agent-era-kayluhb.png',
  ]) {
    assert.ok(text.includes(expected), `missing ${expected}`);
  }
});

test('has one table row per year with PRs', () => {
  const text = formatSummary(calebStats, 'x.png');
  const rows = text.split('\n').filter((line) => /^\d{4}\s/.test(line));
  assert.deepEqual(
    rows.map((r) => r.slice(0, 4)),
    ['2011', '2016', '2017', '2024', '2025', '2026'],
  );
  assert.match(rows.at(-1), /3,554/);
});

test('names restricted orgs in a caveat', () => {
  const text = formatSummary(
    { ...calebStats, restrictedOrgs: ['acme'] },
    'x.png',
  );
  assert.match(text, /acme.*may be low/);
});

test('handles a missing multiplier', () => {
  const text = formatSummary(
    { ...calebStats, prs: { ...calebStats.prs, before: 0, multiplier: null } },
    'x.png',
  );
  assert.ok(!text.includes('×'));
  assert.ok(text.includes('462 PRs/month'));
});

test('a drop in output is not called "more"', () => {
  const text = formatSummary(
    {
      ...calebStats,
      prs: { ...calebStats.prs, before: 100, after: 60, multiplier: 0.6 },
    },
    'x.png',
  );
  assert.ok(text.includes('0.6×'));
  assert.ok(!text.includes('more PRs'));
});
