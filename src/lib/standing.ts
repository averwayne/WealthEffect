import { SCF_BANDS, SCF_PERCENTILES, type AgeBand } from '../data/scf2025';

export function ageBand(age: number): AgeBand {
  if (age < 35) return 'u35';
  if (age < 45) return '35_44';
  if (age < 55) return '45_54';
  if (age < 65) return '55_64';
  if (age < 75) return '65_74';
  return '75p';
}

/** Percentile (0–100) of a net worth within an age band, linearly interpolated. */
export function percentileOf(netWorth: number, band: AgeBand): number {
  const v = SCF_BANDS[band].values;
  const p = SCF_PERCENTILES;
  if (netWorth <= v[0]) return p[0] * (netWorth >= 0 ? 1 : 0.5);
  for (let i = 1; i < v.length; i++) {
    if (netWorth <= v[i]) {
      // flat stretches (many households at exactly 0) resolve to the upper end
      const span = v[i] - v[i - 1];
      const t = span > 0 ? (netWorth - v[i - 1]) / span : 1;
      return p[i - 1] + t * (p[i] - p[i - 1]);
    }
  }
  return 99.95;
}

export function valueAtPercentile(pct: number, band: AgeBand): number {
  const v = SCF_BANDS[band].values;
  const p = SCF_PERCENTILES;
  for (let i = 1; i < p.length; i++) {
    if (pct <= p[i]) {
      const t = (pct - p[i - 1]) / (p[i] - p[i - 1]);
      return v[i - 1] + t * (v[i] - v[i - 1]);
    }
  }
  return v[v.length - 1];
}

export interface Tier {
  key: string;
  label: string;
  min: number; // percentile
  max: number;
}

export const TIERS: Tier[] = [
  { key: 'p0', label: 'Below P25', min: 0, max: 25 },
  { key: 'p25', label: 'P25–P50', min: 25, max: 50 },
  { key: 'p50', label: 'P50–P75', min: 50, max: 75 },
  { key: 'p75', label: 'P75–P90', min: 75, max: 90 },
  { key: 'p90', label: 'P90–P99', min: 90, max: 99 },
  { key: 'p99', label: 'Top 1%', min: 99, max: 100 },
];

export function tierOf(pct: number): Tier {
  return TIERS.find((t) => pct < t.max) ?? TIERS[TIERS.length - 1];
}
