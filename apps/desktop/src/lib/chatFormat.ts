/** Sanitize / summarize chat lines for Codex-like clean display. */

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Strip binary / control noise from protocol dumps. */
export function sanitizeText(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(CTRL, '');
  // Common MCP/ACP binary framing leftovers
  s = s.replace(/\\u0000/g, '');
  s = s.replace(/\uFFFD+/g, '');
  return s.trim();
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
  const m =
    s.match(/Terminal error:[^\n]+/i) ||
    s.match(/spawn failed:[^\n]+/i) ||
    s.match(/No such file or directory[^\n]*/i) ||
    s.match(/error_message["']?\s*[:=]\s*["']?([^\n"']+)/i) ||
    s.match(/Error:\s*([^\n]+)/i);
  if (m) return (m[1] || m[0]).trim().slice(0, 160);
  // Prefer last non-empty line that looks human
  const lines = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 4 && /[a-zA-Z\u4e00-\u9fff]/.test(l));
  const last = lines[lines.length - 1];
  if (last && last.length < 200) return last;
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
