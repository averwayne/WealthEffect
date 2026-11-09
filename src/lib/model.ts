import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_RISK_FREE } from '../data/assumptions';
import { simulate } from './calc';
import { monthsBetween } from './format';
import { portfolioStats, runMonteCarlo, type MCInput, type MCResult } from './montecarlo';
import { benchmark, personalReturn, summarize } from './portfolio';
import { ageBand, percentileOf } from './standing';
import { useStore } from './store';
import type { TargetPath } from './types';

let worker: Worker | null = null;
let seq = 0;

function useMonteCarlo(input: MCInput): MCResult | null {
  const [res, setRes] = useState<MCResult | null>(null);
  const key = JSON.stringify(input);
  const latest = useRef(0);
  useEffect(() => {
    const id = ++seq;
    latest.current = id;
    const parsed = JSON.parse(key) as MCInput;
    if (typeof Worker === 'undefined') {
      setRes(runMonteCarlo(parsed));
      return;
    }
    try {
      worker ??= new Worker(new URL('./mc.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      setRes(runMonteCarlo(parsed));
      return;
    }
    const w = worker;
    const onMsg = (e: MessageEvent<{ id: number; result: MCResult }>) => {
      if (e.data.id === latest.current) setRes(e.data.result);
    };
    w.addEventListener('message', onMsg);
    const t = setTimeout(() => w.postMessage({ id, input: parsed }), 120);
    return () => {
      clearTimeout(t);
      w.removeEventListener('message', onMsg);
    };
  }, [key]);
  return res;
}

/** Value of the target path `monthsIn` months after it started. */
export function targetPathValue(tp: TargetPath, monthsIn: number): number {
  if (monthsIn <= 0) return tp.startValue;
  return simulate({
    start: tp.startValue,
    years: monthsIn / 12,
    rate: tp.rate,
    compounding: 'annually',
    contribution: tp.monthly,
    frequency: 'month',
    timing: 'end',
    contribGrowth: tp.contribGrowth,
  }).end;
}

export function useModel() {
  const s = useStore();
  const { settings } = s;
  const now = new Date();
  const age = now.getFullYear() - settings.birthYear;

  const summary = useMemo(
    () => summarize(s.transactions, s.positions, s.quotes, s.balances),
    [s.transactions, s.positions, s.quotes, s.balances],
  );

  const expensesTotal = settings.expenses.reduce((a, e) => a + (e.amount || 0), 0);
  const surplus = settings.takeHome - expensesTotal;
  const savingsRate = settings.takeHome > 0 ? settings.monthlyInvest / settings.takeHome : 0;
  const stats = useMemo(
    () => portfolioStats(settings.targetAlloc, settings.assumptions, settings.feeRate),
    [settings.targetAlloc, settings.assumptions, settings.feeRate],
  );
  const infl = settings.inflation;
  const freedomNumber = settings.withdrawalRate > 0 ? (expensesTotal * 12) / settings.withdrawalRate : 0;
  const goalToday = settings.goalMode === 'freedom' ? freedomNumber : settings.goalAmount;
  const yearsToGoal = Math.max(1, settings.goalAge - age);
  const goalNominal = goalToday * Math.pow(1 + infl, yearsToGoal);
  const horizonYears = Math.min(70, Math.max(yearsToGoal, settings.incomeAge - age, 10));

  const mc = useMonteCarlo({
    start: Math.max(0, summary.portfolio),
    monthly: settings.monthlyInvest,
    contribGrowth: settings.contribGrowth,
    months: horizonYears * 12,
    mu: stats.mu,
    sigma: stats.sigma,
    runs: 5000,
    goalNominal,
    goalMonths: yearsToGoal * 12,
  });

  const riskFree = settings.riskFreeOverride ?? s.market.tbill?.value ?? DEFAULT_RISK_FREE;
  const riskFreeSource: 'override' | 'live' | 'default' =
    settings.riskFreeOverride != null ? 'override' : s.market.tbill ? 'live' : 'default';

  /** Divide a future nominal value by this to express it in today's dollars (when the toggle is on). */
  const deflator = (years: number) => (settings.realDollars ? Math.pow(1 + infl, years) : 1);

  const tp = settings.targetPath;
  const tpMonths = tp ? monthsBetween(tp.startMonth, now) : 0;
  const targetNow = tp ? targetPathValue(tp, tpMonths) : null;
  const variance = targetNow != null ? summary.portfolio - targetNow : null;

  const ret = useMemo(() => personalReturn(s.transactions, summary.portfolio), [s.transactions, summary.portfolio]);
  const bench = useMemo(
    () => benchmark(s.transactions, s.market.spy, s.quotes.SPY?.price ?? null),
    [s.transactions, s.market.spy, s.quotes.SPY],
  );

  const band = ageBand(age);
  const percentile = percentileOf(summary.netWorth, band);

  return {
    s,
    settings,
    age,
    summary,
    expensesTotal,
    surplus,
    savingsRate,
    stats,
    freedomNumber,
    goalToday,
    yearsToGoal,
    goalNominal,
    horizonYears,
    mc,
    riskFree,
    riskFreeSource,
    deflator,
    targetNow,
    variance,
    ret,
    bench,
    band,
    percentile,
  };
}

export type Model = ReturnType<typeof useModel>;
