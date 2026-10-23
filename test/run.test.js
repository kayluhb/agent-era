import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GhError } from '../src/gh.js';
import { run } from '../src/run.js';
import { calebMonthly, NOW } from './fixtures/caleb-monthly.js';

const aliasesIn = (query) =>
  [...query.matchAll(/(\w+): search/g)].map((m) => m[1]);

const samplePr = {
  additions: 10,
  deletions: 5,
  createdAt: '2026-05-01T00:00:00Z',
  mergedAt: '2026-05-01T06:00:00Z',
  repository: { nameWithOwner: 'a/b', primaryLanguage: { name: 'Go' } },
};

const activeCalendar = {
  viewer: {
    c0: {
      contributionCalendar: {
        weeks: [
          {
            contributionDays: [
              { date: '2026-05-01', contributionCount: 3 },
              { date: '2026-05-02', contributionCount: 0 },
            ],
          },
        ],
      },
    },
  },
};

function fakeGh({
  monthly = calebMonthly,
  commitError = null,
  authError = null,
} = {}) {
  const yearTotal = (year) =>
    Object.entries(monthly)
      .filter(([m]) => m.startsWith(year))
      .reduce((sum, [, n]) => sum + n, 0);
  return {
    login: async () => {
      if (authError) throw authError;
      return 'kayluhb';
    },
    createdAt: async () => '2022-06-01T00:00:00Z',
    graphql: async (query) => {
      if (query.includes('nodes {')) return { search: { nodes: [samplePr] } };
      if (query.includes('contributionsCollection')) return activeCalendar;
      return Object.fromEntries(
        aliasesIn(query).map((alias) => {
          const count = alias.startsWith('y')
            ? yearTotal(alias.slice(1))
            : (monthly[alias.slice(1).replace('_', '-')] ?? 0);
          return [alias, { issueCount: count }];
        }),
      );
    },
    rest: async (path, params) => {
      if (path === 'user/orgs') return [];
      if (path === 'search/commits') {
        if (commitError) throw commitError;
        if (params.q.includes('Co-Authored-By')) return { total_count: 30 };
        if (params.q.includes('cursoragent')) return { total_count: 3 };
        return { total_count: 50 };
      }
      throw new Error(`unexpected ${path}`);
    },
  };
}

function harness(overrides = {}) {
  const logs = [];
  const renders = [];
  const options = {
    argv: [],
    gh: fakeGh(),
    now: NOW,
    sleep: async () => {},
    render: async (svg, pngPath) => {
      renders.push({ svg, pngPath });
      return { path: pngPath, format: 'png' };
    },
    log: (msg) => logs.push(msg),
    progress: () => {},
    terminalPalette: async () => null,
    random: () => 0,
    ...overrides,
  };
  return { options, logs, renders };
}

test('happy path renders the card from detected era', async () => {
  const { options, renders, logs } = harness();
  const result = await run(options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stats.prs.multiplier, 6.8);
  assert.equal(result.stats.eraSource, 'detected');
  assert.equal(result.outputPath, 'agent-era-kayluhb.png');
  assert.equal(result.stats.lines.beforeMedian, 15);
  assert.equal(result.stats.commits.after, 50);
  // Of 50 commits a month over the 6 era months: 30 a month by Claude, 3 by Cursor.
  assert.deepEqual(result.stats.commits.coauthored, {
    Claude: 0.6,
    Cursor: 0.06,
  });
  assert.equal(result.stats.commits.coauthoredMonthly.Claude['2026-04'], 30);
  assert.equal(result.stats.commits.monthly['2024-04'], 50);
  assert.equal(typeof result.stats.afterHours.after, 'number');
  assert.deepEqual(result.stats.mergeHours, { before: 6, after: 6 });
  assert.deepEqual(result.stats.mergeRate, { before: 1, after: 1 });
  // One active day, first seen in May, so averaged over May–Sep.
  assert.equal(result.stats.activeDays.after, 1 / 5);
  assert.equal(renders.length, 1);
  assert.ok(logs.join('\n').includes('6.8×'));
});

