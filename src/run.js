import { parseArgs } from 'node:util';
import { chartMonths, renderCardSvg } from './card.js';
import { beforeAfter, detectEraStart } from './era.js';
import {
  AGENT_TRAILERS,
  COMMIT_SEARCH_PACE_MS,
  fetchActiveDays,
  fetchCoauthoredCount,
  fetchCommitCounts,
  fetchPrMonthly,
  fetchPrSample,
  fetchWindowCounts,
  findRestrictedOrgs,
  median,
} from './fetch.js';
import {
  addMonths,
  currentMonth,
  earlierMonth,
  lastFullMonth,
  laterMonth,
  monthEnd,
  monthRange,
} from './months.js';
import { formatSummary } from './summary.js';
import { DEFAULT_THEME, pickTheme } from './theme.js';

const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const LINES_AFTER_MONTHS = 12;
// Local hours counted as "6pm–6am".
const EVENING_FROM = 18;
const MORNING_UNTIL = 6;

const USAGE = `Usage: agent-era [--since YYYY-MM] [--out path.png] [--no-commits] [--no-lines] [--theme default]
                 [--chart-from YYYY-MM]

  --since YYYY-MM   Month your AI-agent era started (default: detected from your PRs)
  --out PATH        Where to write the card (default: ./agent-era-<login>.png)
  --no-commits      Skip commit counts (faster)
  --no-lines        Skip the PR sample: lines changed, time to merge, repos (faster)
  --theme default   Use the default colors instead of your terminal's
  --chart-from YYYY-MM
                    Start the bar chart at this month (default: 24 months before the era)`;

const GH_MESSAGES = {
  not_installed: 'agent-era needs the GitHub CLI: https://cli.github.com',
  not_authenticated: 'Run `gh auth login` first.',
};

function parse(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      since: { type: 'string' },
      out: { type: 'string' },
      'no-commits': { type: 'boolean' },
      'no-lines': { type: 'boolean' },
      theme: { type: 'string' },
      'chart-from': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  return values;
}

// Runs an optional section; on failure records a caveat and returns null.
async function optional(name, caveats, fn) {
  try {
    return await fn();
  } catch (error) {
    caveats.push(`Skipped ${name}: ${error.message}`);
    return null;
  }
}

const sumIn = (monthly, months) =>
  months.reduce((sum, m) => sum + (monthly[m] ?? 0), 0);
const distinct = (values) => new Set(values.filter(Boolean)).size;
const isEvening = (createdAt) => {
  const hour = new Date(createdAt).getHours();
  return hour >= EVENING_FROM || hour < MORNING_UNTIL;
};

// The 12 months before the era, and the full months since.
function windows(eraStart, now) {
  return {
    before: monthRange(addMonths(eraStart, -12), addMonths(eraStart, -1)),
    after: monthRange(eraStart, lastFullMonth(now)),
  };
}

async function commitStats(
  gh,
  login,
  createdAt,
  { eraStart, chartStart },
  now,
  { sleep, progress },
) {
  // The before/after windows and the chart; the summary table uses yearly totals.
  const lastFull = lastFullMonth(now);
  const months = monthRange(
    earlierMonth(addMonths(eraStart, -12), chartStart),
    lastFull,
  );
  const years = [];
  for (
    let year = Number(createdAt.slice(0, 4));
    year <= now.getUTCFullYear();
    year++
  )
    years.push(year);

  const counts = await fetchCommitCounts(gh, login, years, months, {
    sleep,
    onProgress: (i, n) => progress(`Counting commits… (${i}/${n})`),
  });
  const { before, after, multiplier } = beforeAfter(
    counts.monthly,
    eraStart,
    now,
  );
  const eraMonths = windows(eraStart, now).after;
  const afterTotal = sumIn(counts.monthly, eraMonths);
  const coauthored = {};
  const coauthoredMonthly = {};
  for (const [agent, trailer] of Object.entries(AGENT_TRAILERS)) {
    coauthoredMonthly[agent] = {};
    for (const [i, month] of eraMonths.entries()) {
      progress(
        `Counting ${agent} co-authored commits… (${i + 1}/${eraMonths.length})`,
      );
      await sleep(COMMIT_SEARCH_PACE_MS);
      coauthoredMonthly[agent][month] = await fetchCoauthoredCount(
        gh,
        login,
        trailer,
        `${month}-01`,
        monthEnd(month),
      );
    }
    const count = sumIn(coauthoredMonthly[agent], eraMonths);
    coauthored[agent] = afterTotal ? Math.min(1, count / afterTotal) : null;
  }
  return {
    before,
    after,
    multiplier,
    monthly: counts.monthly,
    yearly: counts.yearly,
    coauthored,
    coauthoredMonthly,
  };
}

