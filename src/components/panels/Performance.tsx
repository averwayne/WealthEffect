import { useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { monthKey, monthsBetween, signedPct, signedUsd, tone, usd, usdc } from '../../lib/format';
import { targetPathValue } from '../../lib/model';
import { useM } from '../../lib/modelContext';
import { Panel } from '../ui';

const axisStyle = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fill: '#7c7468' };

export function Performance() {
  const m = useM();
  const { settings, summary } = m;
  const tp = settings.targetPath;

  const setTargetPath = () =>
    m.s.updateSettings({
      targetPath: {
        startMonth: monthKey(),
        startValue: Math.max(0, summary.portfolio),
        monthly: settings.monthlyInvest,
        rate: m.stats.geo,
        contribGrowth: settings.contribGrowth,
      },
    });

  const data = useMemo(() => {
    const snaps = m.s.snapshots;
    const months = new Set<string>(snaps.map((s) => s.month.slice(0, 7)));
    if (tp) {
      const n = monthsBetween(tp.startMonth);
      const [y, mo] = tp.startMonth.split('-').map(Number);
      for (let k = 0; k <= n + 12; k++) {
        const d = new Date(y, mo - 1 + k, 1);
        months.add(monthKey(d));
      }
    }
    months.add(monthKey());
    return [...months].sort().map((mk) => {
      const snap = snaps.find((s) => s.month.startsWith(mk));
      const isNow = mk === monthKey();
      const actual = isNow ? summary.portfolio : snap?.portfolio;
      const contrib = isNow ? summary.netContributions : snap?.contributions;
      const target = tp && mk >= tp.startMonth ? targetPathValue(tp, monthsBetween(tp.startMonth, new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)) - 1, 1))) : undefined;
      return { x: mk, actual, contrib, target };
    });
  }, [m.s.snapshots, tp, summary.portfolio, summary.netContributions]);

  const r = m.ret;
  const b = m.bench;
  const basis = r.annualised ? '/yr' : 'cum.';

  return (
    <Panel
      n="05"
      title="Performance"
      className="fill"
      meta={
        tp ? (
          <span>
            Target path from {tp.startMonth} ·{' '}
            <button className="linkbtn" onClick={setTargetPath} title="Restart the target path from today's portfolio and plan">
              Re-base
            </button>
          </span>
        ) : (
          <button className="linkbtn" onClick={setTargetPath}>
            Set target path
          </button>
        )
      }
    >
      <div className="pb" style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingBottom: 6 }}>
        <div className="stats" style={{ borderTop: 0 }}>
          <div className="stat">
            <div className="label">Target variance</div>
            <div className={`v ${tone(m.variance)}`}>{m.variance != null ? signedUsd(m.variance, true) : '—'}</div>
          </div>
          <div className="stat">
            <div className="label">Contributions</div>
            <div className="v">{usdc(summary.netContributions)}</div>
          </div>
          <div className="stat">
            <div className="label">Market gains</div>
            <div className={`v ${tone(summary.gains)}`}>{signedUsd(summary.gains, true)}</div>
          </div>
          <div className="stat" title="Money-weighted return (XIRR) on your deposits and withdrawals">
            <div className="label">Your return</div>
            <div className={`v ${tone(r.value)}`}>
              {signedPct(r.value, 1)} <span className="muted" style={{ fontSize: 10 }}>{r.value != null ? basis : ''}</span>
            </div>
          </div>
          <div className="stat" title="Same deposits and withdrawals invested in the S&P 500 (SPY, dividends reinvested)">
            <div className="label">S&amp;P 500</div>
            <div className={`v ${tone(b?.ret.value)}`}>
              {b ? signedPct(b.ret.value, 1) : '—'} <span className="muted" style={{ fontSize: 10 }}>{b?.ret.value != null ? (b.ret.annualised ? '/yr' : 'cum.') : ''}</span>
            </div>
          </div>
        </div>
        <div className="chart-perf">
          {data.length < 2 ? (
            <div className="empty" style={{ marginTop: 8 }}>
              History builds automatically each month. Your first snapshot is recorded today.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e3d9cb" vertical={false} />
                <XAxis dataKey="x" tick={axisStyle} tickLine={false} axisLine={{ stroke: '#b9ac99' }} minTickGap={36} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => usdc(v)} width={56} />
                <Tooltip
                  contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 11, background: '#f8f3ec', border: '1px solid #1b1915', borderRadius: 0 }}
                  formatter={(v: unknown, name?: unknown) => [usd(v as number), name === 'actual' ? 'Portfolio' : name === 'target' ? 'Target path' : 'Contributions']}
                />
                <Line dataKey="contrib" stroke="#b9ac99" strokeWidth={1} dot={false} isAnimationActive={false} connectNulls />
                <Line dataKey="target" stroke="var(--wine)" strokeWidth={1.25} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line dataKey="actual" stroke="var(--ink)" strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="legend" style={{ marginTop: 4 }}>
          <span><i style={{ background: 'var(--ink)' }} />Portfolio</span>
          <span><i style={{ background: 'var(--wine)' }} />Target path</span>
          <span><i style={{ background: '#b9ac99' }} />Net contributions</span>
          <span style={{ marginLeft: 'auto' }}>
            {r.since ? `Since ${r.since}` : ''}
            {!b && m.s.mode === 'cloud' ? ' · Benchmark pending market data' : ''}
          </span>
        </div>
      </div>
    </Panel>
  );
}
