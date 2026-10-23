import { firstActiveMonth } from './era.js';
import { pickHighlights } from './highlights.js';
import { addMonths, lastFullMonth, laterMonth, monthRange } from './months.js';
import { DEFAULT_THEME, mix } from './theme.js';

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 60;
const BAR_AREA = 160;
const BAR_GAP = 3;
const DENSE_BAR_GAP = 1;
const MONTHS_BEFORE_ERA = 24;
const MAX_BARS = 60;
const FONT = `-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
const MONO = `"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`;

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeXml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

const fmt = (n) => Math.round(n).toLocaleString('en-US');

// "0.6× more" would be false, so a drop reads "0.6× as many".
export const multiplierPhrase = (multiplier) =>
  `${multiplier < 1 ? 'as many' : 'more'} PRs per month with AI agents`;

function bars({ prs, eraStart, now, chartFrom }, colors) {
  const lastFull = lastFullMonth(new Date(now));
  // An explicit start month gets every bar it asks for; the default is capped.
  const months = chartFrom
    ? monthRange(chartFrom, lastFull)
    : monthRange(
        laterMonth(
          addMonths(eraStart, -MONTHS_BEFORE_ERA),
          firstActiveMonth(prs.monthly) ?? eraStart,
        ),
        lastFull,
      ).slice(-MAX_BARS);
  const max = Math.max(1, ...months.map((m) => prs.monthly[m] ?? 0));
  const gap = months.length > MAX_BARS ? DENSE_BAR_GAP : BAR_GAP;
  const width = (WIDTH - 2 * PAD - gap * (months.length - 1)) / months.length;
  const baseline = HEIGHT - PAD;
  return months
    .map((month, i) => {
      const height = Math.max(2, ((prs.monthly[month] ?? 0) / max) * BAR_AREA);
      const era = month >= eraStart;
      return `<rect data-bar data-era="${era}" x="${(PAD + i * (width + gap)).toFixed(1)}" y="${(baseline - height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="${era ? colors.accent : colors.faint}"/>`;
    })
    .join('');
}

function headline({ prs }, colors) {
  const right = WIDTH - PAD;
  if (prs.multiplier === null) {
    return `<text x="${PAD}" y="290" font-size="150" font-weight="800" letter-spacing="-6">${fmt(prs.after)}/mo</text>
<text x="${PAD}" y="335" font-size="26">PRs per month with AI agents</text>`;
  }
  return `<text x="${PAD}" y="290" font-size="150" font-weight="800" letter-spacing="-6">${prs.multiplier.toFixed(1)}×</text>
<text x="${PAD}" y="335" font-size="26">${multiplierPhrase(prs.multiplier)}</text>
<text x="${right - 170}" y="290" font-size="44" font-weight="700" text-anchor="end" fill="${colors.dim}">${fmt(prs.before)}</text>
<text x="${right - 170}" y="318" font-size="14" text-anchor="end" font-family='${MONO}' fill="${colors.dim}" letter-spacing="1.5">BEFORE</text>
<text x="${right}" y="290" font-size="44" font-weight="700" text-anchor="end" fill="${colors.accent}">${fmt(prs.after)}</text>
<text x="${right}" y="318" font-size="14" text-anchor="end" font-family='${MONO}' fill="${colors.dim}" letter-spacing="1.5">AFTER</text>`;
}

function secondaryRow(stats, colors) {
  const parts = pickHighlights(stats).map(({ label, before, after }) => {
    const bold = `<tspan fill="${colors.ink}" font-weight="700">${after}</tspan>`;
    return before === null
      ? `${label} ${bold}`
      : `${label} <tspan>${before}</tspan> → ${bold}`;
  });
  if (parts.length === 0) return '';
  return `<text x="${PAD}" y="385" font-size="20" fill="${colors.dim}">${parts.join('   ·   ')}</text>`;
}

export function renderCardSvg(stats, theme = DEFAULT_THEME) {
  const { background, foreground, accent } = theme;
  const colors = {
    ink: foreground,
    dim: mix(background, foreground, 0.5),
    faint: mix(background, foreground, 0.2),
    accent,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="${foreground}" fill-opacity=".08"/></pattern></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#dots)"/>
<g fill="${colors.ink}" font-family='${FONT}'>
<text x="${PAD}" y="${PAD + 18}" font-size="18" font-family='${MONO}' fill="${colors.dim}" letter-spacing="1">@${escapeXml(stats.login)} · pull requests</text>
${headline(stats, colors)}
${secondaryRow(stats, colors)}
</g>
${bars(stats, colors)}
</svg>`;
}
