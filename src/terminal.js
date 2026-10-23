import { execFile } from 'node:child_process';
import { readFile as fsReadFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

// Reads the user's terminal colors from its settings files. No terminal needs
// to be attached, so this works the same under Claude Code and in a shell.

const ANSI_ORDER = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
];

const defaultExec = (cmd, args) => promisify(execFile)(cmd, args);
const defaultReadFile = (path) => fsReadFile(path, 'utf8');

// Accepts "#rrggbb", "rrggbb" or "0xrrggbb", with optional quotes.
function hex(value) {
  const match = /^['"]?(?:#|0x)?([0-9a-f]{6})['"]?$/i.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

const emptyPalette = () => ({ background: null, foreground: null, ansi: {} });

// Later values win, like the terminals themselves.
function setColor(palette, key, value) {
  const color = hex(value);
  if (!color) return;
  if (key === 'background' || key === 'foreground') palette[key] = color;
  else palette.ansi[key] = color;
}

async function iterm({ home, exec }) {
  const plist = join(home, 'Library/Preferences/com.googlecode.iterm2.plist');
  const [{ stdout: guid }, { stdout: json }] = await Promise.all([
    exec('plutil', [
      '-extract',
      'Default Bookmark Guid',
      'raw',
      '-o',
      '-',
      plist,
    ]),
    exec('plutil', ['-extract', 'New Bookmarks', 'json', '-o', '-', plist]),
  ]);
  const profiles = JSON.parse(json);
  const profile =
    profiles.find((p) => p.Guid === guid.trim()) ?? profiles[0] ?? {};
  // Profiles with separate light and dark colors only have suffixed keys.
  const color = (key) => {
    const c = profile[key] ?? profile[`${key} (Dark)`];
    if (!c) return null;
    return `#${['Red', 'Green', 'Blue']
      .map((k) =>
        Math.round(c[`${k} Component`] * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  };
  const palette = emptyPalette();
  setColor(palette, 'background', color('Background Color') ?? '');
  setColor(palette, 'foreground', color('Foreground Color') ?? '');
  for (let n = 0; n < 16; n++) {
    const c = color(`Ansi ${n} Color`);
    if (c) palette.ansi[n] = c;
  }
  return palette;
}

function applyGhostty(palette, text) {
  let theme = null;
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    if (line.trim().startsWith('#') || eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'theme') theme = value;
    else if (key === 'background' || key === 'foreground')
      setColor(palette, key, value);
    else if (key === 'palette') {
      const [n, color] = value.split('=');
      setColor(palette, Number(n), color ?? '');
    }
  }
  return theme;
}

async function ghostty({ env, home, readFile, configDir }) {
  const configs = [
    join(configDir, 'ghostty/config'),
    join(home, 'Library/Application Support/com.mitchellh.ghostty/config'),
  ];
  const texts = (
    await Promise.all(configs.map((path) => readFile(path).catch(() => null)))
  ).filter((text) => text !== null);
  if (texts.length === 0) return null;

  // The config's own colors override its theme, so read the theme first.
  let theme = null;
  for (const text of texts) theme = applyGhostty(emptyPalette(), text) ?? theme;
  const palette = emptyPalette();
  if (theme) {
    // "light:Day,dark:Night" — the card is dark, so use the dark one.
    const name =
      /(?:^|,)\s*dark:([^,]+)/.exec(theme)?.[1].trim() ??
      theme.split(',')[0].trim();
    const candidates = isAbsolute(name)
      ? [name]
      : [
          join(configDir, 'ghostty/themes', name),
          env.GHOSTTY_RESOURCES_DIR &&
            join(env.GHOSTTY_RESOURCES_DIR, 'themes', name),
        ].filter(Boolean);
    for (const path of candidates) {
      const text = await readFile(path).catch(() => null);
      if (text !== null) {
        applyGhostty(palette, text);
        break;
      }
    }
  }
  for (const text of texts) applyGhostty(palette, text);
  return palette;
}

async function applyKitty(palette, path, readFile) {
  for (const line of (await readFile(path)).split('\n')) {
    const [key, value] = line.trim().split(/\s+/, 2);
    if (key === 'include' && value) {
      const included = isAbsolute(value) ? value : join(dirname(path), value);
      await applyKitty(palette, included, readFile).catch(() => {});
    } else if (key === 'background' || key === 'foreground') {
      setColor(palette, key, value ?? '');
    } else if (/^color\d+$/.test(key ?? '')) {
      setColor(palette, Number(key.slice(5)), value ?? '');
    }
  }
}

async function kitty({ env, readFile, configDir }) {
  const palette = emptyPalette();
  const dir = env.KITTY_CONFIG_DIRECTORY ?? join(configDir, 'kitty');
  await applyKitty(palette, join(dir, 'kitty.conf'), readFile);
  return palette;
}

async function applyAlacritty(palette, path, { home, readFile }) {
  const text = await readFile(path);
  // Imported files load first; the importing file's own colors win.
  const imports = /^\s*import\s*=\s*\[([^\]]*)\]/m.exec(text)?.[1] ?? '';
  for (const [, quoted] of imports.matchAll(/["']([^"']+)["']/g)) {
    const file = quoted.replace(/^~(?=\/)/, home);
    await applyAlacritty(palette, file, { home, readFile }).catch(() => {});
  }
  let section = '';
  for (const line of text.split('\n')) {
    const header = /^\s*\[([^\]]+)\]/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    const pair = /^\s*(\w+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    const n = ANSI_ORDER.indexOf(key);
    if (section === 'colors.primary') setColor(palette, key, value);
    else if (section === 'colors.normal' && n >= 0) setColor(palette, n, value);
    else if (section === 'colors.bright' && n >= 0)
      setColor(palette, n + 8, value);
  }
}

async function alacritty({ home, readFile, configDir }) {
  const palette = emptyPalette();
  await applyAlacritty(palette, join(configDir, 'alacritty/alacritty.toml'), {
    home,
    readFile,
  });
  return palette;
}

function detect(env) {
  if (env.TERM_PROGRAM === 'iTerm.app') return ['iTerm2', iterm];
  if (env.TERM_PROGRAM === 'ghostty') return ['Ghostty', ghostty];
  if (env.TERM === 'xterm-kitty' || env.KITTY_WINDOW_ID)
    return ['kitty', kitty];
  if (env.TERM === 'alacritty' || env.ALACRITTY_WINDOW_ID)
    return ['Alacritty', alacritty];
  return null;
}

// Returns { source, palette }, or null when the terminal is unknown or its
// settings can't be read.
export async function readTerminalPalette({
  env = process.env,
  home = homedir(),
  exec = defaultExec,
  readFile = defaultReadFile,
} = {}) {
  const found = detect(env);
  if (!found) return null;
  const [source, read] = found;
  const configDir = env.XDG_CONFIG_HOME ?? join(home, '.config');
  try {
    const palette = await read({ env, home, exec, readFile, configDir });
    return palette ? { source, palette } : null;
  } catch {
    return null;
  }
}
