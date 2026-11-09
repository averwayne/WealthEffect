import { DEFAULT_ASSUMPTIONS, DEFAULT_INFLATION } from '../data/assumptions';
import type { Settings } from './types';

export function defaultSettings(): Settings {
  const year = new Date().getFullYear();
  return {
    displayName: '',
    birthYear: year - 30,
    takeHome: 6000,
    expenses: [
      { name: 'Housing', amount: 1800 },
      { name: 'Transportation', amount: 400 },
      { name: 'Food', amount: 600 },
      { name: 'Insurance & health', amount: 300 },
      { name: 'Other', amount: 400 },
    ],
    monthlyInvest: 1500,
    contribGrowth: 0.03,
    targetAlloc: { index: 0.7, stocks: 0.1, bonds: 0.15, options: 0, cash: 0.05 },
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
    feeRate: 0.001,
    inflation: DEFAULT_INFLATION,
    goalMode: 'freedom',
    goalAmount: 2_000_000,
    goalAge: 60,
    withdrawalRate: 0.04,
    incomeAge: 65,
    riskFreeOverride: null,
    realDollars: true,
    calcTab: 'end',
    calc: {
      target: 1_000_000,
      start: 0,
      years: 30,
      rate: 0.08,
      compounding: 'monthly',
      contribution: 1500,
      frequency: 'month',
      timing: 'end',
      linked: true,
    },
    chartView: 'range',
    targetPath: null,
  };
}

/** Merge stored settings over defaults so new fields added later always exist. */
export function hydrateSettings(stored: Partial<Settings> | null | undefined): Settings {
  const d = defaultSettings();
  if (!stored) return d;
  return {
    ...d,
    ...stored,
    targetAlloc: { ...d.targetAlloc, ...(stored.targetAlloc ?? {}) },
    assumptions: { ...d.assumptions, ...(stored.assumptions ?? {}) },
    calc: { ...d.calc, ...(stored.calc ?? {}) },
  };
}
