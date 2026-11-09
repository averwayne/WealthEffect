import type { AssetClass, BalanceItem, Position, Quote, Transaction } from './types';

export interface Holding {
  symbol: string;
  name: string | null;
  assetClass: AssetClass;
  quantity: number;
  avgCost: number;
  costBasis: number;
  price: number | null;
  priceSource: 'live' | 'manual' | 'trade' | null;
  marketValue: number;
  dayChange: number;
  dayChangePct: number | null;
  unrealized: number;
  quoteTime: string | null;
}

export interface PortfolioSummary {
  holdings: Holding[];
  cash: number;
  invested: number;
  portfolio: number;
  netContributions: number;
  gains: number;
  dayChange: number;
  otherAssets: number;
  liabilities: number;
  netWorth: number;
  byClass: Record<AssetClass, number>;
}

const sortTx = (t: Transaction[]) => [...t].sort((a, b) => a.date.localeCompare(b.date));

export function summarize(
  transactions: Transaction[],
  positions: Position[],
  quotes: Record<string, Quote>,
  balances: BalanceItem[],
): PortfolioSummary {
  const lots = new Map<string, { qty: number; cost: number; lastPrice: number | null }>();
  let cash = 0;
  let netContributions = 0;
  for (const t of sortTx(transactions)) {
    const sym = t.symbol?.toUpperCase() ?? '';
    switch (t.type) {
      case 'deposit':
        cash += t.amount;
        netContributions += t.amount;
        break;
      case 'withdrawal':
        cash -= t.amount;
        netContributions -= t.amount;
        break;
      case 'dividend':
        cash += t.amount;
        break;
      case 'buy': {
        cash -= t.amount;
        const l = lots.get(sym) ?? { qty: 0, cost: 0, lastPrice: null };
        l.qty += t.quantity ?? 0;
        l.cost += t.amount;
        l.lastPrice = t.price ?? l.lastPrice;
        lots.set(sym, l);
        break;
      }
      case 'sell': {
        cash += t.amount;
        const l = lots.get(sym) ?? { qty: 0, cost: 0, lastPrice: null };
        const q = t.quantity ?? 0;
        const avg = l.qty > 0 ? l.cost / l.qty : 0;
        l.cost -= avg * Math.min(q, l.qty);
        l.qty -= q;
        l.lastPrice = t.price ?? l.lastPrice;
        lots.set(sym, l);
        break;
      }
    }
  }
  const posMap = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));
  const holdings: Holding[] = [];
  for (const [symbol, l] of lots) {
    if (Math.abs(l.qty) < 1e-9) continue;
    const pos = posMap.get(symbol);
    const q = quotes[symbol];
    let price: number | null = null;
    let priceSource: Holding['priceSource'] = null;
    if (q && q.price > 0) {
      price = q.price;
      priceSource = 'live';
    } else if (pos?.manualPrice != null) {
      price = pos.manualPrice;
      priceSource = 'manual';
    } else if (l.lastPrice != null) {
      price = l.lastPrice;
      priceSource = 'trade';
    }
    const mv = price != null ? price * l.qty : l.cost;
    const dayChange = priceSource === 'live' && q ? q.change * l.qty : 0;
    holdings.push({
      symbol,
      name: pos?.name ?? null,
      assetClass: pos?.assetClass ?? 'stocks',
      quantity: l.qty,
      avgCost: l.qty ? l.cost / l.qty : 0,
      costBasis: l.cost,
      price,
      priceSource,
      marketValue: mv,
      dayChange,
      dayChangePct: priceSource === 'live' && q ? q.changePct : null,
      unrealized: mv - l.cost,
      quoteTime: priceSource === 'live' && q ? q.quoteTime : null,
    });
  }
  holdings.sort((a, b) => b.marketValue - a.marketValue);
  const invested = holdings.reduce((s, h) => s + h.marketValue, 0);
  const portfolio = invested + cash;
  const byClass: Record<AssetClass, number> = { index: 0, stocks: 0, bonds: 0, options: 0, cash };
  for (const h of holdings) byClass[h.assetClass] += h.marketValue;
  const otherAssets = balances.filter((b) => b.kind === 'asset').reduce((s, b) => s + b.amount, 0);
  const liabilities = balances.filter((b) => b.kind === 'liability').reduce((s, b) => s + b.amount, 0);
  return {
    holdings,
    cash,
    invested,
    portfolio,
    netContributions,
    gains: portfolio - netContributions,
    dayChange: holdings.reduce((s, h) => s + h.dayChange, 0),
    otherAssets,
    liabilities,
    netWorth: portfolio + otherAssets - liabilities,
    byClass,
  };
}

const DAY = 86400000;

/** Money-weighted annualised return. Flows from the investor's view: deposits negative, withdrawals and final value positive. */
export function xirr(flows: { date: Date; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = flows[0].date.getTime();
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (f.date.getTime() - t0) / (365 * DAY)), 0);
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid);
    if (Math.abs(f) < 1e-7) return mid;
    if (f * flo < 0) hi = mid;
    else {
      lo = mid;
      flo = f;
    }
  }
  return (lo + hi) / 2;
}

export interface ReturnResult {
  /** Annualised money-weighted return when the history is at least one year, otherwise cumulative. */
  value: number | null;
  annualised: boolean;
  since: string | null;
}

export function externalFlows(transactions: Transaction[]) {
  return sortTx(transactions)
    .filter((t) => t.type === 'deposit' || t.type === 'withdrawal')
    .map((t) => ({ date: new Date(t.date + 'T12:00:00'), amount: t.type === 'deposit' ? -t.amount : t.amount }));
}

export function personalReturn(transactions: Transaction[], endValue: number, now = new Date()): ReturnResult {
  const flows = externalFlows(transactions);
  if (!flows.length) return { value: null, annualised: false, since: null };
  const since = flows[0].date.toISOString().slice(0, 10);
  const span = (now.getTime() - flows[0].date.getTime()) / DAY;
  if (span < 365) {
    // Modified Dietz (cumulative) for short histories; annualising under a year overstates results.
    const net = -flows.reduce((s, f) => s + f.amount, 0);
    const weighted = -flows.reduce((s, f) => s + f.amount * ((now.getTime() - f.date.getTime()) / DAY / Math.max(span, 1)), 0);
    if (weighted <= 0) return { value: null, annualised: false, since };
    return { value: (endValue - net) / weighted, annualised: false, since };
  }
  return { value: xirr([...flows, { date: now, amount: endValue }]), annualised: true, since };
}

/**
 * Benchmark: what the same deposits and withdrawals would be worth if each had bought/sold the S&P 500 (SPY)
 * at that month's adjusted close.
 */
export function benchmark(
  transactions: Transaction[],
  spy: { date: string; close: number }[],
  spyNow: number | null,
  now = new Date(),
): { value: number; ret: ReturnResult } | null {
  const flows = externalFlows(transactions);
  if (!flows.length || spy.length < 2) return null;
  const series = [...spy].sort((a, b) => a.date.localeCompare(b.date));
  const priceAt = (d: Date) => {
    const iso = d.toISOString().slice(0, 10);
    let p: number | null = null;
    for (const s of series) {
      if (s.date <= iso) p = s.close;
      else break;
    }
    return p ?? series[0].close;
  };
  let units = 0;
  for (const f of flows) units += -f.amount / priceAt(f.date);
  const last = spyNow ?? series[series.length - 1].close;
  const value = units * last;
  return { value, ret: personalReturn(transactions, value, now) };
}
