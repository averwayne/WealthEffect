/**
 * Analog instrument dial. A white chapter ring with minute ticks around a black face,
 * a red needle and a capped hub. `value` is 0–1 (null renders the needle at rest).
 */
export function Dial({ value, size = 92, label }: { value: number | null; size?: number; label: string }) {
  const c = 50;
  const start = -135;
  const sweep = 270;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const angle = start + sweep * v;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, r: number) => [c + r * Math.cos(rad(deg)), c + r * Math.sin(rad(deg))];

  const ticks = [];
  for (let i = 0; i <= 50; i++) {
    const a = start + (sweep * i) / 50;
    const major = i % 10 === 0;
    const [x1, y1] = pt(a, major ? 35 : 37.5);
    const [x2, y2] = pt(a, 41);
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? '#0b0b0c' : '#4a4a4e'} strokeWidth={major ? 1.4 : 0.6} />);
  }
  const nums = [0, 50, 100].map((n) => {
    const [x, y] = pt(start + (sweep * n) / 100, 27);
    return (
      <text key={n} x={x} y={y + 2.6} textAnchor="middle" fontSize="7.5" fontFamily="Inter, sans-serif" fontWeight="500" fill="#e9e9e6">
        {n}
      </text>
    );
  });
  const [nx, ny] = pt(angle, 33);
  const [tx, ty] = pt(angle + 180, 8);
  const arcEnd = pt(start + sweep, 44);
  const arcStart = pt(start, 44);

  return (
    <svg className="dial" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label}>
      <defs>
        <radialGradient id="dial-face" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#161618" />
          <stop offset="100%" stopColor="#050506" />
        </radialGradient>
        <linearGradient id="dial-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx={c} cy={c} r={49} fill="url(#dial-face)" />
      {/* chapter ring */}
      <path
        d={`M ${arcStart[0]} ${arcStart[1]} A 44 44 0 1 1 ${arcEnd[0]} ${arcEnd[1]}`}
        fill="none"
        stroke="#e8e8e4"
        strokeWidth={8}
        strokeLinecap="butt"
      />
      {ticks}
      {nums}
      {/* needle */}
      <line x1={tx} y1={ty} x2={nx} y2={ny} stroke="#ff453a" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={c} cy={c} r={5.2} fill="#d9d9d6" />
      <circle cx={c} cy={c} r={3.2} fill="#ff453a" />
      <text x={c} y={c + 43} textAnchor="middle" fontSize="10" fontFamily="Inter Tight, Inter, sans-serif" fontWeight="300" fill="#f2f2ef">
        {value == null ? '—' : `${Math.round(v * 100)}%`}
      </text>
      <circle cx={c} cy={c} r={49} fill="url(#dial-glass)" />
    </svg>
  );
}
