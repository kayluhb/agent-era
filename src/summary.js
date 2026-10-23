import { multiplierPhrase } from './card.js';
import {
  hours,
  pct,
  peakMonth,
  pickHighlights,
  streakAbove,
} from './highlights.js';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const monthLabel = (month) =>
  `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

const bothKnown = (pair) => pair && pair.before !== null && pair.after !== null;

function headlineLines(stats) {
  const { prs, commits, lines, mergeHours, mergeRate, reviews, activeDays } =
    stats;
  const out =
    prs.multiplier === null
      ? [
          `${fmt(prs.after)} PRs/month with AI agents (no earlier PRs to compare)`,
        ]
      : [
          `${prs.multiplier.toFixed(1)}× ${multiplierPhrase(prs.multiplier)}`,
          `  PRs: ${fmt(prs.before)} → ${fmt(prs.after)} PRs/month`,
        ];
  if (commits)
    out.push(
      `  commits on default branches: ${fmt(commits.before)} → ${fmt(commits.after)}/month`,
    );
  if (commits?.coauthoredShare != null)
    out.push(
      `  commits co-authored by Claude since the agent era: ${pct(commits.coauthoredShare)}`,
    );
  if (lines && lines.beforeMedian !== null && lines.afterMedian !== null) {
    out.push(
      `  median lines changed per merged PR: ${fmt(lines.beforeMedian)} → ${fmt(lines.afterMedian)}`,
    );
  }
  if (bothKnown(mergeHours))
    out.push(
      `  median hours from open to merge: ${hours(mergeHours.before)} → ${hours(mergeHours.after)}`,
    );
  if (bothKnown(mergeRate))
    out.push(
      `  PRs merged: ${pct(mergeRate.before)} → ${pct(mergeRate.after)}`,
    );
  if (reviews)
    out.push(
      `  reviews of other people's PRs: ${fmt(reviews.before)} → ${fmt(reviews.after)}/month`,
    );
  if (activeDays)
    out.push(
      `  active days: ${fmt(activeDays.before)} → ${fmt(activeDays.after)}/month`,
    );
  return out;
}

function factLines(stats) {
  const out = [];
  const peak = peakMonth(stats.prs.monthly, stats.now);
  if (peak)
    out.push(`Best month: ${monthLabel(peak.month)} (${fmt(peak.count)} PRs)`);
  const streak = streakAbove(stats.prs.monthly, stats.prs.before, stats.now);
  if (streak)
    out.push(`${streak} months in a row above your pre-agent average`);
  if (stats.repos)
    out.push(
      `Repos in the merged-PR sample: ${stats.repos.before} → ${stats.repos.after}; languages: ${stats.languages.before} → ${stats.languages.after}`,
    );
  return out.length ? ['', ...out] : [];
}

function cardLine(stats) {
  const picks = pickHighlights(stats);
  return picks.length
    ? `On the card: ${picks.map(({ label }) => label).join(', ')}`
    : 'On the card: PRs only';
}

function yearTable({ prs, commits }) {
  const years = Object.keys(prs.yearly)
    .filter((year) => prs.yearly[year] > 0)
    .sort();
  const header = commits ? 'Year       PRs   Commits' : 'Year       PRs';
  const rows = years.map((year) => {
    const row = `${year}  ${fmt(prs.yearly[year]).padStart(8)}`;
    return commits
      ? `${row}  ${fmt(commits.yearly[year] ?? 0).padStart(8)}`
      : row;
  });
  return [header, ...rows];
}

function caveatLines({ prs, restrictedOrgs, caveats }) {
  const all = [...caveats];
  if (prs.shortHistory) {
    all.push(
      'Less than 12 months of PRs before the agent era, so "before" averages only the months you were active.',
    );
  }
  for (const org of restrictedOrgs) {
    all.push(
      `${org} blocks this gh login, so its counts may be low. Authorize the GitHub CLI for that org's SSO and run again.`,
    );
  }
  return all.length ? ['', 'Caveats:', ...all.map((c) => `- ${c}`)] : [];
}

export function formatSummary(stats, outputPath) {
  return [
    `agent-era for @${stats.login}`,
    '',
    ...headlineLines(stats),
    ...factLines(stats),
    '',
    `Agent era: ${monthLabel(stats.eraStart)} (${stats.eraSource}). Move it with --since YYYY-MM.`,
    '',
    ...yearTable(stats),
    '',
    `Card: ${outputPath}`,
    cardLine(stats),
    stats.colors
      ? `Colors: ${stats.colors.source} (accent: ${stats.colors.accentName})`
      : 'Colors: default',
    ...caveatLines(stats),
  ].join('\n');
}
