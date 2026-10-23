import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTerminalPalette } from '../src/terminal.js';

const HOME = '/home/u';

// Fake filesystem: unknown paths throw like a missing file.
const files = (map) => async (path) => {
  if (path in map) return map[path];
  throw Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' });
};

const component = (byte) => byte / 255;
const itermColor = ([r, g, b]) => ({
  'Red Component': component(r),
  'Green Component': component(g),
  'Blue Component': component(b),
  'Color Space': 'sRGB',
});

test('reads the default iTerm2 profile', async () => {
  const profiles = [
    { Guid: 'other', 'Background Color': itermColor([255, 255, 255]) },
    {
      Guid: 'main',
      'Background Color': itermColor([0, 0, 0]),
      'Foreground Color': itermColor([238, 238, 238]),
      'Ansi 2 Color': itermColor([138, 209, 92]),
      'Ansi 12 Color': itermColor([140, 199, 225]),
    },
  ];
  const exec = async (cmd, args) => {
    assert.equal(cmd, 'plutil');
    const plist = args.at(-1);
    assert.equal(
      plist,
      `${HOME}/Library/Preferences/com.googlecode.iterm2.plist`,
    );
    if (args.includes('Default Bookmark Guid')) return { stdout: 'main\n' };
    return { stdout: JSON.stringify(profiles) };
  };
  const result = await readTerminalPalette({
    env: { TERM_PROGRAM: 'iTerm.app' },
    home: HOME,
    exec,
    readFile: files({}),
  });
  assert.deepEqual(result, {
    source: 'iTerm2',
    palette: {
      background: '#000000',
      foreground: '#eeeeee',
      ansi: { 2: '#8ad15c', 12: '#8cc7e1' },
    },
  });
});

test('uses the dark-mode colors of an iTerm2 profile with light and dark colors', async () => {
  const profiles = [
    {
      Guid: 'main',
      'Background Color (Dark)': itermColor([16, 16, 16]),
      'Background Color (Light)': itermColor([250, 250, 250]),
      'Foreground Color (Dark)': itermColor([220, 220, 220]),
    },
  ];
  const exec = async (_cmd, args) =>
    args.includes('Default Bookmark Guid')
      ? { stdout: 'main' }
      : { stdout: JSON.stringify(profiles) };
  const { palette } = await readTerminalPalette({
    env: { TERM_PROGRAM: 'iTerm.app' },
    home: HOME,
    exec,
    readFile: files({}),
  });
  assert.equal(palette.background, '#101010');
  assert.equal(palette.foreground, '#dcdcdc');
});

test('reads Ghostty colors from its named theme, with config overrides', async () => {
  const result = await readTerminalPalette({
    env: {
      TERM_PROGRAM: 'ghostty',
      GHOSTTY_RESOURCES_DIR: '/app/ghostty',
    },
    home: HOME,
    exec: async () => assert.fail('no commands for Ghostty'),
    readFile: files({
      [`${HOME}/.config/ghostty/config`]:
        '# mine\ntheme = light:Day,dark:Night Owl\nforeground = #fafafa\n',
      '/app/ghostty/themes/Night Owl':
        'palette = 2=#22da6e\npalette = 11 = #ffeb95\nbackground = #011627\nforeground = #d6deeb\n',
    }),
  });
  assert.deepEqual(result, {
    source: 'Ghostty',
    palette: {
      background: '#011627',
      foreground: '#fafafa',
      ansi: { 2: '#22da6e', 11: '#ffeb95' },
    },
  });
});

test('finds Ghostty themes the user installed', async () => {
  const { palette } = await readTerminalPalette({
    env: { TERM_PROGRAM: 'ghostty' },
    home: HOME,
    readFile: files({
      [`${HOME}/.config/ghostty/config`]: 'theme = mine',
      [`${HOME}/.config/ghostty/themes/mine`]:
        'background = 101010\nforeground = #eeeeee',
    }),
  });
  assert.equal(palette.background, '#101010');
});

test('reads kitty colors, following include lines', async () => {
  const result = await readTerminalPalette({
    env: { TERM: 'xterm-kitty', XDG_CONFIG_HOME: '/xdg' },
    home: HOME,
    readFile: files({
      '/xdg/kitty/kitty.conf':
        'font_size 13\ninclude current-theme.conf\ncolor4   #89b4fa\n',
      '/xdg/kitty/current-theme.conf':
        'background #1e1e2e\nforeground #cdd6f4\ncolor4 #000000\ncolor10 #a6e3a1\n',
    }),
  });
  assert.deepEqual(result, {
    source: 'kitty',
    palette: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      ansi: { 4: '#89b4fa', 10: '#a6e3a1' },
    },
  });
});

test('reads Alacritty colors, including imported theme files', async () => {
  const result = await readTerminalPalette({
    env: { TERM: 'alacritty' },
    home: HOME,
    readFile: files({
      [`${HOME}/.config/alacritty/alacritty.toml`]: [
        '[general]',
        'import = [',
        '  "~/.config/alacritty/themes/tokyo.toml",',
        ']',
        '',
        '[colors.normal]',
        "yellow = '0xe0af68'",
      ].join('\n'),
      [`${HOME}/.config/alacritty/themes/tokyo.toml`]: [
        '[colors.primary]',
        'background = "#1a1b26"',
        'foreground = "#c0caf5"',
        '[colors.normal]',
        'green = "#9ece6a"',
        'yellow = "#000000"',
        '[colors.bright]',
        'blue = "#7aa2f7"',
      ].join('\n'),
    }),
  });
  assert.deepEqual(result, {
    source: 'Alacritty',
    palette: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      ansi: { 2: '#9ece6a', 3: '#e0af68', 12: '#7aa2f7' },
    },
  });
});

test('returns null for terminals it does not know', async () => {
  const result = await readTerminalPalette({
    env: { TERM_PROGRAM: 'Apple_Terminal' },
    home: HOME,
    readFile: files({}),
  });
  assert.equal(result, null);
});

test('returns null when the settings file is missing', async () => {
  const result = await readTerminalPalette({
    env: { TERM: 'xterm-kitty' },
    home: HOME,
    readFile: files({}),
  });
  assert.equal(result, null);
});

test('returns null when reading the iTerm2 settings fails', async () => {
  const result = await readTerminalPalette({
    env: { TERM_PROGRAM: 'iTerm.app' },
    home: HOME,
    exec: async () => {
      throw new Error('plutil: not found');
    },
    readFile: files({}),
  });
  assert.equal(result, null);
});
