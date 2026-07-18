/** Small annular context-usage indicator — clickable for detail. */

export function ContextRing({
  pct,
  title,
  onClick,
}: {
  pct: number;
  title?: string;
  onClick?: () => void;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const r = 9;
  const c = 2 * Math.PI * r;
  const dash = (p / 100) * c;
  const warn = p >= 70;
  const crit = p >= 90;
  const stroke = crit ? '#ef4444' : warn ? '#f59e0b' : '#0d0d0d';
  const className = `ctx-ring${warn ? ' warn' : ''}${crit ? ' critical' : ''}${onClick ? ' clickable' : ''}`;
  const common = {
    className,
    title: title || `${p.toFixed(0)}%`,
    'aria-label': title || `context ${p.toFixed(0)} percent`,
  } as const;
  const svg = (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
  if (onClick) {
    return (
      <button type="button" {...common} onClick={onClick}>
        {svg}
      </button>
    );
  }
  return <div {...common}>{svg}</div>;
}
