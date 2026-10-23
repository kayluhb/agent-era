import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRenderer, findChrome, renderPng } from '../src/render.js';

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

test('renderPng gives headless Chrome a timeout', async () => {
  const calls = [];
  await renderPng('<svg/>', '/tmp/out.png', {
    chrome: '/opt/chrome',
    exec: async (_cmd, _args, opts) => calls.push(opts),
  });
  assert.equal(calls[0].timeout, 30_000);
});

test('renderCard falls back to SVG when Chrome fails, and says why', async () => {
  const written = [];
  const render = createRenderer({
    findChrome: () => '/opt/chrome',
    renderPng: async () => {
      throw new Error('Chrome crashed');
    },
    writeFile: async (path, data) => written.push({ path, data }),
  });
  const out = await render('<svg/>', 'card.png');
  assert.deepEqual(out, {
    path: 'card.svg',
    format: 'svg',
    reason: 'Chrome failed (Chrome crashed)',
  });
  assert.equal(written[0].data, '<svg/>');
});

test('renderCard writes SVG without doubling the extension when Chrome is missing', async () => {
  const render = createRenderer({
    findChrome: () => null,
    renderPng: async () => {},
    writeFile: async () => {},
  });
  assert.deepEqual(await render('<svg/>', 'out/card.svg'), {
    path: 'out/card.svg',
    format: 'svg',
    reason: 'Chrome not found',
  });
});

test('renderCard returns the PNG when Chrome works', async () => {
  const render = createRenderer({
    findChrome: () => '/opt/chrome',
    renderPng: async () => {},
    writeFile: async () => {},
  });
  assert.deepEqual(await render('<svg/>', 'card.png'), {
    path: 'card.png',
    format: 'png',
  });
});