test('--since overrides the detected era', async () => {
  const { options } = harness({ argv: ['--since', '2025-06'] });
  const { stats } = await run(options);
  assert.equal(stats.eraSource, 'flag');
  assert.equal(stats.eraStart, '2025-06');
});

test('--out sets the output path', async () => {
  const { options } = harness({ argv: ['--out', '/tmp/me.png'] });
  assert.equal((await run(options)).outputPath, '/tmp/me.png');
});

for (const since of ['2026-10', '26-04', '2026-13']) {
  test(`rejects --since ${since}`, async () => {
    const { options, renders } = harness({ argv: ['--since', since] });
    assert.equal((await run(options)).exitCode, 2);
    assert.equal(renders.length, 0);
  });
}

test('zero PRs exits cleanly without a card', async () => {
  const { options, logs } = harness({ gh: fakeGh({ monthly: {} }) });
  const result = await run(options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.outputPath, null);
  assert.ok(logs.join('\n').includes('No pull requests found for @kayluhb.'));
});

test('logged-out gh exits 1 and renders nothing', async () => {
  const { options, renders, logs } = harness({
    gh: fakeGh({ authError: new GhError('not_authenticated', 'nope') }),
  });
  assert.equal((await run(options)).exitCode, 1);
  assert.equal(renders.length, 0);
  assert.ok(logs.join('\n').includes('gh auth login'));
});

test('missing gh explains where to get it', async () => {
  const { options, logs } = harness({
    gh: fakeGh({ authError: new GhError('not_installed', 'nope') }),
  });
  assert.equal((await run(options)).exitCode, 1);
  assert.ok(logs.join('\n').includes('https://cli.github.com'));
});

test('a rate-limited commit fetch still produces the PR card', async () => {
  const { options, renders } = harness({
    gh: fakeGh({
      commitError: new GhError(
        'rate_limited',
        'GitHub rate limit did not clear.',
      ),
    }),
  });
  const result = await run(options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stats.commits, null);
  assert.ok(result.stats.caveats.some((c) => c.includes('commits')));
  assert.equal(renders.length, 1);
});

test('a failed merge and review count leaves the rest of the card', async () => {
  const gh = fakeGh();
  const { graphql } = gh;
  gh.graphql = async (query) => {
    if (query.includes('reviewed-by')) throw new Error('boom');
    return graphql(query);
  };
  const { options, renders } = harness({ gh });
  const { exitCode, stats } = await run(options);
  assert.equal(exitCode, 0);
  assert.equal(stats.mergeRate, null);
  assert.equal(stats.reviews, null);
  assert.ok(stats.caveats.some((c) => c.includes('merge and review counts')));
  assert.equal(renders.length, 1);
});

test('--no-commits and --no-lines skip those sections', async () => {
  const { options } = harness({ argv: ['--no-commits', '--no-lines'] });
  const { stats } = await run(options);
  assert.equal(stats.commits, null);
  assert.equal(stats.lines, null);
});

test('without Chrome the SVG is written and the caveat says how to fix it', async () => {
  const { options } = harness({
    render: async (_svg, pngPath) => ({
      path: pngPath.replace(/\.png$/, '.svg'),
      format: 'svg',
    }),
  });
  const result = await run(options);
  assert.ok(result.outputPath.endsWith('.svg'));
  assert.ok(result.stats.caveats.some((c) => c.includes('CHROME_PATH')));
});

test('fetches commit months only for the chart and the before/after windows', async () => {
  const gh = fakeGh();
  const queries = [];
  const rest = gh.rest;
  gh.rest = async (path, params) => {
    if (path === 'search/commits') queries.push(params.q);
    return rest(path, params);
  };
  const { options } = harness({ gh });
  await run(options);
  // years 2022–2026 (5) + chart months 2024-04 … 2026-09 (30) + 6 era months per agent (12)
  assert.equal(queries.length, 47);
  assert.ok(!queries.some((q) => q.includes('2024-03-01..')));
});

