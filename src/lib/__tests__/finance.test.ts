import { describe, expect, it } from 'vitest';
import { simulate, solveContribution, solveLength, solveRate, solveStart } from '../calc';
import { portfolioStats, runMonteCarlo } from '../montecarlo';
import { xirr, summarize } from '../portfolio';
import { percentileOf, valueAtPercentile } from '../standing';
import { DEFAULT_ASSUMPTIONS } from '../../data/assumptions';

// Reference case published by calculator.net's Investment Calculator:
// $20,000 start, 10 years, 6% compounded annually, $1,000 at the end of each month.
const ref = { start: 20000, years: 10, rate: 0.06, compounding: 'annually' as const, contribution: 1000, frequency: 'month' as const, timing: 'end' as const };

describe('investment calculator', () => {
  it('matches the reference end balance', () => {
    const r = simulate(ref);
    expect(r.end).toBeCloseTo(198290.4, 0);
    expect(r.totalContrib).toBe(120000);
    expect(r.rows[0].interest).toBeCloseTo(1526.53, 1);
  });
  it('solves the contribution for a $1M target', () => {
    expect(solveContribution({ ...ref, target: 1_000_000 })).toBeCloseTo(5934.4, 1);
  });
  it('round-trips rate, start and length', () => {
    const end = simulate(ref).end;
    expect(solveRate({ ...ref, rate: 0.01, target: end })).toBeCloseTo(0.06, 6);
    expect(solveStart({ ...ref, start: 0, target: end })).toBeCloseTo(20000, 2);
    expect(solveLength({ ...ref, target: end - 1 })).toBe(120);
  });
});

describe('monte carlo', () => {
  it('median tracks the deterministic path at the portfolio geometric rate', () => {
    const w = { index: 1, stocks: 0, bonds: 0, options: 0, cash: 0 };
    const s = portfolioStats(w, DEFAULT_ASSUMPTIONS, 0);
    expect(s.geo).toBeCloseTo(0.1, 2);
    const mc = runMonteCarlo({ start: 100000, monthly: 0, contribGrowth: 0, months: 240, mu: s.mu, sigma: s.sigma, runs: 4000, goalNominal: null });
    const det = 100000 * Math.pow(1 + s.geo, 20);
    expect(mc.years[20].p50 / det).toBeGreaterThan(0.93);
    expect(mc.years[20].p50 / det).toBeLessThan(1.07);
  });
});

describe('portfolio', () => {
  it('xirr of a 10% one-year gain is 10%', () => {
    const r = xirr([{ date: new Date('2024-01-01'), amount: -1000 }, { date: new Date('2025-01-01'), amount: 1100 }]);
    expect(r!).toBeCloseTo(0.1, 2);
  });
  it('derives holdings, cash and contributions from transactions', () => {
    const s = summarize(
      [
        { id: '1', date: '2025-01-02', type: 'deposit', symbol: null, quantity: null, price: null, amount: 1000, note: null },
        { id: '2', date: '2025-01-02', type: 'buy', symbol: 'VTI', quantity: 4, price: 200, amount: 800, note: null },
      ],
      [{ symbol: 'VTI', assetClass: 'index', name: null, manualPrice: null }],
      { VTI: { symbol: 'VTI', price: 250, change: 1, changePct: 0.4, prevClose: 249, quoteTime: null, fetchedAt: '' } },
      [{ id: 'm', kind: 'liability', name: 'Loan', amount: 300 }],
    );
    expect(s.cash).toBe(200);
    expect(s.portfolio).toBe(1200);
    expect(s.gains).toBe(200);
    expect(s.netWorth).toBe(900);
    expect(s.byClass.index).toBe(1000);
  });
});

describe('standing', () => {
  it('median of the 35–44 band is close to the Fed published $156.0K', () => {
    expect(valueAtPercentile(50, '35_44')).toBeGreaterThan(150000);
    expect(valueAtPercentile(50, '35_44')).toBeLessThan(162000);
    expect(percentileOf(156000, '35_44')).toBeCloseTo(50, 0);
  });
});
