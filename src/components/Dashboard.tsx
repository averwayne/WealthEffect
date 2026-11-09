import { useState } from 'react';
import { ordinal, pct, signedPct, signedUsd, tone, usd } from '../lib/format';
import { useModel } from '../lib/model';
import { ModelContext } from '../lib/modelContext';
import { Activity } from './drawers/Activity';
import { Account } from './drawers/Account';
import { Assumptions } from './drawers/Assumptions';
import { CheckIn } from './CheckIn';
import { Allocation } from './panels/Allocation';
import { CashFlow } from './panels/CashFlow';
import { Holdings } from './panels/Holdings';
import { Income } from './panels/Income';
import { Performance } from './panels/Performance';
import { Projection } from './panels/Projection';
import { Standing } from './panels/Standing';
import { Seg } from './ui';
import { monthKey } from '../lib/format';

type DrawerKey = 'activity' | 'assumptions' | 'account' | null;

export function Dashboard() {
  const m = useModel();
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const { summary, s } = m;
  const prob = m.mc?.probability;
  const dayPct = summary.portfolio - summary.dayChange > 0 ? summary.dayChange / (summary.portfolio - summary.dayChange) : null;
  const needsCheckin = s.mode === 'cloud' && s.onboarded && s.lastCheckin !== monthKey();

  return (
    <ModelContext.Provider value={m}>
      <div className="app">
        <div className="strip" role="status" aria-label="Summary">
          <div className="strip-item">
            <span className="strip-label">Net worth</span>
            <b>{usd(summary.netWorth)}</b>
          </div>
          <div className="strip-item">
            <span className="strip-label">Day</span>
            <span className={`chip ${tone(summary.dayChange)}`}>{dayPct != null && summary.dayChange !== 0 ? signedPct(dayPct) : '0.00%'}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">Target path</span>
            <span className={tone(m.variance)}>{m.variance != null ? signedUsd(m.variance) : 'Not set'}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">On track</span>
            <span className={`chip ${prob == null ? '' : prob >= 0.75 ? 'pos' : prob < 0.5 ? 'neg' : ''}`}>{prob == null ? '…' : `${Math.round(prob * 100)}%`}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">3M T-bill</span>
            <span>{pct(m.riskFree, 2)}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">CPI YoY</span>
            <span>{s.market.cpiYoY ? pct(s.market.cpiYoY.value, 1) : '—'}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">Percentile</span>
            <span>{ordinal(m.percentile)}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">{s.mode === 'demo' ? 'Sample data' : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>

        <header className="masthead">
          <nav className="nav" aria-label="Sections">
            <button className="navbtn active">Dashboard</button>
            <button className="navbtn" onClick={() => setDrawer('activity')}>
              Activity
            </button>
            <button className="navbtn" onClick={() => setDrawer('assumptions')}>
              Assumptions
            </button>
          </nav>
          <div className="brand">
            Wealth Effect<small>NET WORTH PLANNER</small>
          </div>
          <div className="nav nav-right">
            {s.mode === 'cloud' && (
              <span className="savestate" aria-live="polite">
                {s.saveState === 'saving' ? 'Saving…' : s.saveState === 'error' ? <span className="neg">Not saved</span> : 'Saved'}
              </span>
            )}
            <Seg
              value={m.settings.realDollars ? 'real' : 'nominal'}
              options={[
                { value: 'real', label: 'Today’s $' },
                { value: 'nominal', label: 'Future $' },
              ]}
              onChange={(v) => s.updateSettings({ realDollars: v === 'real' })}
              ariaLabel="Dollar basis"
            />
            <button className="navbtn" onClick={() => setDrawer('account')} style={{ marginLeft: 8 }}>
              {s.mode === 'demo' ? 'Sign up' : 'Account'}
            </button>
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
          <span>Prices: Finnhub · Rates: FRED · Benchmark: Alpha Vantage · Returns: Damodaran (NYU Stern) · Wealth: Federal Reserve SCF</span>
        </footer>
      </div>

      {drawer === 'activity' && <Activity onClose={() => setDrawer(null)} />}
      {drawer === 'assumptions' && <Assumptions onClose={() => setDrawer(null)} />}
      {drawer === 'account' && <Account onClose={() => setDrawer(null)} />}
      {needsCheckin && !drawer && <CheckIn />}
    </ModelContext.Provider>
  );
}
