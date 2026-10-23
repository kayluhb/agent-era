import { firstActiveMonth } from './era.js';
import { addMonths, lastFullMonth, laterMonth, monthRange } from './months.js';

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 60;
const BAR_AREA = 160;
const BAR_GAP = 3;
const MONTHS_BEFORE_ERA = 24;
const MAX_BARS = 60;
const FONT = `-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;

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

function bars({ prs, eraStart, now }) {
  const months = monthRange(
    laterMonth(
      addMonths(eraStart, -MONTHS_BEFORE_ERA),
      firstActiveMonth(prs.monthly) ?? eraStart,
    ),
    lastFullMonth(new Date(now)),
  ).slice(-MAX_BARS);
  const max = Math.max(1, ...months.map((m) => prs.monthly[m] ?? 0));
  const width =
    (WIDTH - 2 * PAD - BAR_GAP * (months.length - 1)) / months.length;
  const baseline = HEIGHT - PAD;
  return months
    .map((month, i) => {
      const height = Math.max(2, ((prs.monthly[month] ?? 0) / max) * BAR_AREA);
      const era = month >= eraStart;
      return `<rect data-bar data-era="${era}" x="${(PAD + i * (width + BAR_GAP)).toFixed(1)}" y="${(baseline - height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="3" fill="${era ? '#fff' : 'rgba(255,255,255,.35)'}"/>`;
    })
    .join('');
}

function headline({ prs }) {
  const right = WIDTH - PAD;
  if (prs.multiplier === null) {
    return `<text x="${PAD}" y="290" font-size="150" font-weight="900" letter-spacing="-6">${fmt(prs.after)}/mo</text>
<text x="${PAD}" y="335" font-size="26" opacity=".9">PRs per month with AI agents</text>`;
  }
  return `<text x="${PAD}" y="290" font-size="150" font-weight="900" letter-spacing="-6">${prs.multiplier.toFixed(1)}×</text>
<text x="${PAD}" y="335" font-size="26" opacity=".9">${multiplierPhrase(prs.multiplier)}</text>
<text x="${right - 170}" y="290" font-size="44" font-weight="800" text-anchor="end" opacity=".55">${fmt(prs.before)}</text>
<text x="${right - 170}" y="318" font-size="15" text-anchor="end" opacity=".8" letter-spacing="1.5">BEFORE</text>
<text x="${right}" y="290" font-size="44" font-weight="800" text-anchor="end">${fmt(prs.after)}</text>
<text x="${right}" y="318" font-size="15" text-anchor="end" opacity=".8" letter-spacing="1.5">AFTER</text>`;
}

function secondaryRow({ commits, lines }) {
  const parts = [];
  if (commits) {
    parts.push(
      `commits/mo on default branches <tspan opacity=".55">${fmt(commits.before)}</tspan> → <tspan font-weight="800">${fmt(commits.after)}</tspan>`,
    );
  }
  if (lines && lines.beforeMedian !== null && lines.afterMedian !== null) {
    parts.push(
      `median lines per PR <tspan opacity=".55">${fmt(lines.beforeMedian)}</tspan> → <tspan font-weight="800">${fmt(lines.afterMedian)}</tspan>`,
    );
  }
  if (parts.length === 0) return '';
  return `<text x="${PAD}" y="385" font-size="20" opacity=".9">${parts.join('   ·   ')}</text>`;
}

export function renderCardSvg(stats) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#1b1340"/><stop offset=".55" stop-color="#3a1d6e"/><stop offset="1" stop-color="#e2557a"/>
</linearGradient></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
<g fill="#fff" font-family='${FONT}'>
<text x="${PAD}" y="${PAD + 18}" font-size="20" opacity=".8" letter-spacing="1.5">@${escapeXml(stats.login)} · pull requests</text>
${headline(stats)}
${secondaryRow(stats)}
</g>
${bars(stats)}
</svg>`;
}
