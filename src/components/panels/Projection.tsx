import { useMemo } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { simulate, solveContribution, solveLength, solveRate, solveStart } from '../../lib/calc';
import { monthsToText, pct, usd, usdc } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import type { CalcInputs, CalcTab, Compounding } from '../../lib/types';
import { NumField, Panel, Seg } from '../ui';

const TABS: { key: CalcTab; label: string }[] = [
  { key: 'end', label: 'End Amount' },
  { key: 'contribution', label: 'Contribution' },
  { key: 'rate', label: 'Return Rate' },
  { key: 'start', label: 'Starting Amount' },
  { key: 'length', label: 'Length' },
];

const COMPOUNDING: Compounding[] = ['annually', 'semiannually', 'quarterly', 'monthly', 'daily', 'continuously'];

const axisStyle = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fill: '#7c7468' };

export function Projection() {
  const m = useM();
  const { settings } = m;
  const tab = settings.calcTab;
  const c = settings.calc;
  const setCalc = (patch: Partial<CalcInputs>) => m.s.updateSettings({ calc: { ...c, ...patch } });

  // When linked, the calculator reads the live plan.
  const inp: CalcInputs = c.linked
    ? {
        ...c,
        target: m.goalNominal,
        start: Math.max(0, m.summary.portfolio),
        years: m.yearsToGoal,
        rate: m.stats.geo,
        contribution: settings.monthlyInvest,
        frequency: 'month',
        timing: 'end',
        // the plan's rate is an effective annual (geometric) return
        compounding: 'annually',
      }
    : c;

  const contribGrowth = c.linked ? settings.contribGrowth : 0;
  const args = { ...inp, contribGrowth };

  const solved = useMemo(() => {
    switch (tab) {
      case 'contribution':
        return { contribution: solveContribution(args) };
      case 'rate':
        return { rate: solveRate(args) };
      case 'start':
        return { start: solveStart(args) };
      case 'length': {
        const months = solveLength(args);
        return { months };
      }
      default:
        return {};
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, JSON.stringify(args)]);

  const eff = {
    ...args,
    ...(solved.contribution != null ? { contribution: solved.contribution } : {}),
    ...(solved.rate != null ? { rate: solved.rate } : {}),
    ...(solved.start != null ? { start: solved.start } : {}),
    ...('months' in solved ? { years: (solved.months ?? 1200) / 12 } : {}),
  };
  const sim = useMemo(() => simulate(eff), [JSON.stringify(eff)]); // eslint-disable-line react-hooks/exhaustive-deps

  const real = settings.realDollars;
  const defl = (y: number) => (real ? Math.pow(1 + settings.inflation, y) : 1);

  // Split of the ending balance, expressed in the selected dollar basis.
  const parts = useMemo(() => {
    const endV = sim.end / defl(eff.years);
    if (!real) return { end: endV, contrib: sim.totalContrib, growth: sim.totalInterest };
    const months = Math.round(eff.years * 12);
    let contrib = 0;
    for (let mo = 1; mo <= months; mo++) {
      const inYear = ((mo - 1) % 12) + 1;
      const due = eff.frequency === 'month' || (eff.timing === 'begin' ? inYear === 1 : inYear === 12 || mo === months);
      if (!due) continue;
      const c = eff.contribution * Math.pow(1 + (eff.contribGrowth ?? 0), Math.floor((mo - 1) / 12));
      contrib += c / Math.pow(1 + settings.inflation, (eff.timing === 'begin' ? mo - 1 : mo) / 12);
    }
    return { end: endV, contrib, growth: endV - eff.start - contrib };
  }, [sim, real, settings.inflation, JSON.stringify(eff)]); // eslint-disable-line react-hooks/exhaustive-deps

  const freqWord = inp.frequency === 'month' ? 'month' : 'year';
  const when = `${inp.timing === 'begin' ? 'beginning' : 'end'} of each ${freqWord}`;
  const sentence = (() => {
    switch (tab) {
      case 'contribution':
        return Number.isFinite(solved.contribution!) ? (
          <>
            Contribute <b className="pos">{usd(solved.contribution, true)}</b> at the {when} to reach {usd(inp.target)}.
          </>
        ) : (
          'Target is not reachable with these inputs.'
        );
      case 'rate':
        return Number.isFinite(solved.rate!) ? (
          <>
            You need an annual return of <b className="pos">{pct(solved.rate, 2)}</b> to reach {usd(inp.target)}.
          </>
        ) : (
          'Target is not reachable at any plausible return.'
        );
      case 'start':
        return (
          <>
            You need to start with <b className="pos">{usd(solved.start)}</b> to reach {usd(inp.target)}.
          </>
        );
      case 'length':
        return solved.months == null ? (
          'Target is not reached within 100 years.'
        ) : (
          <>
            You reach {usd(inp.target)} in <b className="pos">{monthsToText(solved.months)}</b>.
          </>
        );
      default:
        return (
          <>
            Ending balance after {inp.years} years: <b className="pos">{usd(sim.end)}</b>
            {real ? <span className="muted"> · {usd(sim.end / defl(inp.years))} in today’s dollars</span> : null}
          </>
        );
    }
  })();

  const showRange = c.linked && settings.chartView === 'range' && m.mc != null;
  const goalLine = c.linked ? m.goalToday * (real ? 1 : Math.pow(1 + settings.inflation, m.yearsToGoal)) : null;
  const thisYear = new Date().getFullYear();

  const rangeData = useMemo(() => {
    if (!m.mc) return [];
    return m.mc.years.map((r) => {
      const d = defl(r.year);
      return {
        x: thisYear + r.year,
        band: [r.p10 / d, r.p90 / d],
        inner: [r.p25 / d, r.p75 / d],
        p50: r.p50 / d,
      };
    });
  }, [m.mc, real, settings.inflation]); // eslint-disable-line react-hooks/exhaustive-deps

  const barData = sim.rows.map((r) => {
    const d = defl(r.year);
    return { x: r.year, start: r.cumStart / d, contrib: r.cumContrib / d, interest: r.cumInterest / d };
  });

  const field = (k: 'target' | 'start' | 'years' | 'rate' | 'contribution') => {
    const isOut = (tab === 'contribution' && k === 'contribution') || (tab === 'rate' && k === 'rate') || (tab === 'start' && k === 'start') || (tab === 'length' && k === 'years');
    const disabled = c.linked || isOut;
    if (k === 'rate')
      return <NumField kind="pct" decimals={2} value={isOut ? (solved.rate ?? null) : inp.rate} onChange={(v) => setCalc({ rate: v ?? 0 })} disabled={disabled} ariaLabel="Return rate" />;
    if (k === 'years')
      return (
        <NumField
          kind="num"
          decimals={1}
          suffix="yrs"
          value={isOut ? (solved.months != null ? solved.months / 12 : null) : inp.years}
          onChange={(v) => setCalc({ years: Math.max(1, Math.min(80, v ?? 1)) })}
          disabled={disabled}
          ariaLabel="Years"
        />
      );
    const val = isOut ? (k === 'contribution' ? solved.contribution : solved.start) ?? null : inp[k];
    return <NumField kind="usd" decimals={isOut && k === 'contribution' ? 2 : 0} value={val} onChange={(v) => setCalc({ [k]: v ?? 0 })} disabled={disabled} min={0} ariaLabel={k} />;
  };

  return (
    <Panel
      n="04"
      title="Projection"
      className="proj"
      meta={
        c.linked && m.mc?.probability != null ? (
          <span>
            Probability of reaching goal by age {settings.goalAge}:{' '}
            <b className={m.mc.probability >= 0.75 ? 'pos' : m.mc.probability >= 0.5 ? '' : 'neg'} style={{ fontSize: 12 }}>
              {Math.round(m.mc.probability * 100)}%
            </b>
          </span>
        ) : c.linked ? (
          'Simulating…'
        ) : (
          'Free calculator'
        )
      }
    >
      <nav className="tabs" aria-label="Solve for">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => m.s.updateSettings({ calcTab: t.key })}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="calc">
        <div className="calc-in">
          <label className="row" style={{ marginBottom: 4 }}>
            <span className="label" style={{ color: 'var(--ink)' }}>
              Use my plan
            </span>
            <span style={{ textAlign: 'right' }}>
              <Seg value={c.linked ? 'on' : 'off'} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} onChange={(v) => setCalc(v === 'on' ? { linked: true } : { ...inp, linked: false })} ariaLabel="Use my plan" />
            </span>
          </label>
          {tab !== 'end' && (
            <div className="row">
              <span>Target</span>
              {field('target')}
            </div>
          )}
          <div className="row">
            <span>Starting amount</span>
            {field('start')}
          </div>
          <div className="row">
            <span>Length</span>
            {field('years')}
          </div>
          <div className="row">
            <span>Return rate</span>
            {field('rate')}
          </div>
          <div className="row">
            <span>Compound</span>
            <select className="select" value={inp.compounding} disabled={c.linked} onChange={(e) => setCalc({ compounding: e.target.value as Compounding })}>
              {COMPOUNDING.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <span>Contribution</span>
            {field('contribution')}
          </div>
          <div className="row">
            <span>Contribute at</span>
            <span style={{ textAlign: 'right' }}>
              <Seg value={inp.timing} options={[{ value: 'begin', label: 'Begin' }, { value: 'end', label: 'End' }]} onChange={(v) => !c.linked && setCalc({ timing: v })} ariaLabel="Contribution timing" />
            </span>
          </div>
          <div className="row">
            <span>Of each</span>
            <span style={{ textAlign: 'right' }}>
              <Seg value={inp.frequency} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} onChange={(v) => !c.linked && setCalc({ frequency: v })} ariaLabel="Contribution frequency" />
            </span>
          </div>
          {c.linked && (
            <p className="note" style={{ margin: '6px 0 0' }}>
              Linked to your portfolio, cash flow ({pct(settings.contribGrowth, 0)} annual increase) and allocation. Goal {usd(m.goalToday)} in today’s dollars = {usd(m.goalNominal)} nominal at age {settings.goalAge}.
            </p>
          )}
        </div>
        <div className="calc-out">
          <div className="answer">
            <div className="sentence">{sentence}</div>
          </div>
          <div className="stats" style={{ borderTop: 0, marginBottom: 4 }}>
            <div className="stat">
              <div className="label">End balance</div>
              <div className="v">{usdc(parts.end)}</div>
            </div>
            <div className="stat">
              <div className="label">Starting</div>
              <div className="v">{usdc(eff.start)}</div>
            </div>
            <div className="stat">
              <div className="label">Contributions</div>
              <div className="v">{usdc(parts.contrib)}</div>
            </div>
            <div className="stat">
              <div className="label">Growth</div>
              <div className={`v ${parts.growth < 0 ? 'neg' : ''}`}>{usdc(parts.growth)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 2px' }}>
            {showRange ? (
              <div className="legend">
                <span><i style={{ background: 'var(--band-2)', height: 8 }} />P25–P75</span>
                <span><i style={{ background: 'var(--band)', height: 8 }} />P10–P90</span>
                <span><i style={{ background: 'var(--teal)' }} />Median</span>
                <span><i style={{ background: 'var(--wine)' }} />Goal</span>
              </div>
            ) : (
              <div className="legend">
                <span><i style={{ background: '#b9ac99', height: 8 }} />Starting</span>
                <span><i style={{ background: 'var(--teal)', height: 8 }} />Contributions</span>
                <span><i style={{ background: 'var(--wine)', height: 8 }} />Growth</span>
              </div>
            )}
            <Seg
              value={showRange ? 'range' : 'breakdown'}
              options={[{ value: 'range', label: 'Range' }, { value: 'breakdown', label: 'Breakdown' }]}
              onChange={(v) => m.s.updateSettings({ chartView: v })}
              ariaLabel="Chart view"
            />
          </div>
          <div className="chart-proj">
            <ResponsiveContainer width="100%" height="100%">
              {showRange ? (
                <ComposedChart data={rangeData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e3d9cb" vertical={false} />
                  <XAxis dataKey="x" tick={axisStyle} tickLine={false} axisLine={{ stroke: '#b9ac99' }} interval="preserveStartEnd" minTickGap={28} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => usdc(v)} width={56} />
                  <Tooltip
                    contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 11, background: '#f8f3ec', border: '1px solid #1b1915', borderRadius: 0 }}
                    formatter={(v: unknown, name?: unknown) => {
                      const label = name === 'band' ? 'P10–P90' : name === 'inner' ? 'P25–P75' : 'Median';
                      return [Array.isArray(v) ? `${usdc(v[0])} – ${usdc(v[1])}` : usdc(v as number), label];
                    }}
                    labelFormatter={(l) => `${l} · age ${m.age + (Number(l) - thisYear)}`}
                  />
                  <Area dataKey="band" stroke="none" fill="var(--band)" isAnimationActive={false} />
                  <Area dataKey="inner" stroke="none" fill="var(--band-2)" isAnimationActive={false} />
                  <Line dataKey="p50" stroke="var(--teal)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
                  {goalLine != null && <ReferenceLine y={goalLine} stroke="var(--wine)" strokeDasharray="4 3" />}
                  <ReferenceLine x={thisYear + m.yearsToGoal} stroke="var(--wine)" strokeOpacity={0.4} />
                </ComposedChart>
              ) : (
                <ComposedChart data={barData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e3d9cb" vertical={false} />
                  <XAxis dataKey="x" tick={axisStyle} tickLine={false} axisLine={{ stroke: '#b9ac99' }} minTickGap={16} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => usdc(v)} width={56} />
                  <Tooltip
                    contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 11, background: '#f8f3ec', border: '1px solid #1b1915', borderRadius: 0 }}
                    formatter={(v: unknown, name?: unknown) => [usd(v as number), name === 'start' ? 'Starting' : name === 'contrib' ? 'Contributions' : 'Growth']}
                    labelFormatter={(l) => `Year ${l}`}
                  />
                  <Bar dataKey="start" stackId="a" fill="#b9ac99" isAnimationActive={false} />
                  <Bar dataKey="contrib" stackId="a" fill="var(--teal)" isAnimationActive={false} />
                  <Bar dataKey="interest" stackId="a" fill="var(--wine)" isAnimationActive={false} />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="note" style={{ marginTop: 2 }}>
            {showRange
              ? `5,000 simulated market paths · ${pct(m.stats.geo, 1)} median return, ${pct(m.stats.vol, 1)} volatility · ${real ? 'today’s dollars' : 'future dollars'}`
              : `Deterministic at ${pct(eff.rate, 2)} · ${real ? 'today’s dollars' : 'future dollars'}`}
          </div>
        </div>
      </div>
    </Panel>
  );
}
