import { create } from 'zustand';
import { demoData } from './demo';
import { hydrateSettings } from './defaults';
import { monthKey } from './format';
import { summarize } from './portfolio';
import { callApi, supabase } from './supabase';
import type { BalanceItem, MarketData, Position, Quote, Settings, Snapshot, Transaction } from './types';

type Mode = 'loading' | 'signedOut' | 'demo' | 'cloud';
type FetchStatus = 'idle' | 'loading' | 'ok' | 'unconfigured' | 'error';

interface State {
  mode: Mode;
  userId: string | null;
  email: string | null;
  onboarded: boolean;
  lastCheckin: string | null;
  settings: Settings;
  positions: Position[];
  transactions: Transaction[];
  balances: BalanceItem[];
  snapshots: Snapshot[];
  quotes: Record<string, Quote>;
  quotesStatus: FetchStatus;
  quotesAt: string | null;
  market: MarketData;
  marketStatus: FetchStatus;
  saveState: 'saved' | 'saving' | 'error';
  error: string | null;

  init(): void;
  enterDemo(): void;
  signOut(): Promise<void>;
  updateSettings(patch: Partial<Settings>): void;
  completeOnboarding(): Promise<void>;
  markCheckin(): Promise<void>;
  addTransactions(tx: Omit<Transaction, 'id'>[]): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  upsertPosition(p: Position): Promise<void>;
  addBalance(b: Omit<BalanceItem, 'id'>): Promise<void>;
  updateBalance(b: BalanceItem): Promise<void>;
  deleteBalance(id: string): Promise<void>;
  refreshQuotes(force?: boolean): Promise<void>;
  refreshMarket(): Promise<void>;
  recordSnapshot(): Promise<void>;
  deleteAccount(): Promise<void>;
}

const emptyMarket: MarketData = { tbill: null, cpiYoY: null, spy: [] };

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

const rowToTx = (r: Record<string, unknown>): Transaction => ({
  id: r.id as string,
  date: r.trade_date as string,
  type: r.type as Transaction['type'],
  symbol: (r.symbol as string) ?? null,
  quantity: r.quantity == null ? null : Number(r.quantity),
  price: r.price == null ? null : Number(r.price),
  amount: Number(r.amount),
  note: (r.note as string) ?? null,
});

const txToRow = (t: Omit<Transaction, 'id'>) => ({
  trade_date: t.date,
  type: t.type,
  symbol: t.symbol ? t.symbol.toUpperCase() : null,
  quantity: t.quantity,
  price: t.price,
  amount: t.amount,
  note: t.note,
});

const fail = (set: (p: Partial<State>) => void, e: unknown) => {
  console.error(e);
  set({ saveState: 'error', error: e instanceof Error ? e.message : 'Something went wrong' });
};