function describeSample(sample) {
  return {
    lines: median(sample.map((pr) => pr.lines)),
    hoursToMerge: median(sample.map((pr) => pr.hoursToMerge)),
    repos: distinct(sample.map((pr) => pr.repo)),
    languages: distinct(sample.map((pr) => pr.language)),
    evening: sample.length
      ? sample.filter((pr) => isEvening(pr.createdAt)).length / sample.length
      : null,
  };
}

async function sampleStats(gh, login, eraStart, now, progress) {
  const lastFull = lastFullMonth(now);
  progress('Sampling merged PRs…');
  const before = describeSample(
    await fetchPrSample(gh, login, windows(eraStart, now).before),
  );
  const after = describeSample(
    await fetchPrSample(
      gh,
      login,
      monthRange(
        laterMonth(eraStart, addMonths(lastFull, 1 - LINES_AFTER_MONTHS)),
        lastFull,
      ),
    ),
  );
  return {
    lines: { beforeMedian: before.lines, afterMedian: after.lines },
    mergeHours: { before: before.hoursToMerge, after: after.hoursToMerge },
    repos: { before: before.repos, after: after.repos },
    languages: { before: before.languages, after: after.languages },
    afterHours: { before: before.evening, after: after.evening },
  };
}

async function windowStats(gh, login, prMonthly, eraStart, now, progress) {
  progress('Counting merges and reviews…');
  const { before, after } = windows(eraStart, now);
  const { merged, reviewed } = await fetchWindowCounts(gh, login, [
    ...before,
    ...after,
  ]);
  // Sums over the same months on both sides, so a short history can't skew it.
  const rate = (months) => {
    const opened = sumIn(prMonthly, months);
    return opened ? sumIn(merged, months) / opened : null;
  };
  const reviews = beforeAfter(reviewed, eraStart, now);
  return {
    mergeRate: { before: rate(before), after: rate(after) },
    reviews: { before: reviews.before, after: reviews.after },
  };
}

async function activeDayStats(gh, eraStart, now, progress) {
  progress('Counting active days…');
  const { before, after } = windows(eraStart, now);
  const days = await fetchActiveDays(gh, [...before, ...after]);
  const stats = beforeAfter(days, eraStart, now);
  return { before: stats.before, after: stats.after };
}

// Your terminal's colors with a random accent, or the default when they can't make a readable card.
async function cardTheme(terminalPalette, random) {
  const found = await terminalPalette();
  const theme = found && pickTheme(found.palette, random);
  return theme
    ? { theme, colors: { source: found.source, accentName: theme.accentName } }
    : { theme: DEFAULT_THEME, colors: null };
}

