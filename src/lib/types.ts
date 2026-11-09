export type AssetClass = 'index' | 'stocks' | 'bonds' | 'options' | 'cash';

export const ASSET_CLASSES: AssetClass[] = ['index', 'stocks', 'bonds', 'options', 'cash'];

export const CLASS_LABEL: Record<AssetClass, string> = {
  index: 'Index funds & ETFs',
  stocks: 'Individual stocks',
  bonds: 'Bonds',
  options: 'Options',
  cash: 'Cash',
};

export const CLASS_SHORT: Record<AssetClass, string> = {
  index: 'Index/ETF',
  stocks: 'Stocks',
  bonds: 'Bonds',
  options: 'Options',
  cash: 'Cash',
};

export interface ClassAssumption {
  /** Expected long-run annual return, geometric, decimal (0.10 = 10%). */
  expReturn: number;
  /** Annual volatility (standard deviation), decimal. */
  vol: number;
}

export type Compounding = 'annually' | 'semiannually' | 'quarterly' | 'monthly' | 'daily' | 'continuously';
export type CalcTab = 'end' | 'contribution' | 'rate' | 'start' | 'length';

export interface CalcInputs {
  target: number;
  start: number;
  years: number;
  rate: number; // decimal
  compounding: Compounding;
  contribution: number;
  frequency: 'month' | 'year';
  timing: 'begin' | 'end';
  /** When true, start/contribution/rate follow the live plan (portfolio, cash flow, allocation). */
  linked: boolean;
}

export interface TargetPath {
  /** First month of the path, YYYY-MM. */
  startMonth: string;
  startValue: number;
  monthly: number;
  rate: number;
  contribGrowth: number;
}

export interface ExpenseLine {
  name: string;
  amount: number;
}

export interface Settings {
  displayName: string;
  birthYear: number;
  takeHome: number;
  expenses: ExpenseLine[];
  monthlyInvest: number;
  contribGrowth: number;
  targetAlloc: Record<AssetClass, number>;
  assumptions: Record<AssetClass, ClassAssumption>;
  feeRate: number;
  inflation: number;
  goalMode: 'amount' | 'freedom';
  goalAmount: number;
  goalAge: number;
  withdrawalRate: number;
  incomeAge: number;
  riskFreeOverride: number | null;
  realDollars: boolean;
  calcTab: CalcTab;
  calc: CalcInputs;
  chartView: 'range' | 'breakdown';
  targetPath: TargetPath | null;
}

export type TxType = 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'dividend';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  symbol: string | null;
  quantity: number | null;
  price: number | null;
  /** Cash amount, always positive. */
  amount: number;
  note: string | null;
}

export interface Position {
  symbol: string;
  assetClass: AssetClass;
  name: string | null;
  manualPrice: number | null;
}

export interface BalanceItem {
  id: string;
  kind: 'asset' | 'liability';
  name: string;
  amount: number;
}

export interface Snapshot {
  month: string; // YYYY-MM-01
  netWorth: number;
  portfolio: number;
  contributions: number;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  quoteTime: string | null;
  fetchedAt: string;
}

export interface MarketData {
  tbill: { value: number; date: string } | null;
  cpiYoY: { value: number; date: string } | null;
  spy: { date: string; close: number }[];
}
