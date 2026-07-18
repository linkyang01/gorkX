/** Thin Codex-style titlebar glyphs (16×16 stroke icons). */

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconSidebar({ open }: { open?: boolean }) {
  // Codex: rounded rect with vertical divider (sidebar panel)
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" {...stroke} />
      <path d="M6 2.25v11.5" {...stroke} />
      {open === false ? (
        <path d="M8.5 6.5h3.5M8.5 9.5h3.5" {...stroke} opacity={0.45} />
      ) : null}
    </svg>
  );
}

export function IconBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M10 3.5 5.5 8 10 12.5" {...stroke} />
    </svg>
  );
}

export function IconForward() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M6 3.5 10.5 8 6 12.5" {...stroke} />
    </svg>
  );
}

export function IconProcess() {
  // Thought / activity: soft spark
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="2.25" {...stroke} />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5" {...stroke} />
      <path d="m3.4 3.4 1.05 1.05M11.55 11.55l1.05 1.05M12.6 3.4l-1.05 1.05M4.45 11.55l-1.05 1.05" {...stroke} />
    </svg>
  );
}

export function IconReview() {
  // Diff / split panel
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" {...stroke} />
      <path d="M10 2.25v11.5" {...stroke} />
      <path d="M3.75 6h3M3.75 8.5h2.5M3.75 11h3" {...stroke} />
    </svg>
  );
}

export function IconTerminal() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.75" y="2.5" width="12.5" height="11" rx="2" {...stroke} />
      <path d="m4.5 6 2 2-2 2" {...stroke} />
      <path d="M8.25 10.5H11.5" {...stroke} />
    </svg>
  );
}

export function IconExport() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 2.5v7.5" {...stroke} />
      <path d="m5 7 3 3 3-3" {...stroke} />
      <path d="M3 12.5h10" {...stroke} />
    </svg>
  );
}

export function IconFork() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="4" cy="3.5" r="1.5" {...stroke} />
      <circle cx="12" cy="3.5" r="1.5" {...stroke} />
      <circle cx="8" cy="12.5" r="1.5" {...stroke} />
      <path d="M4 5v1.5a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V5" {...stroke} />
      <path d="M8 9.5v1.5" {...stroke} />
    </svg>
  );
}
