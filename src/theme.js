export const DEFAULT_THEME = {
  background: '#16171a',
  foreground: '#ededed',
  accent: '#f5a524',
  accentName: null,
};

// WCAG contrast: 4.5 for body text, 3 for large text and graphics.
const MIN_TEXT_CONTRAST = 4.5;
const MIN_ACCENT_CONTRAST = 3;

// Red is left out: a red "after" reads as bad news.
const ACCENT_NAMES = {
  2: 'green',
  3: 'yellow',
  4: 'blue',
  5: 'magenta',
  6: 'cyan',
  10: 'bright green',
  11: 'bright yellow',
  12: 'bright blue',
  13: 'bright magenta',
  14: 'bright cyan',
};

const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Blends `from` toward `to`; t=0 is `from`, t=1 is `to`.
export function mix(from, to, t) {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((c, i) =>
      Math.round(c + (b[i] - c) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// Returns null when the palette can't make a readable card.
export function pickTheme({ background, foreground, ansi = {} }, random) {
  if (!HEX.test(background ?? '') || !HEX.test(foreground ?? '')) return null;
  if (contrast(background, foreground) < MIN_TEXT_CONTRAST) return null;
  const accents = Object.keys(ACCENT_NAMES).filter(
    (n) =>
      HEX.test(ansi[n] ?? '') &&
      contrast(background, ansi[n]) >= MIN_ACCENT_CONTRAST,
  );
  if (accents.length === 0) return null;
  const n = accents[Math.floor(random() * accents.length)];
  return {
    background,
    foreground,
    accent: ansi[n],
    accentName: ACCENT_NAMES[n],
  };
}
