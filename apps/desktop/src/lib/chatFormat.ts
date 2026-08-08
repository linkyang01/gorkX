/** Sanitize / summarize chat lines for Codex-like clean display. */

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** CSI / OSC / simple SGR ANSI sequences from engine stderr dumps. */
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

/** Strip binary / control noise from protocol dumps. */
export function sanitizeText(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(ANSI, '');
  // Literal escape sequences sometimes persisted as text dumps.
  s = s.replace(/\\u001b\[[0-9;?]*[a-zA-Z]/gi, '');
  s = s.replace(/\\x1b\[[0-9;?]*[a-zA-Z]/gi, '');
  s = s.replace(CTRL, '');
  // Common MCP/ACP binary framing leftovers
  s = s.replace(/\\u0000/g, '');
  s = s.replace(/\uFFFD+/g, '');
  return s.trim();
}

/** True when xAI returns 403 that Grok Build is not entitled for this account. */
export function isGrokBuildAccessDenied(raw: string | null | undefined): boolean {
  const s = sanitizeText(raw || '');
  return /coming soon|don'?t have access|do not have access|status\s*403|403\s*forbidden/i.test(s)
    && /grok\s*build|build is coming/i.test(s);
}

/** True when the provider rejected a turn because credits/subscription quota is exhausted. */
export function isGrokQuotaBlocked(raw: string | null | undefined): boolean {
  const s = sanitizeText(raw || '');
  return /personal-team-blocked\s*:\s*spending-limit|run out of credits|need a grok subscription|spending[- ]limit|insufficient credits/i.test(s);
}

/** Stable engine token written when the ACP child process exits without a prior error. */
export const AGENT_PROCESS_EXITED = 'Agent process exited';

/** True for the stored process-exit token (any locale wording we may have shown). */
export function isAgentProcessExited(raw: string | null | undefined): boolean {
  const s = sanitizeText(raw || '');
  return (
    /^agent process exited$/i.test(s)
    || /^agent\s*进程已退出$/i.test(s)
    || s === AGENT_PROCESS_EXITED
  );
}

/**
 * Prefer a short, desktop-facing explanation over raw JSON-RPC / stderr dumps.
 * Keeps the original string available for "View error" when callers store it.
 */
export function humanizeEngineError(raw: string | null | undefined): string {
  const s = sanitizeText(raw || '');
  if (!s) return '';
  if (isGrokBuildAccessDenied(s)) {
    return 'GROKX_BUILD_ACCESS_DENIED';
  }
  if (isGrokQuotaBlocked(s)) {
    return 'GROKX_QUOTA_BLOCKED';
  }
  if (isAgentProcessExited(s)) {
    return 'GROKX_AGENT_PROCESS_EXITED';
  }
  // Prefer the inner data.message from JSON-RPC style envelopes.
  const dataMsg =
    s.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]
    || s.match(/message["']?\s*:\s*["']([^"'\n]+)["']/)?.[1];
  if (dataMsg) {
    const unescaped = dataMsg.replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
    if (isGrokBuildAccessDenied(unescaped)) return 'GROKX_BUILD_ACCESS_DENIED';
    if (isGrokQuotaBlocked(unescaped)) return 'GROKX_QUOTA_BLOCKED';
    if (unescaped.length >= 12 && unescaped.length <= 240) return unescaped;
  }
  const api =
    s.match(/API error\s*\([^)]*\)\s*:\s*([^\n"{}]+)/i)?.[1]?.trim()
    || s.match(/status\s*403[^\n]*:\s*([^\n"{}]+)/i)?.[1]?.trim();
  if (api && api.length <= 240) {
    if (isGrokBuildAccessDenied(api) || isGrokBuildAccessDenied(s)) return 'GROKX_BUILD_ACCESS_DENIED';
    if (isGrokQuotaBlocked(api) || isGrokQuotaBlocked(s)) return 'GROKX_QUOTA_BLOCKED';
    return api;
  }
  return summarizeError(s);
}

export function isNoiseSystem(text: string): boolean {
  const s = sanitizeText(text);
  if (!s) return true;
  // Pure protocol error dumps the user shouldn't see by default
  if (/tool_error|execution_failure|session_id|error_kind/i.test(s) && s.length > 80) {
    // keep short human messages
    if (!/failed|错误|失败|exited|reconnected|session /i.test(s.slice(0, 40))) {
      return true;
    }
  }
  // Mostly non-printable ratio
  const printable = s.replace(/[\x20-\x7E\u4e00-\u9fff\n\r\t]/g, '');
  if (s.length > 40 && printable.length / s.length > 0.25) return true;
  return false;
}

/**
 * ACP can replay the full first-turn envelope while loading or creating a
 * session. That envelope includes memory plus the user request, but is not a
 * new user message and must never appear in the transcript.
 */
export function isInjectedUserPromptEcho(text: string): boolean {
  const s = sanitizeText(text);
  return s.includes('—— 记忆上下文结束 ——') && s.includes('用户请求：');
}

/**
 * Older gorkX builds persisted the complete engine-only first-turn envelope
 * as a user line. Keep the person's request, but never render the memory or
 * desktop presentation instructions as if they had typed them.
 */
export function visibleUserPrompt(text: string): string {
  const s = sanitizeText(text);
  if (!isInjectedUserPromptEcho(s)) return s;

  const marker = '用户请求：';
  const start = s.indexOf(marker);
  if (start < 0) return '';
  const afterRequest = s.slice(start + marker.length).trimStart();
  // This exact prefix is added by withConversationPresentation(). It is
  // engine guidance, not part of the user's message. The visible request may
  // itself contain Markdown separators, so only cut at the known guide.
  const guide = '\n\n---\n\ngorkX 会把回答直接呈现为可阅读的桌面结果。';
  const guideAt = afterRequest.indexOf(guide);
  return sanitizeText(guideAt >= 0 ? afterRequest.slice(0, guideAt) : afterRequest);
}

/** One-line tool title for cards. */
export function toolTitle(text: string, kind?: string, status?: string): string {
  const clean = sanitizeText(text);
  let first = clean.split('\n')[0] || clean;
  // "execute · run_terminal_command · failed" style
  first = first.replace(/^tool\s*[·:]\s*/i, '');
  if (first.length > 90) first = first.slice(0, 88) + '…';
  const k = kind && kind !== 'other' ? kind : '';
  const st = status && !first.toLowerCase().includes(status.toLowerCase()) ? status : '';
  return [k, first, st].filter(Boolean).join(' · ');
}

/** Short human summary of tool/system errors. */
export function summarizeError(text: string): string {
  const s = sanitizeText(text);
  if (isGrokBuildAccessDenied(s)) return 'GROKX_BUILD_ACCESS_DENIED';
  if (isGrokQuotaBlocked(s)) return 'GROKX_QUOTA_BLOCKED';
  const m =
    s.match(/Terminal error:[^\n]+/i) ||
    s.match(/spawn failed:[^\n]+/i) ||
    s.match(/No such file or directory[^\n]*/i) ||
    s.match(/error_message["']?\s*[:=]\s*["']?([^\n"']+)/i) ||
    s.match(/API error\s*\([^)]*\)\s*:\s*([^\n"{}]+)/i) ||
    s.match(/Error:\s*([^\n]+)/i);
  if (m) return (m[1] || m[0]).trim().slice(0, 160);
  // Prefer last non-empty line that looks human
  const lines = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 4 && /[a-zA-Z\u4e00-\u9fff]/.test(l) && !/^\d{4}-\d{2}-\d{2}/.test(l));
  const last = lines[lines.length - 1];
  if (last && last.length < 200 && !/^[{[]/.test(last)) return last;
  return s.slice(0, 120) + (s.length > 120 ? '…' : '');
}

export function toolKindLabel(kind?: string): string {
  if (!kind) return 'tool';
  const k = kind.toLowerCase();
  if (k.includes('read') || k === 'read') return 'read';
  if (k.includes('edit') || k.includes('write')) return 'edit';
  if (k.includes('exec') || k.includes('shell') || k.includes('terminal')) return 'run';
  if (k.includes('search') || k.includes('grep')) return 'search';
  if (k.includes('fetch') || k.includes('web')) return 'fetch';
  return kind;
}
