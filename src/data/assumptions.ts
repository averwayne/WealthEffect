import type { AssetClass, ClassAssumption } from '../lib/types';

/**
 * Default capital-market assumptions.
 * Derived from Aswath Damodaran, "Historical Returns on Stocks, Bonds and Bills: 1928–2025"
 * (NYU Stern, histretSP.xls, updated 2026). Geometric annual averages and sample standard deviations.
 *   S&P 500 (incl. dividends): geometric 10.0%, sd 19.4%
 *   US 10-year Treasury bond: geometric 4.5%, sd 7.9%
 *   3-month T-bill:           geometric 3.4%, sd 3.0%
 *   CPI inflation:            geometric 3.0%
 *   Correlation S&P 500 vs 10y Treasury: 0.02
 * Individual-stock volatility is an assumption (single names and small baskets are far more volatile than the index).
 */
export const DATA_SOURCE = {
  name: 'Damodaran, Historical Returns 1928–2025',
  publisher: 'NYU Stern School of Business',
  url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histret.html',
  period: '1928–2025',
};

export const DEFAULT_ASSUMPTIONS: Record<AssetClass, ClassAssumption> = {
  index: { expReturn: 0.1, vol: 0.194 },
  stocks: { expReturn: 0.1, vol: 0.3 },
  bonds: { expReturn: 0.045, vol: 0.079 },
  options: { expReturn: 0, vol: 0 },
  cash: { expReturn: 0.034, vol: 0.03 },
};

export const ASSUMPTION_NOTES: Record<AssetClass, string> = {
  index: 'S&P 500 incl. dividends, 1928–2025',
  stocks: 'Index return; volatility raised for concentration (assumption)',
  bonds: 'US 10-year Treasury, 1928–2025',
  options: 'Tracked at market value; excluded from projections',
  cash: '3-month T-bill, 1928–2025',
};

export const DEFAULT_INFLATION = 0.03;
export const DEFAULT_RISK_FREE = 0.034;

/** Correlation matrix (index, stocks, bonds, cash). Equity–bond from the dataset; others are assumptions. */
export const CORRELATION: Record<string, number> = {
  'index|stocks': 0.85,
  'index|bonds': 0.02,
  'stocks|bonds': 0.02,
  'index|cash': 0,
  'stocks|cash': 0,
  'bonds|cash': 0.2,
};

export function corr(a: AssetClass, b: AssetClass): number {
  if (a === b) return 1;
  return CORRELATION[`${a}|${b}`] ?? CORRELATION[`${b}|${a}`] ?? 0;
}
