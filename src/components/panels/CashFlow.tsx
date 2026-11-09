import { pct, usd } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import { NumField, Panel } from '../ui';

export function CashFlow() {
  const m = useM();
  const { settings } = m;
  const update = m.s.updateSettings;
  const unallocated = m.surplus - settings.monthlyInvest;
  const setExpense = (i: number, patch: Partial<{ name: string; amount: number }>) =>
    update({ expenses: settings.expenses.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  return (
    <Panel n="01" title="Cash Flow" meta="Monthly">
      <div className="pb" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <div>
          <div className="kv">
            <span className="k">Take-home pay</span>
            <NumField kind="usd" value={settings.takeHome} onChange={(v) => update({ takeHome: v ?? 0 })} width={96} min={0} ariaLabel="Take-home pay" />
          </div>
          {settings.expenses.map((e, i) => (
            <div className="kv" key={i}>
              <span className="k" style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                <input
                  className="textin"
                  value={e.name}
                  aria-label="Expense name"
                  onChange={(ev) => setExpense(i, { name: ev.target.value })}
                  style={{ border: 0, padding: 0, fontSize: 13 }}
                />
                <button className="xbtn" title="Remove" aria-label={`Remove ${e.name}`} onClick={() => update({ expenses: settings.expenses.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </span>
              <NumField kind="usd" value={e.amount} onChange={(v) => setExpense(i, { amount: v ?? 0 })} width={96} min={0} ariaLabel={`${e.name} amount`} />
            </div>
          ))}
          <div style={{ paddingTop: 4 }}>
            <button className="linkbtn" onClick={() => update({ expenses: [...settings.expenses, { name: 'New expense', amount: 0 }] })}>
              + Add expense
            </button>
          </div>
        </div>
        <div>
          <div className="kv">
            <span className="k">Expenses</span>
            <span className="v">{usd(m.expensesTotal)}</span>
          </div>
          <div className="kv">
            <span className="k">Surplus</span>
            <span className={`v ${m.surplus < 0 ? 'neg' : ''}`}>{usd(m.surplus)}</span>
          </div>
          <div className="kv">
            <span className="k" style={{ fontWeight: 600 }}>
              Monthly investment
            </span>
            <NumField kind="usd" value={settings.monthlyInvest} onChange={(v) => update({ monthlyInvest: v ?? 0 })} width={96} min={0} ariaLabel="Monthly investment" />
          </div>
          <div className="kv">
            <span className="k">Unallocated</span>
            <span className={`v ${unallocated < 0 ? 'neg' : 'muted'}`}>{usd(unallocated)}</span>
          </div>
          <div className="kv">
            <span className="k">Annual increase</span>
            <NumField kind="pct" value={settings.contribGrowth} onChange={(v) => update({ contribGrowth: v ?? 0 })} width={72} min={0} max={0.5} ariaLabel="Annual contribution increase" />
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label">Savings rate</span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {pct(m.savingsRate)}
              </span>
            </div>
            <div className="bar" title="Share of take-home pay invested">
              <i style={{ width: `${Math.min(100, m.savingsRate * 100)}%` }} />
            </div>
            {unallocated < 0 && (
              <p className="note neg" style={{ margin: '6px 0 0' }}>
                Investment exceeds surplus by {usd(-unallocated)}.
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
