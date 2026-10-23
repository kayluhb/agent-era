#!/usr/bin/env node
import { createGh } from '../src/gh.js';
import { createRenderer } from '../src/render.js';
import { run } from '../src/run.js';
import { readTerminalPalette } from '../src/terminal.js';

const { exitCode } = await run({
  argv: process.argv.slice(2),
  gh: createGh(),
  now: new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  render: createRenderer(),
  log: (msg) => console.log(msg),
  progress: (msg) => process.stderr.write(`${msg}\n`),
  terminalPalette: () => readTerminalPalette(),
  random: Math.random,
});
process.exit(exitCode);
