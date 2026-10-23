import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchCommitCounts,
  fetchLineSample,
  fetchPrMonthly,
  findRestrictedOrgs,
  median,
} from '../src/fetch.js';
import { GhError } from '../src/gh.js';
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

test('fetchLineSample stops at the cap and only samples merged PRs', async () => {
  const queries = [];
  const gh = {
    graphql: async (query) => {
      queries.push(query);
      return {
        search: {
          nodes: Array.from({ length: 100 }, () => ({
            additions: 3,
            deletions: 2,
          })),
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
  const sample = await fetchLineSample(gh, 'kayluhb', months, 250);
  assert.equal(sample.length, 250);
  assert.ok(sample.every((n) => n === 5));
  assert.equal(queries.length, 3);
  assert.ok(queries.every((q) => q.includes('is:merged')));
});

test('fetchLineSample spreads its months across the window', async () => {
  const queries = [];
  const gh = {
    graphql: async (query) => {
      queries.push(query);
      return {
        search: {
          nodes: Array.from({ length: 100 }, () => ({
            additions: 1,
            deletions: 0,
          })),
        },
      };
    },
  };
  const months = Array.from(
    { length: 12 },
    (_, i) => `2025-${String(i + 1).padStart(2, '0')}`,
  );
  await fetchLineSample(gh, 'kayluhb', months, 200);
  assert.ok(queries[0].includes('created:2025-01-01'));
  assert.ok(queries[1].includes('created:2025-07-01'));
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
