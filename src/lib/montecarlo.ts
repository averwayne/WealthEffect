import { corr } from '../data/assumptions';
import type { AssetClass, ClassAssumption } from './types';

export const PROJECTED_CLASSES: AssetClass[] = ['index', 'stocks', 'bonds', 'cash'];

export interface PortfolioStats {
  /** Expected arithmetic annual return. */
  arith: number;
  /** Annual volatility. */
  vol: number;
  /** Median (geometric) annual growth, net of fees. */
  geo: number;
  /** Log-space parameters (annual). */
  mu: number;
  sigma: number;
}

/** Combine per-class assumptions into portfolio-level lognormal parameters. Options are excluded and weights renormalised. */
export function portfolioStats(
  weights: Record<AssetClass, number>,
  a: Record<AssetClass, ClassAssumption>,
  fee: number,
): PortfolioStats {
  const total = PROJECTED_CLASSES.reduce((s, c) => s + Math.max(0, weights[c] || 0), 0);
  const w = (c: AssetClass) => (total > 0 ? Math.max(0, weights[c] || 0) / total : c === 'cash' ? 1 : 0);
  // geometric -> arithmetic: a ≈ g + σ²/2
  const arithOf = (c: AssetClass) => a[c].expReturn + (a[c].vol * a[c].vol) / 2;
  let arith = 0;
  let variance = 0;
  for (const i of PROJECTED_CLASSES) {
    arith += w(i) * arithOf(i);
    for (const j of PROJECTED_CLASSES) variance += w(i) * w(j) * a[i].vol * a[j].vol * corr(i, j);
  }
  const vol = Math.sqrt(Math.max(0, variance));
  const sigma2 = Math.log(1 + (vol * vol) / Math.pow(1 + arith, 2));
  const mu = Math.log(1 + arith) - sigma2 / 2 + Math.log(1 - fee);
  return { arith, vol, geo: Math.exp(mu) - 1, mu, sigma: Math.sqrt(sigma2) };
}

export interface MCInput {
  start: number;
  monthly: number;
  contribGrowth: number;
  months: number;
  mu: number;
  sigma: number;
  runs: number;
  /** Goal in nominal dollars, tested at goalMonths (for probability). */
  goalNominal: number | null;
  goalMonths?: number;
  seed?: number;
}

export interface MCResult {
  /** One row per year (index 0 = today). */
  years: { year: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  probability: number | null;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function runMonteCarlo(inp: MCInput): MCResult {
  const rand = mulberry32(inp.seed ?? 42);
  const gauss = () => {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const muM = inp.mu / 12;
  const sM = inp.sigma / Math.sqrt(12);
  const nYears = Math.ceil(inp.months / 12);
  const byYear: Float64Array[] = Array.from({ length: nYears + 1 }, () => new Float64Array(inp.runs));
  let hits = 0;
  const goalAt = Math.min(inp.months, Math.max(1, inp.goalMonths ?? inp.months));
  for (let r = 0; r < inp.runs; r++) {
    let bal = inp.start;
    byYear[0][r] = bal;
    for (let m = 1; m <= inp.months; m++) {
      const c = inp.monthly * Math.pow(1 + inp.contribGrowth, Math.floor((m - 1) / 12));
      bal = bal * Math.exp(muM + sM * gauss()) + c;
      if (m % 12 === 0 || m === inp.months) byYear[Math.ceil(m / 12)][r] = bal;
      if (m === goalAt && inp.goalNominal != null && bal >= inp.goalNominal) hits++;
    }
  }
  const q = (arr: Float64Array, p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const years = byYear.map((arr, y) => {
    arr.sort();
    return { year: y, p10: q(arr, 0.1), p25: q(arr, 0.25), p50: q(arr, 0.5), p75: q(arr, 0.75), p90: q(arr, 0.9) };
  });
  return { years, probability: inp.goalNominal != null ? hits / inp.runs : null };
}
