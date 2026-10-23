import { currentMonth, monthEnd, monthRange } from './months.js';

const MONTHS_PER_QUERY = 24;
const WINDOW_MONTHS_PER_QUERY = 12;
const CALENDAR_MONTHS_PER_CALL = 12;
const PAGE_SIZE = 100;
const ORG_BLOCKED = /SAML|SSO|HTTP 403/;
const HOUR_MS = 3_600_000;
export const COMMIT_SEARCH_PACE_MS = 2100;
const MIN_TRAILER_COMMITS = 3;
// Trailers agents add to commits they help write. Search matches the quoted text anywhere in the message.
export const AGENT_TRAILERS = {
  Claude: 'Co-Authored-By: Claude',
  Cursor: 'cursoragent@cursor.com',
};

const countQuery = (searches) =>
  `query { ${searches
    .map(
      ({ alias, q }) =>
        `${alias}: search(type: ISSUE, query: "${q}") { issueCount }`,
    )
    .join(' ')} }`;

const prCountQuery = (login, aliases) =>
  countQuery(
    aliases.map(({ alias, from, to }) => ({
      alias,
      q: `author:${login} is:pr created:${from}..${to}`,
    })),
  );

const counts = (data) =>
  Object.fromEntries(
    Object.entries(data).map(([alias, { issueCount }]) => [alias, issueCount]),
  );

export async function fetchPrMonthly(
  gh,
  login,
  createdAt,
  now,
  onProgress = () => {},
) {
  const thisMonth = currentMonth(now);
  const firstYear = Number(createdAt.slice(0, 4));
  const lastYear = Number(thisMonth.slice(0, 4));

  const years = [];
  for (let year = firstYear; year <= lastYear; year++) years.push(year);
  const yearCounts = counts(
    await gh.graphql(
      prCountQuery(
        login,
        years.map((year) => ({
          alias: `y${year}`,
          from: `${year}-01-01`,
          to: `${year}-12-31`,
        })),
      ),
    ),
  );
  const yearly = Object.fromEntries(
    years.map((year) => [year, yearCounts[`y${year}`]]),
  );

  const months = years
    .filter((year) => yearly[year] > 0)
    .flatMap((year) =>
      monthRange(`${year}-01`, year === lastYear ? thisMonth : `${year}-12`),
    );

  const monthly = {};
  const batches = Math.ceil(months.length / MONTHS_PER_QUERY);
  for (let i = 0; i < months.length; i += MONTHS_PER_QUERY) {
    onProgress(i / MONTHS_PER_QUERY + 1, batches);
    const batch = months.slice(i, i + MONTHS_PER_QUERY).map((month) => ({
      month,
      alias: `m${month.replace('-', '_')}`,
      from: `${month}-01`,
      to: monthEnd(month),
    }));
    const batchCounts = counts(await gh.graphql(prCountQuery(login, batch)));
    for (const { month, alias } of batch) monthly[month] = batchCounts[alias];
  }
  return { monthly, yearly };
}

export async function fetchCommitCounts(
  gh,
  login,
  years,
  months,
  { sleep, paceMs = COMMIT_SEARCH_PACE_MS, onProgress = () => {} },
) {
  const requests = [
    ...years.map((year) => ({
      kind: 'yearly',
      key: year,
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    })),
    ...months.map((month) => ({
      kind: 'monthly',
      key: month,
      from: `${month}-01`,
      to: monthEnd(month),
    })),
  ];
  const result = { yearly: {}, monthly: {} };
  for (const [i, { kind, key, from, to }] of requests.entries()) {
    if (i > 0) await sleep(paceMs);
    onProgress(i + 1, requests.length);
    const body = await gh.rest('search/commits', {
      q: `author:${login} committer-date:${from}..${to}`,
    });
    result[kind][key] = body.total_count;
  }
  return result;
}

// The first month with at least MIN_TRAILER_COMMITS of the user's earliest commits carrying a trailer,
// so one experiment doesn't start the era early. Null when there's no such month.
export async function fetchTrailerStart(gh, login, trailer) {
  const body = await gh.rest('search/commits', {
    q: `author:${login} "${trailer}"`,
    sort: 'committer-date',
    order: 'asc',
    per_page: String(PAGE_SIZE),
  });
  const perMonth = {};
  for (const { commit } of body.items ?? []) {
    const month = commit.committer.date.slice(0, 7);
    perMonth[month] = (perMonth[month] ?? 0) + 1;
  }
  return (
    Object.keys(perMonth)
      .sort()
      .find((month) => perMonth[month] >= MIN_TRAILER_COMMITS) ?? null
  );
}

