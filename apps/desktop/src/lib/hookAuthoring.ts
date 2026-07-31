import { invoke } from '@tauri-apps/api/core';

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