export const useStore = create<State>((set, get) => ({
  mode: 'loading',
  userId: null,
  email: null,
  onboarded: false,
  lastCheckin: null,
  settings: hydrateSettings(null),
  positions: [],
  transactions: [],
  balances: [],
  snapshots: [],
  quotes: {},
  quotesStatus: 'idle',
  quotesAt: null,
  market: emptyMarket,
  marketStatus: 'idle',
  saveState: 'saved',
  error: null,

  init() {
    if (initialized) return;
    initialized = true;
    const load = async (userId: string, email: string | null) => {
      set({ mode: 'loading', userId, email });
      try {
        const [prof, pos, tx, bal, snap] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('positions').select('*'),
          supabase.from('transactions').select('*').order('trade_date'),
          supabase.from('balance_items').select('*').order('updated_at'),
          supabase.from('snapshots').select('*').order('month'),
        ]);
        for (const r of [prof, pos, tx, bal, snap]) if (r.error) throw r.error;
        if (!prof.data) await supabase.from('profiles').insert({ id: userId });
        set({
          mode: 'cloud',
          onboarded: !!prof.data?.onboarded,
          lastCheckin: prof.data?.last_checkin ?? null,
          settings: hydrateSettings(prof.data?.settings as Partial<Settings>),
          positions: (pos.data ?? []).map((r) => ({
            symbol: r.symbol,
            assetClass: r.asset_class,
            name: r.name,
            manualPrice: r.manual_price == null ? null : Number(r.manual_price),
          })),
          transactions: (tx.data ?? []).map(rowToTx),
          balances: (bal.data ?? []).map((r) => ({ id: r.id, kind: r.kind, name: r.name, amount: Number(r.amount) })),
          snapshots: (snap.data ?? []).map((r) => ({
            month: r.month,
            netWorth: Number(r.net_worth),
            portfolio: Number(r.portfolio),
            contributions: Number(r.contributions),
          })),
        });
        void get().refreshMarket();
        await get().refreshQuotes();
        void get().recordSnapshot();
      } catch (e) {
        fail(set, e);
        set({ mode: 'cloud' });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (s) void load(s.user.id, s.user.email ?? null);
      else if (get().mode === 'loading') set({ mode: 'signedOut' });
    });
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && get().userId !== session.user.id) void load(session.user.id, session.user.email ?? null);
      if (event === 'SIGNED_OUT') set({ mode: 'signedOut', userId: null, email: null });
    });
  },

  enterDemo() {
    const d = demoData();
    set({
      mode: 'demo',
      onboarded: true,
      lastCheckin: monthKey(),
      settings: d.settings,
      positions: d.positions,
      transactions: d.transactions,
      balances: d.balances,
      snapshots: d.snapshots,
      quotes: d.quotes,
      quotesStatus: 'ok',
      quotesAt: new Date().toISOString(),
      market: emptyMarket,
      marketStatus: 'unconfigured',
    });
  },

  async signOut() {
    if (get().mode === 'demo') {
      set({ mode: 'signedOut' });
      return;
    }
    await supabase.auth.signOut();
    set({ mode: 'signedOut', userId: null, email: null, transactions: [], positions: [], balances: [], snapshots: [], quotes: {} });
  },

  updateSettings(patch) {
    set({ settings: { ...get().settings, ...patch } });
    if (get().mode !== 'cloud') return;
    set({ saveState: 'saving' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ settings: get().settings, updated_at: new Date().toISOString() })
        .eq('id', get().userId!);
      if (error) fail(set, error);
      else set({ saveState: 'saved', error: null });
    }, 600);
  },

  async completeOnboarding() {
    set({ onboarded: true, lastCheckin: monthKey() });
    if (get().mode !== 'cloud') return;
    const { error } = await supabase
      .from('profiles')
      .update({ onboarded: true, last_checkin: monthKey(), settings: get().settings })
      .eq('id', get().userId!);
    if (error) fail(set, error);
    await get().refreshQuotes(true);
    await get().recordSnapshot();
  },

  async markCheckin() {
    set({ lastCheckin: monthKey() });
    if (get().mode === 'cloud') await supabase.from('profiles').update({ last_checkin: monthKey() }).eq('id', get().userId!);
  },

  async addTransactions(list) {
    if (!list.length) return;
    if (get().mode === 'demo') {
      const added = list.map((t, i) => ({ ...t, id: `n${Date.now()}${i}`, symbol: t.symbol?.toUpperCase() ?? null }));
      set({ transactions: [...get().transactions, ...added].sort((a, b) => a.date.localeCompare(b.date)) });
      return;
    }
    set({ saveState: 'saving' });
    const { data, error } = await supabase.from('transactions').insert(list.map(txToRow)).select('*');
    if (error) return fail(set, error);
    set({
      transactions: [...get().transactions, ...(data ?? []).map(rowToTx)].sort((a, b) => a.date.localeCompare(b.date)),
      saveState: 'saved',
    });
    void get().refreshQuotes();
    void get().recordSnapshot();
  },

  async deleteTransaction(id) {
    set({ transactions: get().transactions.filter((t) => t.id !== id) });
    if (get().mode !== 'cloud') return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) fail(set, error);
    void get().recordSnapshot();
  },

  async upsertPosition(p) {
    const sym = p.symbol.toUpperCase();
    const next = { ...p, symbol: sym };
    set({ positions: [...get().positions.filter((x) => x.symbol !== sym), next] });
    if (get().mode !== 'cloud') return;
    const { error } = await supabase.from('positions').upsert(
      { user_id: get().userId, symbol: sym, asset_class: p.assetClass, name: p.name, manual_price: p.manualPrice },
      { onConflict: 'user_id,symbol' },
    );
    if (error) fail(set, error);
  },

  async addBalance(b) {
    if (get().mode !== 'cloud') {
      set({ balances: [...get().balances, { ...b, id: `b${Date.now()}` }] });
      return;
    }
    const { data, error } = await supabase.from('balance_items').insert(b).select('*').single();
    if (error) return fail(set, error);
    set({ balances: [...get().balances, { id: data.id, kind: data.kind, name: data.name, amount: Number(data.amount) }] });
    void get().recordSnapshot();
  },

  async updateBalance(b) {
    set({ balances: get().balances.map((x) => (x.id === b.id ? b : x)) });
    if (get().mode !== 'cloud') return;
    const { error } = await supabase
      .from('balance_items')
      .update({ name: b.name, amount: b.amount, kind: b.kind, updated_at: new Date().toISOString() })
      .eq('id', b.id);
    if (error) fail(set, error);
    void get().recordSnapshot();
  },

  async deleteBalance(id) {
    set({ balances: get().balances.filter((x) => x.id !== id) });
    if (get().mode !== 'cloud') return;
    const { error } = await supabase.from('balance_items').delete().eq('id', id);
    if (error) fail(set, error);
  },

  async refreshQuotes() {
    if (get().mode !== 'cloud') return;
    const syms = new Set<string>(['SPY']);
    for (const t of get().transactions) if (t.symbol) syms.add(t.symbol.toUpperCase());
    const optionSyms = new Set(get().positions.filter((p) => p.assetClass === 'options').map((p) => p.symbol));
    const list = [...syms].filter((s) => !optionSyms.has(s));
    set({ quotesStatus: 'loading' });
    try {
      const res = await callApi<{ quotes: Record<string, unknown>[]; configured: boolean }>('quotes', { symbols: list });
      const quotes: Record<string, Quote> = { ...get().quotes };
      for (const r of res.quotes) {
        quotes[r.symbol as string] = {
          symbol: r.symbol as string,
          price: Number(r.price),
          change: Number(r.change ?? 0),
          changePct: Number(r.change_pct ?? 0),
          prevClose: Number(r.prev_close ?? 0),
          quoteTime: (r.quote_time as string) ?? null,
          fetchedAt: r.fetched_at as string,
        };
      }
      const latest = res.quotes.map((r) => r.fetched_at as string).sort().pop() ?? null;
      set({ quotes, quotesStatus: res.configured ? 'ok' : 'unconfigured', quotesAt: latest });
    } catch (e) {
      console.error(e);
      set({ quotesStatus: 'error' });
    }
  },

  async refreshMarket() {
    if (get().mode !== 'cloud') return;
    set({ marketStatus: 'loading' });
    try {
      const res = await callApi<MarketData & { configured: { fred: boolean; alphavantage: boolean } }>('macro');
      set({
        market: { tbill: res.tbill, cpiYoY: res.cpiYoY, spy: res.spy ?? [] },
        marketStatus: res.configured.fred || res.configured.alphavantage ? 'ok' : 'unconfigured',
      });
    } catch (e) {
      console.error(e);
      set({ marketStatus: 'error' });
    }
  },

  async recordSnapshot() {
    const s = get();
    if (s.mode !== 'cloud' || !s.onboarded) return;
    const sum = summarize(s.transactions, s.positions, s.quotes, s.balances);
    const month = `${monthKey()}-01`;
    const snap: Snapshot = { month, netWorth: sum.netWorth, portfolio: sum.portfolio, contributions: sum.netContributions };
    set({ snapshots: [...s.snapshots.filter((x) => x.month !== month), snap].sort((a, b) => a.month.localeCompare(b.month)) });
    const { error } = await supabase.from('snapshots').upsert({
      user_id: s.userId,
      month,
      net_worth: snap.netWorth,
      portfolio: snap.portfolio,
      contributions: snap.contributions,
      recorded_at: new Date().toISOString(),
    });
    if (error) console.error(error);
  },

  async deleteAccount() {
    if (get().mode !== 'cloud') return;
    await callApi('delete-account');
    await supabase.auth.signOut();
    set({ mode: 'signedOut', userId: null, email: null, transactions: [], positions: [], balances: [], snapshots: [], quotes: {} });
  },
}));
