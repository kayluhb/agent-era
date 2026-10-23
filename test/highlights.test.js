import assert from 'node:assert/strict';
import { test } from 'node:test';
import { peakMonth, pickHighlights, streakAbove } from '../src/highlights.js';
import { calebStats } from './fixtures/caleb-stats.js';

const keys = (stats) => pickHighlights(stats).map(({ key }) => key);

const rich = {
  ...calebStats,
  commits: { ...calebStats.commits, coauthoredShare: 0.41 },
  mergeHours: { before: 20, after: 3.14 },
  mergeRate: { before: 0.91, after: 0.94 },
  reviews: { before: 12, after: 40 },
  activeDays: { before: 18, after: 20 },
};

test('Claude co-authorship leads, then the biggest wins, three at most', () => {
  // commits 8.6×, hours to merge 6.4×, reviews 3.3×, lines 1.4×, active days 1.1×
  assert.deepEqual(keys(rich), ['coauthored', 'commits', 'mergeHours']);
});

test('formats each highlight for the card', () => {
  const [coauthored, , hours] = pickHighlights(rich);
  assert.deepEqual(coauthored, {
    key: 'coauthored',
    label: 'commits co-authored by Claude',
    before: null,
    after: '41%',
  });
  assert.deepEqual(hours, {
    key: 'mergeHours',
    label: 'median hours to merge',
    before: '20',
    after: '3.1',
  });
});

test('a rare Claude co-author is left off', () => {
  const stats = {
    ...rich,
    commits: { ...rich.commits, coauthoredShare: 0.05 },
  };
  assert.ok(!keys(stats).includes('coauthored'));
});

test('slower merges and fewer reviews never make the card', () => {
  const stats = {
    ...calebStats,
    commits: null,
    lines: null,
    mergeHours: { before: 3, after: 20 },
    reviews: { before: 40, after: 12 },
  };
  assert.deepEqual(keys(stats), []);
});

test('smaller PRs can make the card', () => {
  assert.deepEqual(keys({ ...calebStats, commits: null }), ['lines']);
});

test('small changes are not highlights', () => {
  const stats = {
    ...calebStats,
    commits: { ...calebStats.commits, before: 100, after: 110 },
    lines: { beforeMedian: 100, afterMedian: 90 },
  };
  assert.deepEqual(keys(stats), []);
});

test('a high, steady merge rate fills a spare slot', () => {
  const stats = { ...calebStats, mergeRate: { before: 0.91, after: 0.94 } };
  assert.deepEqual(keys(stats), ['commits', 'lines', 'mergeRate']);
});

test('a falling or low merge rate is left off', () => {
  for (const mergeRate of [
    { before: 0.95, after: 0.85 },
    { before: 0.5, after: 0.7 },
  ]) {
    assert.ok(!keys({ ...calebStats, mergeRate }).includes('mergeRate'));
  }
});

test('stats with no before value are not compared', () => {
  const stats = {
    ...calebStats,
    commits: null,
    lines: null,
    reviews: { before: 0, after: 30 },
  };
  assert.deepEqual(keys(stats), []);
});

test('peakMonth ignores the unfinished current month', () => {
  const monthly = { '2026-08': 5, '2026-09': 9, '2026-10': 50 };
  assert.deepEqual(peakMonth(monthly, '2026-10-23T12:00:00Z'), {
    month: '2026-09',
    count: 9,
  });
});

test('streakAbove counts back from the last full month', () => {
  const monthly = {
    '2026-05': 9,
    '2026-06': 2,
    '2026-07': 8,
    '2026-08': 7,
    '2026-09': 9,
    '2026-10': 0,
  };
  assert.equal(streakAbove(monthly, 5, '2026-10-23T12:00:00Z'), 3);
  assert.equal(streakAbove(monthly, 8.5, '2026-10-23T12:00:00Z'), 0);
  assert.equal(streakAbove(monthly, 0, '2026-10-23T12:00:00Z'), 0);
});
