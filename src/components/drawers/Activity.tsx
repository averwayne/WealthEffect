import { useEffect, useMemo, useRef, useState } from 'react';
import { qty, usd } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import { callApi } from '../../lib/supabase';
import { ASSET_CLASSES, CLASS_LABEL, CLASS_SHORT, type AssetClass, type TxType } from '../../lib/types';
import { Drawer, NumField } from '../ui';

const TYPES: { value: TxType; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'dividend', label: 'Dividend / interest' },
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function classFromType(t: string): AssetClass {
  const s = t.toLowerCase();
  if (s.includes('etp') || s.includes('etf') || s.includes('fund')) return 'index';
  if (s.includes('bond')) return 'bonds';
  return 'stocks';
}

function SymbolInput({
  value,
  onChange,
  onPick,
  searchable,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (r: { symbol: string; name: string; type: string }) => void;
  searchable: boolean;
}) {
  const [results, setResults] = useState<{ symbol: string; name: string; type: string }[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!searchable || value.length < 1) {
      setResults([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await callApi<{ results: { symbol: string; name: string; type: string }[] }>('search', { q: value });
        setResults(r.results ?? []);
      } catch {
        setResults([]);
      }
    }, 300);
  }, [value, searchable]);
  return (
    <span style={{ position: 'relative' }}>
      <input
        className="textin mono"
        value={value}
        placeholder="e.g. VTI"
        aria-label="Symbol"
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div className="suggest">
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(r);
                setOpen(false);
              }}
            >
              <b className="mono">{r.symbol}</b>
              <span className="muted">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function Activity({ onClose }: { onClose: () => void }) {
  const m = useM();
  const s = m.s;
  const [type, setType] = useState<TxType>('buy');
  const [date, setDate] = useState(today());
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [cls, setCls] = useState<AssetClass>('index');
  const [q, setQ] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [fund, setFund] = useState(true);
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const needsSymbol = type === 'buy' || type === 'sell' || type === 'dividend';
  const tradeLike = type === 'buy' || type === 'sell';
  const knownPos = s.positions.find((p) => p.symbol === symbol);
  const computed = tradeLike && q != null && price != null ? +(q * price).toFixed(2) : null;
  const finalAmount = computed ?? amount;
  const valid = !!date && finalAmount != null && finalAmount > 0 && (!needsSymbol || symbol.trim().length > 0) && (!tradeLike || (q ?? 0) > 0);

  useEffect(() => {
    if (knownPos) setCls(knownPos.assetClass);
  }, [knownPos]);

  const submit = async () => {
    if (!valid) return;
    const sym = symbol.trim().toUpperCase() || null;
    const list = [] as Parameters<typeof s.addTransactions>[0];
    if (type === 'buy' && fund) list.push({ date, type: 'deposit', symbol: null, quantity: null, price: null, amount: finalAmount!, note: `Funding for ${sym}` });
    list.push({ date, type, symbol: needsSymbol ? sym : null, quantity: tradeLike ? q : null, price: tradeLike ? price : null, amount: finalAmount!, note: note || null });
    if (sym && tradeLike && (!knownPos || knownPos.assetClass !== cls)) {
      await s.upsertPosition({ symbol: sym, assetClass: cls, name: name ?? knownPos?.name ?? null, manualPrice: knownPos?.manualPrice ?? null });
    }
    await s.addTransactions(list);
    setMsg(`Recorded ${TYPES.find((t) => t.value === type)!.label.toLowerCase()}${sym ? ` · ${sym}` : ''} · ${usd(finalAmount, true)}`);
    setQ(null);
    setPrice(null);
    setAmount(null);
    setNote('');
    if (type !== 'dividend') {
      setSymbol('');
      setName(null);
    }
  };

  const tx = useMemo(() => [...s.transactions].reverse(), [s.transactions]);
  const shown = showAll ? tx : tx.slice(0, 40);

  return (
    <Drawer title="Activity" onClose={onClose}>
      <div className="section">
        <h4>Record</h4>
        <div className="formgrid">
          <label>
            <span className="label">Type</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as TxType)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Date</span>
            <input className="textin mono" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
          {needsSymbol && (
            <label>
              <span className="label">Symbol</span>
              <SymbolInput
                value={symbol}
                searchable={s.mode === 'cloud'}
                onChange={(v) => {
                  setSymbol(v);
                  setName(null);
                }}
                onPick={(r) => {
                  setSymbol(r.symbol);
                  setName(r.name);
                  if (!s.positions.find((p) => p.symbol === r.symbol)) setCls(classFromType(r.type));
                }}
              />
            </label>
          )}
          {tradeLike && (
            <label>
              <span className="label">Asset class</span>
              <select className="select" value={cls} onChange={(e) => setCls(e.target.value as AssetClass)}>
                {ASSET_CLASSES.filter((c) => c !== 'cash').map((c) => (
                  <option key={c} value={c}>
                    {CLASS_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tradeLike && (
            <label>
              <span className="label">{cls === 'options' ? 'Contracts' : 'Quantity'}</span>
              <NumField value={q} onChange={setQ} min={0} ariaLabel="Quantity" />
            </label>
          )}
          {tradeLike && (
            <label>
              <span className="label">{cls === 'options' ? 'Price per contract' : 'Price'}</span>
              <NumField kind="usd" decimals={2} value={price} onChange={setPrice} min={0} ariaLabel="Price" />
            </label>
          )}
          <label>
            <span className="label">Amount</span>
            {tradeLike ? <span className="mono" style={{ padding: '2px 0' }}>{usd(computed, true)}</span> : <NumField kind="usd" decimals={2} value={amount} onChange={setAmount} min={0} ariaLabel="Amount" />}
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            <span className="label">Note</span>
            <input className="textin" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <button className="btn" disabled={!valid} onClick={submit}>
            Record
          </button>
          {type === 'buy' && (
            <label className="note" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={fund} onChange={(e) => setFund(e.target.checked)} />
              Funded with new money (also records a deposit)
            </label>
          )}
          {msg && <span className="note pos">{msg}</span>}
        </div>
        <p className="note">
          Deposits and withdrawals are money moving in or out of your portfolio; they drive contributions and your personal return. Buys spend portfolio cash,
          sells and dividends add to it. {cls === 'options' && tradeLike ? 'Options are priced per contract; update their value under Positions.' : ''}
        </p>
      </div>

      <div className="section">
        <h4>Positions</h4>
        {s.positions.length === 0 ? (
          <div className="empty">Positions appear after your first buy.</div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Class</th>
                <th>Live price</th>
                <th>Manual price</th>
              </tr>
            </thead>
            <tbody>
              {[...s.positions]
                .sort((a, b) => a.symbol.localeCompare(b.symbol))
                .map((p) => (
                  <tr key={p.symbol}>
                    <td>
                      <b>{p.symbol}</b> <span className="muted" style={{ fontFamily: 'var(--sans)' }}>{p.name}</span>
                    </td>
                    <td>
                      <select className="select" value={p.assetClass} onChange={(e) => s.upsertPosition({ ...p, assetClass: e.target.value as AssetClass })}>
                        {ASSET_CLASSES.filter((c) => c !== 'cash').map((c) => (
                          <option key={c} value={c}>
                            {CLASS_SHORT[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{s.quotes[p.symbol] ? usd(s.quotes[p.symbol].price, true) : <span className="muted">none</span>}</td>
                    <td>
                      <NumField kind="usd" decimals={2} value={p.manualPrice} onChange={(v) => s.upsertPosition({ ...p, manualPrice: v })} width={100} placeholder="—" ariaLabel={`${p.symbol} manual price`} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        <p className="note">A live price always takes precedence. Use a manual price for options, bonds, private holdings or anything the price feed doesn’t cover.</p>
      </div>

      <div className="section">
        <h4>Other assets &amp; liabilities</h4>
        <BalanceSheet />
      </div>

      <div className="section">
        <h4>
          Transactions <span className="muted">({s.transactions.length})</span>
        </h4>
        {tx.length === 0 ? (
          <div className="empty">No transactions yet.</div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} title={t.note ?? ''}>
                  <td>{t.date}</td>
                  <td style={{ textTransform: 'capitalize', textAlign: 'left' }}>{t.type}</td>
                  <td>{t.symbol ?? ''}</td>
                  <td>{t.quantity != null ? qty(t.quantity) : ''}</td>
                  <td>{t.price != null ? usd(t.price, true) : ''}</td>
                  <td className={t.type === 'withdrawal' || t.type === 'buy' ? '' : 'pos'}>{usd(t.amount, true)}</td>
                  <td>
                    <button className="xbtn" aria-label="Delete transaction" onClick={() => confirm('Delete this transaction?') && s.deleteTransaction(t.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tx.length > 40 && !showAll && (
          <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>
            Show all {tx.length}
          </button>
        )}
      </div>
    </Drawer>
  );
}

function BalanceSheet() {
  const m = useM();
  const s = m.s;
  const [kind, setKind] = useState<'asset' | 'liability'>('asset');
  const [name, setName] = useState('');
  const [amt, setAmt] = useState<number | null>(null);
  return (
    <>
      <table className="t">
        <thead>
          <tr>
            <th>Item</th>
            <th>Type</th>
            <th>Balance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.balances.map((b) => (
            <tr key={b.id}>
              <td>
                <BlurText value={b.name} onCommit={(v) => v !== b.name && s.updateBalance({ ...b, name: v })} />
              </td>
              <td className={b.kind === 'liability' ? 'neg' : ''}>{b.kind === 'asset' ? 'Asset' : 'Liability'}</td>
              <td>
                <NumField kind="usd" value={b.amount} onChange={(v) => s.updateBalance({ ...b, amount: v ?? 0 })} width={110} min={0} ariaLabel={`${b.name} balance`} />
              </td>
              <td>
                <button className="xbtn" aria-label={`Remove ${b.name}`} onClick={() => s.deleteBalance(b.id)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>Net of other items</td>
            <td />
            <td>{usd(m.summary.otherAssets - m.summary.liabilities)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginTop: 10 }}>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'asset' | 'liability')} aria-label="Kind">
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
        </select>
        <input className="textin" placeholder={kind === 'asset' ? 'e.g. Savings account, home equity' : 'e.g. Mortgage, car loan'} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <NumField kind="usd" value={amt} onChange={setAmt} width={120} min={0} placeholder="0" ariaLabel="Balance" />
        <button
          className="btn ghost"
          disabled={!name.trim() || amt == null}
          onClick={async () => {
            await s.addBalance({ kind, name: name.trim(), amount: amt ?? 0 });
            setName('');
            setAmt(null);
          }}
        >
          Add
        </button>
      </div>
      <p className="note">Bank cash, property, vehicles and debts. These count toward net worth and your percentile, not toward the investment projection.</p>
    </>
  );
}

function BlurText({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="textin"
      style={{ border: 0 }}
      value={v}
      aria-label="Item name"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v.trim() || value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
