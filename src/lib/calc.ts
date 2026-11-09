import type { CalcInputs, Compounding } from './types';

/** Effective monthly rate for a nominal annual rate with the given compounding frequency. */
export function monthlyRate(rate: number, compounding: Compounding): number {
  const n: Record<Compounding, number> = {
    annually: 1,
    semiannually: 2,
    quarterly: 4,
    monthly: 12,
    daily: 365,
    continuously: Infinity,
  };
  const k = n[compounding];
  if (k === Infinity) return Math.exp(rate / 12) - 1;
  return Math.pow(1 + rate / k, k / 12) - 1;
}

export interface YearRow {
  year: number;
  deposit: number;
  interest: number;
  balance: number;
  /** Cumulative split of the ending balance. */
  cumStart: number;
  cumContrib: number;
  cumInterest: number;
}

export interface SimResult {
  end: number;
  totalContrib: number;
  totalInterest: number;
  rows: YearRow[];
}

type SimArgs = Pick<CalcInputs, 'start' | 'years' | 'rate' | 'compounding' | 'contribution' | 'frequency' | 'timing'> & {
  contribGrowth?: number;
};

/**
 * Month-by-month accumulation. Matches the conventions of common investment calculators:
 * interest compounds at the chosen frequency (converted to an equivalent monthly rate),
 * contributions arrive at the beginning or end of each month/year.
 */
export function simulate(a: SimArgs): SimResult {
  const months = Math.max(0, Math.round(a.years * 12));
  const i = monthlyRate(a.rate, a.compounding);
  const g = a.contribGrowth ?? 0;
  let bal = a.start;
  let totalContrib = 0;
  let totalInterest = 0;
  const rows: YearRow[] = [];
  let yDeposit = 0;
  let yInterest = 0;
  for (let m = 1; m <= months; m++) {
    const yearIdx = Math.floor((m - 1) / 12);
    const c = a.contribution * Math.pow(1 + g, yearIdx);
    const monthInYear = ((m - 1) % 12) + 1;
    const due =
      a.frequency === 'month' ||
      (a.timing === 'begin' ? monthInYear === 1 : monthInYear === 12 || m === months);
    if (due && a.timing === 'begin') {
      bal += c;
      totalContrib += c;
      yDeposit += c;
    }
    const int = bal * i;
    bal += int;
    totalInterest += int;
    yInterest += int;
    if (due && a.timing === 'end') {
      bal += c;
      totalContrib += c;
      yDeposit += c;
    }
    if (monthInYear === 12 || m === months) {
      rows.push({
        year: yearIdx + 1,
        deposit: yDeposit,
        interest: yInterest,
        balance: bal,
        cumStart: a.start,
        cumContrib: totalContrib,
        cumInterest: totalInterest,
      });
      yDeposit = 0;
      yInterest = 0;
    }
  }
  return { end: bal, totalContrib, totalInterest, rows };
}

export function solveContribution(a: SimArgs & { target: number }): number {
  const base = simulate({ ...a, contribution: 0 }).end;
  const unit = simulate({ ...a, contribution: 1 }).end - base;
  if (unit <= 0) return NaN;
  return Math.max(0, (a.target - base) / unit);
}

export function solveStart(a: SimArgs & { target: number }): number {
  const base = simulate({ ...a, start: 0 }).end;
  const unit = simulate({ ...a, start: 1 }).end - base;
  if (unit <= 0) return NaN;
  return Math.max(0, (a.target - base) / unit);
}

export function solveRate(a: SimArgs & { target: number }): number {
  let lo = -0.5;
  let hi = 1.0;
  const f = (r: number) => simulate({ ...a, rate: r }).end - a.target;
  if (f(lo) > 0) return lo;
  if (f(hi) < 0) return NaN;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Months needed to reach the target (null if not reachable within 100 years). */
export function solveLength(a: SimArgs & { target: number }): number | null {
  if (a.start >= a.target) return 0;
  const i = monthlyRate(a.rate, a.compounding);
  const g = a.contribGrowth ?? 0;
  let bal = a.start;
  for (let m = 1; m <= 1200; m++) {
    const yearIdx = Math.floor((m - 1) / 12);
    const c = a.contribution * Math.pow(1 + g, yearIdx);
    const monthInYear = ((m - 1) % 12) + 1;
    const due = a.frequency === 'month' || (a.timing === 'begin' ? monthInYear === 1 : monthInYear === 12);
    if (due && a.timing === 'begin') bal += c;
    bal += bal * i;
    if (due && a.timing === 'end') bal += c;
    if (bal >= a.target) return m;
  }
  return null;
}
