// Months are "YYYY-MM" strings throughout the codebase.

const pad = (n) => String(n).padStart(2, '0');

const parse = (month) => {
  const [year, mon] = month.split('-').map(Number);
  return { year, mon };
};

export function addMonths(month, n) {
  const { year, mon } = parse(month);
  const index = year * 12 + (mon - 1) + n;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function monthRange(from, to) {
  const months = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

export function monthEnd(month) {
  const { year, mon } = parse(month);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return `${month}-${pad(lastDay)}`;
}

export function currentMonth(now) {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

export function lastFullMonth(now) {
  return addMonths(currentMonth(now), -1);
}

// biome-ignore lint/complexity/useMathMinMax: compares "YYYY-MM" strings, which Math.max can't.
export const laterMonth = (a, b) => (a > b ? a : b);

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const monthLabel = (month) =>
  `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
