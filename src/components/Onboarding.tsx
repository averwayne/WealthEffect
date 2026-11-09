import { useState } from 'react';
import { pct, usd } from '../lib/format';
import { portfolioStats } from '../lib/montecarlo';
import { useStore } from '../lib/store';
import { ASSET_CLASSES, CLASS_LABEL, type AssetClass, type Transaction } from '../lib/types';
import { NumField, Seg } from './ui';

const STEPS = ['About you', 'Investments', 'Balance sheet', 'Goal & allocation'];

interface HoldingRow {
  symbol: string;
  cls: AssetClass;
  qty: number | null;
  cost: number | null;
}

interface BalRow {
  kind: 'asset' | 'liability';
  name: string;
  amount: number | null;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Onboarding() {
  const s = useStore();
  const st = s.settings;
  const up = s.updateSettings;
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<HoldingRow[]>([{ symbol: '', cls: 'index', qty: null, cost: null }]);
  const [cash, setCash] = useState<number | null>(null);
  const [bals, setBals] = useState<BalRow[]>([
    { kind: 'asset', name: 'Savings', amount: null },
    { kind: 'liability', name: 'Loans', amount: null },
  ]);
  const [busy, setBusy] = useState(false);
  const age = new Date().getFullYear() - st.birthYear;
  const expenses = st.expenses.reduce((a, e) => a + e.amount, 0);
  const stats = portfolioStats(st.targetAlloc, st.assumptions, st.feeRate);
  const allocTotal = ASSET_CLASSES.reduce((a, c) => a + (st.targetAlloc[c] || 0), 0);

  const finish = async () => {
    setBusy(true);
    try {
      const date = today();
      const tx: Omit<Transaction, 'id'>[] = [];
      let start = 0;
      for (const r of rows) {
        const sym = r.symbol.trim().toUpperCase();
        if (!sym || !r.qty || !r.cost) continue;
        const amount = +(r.qty * r.cost).toFixed(2);
        start += amount;
        await s.upsertPosition({ symbol: sym, assetClass: r.cls, name: null, manualPrice: null });
        tx.push({ date, type: 'deposit', symbol: null, quantity: null, price: null, amount, note: 'Opening balance' });
        tx.push({ date, type: 'buy', symbol: sym, quantity: r.qty, price: r.cost, amount, note: 'Opening position (cost basis)' });
      }
      if (cash && cash > 0) {
        start += cash;
        tx.push({ date, type: 'deposit', symbol: null, quantity: null, price: null, amount: cash, note: 'Opening cash' });
      }
      await s.addTransactions(tx);
      for (const b of bals) if (b.name.trim() && b.amount) await s.addBalance({ kind: b.kind, name: b.name.trim(), amount: b.amount });
      const ym = date.slice(0, 7);
      up({
        targetPath: { startMonth: ym, startValue: start, monthly: st.monthlyInvest, rate: stats.geo, contribGrowth: st.contribGrowth },
        calc: { ...st.calc, linked: true },
      });
      await s.completeOnboarding();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing" style={{ gridTemplateRows: 'auto 1fr' }}>
      <header className="masthead">
        <span className="label">Set up your plan</span>
        <div className="brand">Wealth Effect</div>
        <span style={{ justifySelf: 'end' }}>
          <button className="navbtn" onClick={() => s.signOut()}>
            Sign out
          </button>
        </span>
      </header>
      <div className="wizard">
        <div className="steps">
          {STEPS.map((t, i) => (
            <div key={t} className={i === step ? 'on' : i < step ? 'done' : ''}>
              {String(i + 1).padStart(2, '0')} — {t}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="section">
            <h4>About you</h4>
            <div className="formgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <label>
                <span className="label">Name (optional)</span>
                <input className="textin" value={st.displayName} onChange={(e) => up({ displayName: e.target.value })} />
              </label>
              <label>
                <span className="label">Birth year</span>
                <NumField kind="int" value={st.birthYear} onChange={(v) => up({ birthYear: Math.max(1920, Math.min(new Date().getFullYear() - 16, v ?? 1990)) })} ariaLabel="Birth year" />
              </label>
              <label>
                <span className="label">Monthly take-home pay</span>
                <NumField kind="usd" value={st.takeHome} onChange={(v) => up({ takeHome: v ?? 0 })} min={0} ariaLabel="Take-home pay" />
              </label>
            </div>
            <h4 style={{ marginTop: 22 }}>Monthly expenses</h4>
            <div className="formgrid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {st.expenses.map((e, i) => (
                <label key={i}>
                  <span className="label">{e.name}</span>
                  <NumField kind="usd" value={e.amount} onChange={(v) => up({ expenses: st.expenses.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)) })} min={0} ariaLabel={e.name} />
                </label>
              ))}
            </div>
            <div className="formgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 18 }}>
              <label>
                <span className="label">Amount to invest each month</span>
                <NumField kind="usd" value={st.monthlyInvest} onChange={(v) => up({ monthlyInvest: v ?? 0 })} min={0} ariaLabel="Monthly investment" />
              </label>
              <label>
                <span className="label">Increase each year</span>
                <NumField kind="pct" value={st.contribGrowth} onChange={(v) => up({ contribGrowth: v ?? 0 })} min={0} max={0.5} ariaLabel="Annual increase" />
              </label>
              <div className="note" style={{ alignSelf: 'end' }}>
                Expenses {usd(expenses)} · surplus {usd(st.takeHome - expenses)} · savings rate {pct(st.takeHome ? st.monthlyInvest / st.takeHome : 0)}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="section">
            <h4>Current investments</h4>
            <p className="note">Enter what you hold today at your average cost. Live prices take over once saved. You can add full trade history later under Activity.</p>
            <table className="t">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Asset class</th>
                  <th>Quantity</th>
                  <th>Avg cost</th>
                  <th>Cost basis</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const set = (p: Partial<HoldingRow>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  return (
                    <tr key={i}>
                      <td>
                        <input className="textin mono" value={r.symbol} placeholder="VTI" onChange={(e) => set({ symbol: e.target.value.toUpperCase() })} aria-label="Symbol" />
                      </td>
                      <td>
                        <select className="select" value={r.cls} onChange={(e) => set({ cls: e.target.value as AssetClass })}>
                          {ASSET_CLASSES.filter((c) => c !== 'cash').map((c) => (
                            <option key={c} value={c}>
                              {CLASS_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <NumField value={r.qty} onChange={(v) => set({ qty: v })} min={0} width={90} ariaLabel="Quantity" />
                      </td>
                      <td>
                        <NumField kind="usd" decimals={2} value={r.cost} onChange={(v) => set({ cost: v })} min={0} width={100} ariaLabel="Average cost" />
                      </td>
                      <td>{r.qty && r.cost ? usd(r.qty * r.cost) : '—'}</td>
                      <td>
                        <button className="xbtn" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove row">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setRows([...rows, { symbol: '', cls: 'stocks', qty: null, cost: null }])}>
              + Add holding
            </button>
            <div className="formgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 18 }}>
              <label>
                <span className="label">Uninvested cash in brokerage</span>
                <NumField kind="usd" value={cash} onChange={setCash} min={0} ariaLabel="Brokerage cash" />
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="section">
            <h4>Other assets &amp; liabilities</h4>
            <p className="note">Bank accounts, property, vehicles and debts. They count toward net worth and your percentile.</p>
            <table className="t">
              <tbody>
                {bals.map((b, i) => {
                  const set = (p: Partial<BalRow>) => setBals(bals.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  return (
                    <tr key={i}>
                      <td style={{ width: 140 }}>
                        <select className="select" value={b.kind} onChange={(e) => set({ kind: e.target.value as BalRow['kind'] })}>
                          <option value="asset">Asset</option>
                          <option value="liability">Liability</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="textin" value={b.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
                      </td>
                      <td>
                        <NumField kind="usd" value={b.amount} onChange={(v) => set({ amount: v })} min={0} width={130} ariaLabel="Amount" />
                      </td>
                      <td>
                        <button className="xbtn" onClick={() => setBals(bals.filter((_, j) => j !== i))} aria-label="Remove">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setBals([...bals, { kind: 'asset', name: '', amount: null }])}>
              + Add item
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="section">
            <h4>Goal</h4>
            <div className="formgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <label>
                <span className="label">Goal type</span>
                <Seg
                  value={st.goalMode}
                  options={[
                    { value: 'freedom', label: 'Freedom number' },
                    { value: 'amount', label: 'Fixed amount' },
                  ]}
                  onChange={(v) => up({ goalMode: v })}
                />
              </label>
              <label>
                <span className="label">Amount (today’s $)</span>
                {st.goalMode === 'amount' ? (
                  <NumField kind="usd" value={st.goalAmount} onChange={(v) => up({ goalAmount: v ?? 0 })} min={0} ariaLabel="Goal amount" />
                ) : (
                  <span className="mono" style={{ padding: '2px 0' }}>
                    {usd((expenses * 12) / st.withdrawalRate)}
                  </span>
                )}
              </label>
              <label>
                <span className="label">By age (you are {age})</span>
                <NumField kind="int" value={st.goalAge} onChange={(v) => up({ goalAge: Math.max(age + 1, Math.min(100, v ?? 60)) })} ariaLabel="Goal age" />
              </label>
            </div>
            <p className="note">Freedom number: annual expenses ÷ {pct(st.withdrawalRate, 0)} withdrawal rate, the portfolio that could fund today’s spending.</p>
            <h4 style={{ marginTop: 22 }}>Target allocation</h4>
            <div className="formgrid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {ASSET_CLASSES.map((c) => (
                <label key={c}>
                  <span className="label">{CLASS_LABEL[c]}</span>
                  <NumField kind="pct" decimals={0} value={st.targetAlloc[c]} onChange={(v) => up({ targetAlloc: { ...st.targetAlloc, [c]: v ?? 0 } })} min={0} max={1} ariaLabel={c} />
                </label>
              ))}
            </div>
            <p className="note">
              Total {pct(allocTotal, 0)}
              {Math.abs(allocTotal - 1) > 0.001 ? <span className="neg"> (should be 100%)</span> : null} · expected median return {pct(stats.geo, 2)} · volatility {pct(stats.vol, 1)}{' '}
              (historical averages, 1928–2025).
            </p>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--rule-strong)', paddingTop: 16 }}>
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          {step < 3 ? (
            <button className="btn" onClick={() => setStep(step + 1)}>
              Continue
            </button>
          ) : (
            <button className="btn" disabled={busy} onClick={finish}>
              {busy ? 'Building your plan…' : 'Open dashboard'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
