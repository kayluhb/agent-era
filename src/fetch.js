import { currentMonth, monthEnd, monthRange } from './months.js';

const MONTHS_PER_QUERY = 24;
const PAGE_SIZE = 100;
const ORG_BLOCKED = /SAML|SSO|HTTP 403/;

const prCountQuery = (login, aliases) =>
  `query { ${aliases
    .map(
      ({ alias, from, to }) =>
        `${alias}: search(type: ISSUE, query: "author:${login} is:pr created:${from}..${to}") { issueCount }`,
    )
    .join(' ')} }`;

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
  { sleep, paceMs = 2100, onProgress = () => {} },
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

export async function fetchLineSample(gh, login, months, cap = 500) {
  const sample = [];
  for (const index of spreadOrder(months.length)) {
    if (sample.length >= cap) break;
    const month = months[index];
    const data = await gh.graphql(
      `query { search(type: ISSUE, first: ${PAGE_SIZE}, query: "author:${login} is:pr is:merged created:${month}-01..${monthEnd(month)}") { nodes { ... on PullRequest { additions deletions } } } }`,
    );
    for (const { additions, deletions } of data.search.nodes) {
      if (sample.length >= cap) break;
      sample.push(additions + deletions);
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
