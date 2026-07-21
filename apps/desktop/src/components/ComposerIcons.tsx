import type { PermissionMode } from '../lib/acpClient';

export function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={active ? 'mic-icon active' : 'mic-icon'}
    >
      <rect
        x="5.5"
        y="1.5"
        width="5"
        height="8"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.35"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.2 : 0}
      />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M8 12v2.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

/** Compact shield for the composer permission control (Codex-style). */
export function PermShieldIcon({ mode }: { mode: PermissionMode }) {
  return (
    <svg className={`composer-shield-icon perm-${mode}`} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5L3.5 3.4v3.7c0 3.1 2.1 5.9 4.5 6.7 2.4-.8 4.5-3.6 4.5-6.7V3.4L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill={mode === 'full' ? 'currentColor' : 'none'}
        fillOpacity={mode === 'full' ? 0.18 : 0}
      />
      {mode === 'auto' ? (
        <path d="M5.8 8.1l1.5 1.5 2.9-3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      ) : mode === 'full' ? (
        <path d="M8 5.4v3.2M8 10.4h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        <path d="M8 5.6v2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}