export async function fetchCoauthoredCount(gh, login, trailer, from, to) {
  const body = await gh.rest('search/commits', {
    q: `author:${login} "${trailer}" committer-date:${from}..${to}`,
  });
  return body.total_count;
}

// Merged PRs and reviews of other people's PRs, per month, both by PR creation date.
export async function fetchWindowCounts(gh, login, months) {
  const result = { merged: {}, reviewed: {} };
  for (let i = 0; i < months.length; i += WINDOW_MONTHS_PER_QUERY) {
    const batch = months.slice(i, i + WINDOW_MONTHS_PER_QUERY);
    const searches = batch.flatMap((month) => {
      const key = month.replace('-', '_');
      const range = `${month}-01..${monthEnd(month)}`;
      return [
        {
          alias: `g${key}`,
          q: `author:${login} is:pr is:merged created:${range}`,
        },
        {
          alias: `r${key}`,
          q: `reviewed-by:${login} -author:${login} is:pr created:${range}`,
        },
      ];
    });
    const batchCounts = counts(await gh.graphql(countQuery(searches)));
    for (const month of batch) {
      const key = month.replace('-', '_');
      result.merged[month] = batchCounts[`g${key}`];
      result.reviewed[month] = batchCounts[`r${key}`];
    }
  }
  return result;
}

// Days with at least one contribution, per month. One calendar covers at most a year.
export async function fetchActiveDays(gh, months) {
  const chunks = [];
  for (let i = 0; i < months.length; i += CALENDAR_MONTHS_PER_CALL)
    chunks.push(months.slice(i, i + CALENDAR_MONTHS_PER_CALL));
  const data = await gh.graphql(
    `query { viewer { ${chunks
      .map(
        (chunk, i) =>
          `c${i}: contributionsCollection(from: "${chunk[0]}-01T00:00:00Z", to: "${monthEnd(chunk.at(-1))}T23:59:59Z") { contributionCalendar { weeks { contributionDays { date contributionCount } } } }`,
      )
      .join(' ')} } }`,
  );
  const active = Object.fromEntries(months.map((month) => [month, 0]));
  for (const { contributionCalendar } of Object.values(data.viewer)) {
    for (const { contributionDays } of contributionCalendar.weeks) {
      for (const { date, contributionCount } of contributionDays) {
        const month = date.slice(0, 7);
        if (contributionCount > 0 && month in active) active[month]++;
      }
    }
  }
  return active;
}

// Visit indices so that any prefix of the order is spread across the whole range.
function spreadOrder(length) {
  const order = [];
  const seen = new Set();
  for (let parts = 1; order.length < length; parts *= 2) {
    for (let i = 0; i < parts; i++) {
      const index = Math.floor((i * length) / parts);
      if (!seen.has(index)) {
        seen.add(index);
        order.push(index);
      }
    }
  }
  return order;
}

export async function fetchPrSample(gh, login, months, cap = 500) {
  const sample = [];
  for (const index of spreadOrder(months.length)) {
    if (sample.length >= cap) break;
    const month = months[index];
    const data = await gh.graphql(
      `query { search(type: ISSUE, first: ${PAGE_SIZE}, query: "author:${login} is:pr is:merged created:${month}-01..${monthEnd(month)}") { nodes { ... on PullRequest { additions deletions createdAt mergedAt repository { nameWithOwner primaryLanguage { name } } } } } }`,
    );
    for (const pr of data.search.nodes) {
      if (sample.length >= cap) break;
      sample.push({
        lines: pr.additions + pr.deletions,
        hoursToMerge:
          (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / HOUR_MS,
        createdAt: pr.createdAt,
        repo: pr.repository.nameWithOwner,
        language: pr.repository.primaryLanguage?.name ?? null,
      });
    }
  }
  return sample;
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function findRestrictedOrgs(gh) {
  const orgs = await gh.rest('user/orgs');
  const restricted = [];
  for (const { login } of orgs) {
    try {
      await gh.rest(`orgs/${login}/repos`, { per_page: '1' });
    } catch (error) {
      if (ORG_BLOCKED.test(error.stderr ?? '')) restricted.push(login);
    }
  }
  return restricted;
}
