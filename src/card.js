import { firstActiveMonth } from './era.js';
import { pickFootnotes, pickTiles } from './highlights.js';
import {
  addMonths,
  lastFullMonth,
  laterMonth,
  monthLabel,
  monthRange,
} from './months.js';
import { DEFAULT_THEME, mix } from './theme.js';

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 60;
const FONT = `-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
const MONO = `"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`;

// Headline on the left, a 3×2 grid of tiles on the right.
const HEADLINE_WIDTH = 460;
const TILES = { x: 540, y: 102, width: 600, height: 248, gap: 12, columns: 3 };

// The chart: a title and key, then the plot with a y-axis on its left.
const LEGEND_Y = 392;
const PLOT_TOP = 406;
const BASELINE = 526;
const PLOT_LEFT = PAD + 44;
const AXIS_LABEL_Y = BASELINE + 20;
const FOOTNOTE_RULE_Y = 562;
const FOOTNOTE_Y = 588;
const BAR_GAP = 3;
const DENSE_BAR_GAP = 1;
const MONTHS_BEFORE_ERA = 24;
const MAX_BARS = 60;
const MAX_TICKS = 4;
// Rough monospace advance per character at 13px and 14px, with letter spacing.
const AXIS_CHAR = 8.2;
const LEGEND_CHAR = 9.4;
const LABEL_PADDING = 14;
const FOOTNOTE_SEPARATOR = '  ·  ';
const MAX_FOOTNOTE_CHARS = 132;

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

// The months on the chart. An explicit start month gets every bar it asks for; the default is capped.
export function chartMonths({ prs, eraStart, now, chartFrom }) {
  const lastFull = lastFullMonth(new Date(now));
  if (chartFrom) return monthRange(chartFrom, lastFull);
  return monthRange(
    laterMonth(
      addMonths(eraStart, -MONTHS_BEFORE_ERA),
      firstActiveMonth(prs.monthly) ?? eraStart,
    ),
    lastFull,
  ).slice(-MAX_BARS);
}

// Commits split by agent co-authorship when we have them, PRs otherwise.
function series(stats) {
  const { commits } = stats;
  if (!commits?.monthly) return { noun: 'PRs', monthly: stats.prs.monthly };
  const byAgent = Object.entries(commits.coauthoredMonthly ?? {}).filter(
    ([, monthly]) => Object.values(monthly).some((n) => n > 0),
  );
  if (byAgent.length === 0)
    return { noun: 'commits', monthly: commits.monthly };
  const agents = {};
  for (const [, monthly] of byAgent) {
    for (const [month, n] of Object.entries(monthly))
      agents[month] = (agents[month] ?? 0) + n;
  }
  return {
    noun: 'commits',
    monthly: commits.monthly,
    agents,
    agentName: byAgent.length === 1 ? byAgent[0][0] : 'agents',
  };
}

// Round steps from zero, like 0, 250, 500, 750, with at most MAX_TICKS above zero.
function ticks(max) {
  const raw = max / MAX_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw),
  );
  const out = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

// Places labels in priority order, skipping any that would overlap one already placed.
function placeLabels(candidates) {
  const placed = [];
  for (const label of candidates) {
    const width = label.text.length * AXIS_CHAR;
    const left = label.anchor === 'end' ? label.x - width : label.x;
    const box = { left, right: left + width };
    if (
      placed.some(
        (p) =>
          box.left < p.box.right + LABEL_PADDING &&
          p.box.left < box.right + LABEL_PADDING,
      )
    )
      continue;
    placed.push({ ...label, box });
  }
  return placed.sort((a, b) => a.box.left - b.box.left);
}

