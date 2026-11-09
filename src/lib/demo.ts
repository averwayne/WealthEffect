import { defaultSettings } from './defaults';
import type { BalanceItem, Position, Quote, Settings, Snapshot, Transaction } from './types';

/**
 * Sample portfolio for the "Explore with sample data" mode. Prices are illustrative, not live market data.
 */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function demoData() {
  const now = new Date();
  const settings: Settings = {
    ...defaultSettings(),
    displayName: 'Sample',
    birthYear: now.getFullYear() - 34,
    takeHome: 7200,
    expenses: [
      { name: 'Housing', amount: 2100 },
      { name: 'Transportation', amount: 450 },
      { name: 'Food', amount: 700 },
      { name: 'Insurance & health', amount: 350 },
      { name: 'Other', amount: 600 },
    ],
    monthlyInvest: 2000,
    goalMode: 'freedom',
    goalAge: 58,
  };

  const prices: Record<string, number[]> = {
    VTI: [218, 226, 231, 240, 236, 248, 255, 262, 251, 268, 274, 281, 276, 289, 295, 301, 298, 307, 312, 318, 309, 321, 327, 334, 329, 338, 341, 336, 345, 352, 349, 357, 361, 355, 364, 368],
    VXUS: [56, 57, 58, 58, 57, 59, 60, 61, 59, 61, 62, 62, 61, 63, 64, 64, 63, 65, 66, 67, 65, 67, 68, 69, 68, 70, 71, 70, 72, 72, 71, 73, 74, 73, 74, 75],
    BND: [71, 71, 72, 72, 71, 72, 72, 73, 72, 72, 73, 73, 72, 73, 73, 73, 72, 73, 73, 74, 73, 73, 74, 74, 73, 74, 74, 74, 74, 75, 74, 75, 75, 75, 75, 75],
  };
  const tx: Transaction[] = [];
  let id = 0;
  const add = (t: Omit<Transaction, 'id'>) => tx.push({ ...t, id: `d${++id}` });
  const months = 36;
  for (let k = 0; k < months; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - k), 3);
    const date = iso(d);
    const dep = k === 0 ? 25000 : 1800 + Math.floor(k / 12) * 100;
    add({ date, type: 'deposit', symbol: null, quantity: null, price: null, amount: dep, note: k === 0 ? 'Opening balance' : 'Monthly contribution' });
    const alloc: [string, number][] = [['VTI', 0.62], ['VXUS', 0.13], ['BND', 0.15]];
    for (const [s, w] of alloc) {
      const p = prices[s][k];
      const q = Math.floor(((dep * w) / p) * 1000) / 1000;
      add({ date, type: 'buy', symbol: s, quantity: q, price: p, amount: +(q * p).toFixed(2), note: null });
    }
    if (k === 6) add({ date, type: 'buy', symbol: 'MSFT', quantity: 10, price: 410, amount: 4100, note: null });
    if (k === 14) add({ date, type: 'buy', symbol: 'AAPL', quantity: 15, price: 190, amount: 2850, note: null });
    if (k === 33) add({ date, type: 'buy', symbol: 'AAPL 270C', quantity: 2, price: 310, amount: 620, note: 'Call option, 2 contracts' });
    if (k % 3 === 2) add({ date, type: 'dividend', symbol: 'VTI', quantity: null, price: null, amount: 60 + k * 9, note: 'Quarterly dividend' });
  }

  const positions: Position[] = [
    { symbol: 'VTI', assetClass: 'index', name: 'Vanguard Total Stock Market ETF', manualPrice: null },
    { symbol: 'VXUS', assetClass: 'index', name: 'Vanguard Total International Stock ETF', manualPrice: null },
    { symbol: 'BND', assetClass: 'bonds', name: 'Vanguard Total Bond Market ETF', manualPrice: null },
    { symbol: 'MSFT', assetClass: 'stocks', name: 'Microsoft Corp', manualPrice: null },
    { symbol: 'AAPL', assetClass: 'stocks', name: 'Apple Inc', manualPrice: null },
    { symbol: 'AAPL 270C', assetClass: 'options', name: 'AAPL call option (per contract)', manualPrice: 410 },
  ];

  const q = (symbol: string, price: number, change: number): Quote => ({
    symbol,
    price,
    change,
    changePct: (change / (price - change)) * 100,
    prevClose: price - change,
    quoteTime: now.toISOString(),
    fetchedAt: now.toISOString(),
  });
  const quotes: Record<string, Quote> = {
    VTI: q('VTI', 368.4, 1.92),
    VXUS: q('VXUS', 75.1, -0.21),
    BND: q('BND', 74.9, 0.06),
    MSFT: q('MSFT', 512.3, 3.4),
    AAPL: q('AAPL', 262.8, -1.15),
  };

  const balances: BalanceItem[] = [
    { id: 'b1', kind: 'asset', name: 'Emergency fund (HYSA)', amount: 18000 },
    { id: 'b2', kind: 'asset', name: 'Checking', amount: 4200 },
    { id: 'b3', kind: 'asset', name: 'Vehicle', amount: 14000 },
    { id: 'b4', kind: 'liability', name: 'Auto loan', amount: 9800 },
    { id: 'b5', kind: 'liability', name: 'Student loans', amount: 16500 },
  ];

  // Month-end snapshots reconstructed from the sample prices.
  const snapshots: Snapshot[] = [];
  const other = 18000 + 4200 + 14000 - 9800 - 16500;
  for (let k = 0; k < months; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - k), 1);
    const upto = tx.filter((t) => t.date <= iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    let cash = 0;
    let contrib = 0;
    const qtyBy: Record<string, number> = {};
    for (const t of upto) {
      if (t.type === 'deposit') (cash += t.amount), (contrib += t.amount);
      if (t.type === 'dividend') cash += t.amount;
      if (t.type === 'buy') (cash -= t.amount), (qtyBy[t.symbol!] = (qtyBy[t.symbol!] ?? 0) + (t.quantity ?? 0));
    }
    let mv = 0;
    for (const [s, n] of Object.entries(qtyBy)) {
      const p = prices[s]?.[k] ?? (s === 'MSFT' ? 410 + k * 3 : s === 'AAPL' ? 190 + k * 2 : 310);
      mv += n * p;
    }
    const portfolio = mv + cash;
    snapshots.push({ month: iso(d), netWorth: portfolio + other, portfolio, contributions: contrib });
  }

  settings.targetPath = {
    startMonth: snapshots[0].month.slice(0, 7),
    startValue: 25000,
    monthly: 1900,
    rate: 0.08,
    contribGrowth: 0.03,
  };

  return { settings, positions, transactions: tx, balances, snapshots, quotes };
}
