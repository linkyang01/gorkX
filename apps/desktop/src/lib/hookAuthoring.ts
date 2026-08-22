import { invoke } from '@tauri-apps/api/core';
import {
  HOOK_VERIFICATION_HOOK_FILE,
  HOOK_VERIFICATION_MARKER_DIR,
  type HookVerificationProject,
} from './hookVerification.ts';

export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SubagentStart'
  | 'SubagentStop';

export type HookHandlerType = 'command' | 'http';

export const HOOK_EVENTS: HookEventName[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'Notification',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
];

export function buildHookDefinition(input: {
  event: HookEventName;
  matcher: string;
  type: HookHandlerType;
  handler: string;
  timeoutSeconds: number;
}): string {
  const handler = input.handler.trim();
  const timeout = Math.min(3600, Math.max(1, Math.round(input.timeoutSeconds)));
  const hook = {
    type: input.type,
    ...(input.type === 'command' ? { command: handler } : { url: handler, timeout }),
    ...(input.type === 'command' ? { timeout } : {}),
  };
  const rule = {
    ...(input.matcher.trim() ? { matcher: input.matcher.trim() } : {}),
    hooks: [hook],
  };
  return `${JSON.stringify({ hooks: { [input.event]: [rule] } }, null, 2)}\n`;
}

const SAFE_VERIFICATION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

/**
 * Build the only command accepted by the Settings Hook verification flow.
 *
 * The command is intentionally generated from the app-owned temporary project
 * descriptor. It cannot run an entered command, call a network endpoint, or
 * write outside the temporary project marker directory. Grok Build, not this
 * renderer, executes the resulting command when a trusted session starts.
 */
export function buildHookVerificationDefinition(project: HookVerificationProject): string {
  const projectPath = project.projectPath.trim();
  const markerRelativePath = project.markerRelativePath.trim();
  const token = project.markerToken.trim();
  const expectedRelative = `${HOOK_VERIFICATION_MARKER_DIR}/${token}.marker`;
  if (project.hookFileName !== HOOK_VERIFICATION_HOOK_FILE) {
    throw new Error('Hook verification file name is invalid.');
  }
  if (!projectPath.startsWith('/') || /[\0\r\n]/.test(projectPath)) {
    throw new Error('Hook verification project must be an absolute local path.');
  }
  if (!SAFE_VERIFICATION_TOKEN.test(token)) {
    throw new Error('Hook verification marker token is invalid.');
  }
  if (markerRelativePath !== expectedRelative) {
    throw new Error('Hook verification marker path is outside the bounded directory.');
  }

  const markerPath = `${projectPath.replace(/\/+$/, '')}/${markerRelativePath}`;
  const markerDirectory = markerPath.slice(0, markerPath.lastIndexOf('/'));
  const script = [
    'set -eu',
    'umask 077',
    `/bin/mkdir -p ${shellQuote(markerDirectory)}`,
    `/usr/bin/printf '%s\\n' ${shellQuote(token)} > ${shellQuote(markerPath)}`,
  ].join('; ');
  return buildHookDefinition({
    event: 'SessionStart',
    matcher: '',
    type: 'command',
    handler: `/bin/sh -c ${shellQuote(script)}`,
    timeoutSeconds: 5,
  });
}

export { HOOK_VERIFICATION_HOOK_FILE };

export type HookHandlerValidationError = 'required' | 'too-long' | 'https' | 'invalid-url';

export function validateHookHandler(
  type: HookHandlerType,
  raw: string,
): HookHandlerValidationError | null {
  const value = raw.trim();
  if (!value) return 'required';
  if (value.length > 16_000) return 'too-long';
  if (type === 'http') {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return 'https';
    } catch {
      return 'invalid-url';
    }
  }
  return null;
}

export function writeProjectHook(cwd: string, fileName: string, content: string): Promise<string> {
  return invoke<string>('workspace_write_hook_definition', { cwd, fileName, content });
}
