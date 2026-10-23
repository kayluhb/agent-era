import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchActiveDays,
  fetchCoauthoredCount,
  fetchCommitCounts,
  fetchPrMonthly,
  fetchPrSample,
  fetchWindowCounts,
  findRestrictedOrgs,
  median,
} from '../src/fetch.js';
import { GhError } from '../src/gh.js';
import { monthRange } from '../src/months.js';
import { NOW } from './fixtures/caleb-monthly.js';

const aliasesIn = (query) =>
  [...query.matchAll(/(\w+): search/g)].map((m) => m[1]);

function fakePrGh(yearCounts) {
  const queries = [];
  return {
    queries,
    graphql: async (query) => {
      queries.push(query);
      return Object.fromEntries(
        aliasesIn(query).map((alias) => {
          const year = alias.startsWith('y') ? alias.slice(1) : null;
          return [alias, { issueCount: year ? (yearCounts[year] ?? 0) : 1 }];
        }),
      );
    },
  };
}

test('fetchPrMonthly asks for years once, then batches months of active years only', async () => {
  const gh = fakePrGh({ 2024: 40, 2025: 30, 2026: 12 });
  const { yearly, monthly } = await fetchPrMonthly(
    gh,
    'kayluhb',
    '2008-10-17T20:37:26Z',
    NOW,
  );

  assert.equal(yearly['2008'], 0);
  assert.equal(yearly['2025'], 30);
  assert.equal(yearly['2026'], 12);

  const monthQueries = gh.queries.slice(1);
  assert.equal(monthQueries.length, 2);
  assert.equal(aliasesIn(monthQueries[0]).length, 24);
  assert.equal(aliasesIn(monthQueries[1]).length, 10);
  assert.ok(!monthQueries.some((q) => q.includes('created:2023-01-01')));

  assert.equal(monthly['2024-01'], 1);
  assert.equal(monthly['2026-10'], 1);
  assert.equal(monthly['2026-11'], undefined);
});

test('fetchPrMonthly builds exact month ranges', async () => {
  const gh = fakePrGh({ 2026: 5 });
  await fetchPrMonthly(gh, 'kayluhb', '2025-03-01T00:00:00Z', NOW);
  assert.ok(
    gh.queries.some((q) =>
      q.includes('author:kayluhb is:pr created:2026-02-01..2026-02-28'),
    ),
  );
});

test('fetchCommitCounts paces requests and maps total_count to keys', async () => {
  const calls = [];
  const gh = {
    rest: async (path, params) => {
      calls.push({ path, params });
      return { total_count: calls.length };
    },
  };
  const sleeps = [];
  const result = await fetchCommitCounts(
    gh,
    'kayluhb',
    [2025],
    ['2026-01', '2026-02'],
    {
      sleep: async (ms) => sleeps.push(ms),
      paceMs: 5,
    },
  );
  assert.deepEqual(result, {
    yearly: { 2025: 1 },
    monthly: { '2026-01': 2, '2026-02': 3 },
  });
  assert.equal(calls[0].path, 'search/commits');
  assert.equal(
    calls[0].params.q,
    'author:kayluhb committer-date:2025-01-01..2025-12-31',
  );
  assert.equal(
    calls[2].params.q,
    'author:kayluhb committer-date:2026-02-01..2026-02-28',
  );
  assert.deepEqual(sleeps, [5, 5]);
});

const pr = (additions, deletions, language = 'Go') => ({
  additions,
  deletions,
  createdAt: '2025-01-01T00:00:00Z',
  mergedAt: '2025-01-02T12:00:00Z',
  repository: {
    nameWithOwner: 'a/b',
    primaryLanguage: language && { name: language },
  },
});

test('fetchPrSample stops at the cap and only samples merged PRs', async () => {
  const queries = [];
  const gh = {
    graphql: async (query) => {
      queries.push(query);
      return {
        search: {
          nodes: Array.from({ length: 100 }, () => pr(3, 2)),
        },
      };
    },
  };
  const months = [
    '2025-01',
    '2025-02',
    '2025-03',
    '2025-04',
    '2025-05',
    '2025-06',
  ];
  const sample = await fetchPrSample(gh, 'kayluhb', months, 250);
  assert.equal(sample.length, 250);
  assert.ok(sample.every((p) => p.lines === 5));
  assert.equal(queries.length, 3);
  assert.ok(queries.every((q) => q.includes('is:merged')));
});

