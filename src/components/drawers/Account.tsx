import { useState } from 'react';
import { useM } from '../../lib/modelContext';
import { Drawer } from '../ui';
import { AuthForm } from '../Landing';

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function Account({ onClose }: { onClose: () => void }) {
  const m = useM();
  const s = m.s;
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  if (s.mode === 'demo') {
    return (
      <Drawer title="Create your account" onClose={onClose}>
        <div className="section">
          <h4>Save your own plan</h4>
          <p className="note" style={{ color: 'var(--ink-2)' }}>
            You are viewing sample data. Create a free account to build your own plan; it is saved to the cloud and private to you.
          </p>
          <AuthForm />
        </div>
        <button className="btn ghost" onClick={() => s.signOut()}>
          Exit sample
        </button>
      </Drawer>
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const exportJson = () =>
    download(
      `wealth-effect-${stamp}.json`,
      JSON.stringify(
        { exportedAt: new Date().toISOString(), settings: s.settings, positions: s.positions, transactions: s.transactions, balances: s.balances, snapshots: s.snapshots },
        null,
        2,
      ),
      'application/json',
    );
  const exportCsv = () => {
    const head = ['date', 'type', 'symbol', 'quantity', 'price', 'amount', 'note'];
    const rows = s.transactions.map((t) => [t.date, t.type, t.symbol, t.quantity, t.price, t.amount, t.note].map(csvCell).join(','));
    download(`wealth-effect-transactions-${stamp}.csv`, [head.join(','), ...rows].join('\n'), 'text/csv');
  };

  return (
    <Drawer title="Account" onClose={onClose}>
      <div className="section">
        <h4>Profile</h4>
        <div className="kv">
          <span className="k">Email</span>
          <span className="v">{s.email}</span>
        </div>
        <div className="kv">
          <span className="k">Display name</span>
          <input className="textin" style={{ maxWidth: 220, textAlign: 'right' }} value={s.settings.displayName} onChange={(e) => s.updateSettings({ displayName: e.target.value })} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={() => s.signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <div className="section">
        <h4>Your data</h4>
        <p className="note" style={{ color: 'var(--ink-2)' }}>
          Your plan is stored in your private account and is only readable by you. Export it at any time.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" onClick={exportJson}>
            Export all (JSON)
          </button>
          <button className="btn ghost" onClick={exportCsv}>
            Transactions (CSV)
          </button>
        </div>
      </div>

      <div className="section">
        <h4>Delete account</h4>
        <p className="note">Permanently deletes your account, plan, transactions and history. This cannot be undone. Type DELETE to confirm.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input className="textin mono" style={{ maxWidth: 140 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE to confirm" />
          <button
            className="btn danger"
            disabled={confirmText !== 'DELETE' || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await s.deleteAccount();
              } catch {
                alert('Could not delete the account. Please try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </Drawer>
  );
}
