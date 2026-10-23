import { lastFullMonth, monthRange } from './months.js';

const MAX_HIGHLIGHTS = 3;
const MIN_CHANGE = 1.25;
const MIN_COAUTHORED_SHARE = 0.1;
const MIN_MERGE_RATE = 0.8;
const MERGE_RATE_SLACK = 0.05;
const MIN_STREAK = 2;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const pct = (share) => `${Math.round(share * 100)}%`;
export const hours = (n) => (n < 10 ? n.toFixed(1) : fmt(n));

// `better` says which way counts as a win. "either" is for stats where smaller is good too.
function changeStats({ commits, reviews, activeDays, lines, mergeHours }) {
  return [
    commits && {
      key: 'commits',
      label: 'commits/mo',
      before: commits.before,
      after: commits.after,
      better: 'up',
      format: fmt,
    },
    reviews && {
      key: 'reviews',
      label: 'reviews/mo',
      before: reviews.before,
      after: reviews.after,
      better: 'up',
      format: fmt,
    },
    activeDays && {
      key: 'activeDays',
      label: 'active days/mo',
      before: activeDays.before,
      after: activeDays.after,
      better: 'up',
      format: fmt,
    },
    lines && {
      key: 'lines',
      label: 'median lines/PR',
      before: lines.beforeMedian,
      after: lines.afterMedian,
      better: 'either',
      format: fmt,
    },
    mergeHours && {
      key: 'mergeHours',
      label: 'median hours to merge',
      before: mergeHours.before,
      after: mergeHours.after,
      better: 'down',
      format: hours,
    },
  ].filter(Boolean);
}

// How many times better, or 0 when there's nothing honest to compare.
function improvement({ before, after, better }) {
  if (!(before > 0) || !(after > 0)) return 0;
  const up = after / before;
  if (better === 'up') return up;
  if (better === 'down') return 1 / up;
  return Math.max(up, 1 / up);
}

// The card's secondary row: Claude co-authorship first, then the biggest wins, then a healthy merge rate.
export function pickHighlights(stats) {
  const picks = [];
  const share = stats.commits?.coauthoredShare;
  if (share >= MIN_COAUTHORED_SHARE) {
    picks.push({
      key: 'coauthored',
      label: 'commits co-authored by Claude',
      before: null,
      after: pct(share),
    });
  }
  picks.push(
    ...changeStats(stats)
      .map((stat) => ({ stat, score: improvement(stat) }))
      .filter(({ score }) => score >= MIN_CHANGE)
      .sort((a, b) => b.score - a.score)
      .map(({ stat: { key, label, before, after, format } }) => ({
        key,
        label,
        before: format(before),
        after: format(after),
      })),
  );
  const rate = stats.mergeRate;
  if (
    rate?.after >= MIN_MERGE_RATE &&
    (rate.before === null || rate.after >= rate.before - MERGE_RATE_SLACK)
  ) {
    picks.push({
      key: 'mergeRate',
      label: 'PRs merged',
      before: rate.before === null ? null : pct(rate.before),
      after: pct(rate.after),
    });
  }
  return picks.slice(0, MAX_HIGHLIGHTS);
}

export function peakMonth(monthly, now) {
  const lastFull = lastFullMonth(new Date(now));
  let peak = null;
  for (const [month, count] of Object.entries(monthly)) {
    if (month <= lastFull && count > 0 && (!peak || count > peak.count))
      peak = { month, count };
  }
  return peak;
}

// Full months in a row, up to the last one, above the pre-agent average.
export function streakAbove(monthly, average, now) {
  if (!(average > 0)) return 0;
  const months = Object.keys(monthly).sort();
  if (months.length === 0) return 0;
  let streak = 0;
  for (const month of monthRange(
    months[0],
    lastFullMonth(new Date(now)),
  ).reverse()) {
    if ((monthly[month] ?? 0) <= average) break;
    streak++;
  }
  return streak >= MIN_STREAK ? streak : 0;
}