test('fetchPrSample spreads its months across the window', async () => {
  const queries = [];
  const gh = {
    graphql: async (query) => {
      queries.push(query);
      return {
        search: {
          nodes: Array.from({ length: 100 }, () => pr(1, 0)),
        },
      };
    },
  };
  const months = Array.from(
    { length: 12 },
    (_, i) => `2025-${String(i + 1).padStart(2, '0')}`,
  );
  await fetchPrSample(gh, 'kayluhb', months, 200);
  assert.ok(queries[0].includes('created:2025-01-01'));
  assert.ok(queries[1].includes('created:2025-07-01'));
});

test('fetchPrSample keeps merge time, repo and language', async () => {
  const gh = {
    graphql: async () => ({ search: { nodes: [pr(1, 1, null)] } }),
  };
  const [sample] = await fetchPrSample(gh, 'kayluhb', ['2025-01']);
  assert.deepEqual(sample, {
    lines: 2,
    hoursToMerge: 36,
    createdAt: '2025-01-01T00:00:00Z',
    repo: 'a/b',
    language: null,
  });
});

test('fetchCoauthoredCount searches commits for a trailer', async () => {
  let q;
  const gh = {
    rest: async (_path, params) => {
      q = params.q;
      return { total_count: 7 };
    },
  };
  assert.equal(
    await fetchCoauthoredCount(
      gh,
      'kayluhb',
      'Co-Authored-By: Claude',
      '2026-04-01',
      '2026-09-30',
    ),
    7,
  );
  assert.equal(
    q,
    'author:kayluhb "Co-Authored-By: Claude" committer-date:2026-04-01..2026-09-30',
  );
});

test('fetchWindowCounts gets merged and reviewed counts per month', async () => {
  const queries = [];
  const gh = {
    graphql: async (query) => {
      queries.push(query);
      return Object.fromEntries(
        aliasesIn(query).map((alias) => [
          alias,
          { issueCount: alias.startsWith('g') ? 4 : 9 },
        ]),
      );
    },
  };
  const months = monthRange('2025-01', '2026-02');
  const { merged, reviewed } = await fetchWindowCounts(gh, 'kayluhb', months);
  assert.equal(queries.length, 2);
  assert.equal(aliasesIn(queries[0]).length, 24);
  assert.equal(merged['2026-02'], 4);
  assert.equal(reviewed['2025-01'], 9);
  assert.ok(
    queries[0].includes(
      'reviewed-by:kayluhb -author:kayluhb is:pr created:2025-01-01..2025-01-31',
    ),
  );
  assert.ok(
    queries[0].includes('author:kayluhb is:pr is:merged created:2025-02-01'),
  );
});

test('fetchActiveDays counts days with contributions, a year per calendar', async () => {
  let query;
  const day = (date, contributionCount) => ({ date, contributionCount });
  const gh = {
    graphql: async (q) => {
      query = q;
      return {
        viewer: {
          c0: {
            contributionCalendar: {
              weeks: [
                {
                  contributionDays: [
                    day('2025-01-30', 2),
                    day('2025-01-31', 0),
                    day('2025-02-01', 1),
                  ],
                },
              ],
            },
          },
          c1: {
            contributionCalendar: {
              weeks: [{ contributionDays: [day('2026-01-05', 4)] }],
            },
          },
        },
      };
    },
  };
  const months = monthRange('2025-01', '2026-01');
  const active = await fetchActiveDays(gh, months);
  assert.equal(active['2025-01'], 1);
  assert.equal(active['2025-02'], 1);
  assert.equal(active['2025-03'], 0);
  assert.equal(active['2026-01'], 1);
  assert.ok(
    query.includes(
      'c0: contributionsCollection(from: "2025-01-01T00:00:00Z", to: "2025-12-31T23:59:59Z")',
    ),
  );
  assert.ok(
    query.includes(
      'c1: contributionsCollection(from: "2026-01-01T00:00:00Z", to: "2026-01-31T23:59:59Z")',
    ),
  );
});

test('median', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('findRestrictedOrgs reports orgs that block the token', async () => {
  const gh = {
    rest: async (path) => {
      if (path === 'user/orgs')
        return [{ login: 'acme' }, { login: 'open' }, { login: 'flaky' }];
      if (path === 'orgs/acme/repos') {
        throw new GhError(
          'failed',
          'nope',
          'Resource protected by organization SAML enforcement',
        );
      }
      if (path === 'orgs/flaky/repos')
        throw new GhError('failed', 'nope', 'HTTP 500');
      return [];
    },
  };
  assert.deepEqual(await findRestrictedOrgs(gh), ['acme']);
});
