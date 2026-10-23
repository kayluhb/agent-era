import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findChrome, renderPng } from '../src/render.js';

const MAC_CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('findChrome prefers CHROME_PATH when it exists', () => {
  const chrome = findChrome({
    env: { CHROME_PATH: '/opt/chrome' },
    platform: 'darwin',
    exists: (p) => p === '/opt/chrome' || p === MAC_CHROME,
  });
  assert.equal(chrome, '/opt/chrome');
});

test('findChrome finds the macOS app', () => {
  assert.equal(
    findChrome({
      env: {},
      platform: 'darwin',
      exists: (p) => p === MAC_CHROME,
    }),
    MAC_CHROME,
  );
});

test('findChrome searches PATH on linux', () => {
  const chrome = findChrome({
    env: { PATH: '/usr/local/bin:/usr/bin' },
    platform: 'linux',
    exists: (p) => p === '/usr/bin/chromium',
  });
  assert.equal(chrome, '/usr/bin/chromium');
});

test('findChrome returns null when nothing exists', () => {
  assert.equal(
    findChrome({
      env: { PATH: '/usr/bin' },
      platform: 'linux',
      exists: () => false,
    }),
    null,
  );
});

test('renderPng screenshots a 1200x630 page with headless Chrome', async () => {
  const calls = [];
  await renderPng('<svg/>', '/tmp/out.png', {
    chrome: '/opt/chrome',
    exec: async (cmd, args) => calls.push({ cmd, args }),
  });
  assert.equal(calls[0].cmd, '/opt/chrome');
  assert.ok(calls[0].args.includes('--headless=new'));
  assert.ok(calls[0].args.includes('--window-size=1200,630'));
  assert.ok(calls[0].args.includes('--screenshot=/tmp/out.png'));
  assert.ok(calls[0].args.at(-1).startsWith('file://'));
});
