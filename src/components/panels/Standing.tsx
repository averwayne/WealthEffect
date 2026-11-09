import { SCF_BANDS, SCF_YEAR } from '../../data/scf2025';
import { ordinal, pct, usd, usdc } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import { ageBand, percentileOf, TIERS, tierOf, valueAtPercentile } from '../../lib/standing';
import { Panel } from '../ui';

export function Standing() {
  const m = useM();
  const { summary, settings } = m;
  const band = m.band;
  const p = m.percentile;
  const tier = tierOf(p);
  const nextTier = TIERS[TIERS.indexOf(tier) + 1];
  const nextValue = nextTier ? valueAtPercentile(nextTier.min, band) : null;
  const gap = nextValue != null ? Math.max(0, nextValue - summary.netWorth) : null;
  const allAges = percentileOf(summary.netWorth, 'all');
  const otherNet = summary.otherAssets - summary.liabilities;

  // Year the median projection (in today's dollars) first crosses the next tier for the age band at that time.
  let reachYear: number | null = null;
  if (nextTier && m.mc) {
    for (const r of m.mc.years) {
      if (r.year === 0) continue;
      const nw = r.p50 / Math.pow(1 + settings.inflation, r.year) + otherNet;
      const b = ageBand(m.age + r.year);
      if (nw >= valueAtPercentile(nextTier.min, b)) {
        reachYear = new Date().getFullYear() + r.year;
        break;
      }
    }
  }

  const fnPct = m.freedomNumber > 0 ? summary.portfolio / m.freedomNumber : 0;

  return (
    <Panel n="07" title="Standing" className="fill" meta={`Fed SCF ${SCF_YEAR} · ${SCF_BANDS[band].label}`}>
      <div className="pb" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="label">Net worth percentile, age {m.age}</div>
            <div className="figure">
              {ordinal(p)} <span style={{ fontSize: 15, color: 'var(--muted)' }}>percentile</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="label">Tier</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--wine)' }}>
              {tier.label}
            </div>
          </div>
        </div>

        <div>
          <div className="bar" style={{ height: 8 }}>
            <i style={{ width: `${p}%` }} />
            {TIERS.slice(1).map((t) => (
              <span key={t.key} style={{ position: 'absolute', left: `${t.min}%`, top: -2, bottom: -2, width: 1, background: 'var(--paper)' }} />
            ))}
          </div>
          <div className="mono muted" style={{ position: 'relative', height: 14, fontSize: 9.5, marginTop: 3 }}>
            {[25, 50, 75, 90, 99].map((v) => (
              <span key={v} style={{ position: 'absolute', left: `${v}%`, transform: 'translateX(-50%)' }}>
                P{v}
              </span>
            ))}
          </div>
        </div>

        <table className="t">
          <thead>
            <tr>
              <th>Threshold ({SCF_BANDS[band].label})</th>
              <th>Net worth</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {[25, 50, 75, 90, 99].map((q) => {
              const v = valueAtPercentile(q, band);
              const isNext = nextTier?.min === q;
              return (
                <tr key={q} style={isNext ? { background: 'var(--wine-soft)' } : undefined}>
                  <td>
                    P{q}
                    {q === 50 ? ' · median' : ''}
                    {isNext ? <span className="wine"> · next</span> : ''}
                  </td>
                  <td>{usd(v)}</td>
                  <td className={summary.netWorth >= v ? 'pos' : 'muted'}>{summary.netWorth >= v ? '✓' : usdc(v - summary.netWorth)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="stats">
          <div className="stat">
            <div className="label">To next tier</div>
            <div className="v">{gap != null ? usdc(gap) : '—'}</div>
          </div>
          <div className="stat">
            <div className="label">Est. year</div>
            <div className="v">{nextTier ? (reachYear ?? (m.mc ? '—' : '…')) : 'Top'}</div>
          </div>
          <div className="stat">
            <div className="label">All ages</div>
            <div className="v">{ordinal(allAges)}</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="label">Freedom number</span>
            <span className="mono" style={{ fontSize: 15 }}>
              {usd(m.freedomNumber)}
            </span>
          </div>
          <div className="bar" style={{ marginTop: 6 }}>
            <i style={{ width: `${Math.min(100, fnPct * 100)}%`, background: 'var(--wine)' }} />
          </div>
          <div className="note" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {usd(m.expensesTotal * 12)}/yr ÷ {pct(settings.withdrawalRate, 1)} withdrawal
            </span>
            <span className="mono">{pct(fnPct, 1)} complete</span>
          </div>
        </div>
        <p className="note" style={{ margin: 0 }}>
          Net worth {usd(summary.netWorth)} = portfolio {usdc(summary.portfolio)} + other assets {usdc(summary.otherAssets)} − liabilities {usdc(summary.liabilities)}. Percentiles computed from Federal Reserve Survey of Consumer Finances {SCF_YEAR} microdata.
        </p>
      </div>
    </Panel>
  );
}
