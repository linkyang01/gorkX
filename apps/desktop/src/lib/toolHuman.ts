/** Formal short labels for agent tool activity (UI copy, zh-first). */

const CALL_ID = /^call-[0-9a-f-]+(\s*·\s*\S+)?$/i;

function isNoiseLabel(s: string): boolean {
  const t = (s || '').trim();
  if (!t) return true;
  if (CALL_ID.test(t)) return true;
  if (/^call-[0-9a-f-]+/i.test(t) && t.length < 80) return true;
  return false;
}

const KIND_ACTION: Record<string, string> = {
  read: '读取文件',
  edit: '编辑文件',
  write: '写入文件',
  execute: '执行命令',
  exec: '执行命令',
  shell: '执行命令',
  terminal: '执行命令',
  search: '检索代码',
  grep: '检索代码',
  list: '列出目录',
  fetch: '获取网页',
  web: '网络请求',
  other: '工具调用',
  think: '思考',
  plan: '更新计划',
};

export function humanToolTitle(raw: string, kind?: string): string {
  const s = (raw || '').replace(/[\u0000-\u001F]/g, ' ').trim();
  const k = (kind || '').toLowerCase();
  const lower = s.toLowerCase();
  const noise = isNoiseLabel(s);

  // Prefer structured kind when label is protocol garbage
  if (noise && k && KIND_ACTION[k]) {
    return KIND_ACTION[k];
  }

  if (k.includes('read') || /^read\b/i.test(s) || lower.includes('read_file') || lower.startsWith('读取'))
    return noise ? '读取文件' : pickPath(s, '读取文件');
  if (k.includes('edit') || k.includes('write') || /write|edit|search_replace|str_replace/i.test(s) || lower.startsWith('编辑'))
    return noise ? '编辑文件' : pickPath(s, '编辑文件');
  if (
    k.includes('exec') ||
    k === 'execute' ||
    /shell|terminal|bash|command|run_terminal/i.test(s) ||
    lower.startsWith('执行')
  )
    return noise ? '执行命令' : firstLine(stripActionPrefix(s), '执行命令');
  if (k.includes('list') || /list_dir|list files/i.test(s) || lower.startsWith('列出'))
    return noise ? '列出目录' : pickPath(s, '列出目录');
  if (/grep|search|rg\b|find/i.test(s) || k.includes('search'))
    return noise ? '检索代码' : firstLine(s, '检索代码');
  if (/web_search|search web/i.test(s)) return firstLine(s, '检索网页');
  if (/web_fetch|fetch url|open_page/i.test(s) || k.includes('fetch'))
    return noise ? '获取网页' : firstLine(s, '获取网页');
  if (/git/i.test(s)) return firstLine(s, 'Git 操作');
  if (/plan|todo/i.test(s)) return firstLine(s, '更新计划');
  if (/mcp/i.test(s)) return firstLine(s, 'MCP 调用');
  if (/image|screenshot|imagine|video/i.test(s)) return firstLine(s, '媒体处理');
  if (/memory|remember|flush|dream/i.test(s)) return firstLine(s, '记忆操作');

  if (noise) {
    if (k && KIND_ACTION[k]) return KIND_ACTION[k];
    return '工具调用';
  }

  // Already human Chinese line from parseToolUpdate
  if (/[\u4e00-\u9fff]/.test(s)) {
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }

  if (s.startsWith('{') || s.startsWith('[')) return '工具调用';
  return s.length > 80 ? `${s.slice(0, 80)}…` : s || '工具调用';
}

function stripActionPrefix(s: string): string {
  return s.replace(/^(执行命令|读取文件|编辑文件|列出目录)\s*[·:：]\s*/i, '').trim() || s;
}

export function humanToolStatus(status?: string): {
  label: string;
  tone: 'run' | 'ok' | 'err' | 'idle';
} {
  const s = (status || '').toLowerCase();
  if (!s) return { label: '进行中', tone: 'run' };
  if (/fail|error|denied|cancel/.test(s)) return { label: '失败', tone: 'err' };
  if (/done|completed|success|ok|end/.test(s)) return { label: '已完成', tone: 'ok' };
  if (/pend|wait|queued/.test(s)) return { label: '等待中', tone: 'idle' };
  if (/run|progress|start|in_progress|exec/.test(s)) return { label: '执行中', tone: 'run' };
  return { label: status || '—', tone: 'idle' };
}

