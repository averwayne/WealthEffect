const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

export function usd(v: number | null | undefined, cents = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return (cents ? usd2 : usd0).format(v);
}

/** Compact currency: $1.24M, $312K. */
export function usdc(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${s}$${(a / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function signedUsd(v: number | null | undefined, compact = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const body = compact ? usdc(Math.abs(v)) : usd(Math.abs(v));
  return `${v >= 0 ? '+' : '−'}${body}`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function signedPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}%`;
}

export function qty(v: number): string {
  return num.format(v);
}

export function ordinal(n: number): string {
  const r = Math.round(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = r % 100;
  return r + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function monthsToText(m: number | null): string {
  if (m == null) return '> 100 yrs';
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (!y) return `${mo} mo`;
  return mo ? `${y} yrs ${mo} mo` : `${y} yrs`;
}

export const tone = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v === 0 ? '' : v > 0 ? 'pos' : 'neg');

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthsBetween(fromYYYYMM: string, to = new Date()): number {
  const [y, m] = fromYYYYMM.split('-').map(Number);
  return (to.getFullYear() - y) * 12 + (to.getMonth() + 1 - m);
}
