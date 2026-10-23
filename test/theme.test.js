import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_THEME, pickTheme } from '../src/theme.js';

// Caleb's iTerm2 default profile.
const iterm = {
  background: '#000000',
  foreground: '#eeeeee',
  ansi: {
    1: '#ec5f67',
    2: '#8ad15c',
    3: '#ecce58',
    4: '#7abdeb',
    5: '#cfabe0',
    6: '#5fb3b3',
    8: '#000000',
  },
};

test('keeps the profile background and text and picks a random accent', () => {
  assert.deepEqual(
    pickTheme(iterm, () => 0),
    {
      background: '#000000',
      foreground: '#eeeeee',
      accent: '#8ad15c',
      accentName: 'green',
    },
  );
  assert.equal(pickTheme(iterm, () => 0.99).accentName, 'cyan');
});

test('never picks red as the accent', () => {
  const onlyRed = { ...iterm, ansi: { 1: '#ec5f67', 9: '#ff7b85' } };
  assert.equal(
    pickTheme(onlyRed, () => 0),
    null,
  );
});

test('skips accents that are hard to see on the background', () => {
  const dimBlue = { ...iterm, ansi: { 4: '#1a1a40', 3: '#ecce58' } };
  assert.equal(pickTheme(dimBlue, () => 0).accentName, 'yellow');
});

test('names bright accents', () => {
  const bright = { ...iterm, ansi: { 10: '#a6e3a1' } };
  assert.equal(pickTheme(bright, () => 0).accentName, 'bright green');
});

test('gives up when the text is hard to read on the background', () => {
  const lowContrast = { ...iterm, foreground: '#333333' };
  assert.equal(
    pickTheme(lowContrast, () => 0),
    null,
  );
});

test('gives up when the palette is missing its background or text', () => {
  assert.equal(
    pickTheme({ ...iterm, background: null }, () => 0),
    null,
  );
  assert.equal(
    pickTheme({ ...iterm, foreground: undefined }, () => 0),
    null,
  );
});

test('the default theme passes its own readability checks', () => {
  const asPalette = {
    background: DEFAULT_THEME.background,
    foreground: DEFAULT_THEME.foreground,
    ansi: { 3: DEFAULT_THEME.accent },
  };
  assert.equal(pickTheme(asPalette, () => 0).accent, DEFAULT_THEME.accent);
});
