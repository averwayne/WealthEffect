import { ASSUMPTION_NOTES } from '../../data/assumptions';
import { pct } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import { ASSET_CLASSES, CLASS_SHORT, type AssetClass } from '../../lib/types';
import { NumField, Panel } from '../ui';

const DRIFT_BAND = 0.05;

export function Allocation({ onAssumptions }: { onAssumptions: () => void }) {
  const m = useM();
  const { settings, summary } = m;
  const totalTarget = ASSET_CLASSES.reduce((s, c) => s + (settings.targetAlloc[c] || 0), 0);
  const port = summary.portfolio;
  const actual = (c: AssetClass) => (port > 0 ? summary.byClass[c] / port : 0);
  const setTarget = (c: AssetClass, v: number) => m.s.updateSettings({ targetAlloc: { ...settings.targetAlloc, [c]: v } });
  const off = Math.abs(totalTarget - 1) > 0.0005;

  return (
    <Panel
      n="02"
      title="Allocation"
      meta={
        <button className="linkbtn" onClick={onAssumptions}>
          Assumptions
        </button>
      }
    >
      <div className="pb" style={{ paddingTop: 4 }}>
        <table className="t">
          <thead>
            <tr>
              <th>Asset class</th>
              <th>Target</th>
              <th>Actual</th>
              <th>Drift</th>
              <th>Exp. ret</th>
              <th>Vol</th>
            </tr>
          </thead>
          <tbody>
            {ASSET_CLASSES.map((c) => {
              const a = actual(c);
              const drift = a - (settings.targetAlloc[c] || 0);
              const flag = port > 0 && Math.abs(drift) > DRIFT_BAND;
              const excluded = c === 'options';
              return (
                <tr key={c} title={ASSUMPTION_NOTES[c]}>
                  <td style={{ fontFamily: 'var(--sans)', fontSize: 12.5 }}>{CLASS_SHORT[c]}</td>
                  <td>
                    <NumField kind="pct" decimals={0} value={settings.targetAlloc[c]} onChange={(v) => setTarget(c, v ?? 0)} width={58} min={0} max={1} ariaLabel={`${CLASS_SHORT[c]} target`} />
                  </td>
                  <td>{port > 0 ? pct(a) : '—'}</td>
                  <td className={flag ? 'wine' : 'muted'}>{port > 0 ? `${drift >= 0 ? '+' : '−'}${Math.abs(drift * 100).toFixed(1)}` : '—'}</td>
                  <td className={excluded ? 'muted' : ''}>{excluded ? 'n/a' : pct(settings.assumptions[c].expReturn)}</td>
                  <td className={excluded ? 'muted' : ''}>{excluded ? 'n/a' : pct(settings.assumptions[c].vol)}</td>
                </tr>
              );
            })}
            <tr className="total">
              <td style={{ fontFamily: 'var(--sans)' }}>Total</td>
              <td className={off ? 'neg' : ''}>{pct(totalTarget, 0)}</td>
              <td>{port > 0 ? '100%' : '—'}</td>
              <td />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
        <div className="stats" style={{ marginTop: 8, borderTop: 0 }}>
          <div className="stat">
            <div className="label">Exp. return</div>
            <div className="v">{pct(m.stats.geo, 2)}</div>
          </div>
          <div className="stat">
            <div className="label">Volatility</div>
            <div className="v">{pct(m.stats.vol, 1)}</div>
          </div>
          <div className="stat">
            <div className="label">Real return</div>
            <div className="v">{pct((1 + m.stats.geo) / (1 + settings.inflation) - 1, 2)}</div>
          </div>
        </div>
        <p className="note" style={{ margin: '2px 0 0' }}>
          {off ? <span className="neg">Targets sum to {pct(totalTarget, 0)}; projections renormalise to 100%. </span> : null}
          Median annual return after {pct(settings.feeRate, 2)} fees. Options excluded. Drift flagged beyond ±5 pts.
        </p>
      </div>
    </Panel>
  );
}
