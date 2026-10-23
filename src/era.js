import { addMonths, lastFullMonth, laterMonth, monthRange } from './months.js';

const EARLIEST_CANDIDATE = '2023-01';
const DEFAULT_ERA_START = '2025-02'; // Claude Code's launch
const MIN_JUMP = 2;
const MIN_BASELINE_MONTHS = 6;
// Activity is sustained once at least half of the next 12 months are active.
const SUSTAINED_WINDOW = 12;
const SUSTAINED_ACTIVE_MONTHS = 6;

const countIn = (monthly, months) =>
  months.reduce((sum, m) => sum + (monthly[m] ?? 0), 0);
const meanIn = (monthly, months) =>
  months.length ? countIn(monthly, months) / months.length : 0;

// The first month of steady activity, skipping a scattered early trickle.
// Falls back to the first active month when activity never gets steady.
export function firstActiveMonth(monthly) {
  const active = Object.keys(monthly)
    .filter((m) => monthly[m] > 0)
    .sort();
  const sustained = active.find(
    (month) =>
      monthRange(month, addMonths(month, SUSTAINED_WINDOW - 1)).filter(
        (m) => monthly[m] > 0,
      ).length >= SUSTAINED_ACTIVE_MONTHS,
  );
  return sustained ?? active[0] ?? null;
}

// The 12 months before `month`, clipped so they never start before the first active month.
function priorWindow(month, first) {
  return monthRange(
    laterMonth(addMonths(month, -12), first),
    addMonths(month, -1),
  );
}

export function detectEraStart(monthly, now) {
  const first = firstActiveMonth(monthly);
  let best = null;
  if (first) {
    const lastCandidate = addMonths(lastFullMonth(now), -2);
    // A baseline needs some history, or a normal ramp-up looks like a jump.
    const firstCandidate = laterMonth(
      EARLIEST_CANDIDATE,
      addMonths(first, MIN_BASELINE_MONTHS),
    );
    for (const month of monthRange(firstCandidate, lastCandidate)) {
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
  // Months before someone's first PR aren't "after" months, even past the line.
  const afterMonths = monthRange(
    first ? laterMonth(eraStart, first) : eraStart,
    lastFullMonth(now),
  );
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
