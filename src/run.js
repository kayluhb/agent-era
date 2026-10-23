import { parseArgs } from 'node:util';
import { renderCardSvg } from './card.js';
import { beforeAfter, detectEraStart } from './era.js';
import {
  fetchCommitCounts,
  fetchLineSample,
  fetchPrMonthly,
  findRestrictedOrgs,
  median,
} from './fetch.js';
import {
  addMonths,
  currentMonth,
  lastFullMonth,
  laterMonth,
  monthRange,
} from './months.js';
import { formatSummary } from './summary.js';
import { DEFAULT_THEME, pickTheme } from './theme.js';

const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const LINES_AFTER_MONTHS = 12;

const USAGE = `Usage: agent-era [--since YYYY-MM] [--out path.png] [--no-commits] [--no-lines] [--theme default]

  --since YYYY-MM   Month your AI-agent era started (default: detected from your PRs)
  --out PATH        Where to write the card (default: ./agent-era-<login>.png)
  --no-commits      Skip commit counts (faster)
  --no-lines        Skip lines-changed sampling (faster)
  --theme default   Use the default colors instead of your terminal's`;

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

async function commitStats(
  gh,
  login,
  createdAt,
  eraStart,
  now,
  { sleep, progress },
) {
  // Only the before/after windows feed the card; the summary table uses yearly totals.
  const months = monthRange(addMonths(eraStart, -12), lastFullMonth(now));
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
  return { before, after, multiplier, yearly: counts.yearly };
}

async function lineStats(gh, login, eraStart, now, progress) {
  const lastFull = lastFullMonth(now);
  progress('Sampling lines changed…');
  const before = await fetchLineSample(
    gh,
    login,
    monthRange(addMonths(eraStart, -12), addMonths(eraStart, -1)),
  );
  const after = await fetchLineSample(
    gh,
    login,
    monthRange(
      laterMonth(eraStart, addMonths(lastFull, 1 - LINES_AFTER_MONTHS)),
      lastFull,
    ),
  );
  return { beforeMedian: median(before), afterMedian: median(after) };
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

    // Commits use REST search and lines use GraphQL, so their rate limits don't collide.
    const [commits, lines] = await Promise.all([
      args['no-commits']
        ? null
        : optional('commits', caveats, () =>
            commitStats(gh, login, createdAt, era.month, now, {
              sleep,
              progress,
            }),
          ),
      args['no-lines']
        ? null
        : optional('lines changed', caveats, () =>
            lineStats(gh, login, era.month, now, progress),
          ),
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
      prs: {
        before: prStats.before,
        after: prStats.after,
        multiplier: prStats.multiplier,
        monthly: prs.monthly,
        yearly: prs.yearly,
        shortHistory: prStats.shortHistory,
      },
      commits,
      lines,
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