function chart(stats, colors) {
  const months = chartMonths(stats);
  const { noun, monthly, agents, agentName } = series(stats);
  const max = Math.max(1, ...months.map((m) => monthly[m] ?? 0));
  const gap = months.length > MAX_BARS ? DENSE_BAR_GAP : BAR_GAP;
  const plotWidth = WIDTH - PAD - PLOT_LEFT;
  const width = (plotWidth - gap * (months.length - 1)) / months.length;
  const xOf = (i) => PLOT_LEFT + i * (width + gap);
  const heightOf = (v) => (v / max) * (BASELINE - PLOT_TOP);
  const out = [];

  for (const value of ticks(max)) {
    const y = (BASELINE - heightOf(value)).toFixed(1);
    if (value > 0)
      out.push(
        `<line x1="${PLOT_LEFT}" x2="${WIDTH - PAD}" y1="${y}" y2="${y}" stroke="${colors.grid}" stroke-dasharray="3 4"/>`,
      );
    out.push(
      `<text data-tick x="${PLOT_LEFT - 10}" y="${(Number(y) + 4).toFixed(1)}" font-size="12" text-anchor="end" font-family='${MONO}' fill="${colors.dim}">${fmt(value)}</text>`,
    );
  }

  for (const [i, month] of months.entries()) {
    const value = monthly[month] ?? 0;
    const height = Math.max(2, heightOf(value));
    const era = month >= stats.eraStart;
    const x = xOf(i).toFixed(1);
    const fill = !era ? colors.faint : agents ? colors.solo : colors.accent;
    out.push(
      `<rect data-bar data-era="${era}" x="${x}" y="${(BASELINE - height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="${fill}"/>`,
    );
    const share =
      era && agents && value ? Math.min(1, (agents[month] ?? 0) / value) : 0;
    if (share > 0)
      out.push(
        `<rect data-agent x="${x}" y="${(BASELINE - height * share).toFixed(1)}" width="${width.toFixed(1)}" height="${(height * share).toFixed(1)}" fill="${colors.accent}"/>`,
      );
  }
  out.push(
    `<line x1="${PLOT_LEFT}" x2="${WIDTH - PAD}" y1="${BASELINE + 0.5}" y2="${BASELINE + 0.5}" stroke="${colors.axis}"/>`,
  );

  const eraIndex = months.indexOf(stats.eraStart);
  const eraX = eraIndex > 0 ? xOf(eraIndex) - gap / 2 : null;
  if (eraX !== null)
    out.push(
      `<line data-era-line x1="${eraX.toFixed(1)}" x2="${eraX.toFixed(1)}" y1="${PLOT_TOP}" y2="${BASELINE}" stroke="${colors.accent}" stroke-dasharray="4 4"/>`,
    );

  // Axis labels, most important first: where the chart starts, each year, where it ends, the era line.
  const first = months[0];
  const last = months.at(-1);
  const candidates = [];
  if (!first.endsWith('-01'))
    candidates.push({
      x: PLOT_LEFT,
      text: monthLabel(first),
      fill: colors.dim,
    });
  for (const [i, month] of months.entries()) {
    if (month.endsWith('-01'))
      candidates.push({
        x: xOf(i),
        text: month.slice(0, 4),
        fill: colors.dim,
        year: true,
      });
  }
  if (last !== first)
    candidates.push({
      x: WIDTH - PAD,
      anchor: 'end',
      text: monthLabel(last),
      fill: colors.dim,
    });
  if (eraX !== null)
    candidates.push({
      x: eraX + 6,
      text: monthLabel(stats.eraStart),
      fill: colors.accent,
    });
  for (const label of placeLabels(candidates)) {
    out.push(
      `<text${label.year ? ' data-year' : ''} x="${label.x.toFixed(1)}" y="${AXIS_LABEL_Y}" font-size="13"${label.anchor ? ` text-anchor="${label.anchor}"` : ''} font-family='${MONO}' fill="${label.fill}">${label.text}</text>`,
    );
  }

  return [legend(noun, agents ? agentName : null, colors), ...out].join('\n');
}

// The chart title on the left, its key on the right.
function legend(noun, agentName, colors) {
  const keys = agentName
    ? [
        ['BEFORE AGENTS', colors.faint],
        ['SOLO', colors.solo],
        [`WITH ${agentName.toUpperCase()}`, colors.accent],
      ]
    : [
        ['BEFORE AGENTS', colors.faint],
        ['WITH AGENTS', colors.accent],
      ];
  const out = [
    `<text x="${PAD}" y="${LEGEND_Y}" font-size="14" font-weight="700" letter-spacing="1" font-family='${MONO}' fill="${colors.ink}">${noun.toUpperCase()} OVER TIME</text>`,
  ];
  let right = WIDTH - PAD;
  for (const [text, fill] of keys.reverse()) {
    const left = right - text.length * LEGEND_CHAR;
    out.push(
      `<rect data-key x="${(left - 22).toFixed(1)}" y="${LEGEND_Y - 12}" width="14" height="14" rx="3" fill="${fill}"/>`,
      `<text x="${left.toFixed(1)}" y="${LEGEND_Y}" font-size="14" letter-spacing="1" font-family='${MONO}' fill="${colors.dim}">${escapeXml(text)}</text>`,
    );
    right = left - 22 - 24;
  }
  return out.join('\n');
}

