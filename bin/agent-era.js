#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createGh } from '../src/gh.js';
import { findChrome, renderPng } from '../src/render.js';
import { run } from '../src/run.js';

async function render(svg, pngPath) {
  const chrome = findChrome();
  if (chrome) {
    await renderPng(svg, pngPath, { chrome });
    return { path: pngPath, format: 'png' };
  }
  const svgPath = `${pngPath.replace(/\.png$/i, '')}.svg`;
  await writeFile(svgPath, svg);
  return { path: svgPath, format: 'svg' };
}

const { exitCode } = await run({
  argv: process.argv.slice(2),
  gh: createGh(),
  now: new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  render,
  log: (msg) => console.log(msg),
  progress: (msg) => process.stderr.write(`${msg}\n`),
});
process.exit(exitCode);
