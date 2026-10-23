import { lastFullMonth, monthLabel, monthRange } from './months.js';

const MAX_TILES = 6;
const MIN_CHANGE = 1.25;
const MIN_COAUTHORED_SHARE = 0.1;
const MIN_MERGE_RATE = 0.8;
const MERGE_RATE_SLACK = 0.05;
const MIN_STREAK = 2;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const pct = (share) => `${Math.round(share * 100)}%`;
export const hours = (n) => (n < 10 ? n.toFixed(1) : fmt(n));
const times = (n) => `${n.toFixed(1)}×`;

// `better` says which way counts as a win. "either" is for stats where smaller is good too.
function changeStats({ commits, reviews, activeDays, lines, mergeHours }) {
  return [
    commits && {
      key: 'commits',
      label: 'Commits / mo',
      before: commits.before,
      after: commits.after,
      better: 'up',
      format: fmt,
    },
    reviews && {
      key: 'reviews',
      label: 'Reviews / mo',
      before: reviews.before,
      after: reviews.after,
      better: 'up',
      format: fmt,
    },
    activeDays && {
      key: 'activeDays',
      label: 'Active days / mo',
      before: activeDays.before,
      after: activeDays.after,
      better: 'up',
      format: fmt,
    },
    lines && {
      key: 'lines',
      label: 'Lines / PR',
      before: lines.beforeMedian,
      after: lines.afterMedian,
      better: 'either',
      format: fmt,
    },
    mergeHours && {
      key: 'mergeHours',
      label: 'Hours to merge',
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

function changeNote({ key, before, after }, score) {
  if (key === 'mergeHours') return `${times(score)} faster`;
  if (key === 'lines')
    return `${times(score)} ${after < before ? 'smaller' : 'bigger'} PRs`;
  return `${times(score)} more`;
}

// A tile as one line of text, for the summary.
export const tileText = ({ label, before, after, note }) =>
  `${label} ${before === null ? after : `${before} → ${after}`} (${note})`;

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

// The card's tiles: agent co-authorship, the biggest wins, best month, streak, then a healthy merge rate.
export function pickTiles(stats) {
  const tiles = Object.entries(stats.commits?.coauthored ?? {})
    .filter(([, share]) => share >= MIN_COAUTHORED_SHARE)
    .sort(([, a], [, b]) => b - a)
    .map(([agent, share]) => ({
      key: `coauthored${agent}`,
      label: `By ${agent}`,
      before: null,
      after: pct(share),
      note: 'of agent-era commits',
    }));
  tiles.push(
    ...changeStats(stats)
      .map((stat) => ({ stat, score: improvement(stat) }))
      .filter(({ score }) => score >= MIN_CHANGE)
      .sort((a, b) => b.score - a.score)
      .map(({ stat, score }) => ({
        key: stat.key,
        label: stat.label,
        before: stat.format(stat.before),
        after: stat.format(stat.after),
        note: changeNote(stat, score),
      })),
  );
  const peak = peakMonth(stats.prs.monthly, stats.now);
  if (peak) {
    tiles.push({
      key: 'bestMonth',
      label: 'Best month',
      before: null,
      after: fmt(peak.count),
      note: `PRs in ${monthLabel(peak.month)}`,
    });
  }
  const streak = streakAbove(stats.prs.monthly, stats.prs.before, stats.now);
  if (streak) {
    tiles.push({
      key: 'streak',
      label: 'Streak',
      before: null,
      after: `${streak} mo`,
      note: 'above pre-agent avg',
    });
  }
  const rate = stats.mergeRate;
  if (
    rate?.after >= MIN_MERGE_RATE &&
    (rate.before === null || rate.after >= rate.before - MERGE_RATE_SLACK)
  ) {
    tiles.push({
      key: 'mergeRate',
      label: 'PRs merged',
      before: rate.before === null ? null : pct(rate.before),
      after: pct(rate.after),
      note: 'merge rate',
    });
  }
  return tiles.slice(0, MAX_TILES);
}

// Context lines under the chart, for stats that didn't get a tile. Drops are shown too.
export function pickFootnotes(stats, tiles) {
  const onTiles = new Set(tiles.map(({ key }) => key));
  const pair = (value) =>
    value && value.before !== null && value.after !== null;
  const notes = [];
  if (!onTiles.has('reviews') && pair(stats.reviews))
    notes.push(
      `reviews given ${fmt(stats.reviews.before)} → ${fmt(stats.reviews.after)}/mo`,
    );
  if (!onTiles.has('activeDays') && pair(stats.activeDays))
    notes.push(
      `active days ${fmt(stats.activeDays.before)} → ${fmt(stats.activeDays.after)}/mo`,
    );
  if (pair(stats.afterHours))
    notes.push(
      `PRs opened 6pm–6am ${pct(stats.afterHours.before)} → ${pct(stats.afterHours.after)}`,
    );
  return notes;
}