test('samples lines while commit counts are still running', async () => {
  const gh = fakeGh();
  const events = [];
  const { rest, graphql } = gh;
  gh.rest = async (path, params) => {
    if (path === 'search/commits') {
      await new Promise((resolve) => setImmediate(resolve));
      events.push('commit');
    }
    return rest(path, params);
  };
  gh.graphql = async (query) => {
    if (query.includes('nodes {')) events.push('lines');
    return graphql(query);
  };
  const { options } = harness({ gh });
  await run(options);
  assert.ok(events.indexOf('lines') < events.lastIndexOf('commit'));
});

test('the SVG fallback caveat carries the renderer reason', async () => {
  const { options } = harness({
    render: async () => ({
      path: 'x.svg',
      format: 'svg',
      reason: 'Chrome failed (boom)',
    }),
  });
  const { stats } = await run(options);
  assert.ok(
    stats.caveats.some(
      (c) => c.includes('Chrome failed (boom)') && c.includes('CHROME_PATH'),
    ),
  );
});

const itermPalette = {
  source: 'iTerm2',
  palette: {
    background: '#000000',
    foreground: '#eeeeee',
    ansi: { 2: '#8ad15c', 4: '#7abdeb' },
  },
};

test('paints the card in the terminal colors with a random accent', async () => {
  const { options, renders, logs } = harness({
    terminalPalette: async () => itermPalette,
    random: () => 0.6,
  });
  const result = await run(options);
  assert.equal(result.exitCode, 0);
  assert.ok(renders[0].svg.includes('fill="#000000"'));
  assert.ok(renders[0].svg.includes('fill="#7abdeb"'));
  assert.ok(logs.join('\n').includes('Colors: iTerm2 (accent: blue)'));
});

test('falls back to the default colors when the terminal is unknown', async () => {
  const { options, renders, logs } = harness();
  await run(options);
  assert.ok(renders[0].svg.includes('fill="#16171a"'));
  assert.ok(logs.join('\n').includes('Colors: default'));
});

test('falls back to the default colors when the palette is unreadable', async () => {
  const { options, renders, logs } = harness({
    terminalPalette: async () => ({
      source: 'iTerm2',
      palette: { background: '#000000', foreground: '#111111', ansi: {} },
    }),
  });
  await run(options);
  assert.ok(renders[0].svg.includes('fill="#16171a"'));
  assert.ok(logs.join('\n').includes('Colors: default'));
});

test('--theme default skips reading the terminal', async () => {
  const { options, renders, logs } = harness({
    argv: ['--theme', 'default'],
    terminalPalette: async () => assert.fail('should not read the terminal'),
  });
  const result = await run(options);
  assert.equal(result.exitCode, 0);
  assert.ok(renders[0].svg.includes('fill="#16171a"'));
  assert.ok(logs.join('\n').includes('Colors: default'));
});

test('rejects an unknown --theme', async () => {
  const { options, renders, logs } = harness({ argv: ['--theme', 'neon'] });
  const result = await run(options);
  assert.equal(result.exitCode, 2);
  assert.equal(renders.length, 0);
  assert.ok(logs.join('\n').includes('--theme'));
});

test('--chart-from starts the chart at that month', async () => {
  const { options, renders } = harness({ argv: ['--chart-from', '2016-01'] });
  const { exitCode, stats } = await run(options);
  assert.equal(exitCode, 0);
  assert.equal(stats.chartFrom, '2016-01');
  // Jan 2016 through Sep 2026.
  assert.equal(renders[0].svg.match(/<rect data-bar/g).length, 129);
});

for (const from of ['2026-10', '2016', '2016-13']) {
  test(`rejects --chart-from ${from}`, async () => {
    const { options, renders } = harness({ argv: ['--chart-from', from] });
    assert.equal((await run(options)).exitCode, 2);
    assert.equal(renders.length, 0);
  });
}
