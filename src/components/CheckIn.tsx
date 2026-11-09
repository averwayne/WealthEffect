import { useState } from 'react';
import { usd } from '../lib/format';
import { useM } from '../lib/modelContext';
import { NumField } from './ui';

/** First visit of each month: confirm this month's contribution, then the month's snapshot is recorded. */
export function CheckIn() {
  const m = useM();
  const s = m.s;
  const [amount, setAmount] = useState<number | null>(m.settings.monthlyInvest);
  const [busy, setBusy] = useState(false);
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const done = async (record: boolean) => {
    setBusy(true);
    if (record && amount && amount > 0) {
      await s.addTransactions([{ date, type: 'deposit', symbol: null, quantity: null, price: null, amount, note: 'Monthly contribution' }]);
    }
    await s.markCheckin();
    await s.recordSnapshot();
    setBusy(false);
  };

  return (
    <>
      <div className="scrim" />
      <div className="modal" role="dialog" aria-label="Monthly check-in">
        <div className="drawer-h">
          <h3>{month} check-in</h3>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>
          <p style={{ marginTop: 0, color: 'var(--ink-2)' }}>
            Prices have been updated. Confirm how much you added to your portfolio this month; it is recorded as a deposit and invested later from Activity.
          </p>
          <div className="kv">
            <span className="k">Contributed this month</span>
            <NumField kind="usd" value={amount} onChange={setAmount} width={130} min={0} ariaLabel="Contribution" />
          </div>
          <div className="kv">
            <span className="k">Plan</span>
            <span className="v">{usd(m.settings.monthlyInvest)}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn" disabled={busy} onClick={() => done(true)}>
              Record &amp; continue
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => done(false)}>
              Nothing this month
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
