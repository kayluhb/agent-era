import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGh } from '../src/gh.js';

const ok = (body) => ({ stdout: JSON.stringify(body), stderr: '', code: 0 });
const fail = (stderr) => ({ stdout: '', stderr, code: 1 });

function fakeExec(responses) {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { exec, calls };
}

const noSleep = () => {
  const sleeps = [];
  return { sleep: async (ms) => sleeps.push(ms), sleeps };
};

test('graphql returns parsed data', async () => {
  const { exec, calls } = fakeExec([ok({ data: { a: { issueCount: 3 } } })]);
  const gh = createGh({ exec, sleep: noSleep().sleep });
  const data = await gh.graphql('query { a }');
  assert.deepEqual(data, { a: { issueCount: 3 } });
  assert.ok(calls[0].includes('api'));
  assert.ok(calls[0].includes('graphql'));
  assert.ok(calls[0].includes('query=query { a }'));
});

test('rest passes GET params as fields', async () => {
  const { exec, calls } = fakeExec([ok({ total_count: 61 })]);
  const gh = createGh({ exec, sleep: noSleep().sleep });
  const body = await gh.rest('search/commits', { q: 'author:x' });
  assert.equal(body.total_count, 61);
  assert.deepEqual(calls[0], [
    'api',
    '-X',
    'GET',
    'search/commits',
    '-f',
    'q=author:x',
  ]);
});

test('retries secondary rate limit then succeeds', async () => {
  const { exec, calls } = fakeExec([
    fail('You have exceeded a secondary rate limit'),
    ok({ data: { ok: true } }),
  ]);
  const { sleep, sleeps } = noSleep();
  const gh = createGh({ exec, sleep });
  assert.deepEqual(await gh.graphql('q'), { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(sleeps.length, 1);
});

test('gives up after maxRetries', async () => {
  const responses = Array.from({ length: 10 }, () => fail('HTTP 429'));
  const { exec, calls } = fakeExec(responses);
  const gh = createGh({ exec, sleep: noSleep().sleep, maxRetries: 3 });
  await assert.rejects(gh.graphql('q'), { code: 'rate_limited' });
  assert.equal(calls.length, 4);
});

test('not installed', async () => {
  const err = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
  const { exec } = fakeExec([err]);
  const gh = createGh({ exec, sleep: noSleep().sleep });
  await assert.rejects(gh.login(), { code: 'not_installed' });
});

test('not authenticated', async () => {
  const { exec } = fakeExec([
    fail('To get started with GitHub CLI, please run:  gh auth login'),
  ]);
  const gh = createGh({ exec, sleep: noSleep().sleep });
  await assert.rejects(gh.login(), { code: 'not_authenticated' });
});

test('other failures keep stderr for callers', async () => {
  const { exec } = fakeExec([
    fail('Resource protected by organization SAML enforcement'),
  ]);
  const gh = createGh({ exec, sleep: noSleep().sleep });
  await assert.rejects(gh.rest('orgs/acme/repos'), (err) => {
    assert.equal(err.code, 'failed');
    assert.match(err.stderr, /SAML/);
    return true;
  });
});

test('login is cached', async () => {
  const { exec, calls } = fakeExec([
    ok({ login: 'kayluhb', created_at: '2008-10-17T20:37:26Z' }),
  ]);
  const gh = createGh({ exec, sleep: noSleep().sleep });
  assert.equal(await gh.login(), 'kayluhb');
  assert.equal(await gh.login(), 'kayluhb');
  assert.equal(await gh.createdAt(), '2008-10-17T20:37:26Z');
  assert.equal(calls.length, 1);
});