export async function run({
  argv,
  gh,
  now,
  sleep,
  render,
  log,
  progress,
  terminalPalette,
  random,
}) {
  let args;
  try {
    args = parse(argv);
  } catch (error) {
    log(`${error.message}\n\n${USAGE}`);
    return { exitCode: 2, outputPath: null, stats: null };
  }
  if (args.help) {
    log(USAGE);
    return { exitCode: 0, outputPath: null, stats: null };
  }
  if (
    args.since &&
    (!MONTH_FORMAT.test(args.since) || args.since > lastFullMonth(now))
  ) {
    log(
      `--since must be a full month before ${currentMonth(now)}, like 2025-06.`,
    );
    return { exitCode: 2, outputPath: null, stats: null };
  }
  if (
    args['chart-from'] &&
    (!MONTH_FORMAT.test(args['chart-from']) ||
      args['chart-from'] > lastFullMonth(now))
  ) {
    log(
      `--chart-from must be a full month before ${currentMonth(now)}, like 2016-01.`,
    );
    return { exitCode: 2, outputPath: null, stats: null };
  }
  if (args.theme !== undefined && args.theme !== 'default') {
    log(`--theme only accepts "default".\n\n${USAGE}`);
    return { exitCode: 2, outputPath: null, stats: null };
  }

  try {
    const login = await gh.login();
    const createdAt = await gh.createdAt();
    const prs = await fetchPrMonthly(gh, login, createdAt, now, (i, n) =>
      progress(`Counting PRs… (${i}/${n})`),
    );
    if (Object.values(prs.yearly).every((n) => n === 0)) {
      log(`No pull requests found for @${login}.`);
      return { exitCode: 0, outputPath: null, stats: null };
    }

    const era = args.since
      ? { month: args.since, source: 'flag' }
      : detectEraStart(prs.monthly, now);
    const prStats = beforeAfter(prs.monthly, era.month, now);
    const caveats = [];

    // Commits use REST search and the rest use GraphQL, so their rate limits don't collide.
    const graphqlLane = async () => ({
      sample: args['no-lines']
        ? null
        : await optional('PR sample', caveats, () =>
            sampleStats(gh, login, era.month, now, progress),
          ),
      window: await optional('merge and review counts', caveats, () =>
        windowStats(gh, login, prs.monthly, era.month, now, progress),
      ),
      activeDays: await optional('active days', caveats, () =>
        activeDayStats(gh, era.month, now, progress),
      ),
    });
    const [commits, { sample, window, activeDays }] = await Promise.all([
      args['no-commits']
        ? null
        : optional('commits', caveats, () =>
            commitStats(
              gh,
              login,
              createdAt,
              {
                eraStart: era.month,
                chartStart: chartMonths({
                  prs,
                  eraStart: era.month,
                  now,
                  chartFrom: args['chart-from'],
                })[0],
              },
              now,
              { sleep, progress },
            ),
          ),
      graphqlLane(),
    ]);
    const restrictedOrgs =
      (await optional('org access check', caveats, () =>
        findRestrictedOrgs(gh),
      )) ?? [];

    const { theme, colors } =
      args.theme === 'default'
        ? { theme: DEFAULT_THEME, colors: null }
        : await cardTheme(terminalPalette, random);

    const stats = {
      login,
      eraStart: era.month,
      eraSource: era.source,
      chartFrom: args['chart-from'] ?? null,
      prs: {
        before: prStats.before,
        after: prStats.after,
        multiplier: prStats.multiplier,
        monthly: prs.monthly,
        yearly: prs.yearly,
        shortHistory: prStats.shortHistory,
      },
      commits,
      lines: sample?.lines ?? null,
      mergeHours: sample?.mergeHours ?? null,
      repos: sample?.repos ?? null,
      languages: sample?.languages ?? null,
      afterHours: sample?.afterHours ?? null,
      mergeRate: window?.mergeRate ?? null,
      reviews: window?.reviews ?? null,
      activeDays,
      restrictedOrgs,
      caveats,
      colors,
      now: now.toISOString(),
    };

    const output = await render(
      renderCardSvg(stats, theme),
      args.out ?? `agent-era-${login}.png`,
    );
    if (output.format === 'svg') {
      caveats.push(
        `${output.reason ?? 'Chrome not found'} — wrote SVG; open it in a browser and screenshot, or set CHROME_PATH.`,
      );
    }
    log(formatSummary(stats, output.path));
    return { exitCode: 0, outputPath: output.path, stats };
  } catch (error) {
    log(GH_MESSAGES[error.code] ?? `agent-era failed: ${error.message}`);
    return { exitCode: 1, outputPath: null, stats: null };
  }
}
