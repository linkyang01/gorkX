/**
 * Shared stroke icons for sidebar / lists / panels.
 * Match ChromeIcons language (16×16, 1.5 stroke). Do not use for:
 * - titlebar chrome (ChromeIcons)
 * - composer controls (+, shield, mic, send, context ring)
 */

import type { ReactNode } from 'react';

const s = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Svg({
  children,
  size = 16,
  className,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconPlus({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 3v10M3 8h10" {...s} />
    </Svg>
  );
}

export function IconPlugins({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 2.25 9.1 5.9 12.75 7 9.1 8.1 8 11.75 6.9 8.1 3.25 7 6.9 5.9 8 2.25z" {...s} />
      <path d="M12.25 10.5 12.75 12 14.25 12.5 12.75 13 12.25 14.5 11.75 13 10.25 12.5 11.75 12 12.25 10.5z" {...s} />
    </Svg>
  );
}

export function IconScheduled({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8.25" r="5.5" {...s} />
      <path d="M8 5.5v3.25l2 1.25" {...s} />
    </Svg>
  );
}

export function IconMemory({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path
        d="M4.25 3.5h5.5a2 2 0 0 1 2 2v6.25a1.25 1.25 0 0 1-1.25 1.25H4.25V3.5z"
        {...s}
      />
      <path d="M4.25 3.5A1.75 1.75 0 0 0 2.5 5.25v6.5A1.75 1.75 0 0 0 4.25 13.5" {...s} />
      <path d="M6.25 6.5h3.5M6.25 9h2.5" {...s} />
    </Svg>
  );
}

export function IconFolder({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path
        d="M2.5 4.75A1.5 1.5 0 0 1 4 3.25h2.2l1.1 1.25H12a1.5 1.5 0 0 1 1.5 1.5v5.5A1.5 1.5 0 0 1 12 12.75H4A1.5 1.5 0 0 1 2.5 11.25V4.75z"
        {...s}
      />
    </Svg>
  );
}

export function IconFolderPinned({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path
        d="M2.5 5A1.5 1.5 0 0 1 4 3.5h2l1 1.1H12a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 12 12.5H4A1.5 1.5 0 0 1 2.5 11V5z"
        {...s}
      />
      <path d="M10.25 6.25 11.5 7.5 10.25 8.75" {...s} />
      <path d="M8.75 7.5h2.75" {...s} />
    </Svg>
  );
}

export function IconMore({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="4" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconRename({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M9.5 3.5 12.5 6.5 6 13H3v-3L9.5 3.5z" {...s} />
      <path d="m8.25 4.75 3 3" {...s} />
    </Svg>
  );
}

export function IconArchive({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M2.75 4.25h10.5v2H2.75z" {...s} />
      <path d="M3.75 6.25v5.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-5.5" {...s} />
      <path d="M6.5 9h3" {...s} />
    </Svg>
  );
}

export function IconClose({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" {...s} />
    </Svg>
  );
}

export function IconRefresh({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M13 8a5 5 0 1 1-1.3-3.4" {...s} />
      <path d="M13 3.25V6.5h-3.25" {...s} />
    </Svg>
  );
}

export function IconSearch({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="7" cy="7" r="3.75" {...s} />
      <path d="m10 10 3 3" {...s} />
    </Svg>
  );
}

export function IconPin({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 2.75 9.4 6.1 13 6.6 10.4 9.1 11.1 12.75 8 10.9 4.9 12.75 5.6 9.1 3 6.6 6.6 6.1 8 2.75z" {...s} />
    </Svg>
  );
}

export function IconWorktree({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="4.25" cy="3.75" r="1.5" {...s} />
      <circle cx="11.75" cy="3.75" r="1.5" {...s} />
      <circle cx="8" cy="12.25" r="1.5" {...s} />
      <path d="M4.25 5.25v1a3 3 0 0 0 3 3h1.5a3 3 0 0 0 3-3v-1" {...s} />
      <path d="M8 9.25v1.5" {...s} />
    </Svg>
  );
}

export function IconRemoteSession({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="3" {...s} />
    </Svg>
  );
}

export function IconThought({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path
        d="M4.5 9.5c-1.2-.9-1.75-2.2-1.75-3.5A4.25 4.25 0 0 1 7 1.75h2a4.25 4.25 0 0 1 4.25 4.25c0 1.3-.55 2.6-1.75 3.5L10.5 11v1.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V11L4.5 9.5z"
        {...s}
      />
    </Svg>
  );
}

export function IconTool({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M10.5 3.5a2.5 2.5 0 0 0-3.4 3.4L3.5 10.5 5.5 12.5l3.6-3.6a2.5 2.5 0 0 0 3.4-3.4L11 6.5 10.5 3.5z" {...s} />
    </Svg>
  );
}

export function IconSystem({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 3.25 12.75 6v4L8 12.75 3.25 10V6L8 3.25z" {...s} />
      <circle cx="8" cy="8" r="1.25" {...s} />
    </Svg>
  );
}

export function IconWarning({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 2.75 13.5 12.5H2.5L8 2.75z" {...s} />
      <path d="M8 6.5v2.75" {...s} />
      <circle cx="8" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconCheck({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m3.5 8.25 3 3 6-6.5" {...s} />
    </Svg>
  );
}

export function IconOpenFolder({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path
        d="M2.5 5A1.5 1.5 0 0 1 4 3.5h2l1 1H12a1.5 1.5 0 0 1 1.5 1.5v.75"
        {...s}
      />
      <path
        d="M2.75 7.25h10.1l-.9 4.1a1.25 1.25 0 0 1-1.22 1H4.87a1.25 1.25 0 0 1-1.22-1l-.9-4.1z"
        {...s}
      />
    </Svg>
  );
}

export function IconInbox({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M2.75 4.5h10.5v7.25a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1V4.5z" {...s} />
      <path d="M2.75 9h3l1 1.5h2.5l1-1.5h3" {...s} />
    </Svg>
  );
}
