import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const APP_PATHS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [],
};
const PATH_BINARIES = ['google-chrome', 'chromium', 'chromium-browser'];

export function findChrome({
  env = process.env,
  platform = process.platform,
  exists = existsSync,
} = {}) {
  const candidates = [env.CHROME_PATH, ...(APP_PATHS[platform] ?? [])];
  if (platform === 'win32' && env.PROGRAMFILES) {
    candidates.push(
      join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  }
  if (platform === 'linux') {
    const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean);
    candidates.push(
      ...dirs.flatMap((dir) => PATH_BINARIES.map((bin) => join(dir, bin))),
    );
  }
  return candidates.find((path) => path && exists(path)) ?? null;
}

const CHROME_TIMEOUT_MS = 30_000;
const defaultExec = (cmd, args, options) =>
  promisify(execFile)(cmd, args, options);

export async function renderPng(svg, outPath, { chrome, exec = defaultExec }) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-era-'));
  const page = join(dir, 'card.html');
  try {
    await writeFile(
      page,
      `<!doctype html><html><body style="margin:0">${svg}</body></html>`,
    );
    await exec(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1200,630',
        `--screenshot=${resolve(outPath)}`,
        pathToFileURL(page).href,
      ],
      { timeout: CHROME_TIMEOUT_MS },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Rendering is the last step, so a Chrome problem falls back to SVG rather than losing the run.
export function createRenderer({
  findChrome: find = findChrome,
  renderPng: toPng = renderPng,
  writeFile: write = writeFile,
} = {}) {
  return async (svg, pngPath) => {
    const svgPath = `${pngPath.replace(/\.[^./\\]+$/, '')}.svg`;
    const chrome = find();
    if (!chrome) {
      await write(svgPath, svg);
      return { path: svgPath, format: 'svg', reason: 'Chrome not found' };
    }
    try {
      await toPng(svg, pngPath, { chrome });
      return { path: pngPath, format: 'png' };
    } catch (error) {
      await write(svgPath, svg);
      return {
        path: svgPath,
        format: 'svg',
        reason: `Chrome failed (${error.message})`,
      };
    }
  };
}
