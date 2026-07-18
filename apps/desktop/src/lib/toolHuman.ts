/** Turn raw agent tool labels into short human-readable Chinese/English status. */

export function humanToolTitle(raw: string, kind?: string): string {
  const s = (raw || '').replace(/[\u0000-\u001F]/g, ' ').trim();
  const k = (kind || '').toLowerCase();
  const lower = s.toLowerCase();

  if (k.includes('read') || /^read\b/i.test(s) || lower.includes('read_file'))
    return pickPath(s, '读取文件');
  if (k.includes('edit') || /write|edit|search_replace|str_replace/i.test(s))
    return pickPath(s, '编辑文件');
  if (k.includes('bash') || /shell|terminal|bash|command/i.test(s))
    return firstLine(s, '运行命令');
  if (/grep|search|rg\b|find/i.test(s)) return firstLine(s, '搜索代码');
  if (/list_dir|list dir|ls\b/i.test(s)) return pickPath(s, '列出目录');
  if (/web_search|search web/i.test(s)) return firstLine(s, '网页搜索');
  if (/web_fetch|fetch url|open_page/i.test(s)) return firstLine(s, '打开网页');
  if (/git/i.test(s)) return firstLine(s, 'Git 操作');
  if (/plan|todo/i.test(s)) return firstLine(s, '更新计划');
  if (/mcp/i.test(s)) return firstLine(s, 'MCP 工具');
  if (/image|screenshot/i.test(s)) return firstLine(s, '图像');

  // Truncate noisy JSON
  if (s.startsWith('{') || s.startsWith('[')) return '工具调用';
  return s.length > 80 ? `${s.slice(0, 80)}…` : s || '工具';
}

export function humanToolStatus(status?: string): { label: string; tone: 'run' | 'ok' | 'err' | 'idle' } {
  const s = (status || '').toLowerCase();
  if (!s) return { label: '进行中', tone: 'run' };
  if (/fail|error|denied|cancel/.test(s)) return { label: '失败', tone: 'err' };
  if (/done|completed|success|ok|end/.test(s)) return { label: '完成', tone: 'ok' };
  if (/pend|wait|queued/.test(s)) return { label: '等待', tone: 'idle' };
  if (/run|progress|start|in_progress|exec/.test(s)) return { label: '执行中', tone: 'run' };
  return { label: status || '—', tone: 'idle' };
}

function pickPath(s: string, prefix: string): string {
  const m =
    s.match(/[`'"]([^`'"]+\.[a-z0-9]+)[`'"]/i) ||
    s.match(/((?:\/|~|\.\/)[^\s`'"]+)/);
  if (m?.[1]) {
    const base = m[1].split('/').filter(Boolean).pop() || m[1];
    return `${prefix} · ${base}`;
  }
  return prefix;
}

function firstLine(s: string, fallback: string): string {
  const line = s.split('\n')[0]?.trim() || fallback;
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}

export function humanPlanStatus(status?: string): string {
  const s = (status || '').toLowerCase();
  if (!s) return '';
  if (/done|complete|finish/.test(s)) return '已完成';
  if (/progress|doing|active|in_progress/.test(s)) return '进行中';
  if (/pend|todo|wait/.test(s)) return '待办';
  if (/cancel|skip/.test(s)) return '已跳过';
  return status || '';
}
