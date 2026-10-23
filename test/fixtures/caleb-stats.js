import { calebMonthly } from './caleb-monthly.js';

export const calebStats = {
  login: 'kayluhb',
  eraStart: '2026-04',
  eraSource: 'detected',
  prs: {
    before: 68.25,
    after: 461.83,
    multiplier: 6.8,
    monthly: calebMonthly,
    yearly: { 2011: 4, 2016: 145, 2017: 507, 2024: 531, 2025: 747, 2026: 3554 },
    shortHistory: false,
  },
  commits: {
    before: 70.4,
    after: 602.2,
    multiplier: 8.6,
    yearly: { 2025: 900, 2026: 4200 },
  },
  lines: { beforeMedian: 120, afterMedian: 85.5 },
  restrictedOrgs: [],
  caveats: [],
  now: '2026-10-23T12:00:00Z',
};
