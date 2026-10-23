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

function headlineLines({ prs, commits, lines }) {
  const out =
    prs.multiplier === null
      ? [
          `${fmt(prs.after)} PRs/month with AI agents (no earlier PRs to compare)`,
        ]
      : [
          `${prs.multiplier.toFixed(1)}× more PRs per month with AI agents`,
          `  PRs: ${fmt(prs.before)} → ${fmt(prs.after)} PRs/month`,
        ];
  if (commits)
    out.push(
      `  commits on default branches: ${fmt(commits.before)} → ${fmt(commits.after)}/month`,
    );
  if (lines && lines.beforeMedian !== null && lines.afterMedian !== null) {
    out.push(
      `  median lines changed per merged PR: ${fmt(lines.beforeMedian)} → ${fmt(lines.afterMedian)}`,
    );
  }
  return out;
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
    '',
    `Agent era: ${monthLabel(stats.eraStart)} (${stats.eraSource}). Move it with --since YYYY-MM.`,
    '',
    ...yearTable(stats),
    '',
    `Card: ${outputPath}`,
    ...caveatLines(stats),
  ].join('\n');
}
