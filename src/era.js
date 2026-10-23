import { addMonths, lastFullMonth, monthRange } from './months.js';

const EARLIEST_CANDIDATE = '2023-01';
const DEFAULT_ERA_START = '2025-02'; // Claude Code's launch
const MIN_JUMP = 2;

// biome-ignore lint/complexity/useMathMinMax: compares "YYYY-MM" strings, which Math.max can't.
const later = (a, b) => (a > b ? a : b);
const countIn = (monthly, months) =>
  months.reduce((sum, m) => sum + (monthly[m] ?? 0), 0);
const meanIn = (monthly, months) =>
  months.length ? countIn(monthly, months) / months.length : 0;

export function firstActiveMonth(monthly) {
  const active = Object.keys(monthly)
    .filter((m) => monthly[m] > 0)
    .sort();
  return active[0] ?? null;
}

// The 12 months before `month`, clipped so they never start before the first active month.
function priorWindow(month, first) {
  return monthRange(later(addMonths(month, -12), first), addMonths(month, -1));
}

export function detectEraStart(monthly, now) {
  const first = firstActiveMonth(monthly);
  let best = null;
  if (first) {
    const lastCandidate = addMonths(lastFullMonth(now), -2);
    for (const month of monthRange(
      later(EARLIEST_CANDIDATE, first),
      lastCandidate,
    )) {
      const prior = priorWindow(month, first);
      const priorMean = meanIn(monthly, prior);
      if (priorMean === 0) continue;
      const ratio =
        meanIn(monthly, monthRange(month, addMonths(month, 2))) / priorMean;
      if (ratio >= MIN_JUMP && (!best || ratio > best.ratio))
        best = { month, ratio };
    }
  }
  return best
    ? { month: best.month, source: 'detected' }
    : { month: DEFAULT_ERA_START, source: 'default' };
}

export function beforeAfter(monthly, eraStart, now) {
  const first = firstActiveMonth(monthly);
  const beforeMonths = first ? priorWindow(eraStart, first) : [];
  const afterMonths = monthRange(eraStart, lastFullMonth(now));
  const before = meanIn(monthly, beforeMonths);
  const after = meanIn(monthly, afterMonths);
  return {
    before,
    after,
    multiplier: before === 0 ? null : Math.round((after / before) * 10) / 10,
    beforeMonths: beforeMonths.length,
    afterMonths: afterMonths.length,
    shortHistory: first !== null && first > addMonths(eraStart, -12),
  };
}