function headline({ prs }, colors) {
  const big =
    prs.multiplier === null
      ? `${fmt(prs.after)}/mo`
      : `${prs.multiplier.toFixed(1)}×`;
  // Bold digits run about 0.62em wide; shrink long numbers so they clear the tiles.
  const size = Math.min(132, Math.floor(HEADLINE_WIDTH / (big.length * 0.62)));
  const lines = [
    `<text x="${PAD}" y="226" font-size="${size}" font-weight="800" letter-spacing="-5">${big}</text>`,
  ];
  if (prs.multiplier === null) {
    lines.push(
      `<text x="${PAD}" y="268" font-size="24">PRs per month with AI agents</text>`,
    );
    return lines.join('\n');
  }
  lines.push(
    `<text x="${PAD}" y="268" font-size="24">${multiplierPhrase(prs.multiplier)}</text>`,
    `<text x="${PAD}" y="306" font-size="20" font-family='${MONO}' fill="${colors.dim}"><tspan>${fmt(prs.before)}</tspan> → <tspan fill="${colors.accent}" font-weight="700">${fmt(prs.after)}</tspan> PRs/mo</text>`,
  );
  return lines.join('\n');
}

function tiles(picked, colors) {
  const { x, y, width, height, gap, columns } = TILES;
  const rows = 2;
  const w = (width - gap * (columns - 1)) / columns;
  const h = (height - gap * (rows - 1)) / rows;
  return picked
    .map((tile, i) => {
      const tx = x + (i % columns) * (w + gap);
      const ty = y + Math.floor(i / columns) * (h + gap);
      const before =
        tile.before === null
          ? ''
          : `<tspan font-size="18" fill="${colors.dim}">${escapeXml(tile.before)} → </tspan>`;
      return `<g data-tile="${tile.key}">
<rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="10" fill="${colors.tile}"/>
<text x="${(tx + 18).toFixed(1)}" y="${(ty + 30).toFixed(1)}" font-size="12" letter-spacing="1.2" font-family='${MONO}' fill="${colors.dim}">${escapeXml(tile.label.toUpperCase())}</text>
<text x="${(tx + 18).toFixed(1)}" y="${(ty + 76).toFixed(1)}">${before}<tspan font-size="30" font-weight="700">${escapeXml(tile.after)}</tspan></text>
<text x="${(tx + 18).toFixed(1)}" y="${(ty + 102).toFixed(1)}" font-size="14" font-weight="600" fill="${colors.accent}">${escapeXml(tile.note)}</text>
</g>`;
    })
    .join('\n');
}

// Footnotes in order until the line is full, skipping any that won't fit.
function footnote(notes, colors) {
  const fitted = [];
  let chars = 0;
  for (const note of notes) {
    const next =
      chars + (fitted.length ? FOOTNOTE_SEPARATOR.length : 0) + note.length;
    if (next > MAX_FOOTNOTE_CHARS) continue;
    fitted.push(note);
    chars = next;
  }
  if (fitted.length === 0) return '';
  return `<line x1="${PAD}" x2="${WIDTH - PAD}" y1="${FOOTNOTE_RULE_Y}" y2="${FOOTNOTE_RULE_Y}" stroke="${colors.grid}"/>
<text data-footnote x="${PAD}" y="${FOOTNOTE_Y}" font-size="13" font-family='${MONO}' fill="${colors.dim}">${escapeXml(fitted.join(FOOTNOTE_SEPARATOR))}</text>`;
}

export function renderCardSvg(stats, theme = DEFAULT_THEME) {
  const { background, foreground, accent } = theme;
  const colors = {
    ink: foreground,
    dim: mix(background, foreground, 0.5),
    faint: mix(background, foreground, 0.2),
    axis: mix(background, foreground, 0.35),
    grid: mix(background, foreground, 0.1),
    tile: mix(background, foreground, 0.05),
    solo: mix(background, accent, 0.4),
    accent,
  };
  const picked = pickTiles(stats);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="${foreground}" fill-opacity=".08"/></pattern></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#dots)"/>
<g fill="${colors.ink}" font-family='${FONT}'>
<text x="${PAD}" y="${PAD + 18}" font-size="18" font-family='${MONO}' fill="${colors.dim}" letter-spacing="1">@${escapeXml(stats.login)} · pull requests</text>
<text x="${WIDTH - PAD}" y="${PAD + 18}" font-size="18" text-anchor="end" font-family='${MONO}' fill="${colors.dim}" letter-spacing="1">agent era since ${monthLabel(stats.eraStart)}</text>
${headline(stats, colors)}
${tiles(picked, colors)}
${chart(stats, colors)}
${footnote(pickFootnotes(stats, picked), colors)}
</g>
</svg>`;
}
