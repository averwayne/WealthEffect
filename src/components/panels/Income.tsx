import { pct, usd } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import { NumField, Panel } from '../ui';

export function Income() {
  const m = useM();
  const { settings, summary } = m;
  const p50At = (age: number) => {
    const y = Math.max(0, age - m.age);
    const row = m.mc?.years[Math.min(y, (m.mc?.years.length ?? 1) - 1)];
    return row ? { nominal: row.p50, years: y } : null;
  };

  const rows: { label: string; balance: number | null; years: number }[] = [
    { label: 'Today', balance: Math.max(0, summary.portfolio), years: 0 },
    { label: `At goal · age ${settings.goalAge}`, balance: p50At(settings.goalAge)?.nominal ?? null, years: Math.max(0, settings.goalAge - m.age) },
    { label: `At age ${settings.incomeAge}`, balance: p50At(settings.incomeAge)?.nominal ?? null, years: Math.max(0, settings.incomeAge - m.age) },
  ];

  const rf = m.riskFree;
  const swr = settings.withdrawalRate;
  const tbillAsOf = m.s.market.tbill?.date;

  return (
    <Panel n="06" title="Income" meta="Monthly, from portfolio">
      <div className="pb">
        <table className="t">
          <thead>
            <tr>
              <th>Balance at</th>
              <th>Median balance</th>
              <th>Risk-free</th>
              <th>{pct(swr, 1)} rule</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = m.deflator(r.years);
              const bal = r.balance == null ? null : r.balance / d;
              const covers = bal != null && m.expensesTotal > 0 ? (bal * swr) / 12 / m.expensesTotal : null;
              return (
                <tr key={r.label}>
                  <td style={{ fontFamily: 'var(--sans)', fontSize: 12.5 }}>{r.label}</td>
                  <td>{bal == null ? <span className="skeleton" style={{ display: 'inline-block', width: 60 }} /> : usd(bal)}</td>
                  <td>{bal == null ? '—' : usd((bal * rf) / 12)}</td>
                  <td title={covers != null ? `Covers ${Math.round(covers * 100)}% of current monthly expenses` : ''}>
                    {bal == null ? '—' : usd((bal * swr) / 12)}
                    {covers != null && <span className={covers >= 1 ? 'pos' : 'muted'} style={{ fontSize: 10 }}> {Math.min(999, Math.round(covers * 100))}%</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="kv" style={{ marginTop: 6 }}>
          <span className="k">
            Risk-free rate <span className="muted">· 3-month T-bill</span>
          </span>
          <span className="v">
            {pct(rf, 2)}{' '}
            <span className="muted" style={{ fontSize: 10 }}>
              {m.riskFreeSource === 'live' ? `FRED ${tbillAsOf}` : m.riskFreeSource === 'override' ? 'custom' : 'long-run avg'}
            </span>
          </span>
        </div>
        <div className="kv">
          <span className="k">Withdrawal rate</span>
          <NumField kind="pct" decimals={1} value={swr} onChange={(v) => m.s.updateSettings({ withdrawalRate: Math.max(0.01, v ?? 0.04) })} width={70} ariaLabel="Withdrawal rate" />
        </div>
        <div className="kv">
          <span className="k">Show income at age</span>
          <NumField kind="int" value={settings.incomeAge} onChange={(v) => m.s.updateSettings({ incomeAge: Math.max(m.age + 1, Math.min(100, v ?? 65)) })} width={56} ariaLabel="Income age" />
        </div>
        <p className="note" style={{ margin: '6px 0 0' }}>
          Risk-free: interest only, principal intact. {pct(swr, 1)} rule: inflation-adjusted withdrawals historically sustainable for ~30 years. % = share of current expenses covered.{' '}
          {settings.realDollars ? 'Today’s dollars.' : 'Future dollars.'}
        </p>
      </div>
    </Panel>
  );
}
