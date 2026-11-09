import { useEffect, useState, type ReactNode } from 'react';

type Kind = 'usd' | 'pct' | 'num' | 'int';

const fmt = (v: number | null, kind: Kind, decimals?: number) => {
  if (v == null || !Number.isFinite(v)) return '';
  if (kind === 'pct') return (v * 100).toFixed(decimals ?? 1);
  if (kind === 'usd') return v.toLocaleString('en-US', { maximumFractionDigits: decimals ?? 0, minimumFractionDigits: decimals ?? 0 });
  if (kind === 'int') return String(Math.round(v));
  return v.toLocaleString('en-US', { maximumFractionDigits: decimals ?? 4 });
};

/** Inline numeric input: formatted at rest, raw while editing, commits on blur or Enter. */
export function NumField({
  value,
  onChange,
  kind = 'num',
  decimals,
  suffix,
  width,
  min,
  max,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  kind?: Kind;
  decimals?: number;
  suffix?: string;
  width?: number | string;
  min?: number;
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fmt(value, kind, decimals));
  useEffect(() => {
    if (!editing) setText(fmt(value, kind, decimals));
  }, [value, kind, decimals, editing]);

  const commit = () => {
    setEditing(false);
    const raw = text.replace(/[$,%\s]/g, '');
    if (raw === '') {
      onChange(null);
      return;
    }
    let n = Number(raw);
    if (!Number.isFinite(n)) {
      setText(fmt(value, kind, decimals));
      return;
    }
    if (kind === 'pct') n = n / 100;
    if (kind === 'int') n = Math.round(n);
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
    setText(fmt(n, kind, decimals));
  };

  return (
    <span className="field" style={{ width }}>
      {kind === 'usd' && <span className="affix">$</span>}
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => {
          setEditing(true);
          setText(value == null ? '' : kind === 'pct' ? String(+(value * 100).toFixed(4)) : String(value));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmt(value, kind, decimals));
            setEditing(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {(suffix || kind === 'pct') && <span className="affix">{suffix ?? '%'}</span>}
    </span>
  );
}

export function Panel({
  n,
  title,
  meta,
  children,
  className = '',
  style,
}: {
  n: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style} aria-label={title}>
      <header className="ph">
        <h2>
          <span className="n">{n}</span>
          {title}
        </h2>
        {meta != null && <div className="meta">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

export function Kv({ k, v, className = '' }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={`kv ${className}`}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-h">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-b">{children}</div>
      </aside>
    </>
  );
}
