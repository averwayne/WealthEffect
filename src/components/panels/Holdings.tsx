import { qty, signedPct, tone, usd } from '../../lib/format';
import { useM } from '../../lib/modelContext';
import { CLASS_SHORT } from '../../lib/types';
import { Panel } from '../ui';

function quoteMeta(status: string, at: string | null, demo: boolean) {
  if (demo) return 'Sample prices';
  if (status === 'loading') return 'Updating…';
  if (status === 'unconfigured') return 'Live prices not configured';
  if (status === 'error') return 'Prices unavailable · showing last known';
  if (!at) return '';
  const d = new Date(at);
  return `Prices as of ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function Holdings({ onTrade }: { onTrade: () => void }) {
  const m = useM();
  const { summary } = m;
  const totalDay = summary.dayChange;
  return (
    <Panel
      n="03"
      title="Holdings"
      className="fill"
      meta={
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>{quoteMeta(m.s.quotesStatus, m.s.quotesAt, m.s.mode === 'demo')}</span>
          <button className="linkbtn" onClick={onTrade}>
            + Record
          </button>
        </span>
      }
    >
      <div className="pb scroll" style={{ paddingTop: 0 }}>
        {summary.holdings.length === 0 && summary.cash === 0 ? (
          <div className="empty" style={{ marginTop: 12 }}>
            No holdings yet. <button className="linkbtn" onClick={onTrade}>Record a purchase</button>
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Qty</th>
                <th className="hide-narrow">Price</th>
                <th>Value</th>
                <th>Day</th>
                <th>Gain</th>
                <th className="hide-xnarrow">Wt</th>
              </tr>
            </thead>
            <tbody>
              {summary.holdings.map((h) => (
                <tr key={h.symbol} title={`${h.name ?? h.symbol} · ${CLASS_SHORT[h.assetClass]} · avg cost ${usd(h.avgCost, true)}`}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{h.symbol}</span>{' '}
                    <span className="muted" style={{ fontSize: 9.5, letterSpacing: '0.06em' }}>
                      {CLASS_SHORT[h.assetClass].toUpperCase()}
                    </span>
                  </td>
                  <td>{qty(h.quantity)}</td>
                  <td className="hide-narrow">
                    {h.price != null ? usd(h.price, true) : '—'}
                    {h.priceSource && h.priceSource !== 'live' && (
                      <span className="muted" title={h.priceSource === 'manual' ? 'Manual price' : 'Last trade price'}>
                        {' '}
                        {h.priceSource === 'manual' ? 'm' : 't'}
                      </span>
                    )}
                  </td>
                  <td>{usd(h.marketValue)}</td>
                  <td className={tone(h.dayChangePct)}>{h.dayChangePct != null ? signedPct(h.dayChangePct / 100) : '—'}</td>
                  <td className={tone(h.unrealized)}>{h.costBasis > 0 ? signedPct(h.unrealized / h.costBasis, 1) : '—'}</td>
                  <td className="hide-xnarrow">{summary.portfolio > 0 ? `${((h.marketValue / summary.portfolio) * 100).toFixed(1)}` : '—'}</td>
                </tr>
              ))}
              <tr className="sub">
                <td>Cash</td>
                <td />
                <td className="hide-narrow" />
                <td>{usd(summary.cash)}</td>
                <td />
                <td />
                <td className="hide-xnarrow">{summary.portfolio > 0 ? ((summary.cash / summary.portfolio) * 100).toFixed(1) : '—'}</td>
              </tr>
              <tr className="total">
                <td>Portfolio</td>
                <td />
                <td className="hide-narrow" />
                <td>{usd(summary.portfolio)}</td>
                <td className={tone(totalDay)}>{totalDay ? `${totalDay > 0 ? '+' : '−'}${usd(Math.abs(totalDay))}` : '—'}</td>
                <td className={tone(summary.gains)}>{summary.netContributions > 0 ? signedPct(summary.gains / summary.netContributions, 1) : '—'}</td>
                <td className="hide-xnarrow">100</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
