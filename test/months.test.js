import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addMonths,
  currentMonth,
  lastFullMonth,
  laterMonth,
  monthEnd,
  monthRange,
} from '../src/months.js';

test('addMonths crosses year boundaries both ways', () => {
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2025-11', 14), '2027-01');
});

test('monthRange is inclusive and empty when reversed', () => {
  assert.deepEqual(monthRange('2025-11', '2026-02'), [
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
  ]);
  assert.deepEqual(monthRange('2026-02', '2026-01'), []);
});

test('monthEnd handles leap years and 30-day months', () => {
  assert.equal(monthEnd('2024-02'), '2024-02-29');
  assert.equal(monthEnd('2026-04'), '2026-04-30');
});

test('currentMonth and lastFullMonth use UTC', () => {
  const now = new Date('2026-11-01T00:30:00Z');
  assert.equal(currentMonth(now), '2026-11');
  assert.equal(lastFullMonth(now), '2026-10');
});

test('laterMonth picks the later of two months', () => {
  assert.equal(laterMonth('2023-01', '2022-12'), '2023-01');
  assert.equal(laterMonth('2022-12', '2023-01'), '2023-01');
});
