import { ASSUMPTION_NOTES, DATA_SOURCE, DEFAULT_ASSUMPTIONS, DEFAULT_INFLATION } from '../../data/assumptions';
import { SCF_YEAR } from '../../data/scf2025';
import { pct, usd } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import { ASSET_CLASSES, CLASS_LABEL, type AssetClass } from '../../lib/types';
import { Drawer, NumField, Seg } from '../ui';

export function Assumptions({ onClose }: { onClose: () => void }) {
  const m = useM();
  const { settings } = m;
  const up = m.s.updateSettings;
  const setA = (c: AssetClass, k: 'expReturn' | 'vol', v: number) =>
    up({ assumptions: { ...settings.assumptions, [c]: { ...settings.assumptions[c], [k]: v } } });

  return (
    <Drawer title="Plan & Assumptions" onClose={onClose}>
      <div className="section">
        <h4>Goal</h4>
        <div className="formgrid">
          <label>
            <span className="label">Goal type</span>
            <Seg
              value={settings.goalMode}
              options={[
                { value: 'freedom', label: 'Freedom number' },
                { value: 'amount', label: 'Fixed amount' },
              ]}
              onChange={(v) => up({ goalMode: v })}
            />
          </label>
          <label>
            <span className="label">Goal amount (today’s $)</span>
            {settings.goalMode === 'amount' ? (
              <NumField kind="usd" value={settings.goalAmount} onChange={(v) => up({ goalAmount: v ?? 0 })} min={0} ariaLabel="Goal amount" />
            ) : (
              <span className="mono">{usd(m.freedomNumber)}</span>
            )}
          </label>
          <label>
            <span className="label">Reach it by age</span>
            <NumField kind="int" value={settings.goalAge} onChange={(v) => up({ goalAge: Math.max(m.age + 1, Math.min(100, v ?? 60)) })} ariaLabel="Goal age" />
          </label>
          <label>
            <span className="label">Birth year</span>
            <NumField kind="int" value={settings.birthYear} onChange={(v) => up({ birthYear: Math.max(1920, Math.min(new Date().getFullYear() - 16, v ?? 1990)) })} ariaLabel="Birth year" />
          </label>
        </div>
        <p className="note">
          Freedom number = annual expenses ({usd(m.expensesTotal * 12)}) ÷ withdrawal rate ({pct(settings.withdrawalRate, 1)}): the portfolio size at which withdrawals could
          cover today’s spending. Goals are stated in today’s dollars and inflated to the target year for probability calculations.
        </p>
      </div>

      <div className="section">
        <h4>Capital market assumptions</h4>
        <table className="t">
          <thead>
            <tr>
              <th>Asset class</th>
              <th>Expected return</th>
              <th>Volatility</th>
              <th style={{ textAlign: 'left', paddingLeft: 16 }}>Basis</th>
            </tr>
          </thead>
          <tbody>
            {ASSET_CLASSES.map((c) => (
              <tr key={c}>
                <td style={{ fontFamily: 'var(--sans)' }}>{CLASS_LABEL[c]}</td>
                <td>{c === 'options' ? <span className="muted">excluded</span> : <NumField kind="pct" decimals={1} value={settings.assumptions[c].expReturn} onChange={(v) => setA(c, 'expReturn', v ?? 0)} width={72} ariaLabel={`${c} return`} />}</td>
                <td>{c === 'options' ? <span className="muted">—</span> : <NumField kind="pct" decimals={1} value={settings.assumptions[c].vol} onChange={(v) => setA(c, 'vol', Math.max(0, v ?? 0))} width={72} ariaLabel={`${c} volatility`} />}</td>
                <td style={{ textAlign: 'left', paddingLeft: 16, fontFamily: 'var(--sans)', whiteSpace: 'normal' }} className="muted">
                  {ASSUMPTION_NOTES[c]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="formgrid" style={{ marginTop: 14 }}>
          <label>
            <span className="label">Annual fees (expense ratio)</span>
            <NumField kind="pct" decimals={2} value={settings.feeRate} onChange={(v) => up({ feeRate: Math.max(0, v ?? 0) })} ariaLabel="Fees" />
          </label>
          <label>
            <span className="label">Inflation</span>
            <NumField kind="pct" decimals={1} value={settings.inflation} onChange={(v) => up({ inflation: v ?? DEFAULT_INFLATION })} ariaLabel="Inflation" />
          </label>
          <label>
            <span className="label">Risk-free rate override</span>
            <NumField kind="pct" decimals={2} value={settings.riskFreeOverride} onChange={(v) => up({ riskFreeOverride: v })} placeholder="live" ariaLabel="Risk-free override" />
          </label>
          <label>
            <span className="label">&nbsp;</span>
            <button className="btn ghost" onClick={() => up({ assumptions: structuredClone(DEFAULT_ASSUMPTIONS), inflation: DEFAULT_INFLATION, feeRate: 0.001 })}>
              Reset to defaults
            </button>
          </label>
        </div>
        <p className="note">
          Expected returns are geometric (compound) averages; volatility is the annual standard deviation. Projections draw 5,000 lognormal market paths using your target
          allocation, with an equity–bond correlation of 0.02 (1928–2025) and 0.85 between index funds and individual stocks (assumption). Leave the risk-free override empty
          to use the latest 3-month T-bill rate. Inflation default: CPI, 1928–2025 geometric average ({pct(DEFAULT_INFLATION, 1)}).
        </p>
      </div>

      <div className="section">
        <h4>Target path</h4>
        {settings.targetPath ? (
          <p className="note" style={{ color: 'var(--ink-2)' }}>
            Started {settings.targetPath.startMonth} at {usd(settings.targetPath.startValue)}, contributing {usd(settings.targetPath.monthly)}/month (+
            {pct(settings.targetPath.contribGrowth, 0)}/yr) at {pct(settings.targetPath.rate, 2)}. The target path is the median expectation fixed at that moment, so you
            can measure progress against it. Re-base it from the Performance panel after a major change to your plan.
          </p>
        ) : (
          <p className="note">Not set. Set it from the Performance panel to start measuring variance.</p>
        )}
      </div>

      <div className="section">
        <h4>Sources</h4>
        <ul className="note" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
          <li>
            Historical returns: {DATA_SOURCE.name}, {DATA_SOURCE.publisher}.{' '}
            <a href={DATA_SOURCE.url} target="_blank" rel="noreferrer">
              Dataset
            </a>
          </li>
          <li>
            Net worth percentiles: Board of Governors of the Federal Reserve System, Survey of Consumer Finances {SCF_YEAR}, public summary extract (weighted percentiles by age
            of family head).{' '}
            <a href="https://www.federalreserve.gov/econres/scfindex.htm" target="_blank" rel="noreferrer">
              SCF
            </a>
          </li>
          <li>3-month T-bill (DTB3) and CPI (CPIAUCSL): Federal Reserve Bank of St. Louis, FRED.</li>
          <li>Security prices: Finnhub. S&amp;P 500 benchmark: SPY monthly adjusted closes, Alpha Vantage.</li>
          <li>Withdrawal rule: Bengen (1994), “Determining Withdrawal Rates Using Historical Data,” Journal of Financial Planning.</li>
        </ul>
      </div>
    </Drawer>
  );
}
