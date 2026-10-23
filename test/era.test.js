import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beforeAfter, detectEraStart, firstActiveMonth } from '../src/era.js';
import { monthRange } from '../src/months.js';
import { calebMonthly, NOW } from './fixtures/caleb-monthly.js';

const flat = Object.fromEntries(
  monthRange('2022-01', '2026-10').map((m) => [m, 40]),
);

test('detects the April 2026 jump in real data', () => {
  assert.deepEqual(detectEraStart(calebMonthly, NOW), {
    month: '2026-04',
    source: 'detected',
  });
});

test('before/after for real data excludes the partial month', () => {
  const s = beforeAfter(calebMonthly, '2026-04', NOW);
  assert.equal(Math.round(s.before), 68);
  assert.equal(Math.round(s.after), 462);
  assert.equal(s.multiplier, 6.8);
  assert.equal(s.afterMonths, 6);
  assert.equal(s.shortHistory, false);
});

test('flat history falls back to the default line with an honest multiplier', () => {
  assert.deepEqual(detectEraStart(flat, NOW), {
    month: '2025-02',
    source: 'default',
  });
  assert.equal(beforeAfter(flat, '2025-02', NOW).multiplier, 1);
});

test('brand-new user has no before and no multiplier', () => {
  const f = beforeAfter({ '2026-08': 5, '2026-09': 9 }, '2025-02', NOW);
  assert.equal(f.before, 0);
  assert.equal(f.multiplier, null);
});

test('short history averages only the active months before the line', () => {
  const short = {
    '2026-01': 10,
    '2026-02': 10,
    '2026-03': 10,
    '2026-04': 40,
    '2026-05': 40,
    '2026-06': 40,
    '2026-07': 40,
  };
  const s = beforeAfter(short, '2026-04', NOW);
  assert.equal(s.before, 10);
  assert.equal(s.shortHistory, true);
});

test('a spike in the current partial month is never detected', () => {
  assert.equal(
    detectEraStart({ ...flat, '2026-10': 5000 }, NOW).source,
    'default',
  );
});

test('running on the 1st counts the just-finished month as full', () => {
  const s = beforeAfter(
    calebMonthly,
    '2026-04',
    new Date('2026-11-01T00:00:00Z'),
  );
  assert.equal(s.afterMonths, 7);
});

test('firstActiveMonth finds the earliest non-zero month', () => {
  assert.equal(
    firstActiveMonth({ '2024-03': 0, '2024-05': 2, '2024-04': 1 }),
    '2024-04',
  );
  assert.equal(firstActiveMonth({}), null);
});
