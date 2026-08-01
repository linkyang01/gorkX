/**
 * Single source of truth for desktop keyboard shortcuts.
 * App.tsx dispatches from matchDesktopShortcut; ShortcutsHelp renders the same list.
 */

import type { MsgKey } from './i18n.ts';
import { t } from './i18n.ts';

export type DesktopShortcutAction =
  | 'new-task'
  | 'review'
  | 'terminal'
  | 'settings'
  | 'task-search'
  | 'extensions'
  | 'memory'
  | 'decisions'
  | 'scheduled'
  | 'spawn-subagent'
  | 'process'
  | 'task-info'
  | 'help'
  | 'voice'
  | 'focus-composer';

export interface DesktopShortcutSpec {
  id: DesktopShortcutAction;
  /** Display chord in the help dialog */
  keysLabel: string;
  actionMsgKey: MsgKey;
  /** Lowercase letter, '/', or special like 'F8' */
  key: string;
  /** Also match KeyboardEvent.code (e.g. Space) */
  code?: string;
  meta?: boolean;
  /** Require Ctrl even when meta is false (voice: Ctrl+Space) */
  ctrl?: boolean;
  shift?: boolean;
  /** Action needs a connected live task session */
  requiresLiveSession?: boolean;
  /** Hide from automatic letter matching when true (handled via code) */
  codeOnly?: boolean;
}

/** Product shortcuts listed in ⌘/ help (composer Enter/Esc remain free-form). */
export const DESKTOP_SHORTCUT_SPECS: readonly DesktopShortcutSpec[] = [
  {
    id: 'focus-composer',
    keysLabel: '⌘/Ctrl + L',
    actionMsgKey: 'shortcutFocusComposer',
    key: 'l',
    meta: true,
  },
  {
    id: 'new-task',
    keysLabel: '⌘/Ctrl + N',
    actionMsgKey: 'shortcutNewTask',
    key: 'n',
    meta: true,
  },
  {
    id: 'review',
    keysLabel: '⌘/Ctrl + D',
    actionMsgKey: 'shortcutReview',
    key: 'd',
    meta: true,
  },
  {
    id: 'terminal',
    keysLabel: '⇧⌘/Ctrl + J',
    actionMsgKey: 'shortcutTerminal',
    key: 'j',
    meta: true,
    shift: true,
  },
  {
    id: 'extensions',
    keysLabel: '⇧⌘/Ctrl + E',
    actionMsgKey: 'shortcutExtensions',
    key: 'e',
    meta: true,
    shift: true,
  },
  {
    id: 'memory',
    keysLabel: '⇧⌘/Ctrl + M',
    actionMsgKey: 'shortcutMemory',
    key: 'm',
    meta: true,
    shift: true,
  },
  {
    id: 'decisions',
    keysLabel: '⇧⌘/Ctrl + A',
    actionMsgKey: 'shortcutDecisions',
    key: 'a',
    meta: true,
    shift: true,
  },
  {
    id: 'scheduled',
    keysLabel: '⇧⌘/Ctrl + S',
    actionMsgKey: 'shortcutScheduled',
    key: 's',
    meta: true,
    shift: true,
  },
  {
    id: 'spawn-subagent',
    keysLabel: '⇧⌘/Ctrl + B',
    actionMsgKey: 'shortcutSpawnSubagent',
    key: 'b',
    meta: true,
    shift: true,
    requiresLiveSession: true,
  },
  {
    id: 'process',
    keysLabel: '⇧⌘/Ctrl + P',
    actionMsgKey: 'shortcutProcess',
    key: 'p',
    meta: true,
    shift: true,
  },
  {
    id: 'task-info',
    keysLabel: '⇧⌘/Ctrl + I',
    actionMsgKey: 'shortcutTaskInfo',
    key: 'i',
    meta: true,
    shift: true,
    requiresLiveSession: true,
  },
  {
    id: 'task-search',
    keysLabel: '⇧⌘/Ctrl + F',
    actionMsgKey: 'shortcutTaskSearch',
    key: 'f',
    meta: true,
    shift: true,
  },
  {
    id: 'settings',
    keysLabel: '⌘/Ctrl + K',
    actionMsgKey: 'shortcutSettings',
    key: 'k',
    meta: true,
  },
  {
    id: 'voice',
    keysLabel: 'Ctrl + Space / F8',
    actionMsgKey: 'shortcutVoice',
    key: 'f8',
    code: 'Space',
    ctrl: true,
  },
  {
    id: 'help',
    keysLabel: '⌘/Ctrl + /',
    actionMsgKey: 'shortcutHelp',
    key: '/',
    meta: true,
  },
] as const;

/** Acceptance checklist A2 keys that must appear in help and wiring. */
export const ACCEPTANCE_SHIFT_META_ACTIONS: readonly DesktopShortcutAction[] = [
  'decisions',
  'spawn-subagent',
  'memory',
  'scheduled',
  'process',
  'task-info',
];

/** Help dialog rows: composer-local chords + global product shortcuts. */
export function desktopShortcutHelpTable(): Array<{ keys: string; action: string }> {
  return [
    { keys: 'Enter', action: t('shortcutSend') },
    { keys: 'Shift + Enter', action: t('shortcutNewline') },
    { keys: '↑ / ↓', action: t('shortcutMenusNav') },
    { keys: 'Enter / Tab', action: t('shortcutMenusPick') },
    ...DESKTOP_SHORTCUT_SPECS.map((spec) => ({
      keys: spec.keysLabel,
      action: t(spec.actionMsgKey),
    })),
    { keys: '⌥⌘ ↑ / ↓', action: t('shortcutPrevNextTask') },
    { keys: '⌥⌘ [ / ]', action: t('shortcutPrevNextTask') },
    { keys: 'Esc', action: t('shortcutEsc') },
  ];
}

export interface ShortcutMatchInput {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Resolve a global shortcut. Returns null when no product chord matches.
 * Voice is only matched when voiceEnabled is true.
 */
export function matchDesktopShortcut(
  e: ShortcutMatchInput,
  opts?: { voiceEnabled?: boolean },
): DesktopShortcutAction | null {
  if (e.altKey) return null;
  const meta = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const code = e.code;

  // Voice: F8 or Ctrl+Space (not meta-only Space)
  if (opts?.voiceEnabled) {
    if (key === 'F8' || key === 'f8') return 'voice';
    if (!e.metaKey && e.ctrlKey && (code === 'Space' || key === ' ')) return 'voice';
  }

  for (const spec of DESKTOP_SHORTCUT_SPECS) {
    if (spec.id === 'voice') continue;
    const needMeta = Boolean(spec.meta);
    const needShift = Boolean(spec.shift);
    if (needMeta !== meta) continue;
    if (needShift !== e.shiftKey) continue;
    // Non-shift meta chords must not fire when shift is held (except intentional).
    if (!needShift && e.shiftKey) continue;
    if (spec.key === '/' && key === '/') return spec.id;
    if (spec.key.length === 1 && key === spec.key) return spec.id;
  }
  return null;
}
