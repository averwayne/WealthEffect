import { useState } from 'react';
import { monthKey, ordinal, pct, signedPct, signedUsd, usd } from '../lib/format';
import { useModel } from '../lib/model';
import { ModelContext } from '../lib/modelContext';
import { CheckIn } from './CheckIn';
import { Dial } from './Dial';
import { Account } from './drawers/Account';
import { Activity } from './drawers/Activity';
import { Assumptions } from './drawers/Assumptions';
import { Allocation } from './panels/Allocation';
import { CashFlow } from './panels/CashFlow';
import { Holdings } from './panels/Holdings';
import { Income } from './panels/Income';
import { Performance } from './panels/Performance';
import { Projection } from './panels/Projection';
import { Standing } from './panels/Standing';
import { Seg } from './ui';

type DrawerKey = 'activity' | 'assumptions' | 'account' | null;

const toneTag = (v: number | null | undefined) => (v == null || v === 0 ? 'tag' : v > 0 ? 'tag g' : 'tag r');

export function Dashboard() {
  const m = useModel();
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const { summary, s } = m;
  const prob = m.mc?.probability ?? null;
  const prior = summary.portfolio - summary.dayChange;
  const dayPct = prior > 0 && summary.dayChange !== 0 ? summary.dayChange / prior : 0;
  const needsCheckin = s.mode === 'cloud' && s.onboarded && s.lastCheckin !== monthKey();
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const toggleBasis = () => s.updateSettings({ realDollars: !m.settings.realDollars });
  const refresh = () => {
    void s.refreshQuotes(true);
    void s.refreshMarket();
  };

  return (
    <ModelContext.Provider value={m}>
      <div className="app">
        <div className="bezel">
          <div className="bezel-btns">
            <button className="bezel-btn red" title="Refresh prices and rates" aria-label="Refresh prices and rates" onClick={refresh} />
            <button className="bezel-btn yellow" title="Switch between today’s and future dollars" aria-label="Switch dollar basis" onClick={toggleBasis} />
          </div>
          <div className="device">
            <header className="cluster">
              <div>
                <div className="brand">
                  Wealth Effect
                  <small>{s.mode === 'demo' ? 'Sample data' : dateLine}</small>
                </div>
                <nav className="nav" aria-label="Sections">
                  <button className="navbtn active">Dashboard</button>
                  <button className="navbtn" onClick={() => setDrawer('activity')}>
                    Activity
                  </button>
                  <button className="navbtn" onClick={() => setDrawer('assumptions')}>
                    Assumptions
                  </button>
                </nav>
              </div>

              <div className="readouts" role="status" aria-label="Summary">
                <div className="readout">
                  <div className="label">Net worth</div>
                  <div className="big">{usd(summary.netWorth)}</div>
                </div>
                <div className="readout">
                  <div className="label">Today</div>
                  <div className="val">
                    <span className={toneTag(summary.dayChange)}>{signedPct(dayPct)}</span>
                  </div>
                </div>
                <div className="readout">
                  <div className="label">Target path</div>
                  <div className="val">
                    <span className={m.variance == null ? 'tag' : m.variance >= 0 ? 'tag g' : 'tag y'}>{m.variance != null ? signedUsd(m.variance) : 'Not set'}</span>
                  </div>
                </div>
                <div className="readout-stack" style={{ marginLeft: 6 }}>
                  <span className="k">3M T-bill</span>
                  <span>{pct(m.riskFree, 2)}</span>
                  <span className="k">CPI YoY</span>
                  <span>{s.market.cpiYoY ? pct(s.market.cpiYoY.value, 1) : '—'}</span>
                  <span className="k">Percentile</span>
                  <span>{ordinal(m.percentile)}</span>
                </div>
              </div>

              <div className="cluster-right">
                <div className="dial-wrap">
                  <Dial value={prob} label={`Probability of reaching goal: ${prob == null ? 'calculating' : Math.round(prob * 100) + '%'}`} />
                  <div>
                    <div className="label">Probability</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.35 }}>
                      Goal by age {m.settings.goalAge}
                      <br />
                      <span className={prob == null ? 'tag' : prob >= 0.75 ? 'tag g' : prob >= 0.5 ? 'tag y' : 'tag r'} style={{ marginTop: 4 }}>
                        {prob == null ? 'Simulating' : prob >= 0.75 ? 'On track' : prob >= 0.5 ? 'Watch' : 'Off track'}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {s.mode === 'cloud' && (
                      <span className="savestate" aria-live="polite">
                        {s.saveState === 'saving' ? 'Saving…' : s.saveState === 'error' ? <span className="neg">Not saved</span> : 'Saved'}
                      </span>
                    )}
                    <button className="navbtn" onClick={() => setDrawer('account')} style={{ borderColor: 'var(--rule-strong)' }}>
                      {s.mode === 'demo' ? 'Sign up' : 'Account'}
                    </button>
                  </div>
                  <Seg
                    value={m.settings.realDollars ? 'real' : 'nominal'}
                    options={[
                      { value: 'real', label: 'Today’s $' },
                      { value: 'nominal', label: 'Future $' },
                    ]}
                    onChange={(v) => s.updateSettings({ realDollars: v === 'real' })}
                    ariaLabel="Dollar basis"
                  />
                </div>
              </div>
            </header>

            <main className="grid">
              <div className="col">
                <CashFlow />
                <Allocation onAssumptions={() => setDrawer('assumptions')} />
                <Holdings onTrade={() => setDrawer('activity')} />
              </div>
              <div className="col">
                <Projection />
                <Performance />
              </div>
              <div className="col">
                <Income />
                <Standing />
              </div>
            </main>

            <footer className="foot">
              <span>For education and planning only. Not investment, tax or legal advice. Projections are hypothetical and not guarantees of future results.</span>
              <span>Rates: FRED · Benchmark: Alpha Vantage · Returns: Damodaran (NYU Stern) · Wealth: Federal Reserve SCF</span>
            </footer>
          </div>
        </div>
      </div>

      {drawer === 'activity' && <Activity onClose={() => setDrawer(null)} />}
      {drawer === 'assumptions' && <Assumptions onClose={() => setDrawer(null)} />}
      {drawer === 'account' && <Account onClose={() => setDrawer(null)} />}
      {needsCheckin && !drawer && <CheckIn />}
    </ModelContext.Provider>
  );
}
