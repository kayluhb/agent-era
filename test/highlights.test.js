import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  highlightText,
  peakMonth,
  pickHighlights,
  streakAbove,
} from '../src/highlights.js';
import { calebStats } from './fixtures/caleb-stats.js';

const keys = (stats) => pickHighlights(stats).map(({ key }) => key);

const rich = {
  ...calebStats,
  commits: {
    ...calebStats.commits,
    coauthored: { Claude: 0.41, Cursor: 0.02 },
  },
  mergeHours: { before: 20, after: 3.14 },
  mergeRate: { before: 0.91, after: 0.94 },
  reviews: { before: 12, after: 40 },
  activeDays: { before: 18, after: 20 },
};

test('agent co-authorship leads, then the biggest wins, three at most', () => {
  // commits 8.6×, hours to merge 6.4×, reviews 3.3×, lines 1.4×, active days 1.1×
  assert.deepEqual(keys(rich), ['coauthoredClaude', 'commits', 'mergeHours']);
});

test('formats each highlight for the card', () => {
  const [coauthored, , hours] = pickHighlights(rich);
  assert.deepEqual(coauthored, {
    key: 'coauthoredClaude',
    label: 'of commits co-authored by Claude since Apr 2026',
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

test('a rare agent co-author is left off', () => {
  assert.ok(!keys(rich).includes('coauthoredCursor'));
});

test('each agent past the bar gets its own highlight, biggest first', () => {
  const stats = {
    ...rich,
    commits: { ...rich.commits, coauthored: { Claude: 0.2, Cursor: 0.3 } },
  };
  assert.deepEqual(keys(stats).slice(0, 2), [
    'coauthoredCursor',
    'coauthoredClaude',
  ]);
});

test('highlights that would overflow the line are skipped, not cut off', () => {
  const stats = {
    ...rich,
    commits: { ...rich.commits, coauthored: { Claude: 0.4, Cursor: 0.3 } },
  };
  // Two long co-author highlights fill the line, so the stats after them are skipped.
  assert.deepEqual(keys(stats), ['coauthoredClaude', 'coauthoredCursor']);
  const chars = pickHighlights(stats).map(highlightText).join('   ·   ').length;
  assert.ok(chars <= 116);
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
