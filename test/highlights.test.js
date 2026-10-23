import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  peakMonth,
  pickFootnotes,
  pickTiles,
  streakAbove,
  tileText,
} from '../src/highlights.js';
import { calebStats } from './fixtures/caleb-stats.js';

const keys = (stats) => pickTiles(stats).map(({ key }) => key);

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

test('agent co-authorship leads, then the biggest wins, six at most', () => {
  // commits 8.6×, hours to merge 6.4×, reviews 3.3×, lines 1.4×, active days 1.1×
  assert.deepEqual(keys(rich), [
    'coauthoredClaude',
    'commits',
    'mergeHours',
    'reviews',
    'lines',
    'bestMonth',
  ]);
});

test('formats each tile for the card', () => {
  const [coauthored, , hours, , lines, best] = pickTiles(rich);
  assert.deepEqual(coauthored, {
    key: 'coauthoredClaude',
    label: 'By Claude',
    before: null,
    after: '41%',
    note: 'of agent-era commits',
  });
  assert.deepEqual(hours, {
    key: 'mergeHours',
    label: 'Hours to merge',
    before: '20',
    after: '3.1',
    note: '6.4× faster',
  });
  assert.equal(lines.note, '1.4× smaller PRs');
  assert.deepEqual(best, {
    key: 'bestMonth',
    label: 'Best month',
    before: null,
    after: '628',
    note: 'PRs in Jun 2026',
  });
});

test('tileText reads as one line for the summary', () => {
  const [coauthored, commits] = pickTiles(rich);
  assert.equal(tileText(coauthored), 'By Claude 41% (of agent-era commits)');
  assert.equal(tileText(commits), 'Commits / mo 70 → 602 (8.6× more)');
});

test('a rare agent co-author is left off', () => {
  assert.ok(!keys(rich).includes('coauthoredCursor'));
});

test('each agent past the bar gets its own tile, biggest first', () => {
  const stats = {
    ...rich,
    commits: { ...rich.commits, coauthored: { Claude: 0.2, Cursor: 0.3 } },
  };
  assert.deepEqual(keys(stats).slice(0, 2), [
    'coauthoredCursor',
    'coauthoredClaude',
  ]);
});

test('slower merges and fewer reviews never make a tile', () => {
  const stats = {
    ...calebStats,
    commits: null,
    lines: null,
    mergeHours: { before: 3, after: 20 },
    reviews: { before: 40, after: 12 },
  };
  assert.deepEqual(keys(stats), ['bestMonth', 'streak']);
});

test('smaller PRs can make a tile', () => {
  assert.ok(keys({ ...calebStats, commits: null }).includes('lines'));
});

test('small changes are not tiles', () => {
  const stats = {
    ...calebStats,
    commits: { ...calebStats.commits, before: 100, after: 110 },
    lines: { beforeMedian: 100, afterMedian: 90 },
  };
  assert.deepEqual(keys(stats), ['bestMonth', 'streak']);
});

test('a high, steady merge rate fills a spare tile', () => {
  const stats = { ...calebStats, mergeRate: { before: 0.91, after: 0.94 } };
  assert.deepEqual(keys(stats), [
    'commits',
    'lines',
    'bestMonth',
    'streak',
    'mergeRate',
  ]);
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
  assert.ok(!keys(stats).includes('reviews'));
});

test('footnotes skip stats already on a tile', () => {
  const stats = { ...rich, afterHours: { before: 0.1, after: 0.25 } };
  assert.deepEqual(pickFootnotes(stats, pickTiles(stats)), [
    'active days 18 → 20/mo',
    'PRs opened 6pm–6am 10% → 25%',
  ]);
});

test('footnotes leave out stats with a missing side', () => {
  const stats = {
    ...calebStats,
    reviews: null,
    activeDays: { before: null, after: 3 },
    afterHours: { before: null, after: 0.2 },
  };
  assert.deepEqual(pickFootnotes(stats, []), []);
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