function pickPath(s: string, prefix: string): string {
  // Already "读取文件 · foo"
  if (s.startsWith(prefix)) return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  const m =
    s.match(/[`'"]([^`'"]+\.[a-z0-9]+)[`'"]/i) ||
    s.match(/((?:\/|~|\.\/)[^\s`'"]+)/) ||
    s.match(/·\s*([^\s].*)$/);
  if (m?.[1]) {
    const raw = m[1].replace(/^[·:：]\s*/, '');
    const base = raw.split('/').filter(Boolean).slice(-2).join('/') || raw;
    const short = base.length > 40 ? `…${base.slice(-38)}` : base;
    return `${prefix} · ${short}`;
  }
  // "Execute `cmd`" leftovers
  const cmd = s.match(/`([^`]+)`/);
  if (cmd) {
    const c = cmd[1].replace(/\s+/g, ' ');
    return `${prefix} · ${c.length > 48 ? `${c.slice(0, 46)}…` : c}`;
  }
  return prefix;
}

function firstLine(s: string, fallback: string): string {
  if (isNoiseLabel(s)) return fallback;
  if (s.startsWith(fallback)) return s.length > 72 ? `${s.slice(0, 72)}…` : s;
  const line = s.split('\n')[0]?.trim() || fallback;
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}

export function humanPlanStatus(status?: string): string {
  const s = (status || '').toLowerCase();
  if (!s) return '';
  if (/done|complete|finish/.test(s)) return '已完成';
  if (/progress|doing|active|in_progress/.test(s)) return '进行中';
  if (/pend|todo|wait/.test(s)) return '待执行';
  if (/cancel|skip/.test(s)) return '已跳过';
  return status || '';
}

/** Clean plan step text for display (drop JSON dumps / ids). */
export function humanPlanText(raw: string): string {
  const s = (raw || '').replace(/[\u0000-\u001F]/g, ' ').trim();
  if (!s) return '（空步骤）';
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      const t =
        (typeof o.content === 'string' && o.content) ||
        (typeof o.text === 'string' && o.text) ||
        (typeof o.title === 'string' && o.title) ||
        (typeof o.description === 'string' && o.description);
      if (t) return t.length > 200 ? `${t.slice(0, 200)}…` : t;
    } catch {
      /* */
    }
    return '计划步骤';
  }
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

export type PermissionSummary = {
  /** Short category, e.g. 运行命令 */
  kindLabel: string;
  /** One-line human title */
  title: string;
  /** Optional longer description */
  description?: string;
  /** Command or path to show in mono */
  command?: string;
};

/** Turn raw ACP toolCall into copy a person can understand. */
export function summarizePermissionTool(toolCall: unknown): PermissionSummary {
  const o = (toolCall && typeof toolCall === 'object' ? toolCall : {}) as Record<
    string,
    unknown
  >;
  const kind = String(o.kind ?? o.type ?? '').toLowerCase();
  const titleRaw = String(o.title ?? o.name ?? o.label ?? '');
  const descRaw = String(o.description ?? '');
  const rawIn = o.rawInput as Record<string, unknown> | undefined;
  const meta = o._meta as Record<string, unknown> | undefined;
  const xai = meta?.['x.ai/tool'] as Record<string, unknown> | undefined;
  const toolName = String(xai?.name ?? o.toolName ?? '').toLowerCase();

  let command: string | undefined;
  if (rawIn) {
    if (typeof rawIn.command === 'string') command = rawIn.command;
    else if (typeof rawIn.cmd === 'string') command = rawIn.cmd;
    else if (typeof rawIn.path === 'string') command = rawIn.path;
    else if (typeof rawIn.file_path === 'string') command = rawIn.file_path;
    else if (typeof rawIn.filePath === 'string') command = rawIn.filePath;
    else if (typeof rawIn.target_file === 'string') command = rawIn.target_file;
    else if (typeof rawIn.target_directory === 'string') command = rawIn.target_directory;
  }
  // title often: Execute `ls ...`
  if (!command && titleRaw) {
    const m = titleRaw.match(/`([^`]+)`/);
    if (m) command = m[1];
  }

  let kindLabel = '使用工具';
  if (
    kind.includes('exec') ||
    /bash|shell|terminal|run_terminal|command/i.test(toolName + titleRaw)
  ) {
    kindLabel = '运行命令';
  } else if (/read|list/i.test(toolName + kind + titleRaw)) {
    kindLabel = '读取';
  } else if (/write|edit|replace/i.test(toolName + kind + titleRaw)) {
    kindLabel = '修改文件';
  } else if (/search|grep/i.test(toolName + kind + titleRaw)) {
    kindLabel = '搜索';
  } else if (/web|fetch|http/i.test(toolName + kind + titleRaw)) {
    kindLabel = '网络';
  }

  const title =
    descRaw.trim() ||
    humanToolTitle(titleRaw || toolName || command || '', kind) ||
    '需要确认的操作';

  let description = descRaw.trim() || undefined;
  if (description && /locate|approved plan|workspace state/i.test(description)) {
    description = '代理想查看计划文件或工作区状态。';
  }
  if (kindLabel === '运行命令' && command) {
    description = description || '代理想在终端执行下列命令。';
  }

  return {
    kindLabel,
    title: title.length > 120 ? `${title.slice(0, 120)}…` : title,
    description,
    command: command
      ? command.length > 400
        ? `${command.slice(0, 400)}…`
        : command
      : undefined,
  };
}

/** Map engine option labels to short Chinese for buttons. */
export function humanPermissionOptionLabel(name: string | undefined, optionId: string): string {
  const s = `${name ?? ''} ${optionId}`.toLowerCase();
  if (/allow.?always|always.?allow|allow_always/i.test(s)) return '始终允许';
  if (/allow.?once|allow_once|once|yes.?proceed|proceed/i.test(s)) return '允许一次';
  if (/reject.?always|deny.?always|reject_always/i.test(s)) return '始终拒绝';
  if (/reject|deny|no,|cancel|differently/i.test(s)) return '拒绝';
  if (/allow|approve|accept|yes/i.test(s)) return '允许';
  return name || optionId;
}

/** Short file name for review file list. */
export function humanFileName(path: string): { name: string; dir: string } {
  const p = (path || '').replace(/\\/g, '/');
  const parts = p.split('/').filter(Boolean);
  if (parts.length === 0) return { name: path || '（未命名）', dir: '' };
  const name = parts[parts.length - 1];
  const dir = parts.length > 1 ? parts.slice(0, -1).slice(-2).join('/') : '';
  return { name, dir };
}
