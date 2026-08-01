import type { ChatLine } from './MessageList';
import { IconTool } from './UiIcons';
import { t } from '../lib/i18n';

type Node = {
  id: string;
  line: ChatLine;
  children: Node[];
};

/**
 * Build a display tree strictly from native lifecycle events. If an older
 * kernel omits a parent id, its task remains a direct child of this session.
 * This intentionally does not invent a parent/child relationship in the UI.
 */
export function subagentTree(lines: ChatLine[]): Node[] {
  const rows = lines.flatMap((line) => {
    if (line.role !== 'tool' || line.toolKind !== 'subagent') return [];
    const id = line.toolKey?.replace(/^subagent:/, '');
    return id ? [{ id, line, children: [] as Node[] }] : [];
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const roots: Node[] = [];
  for (const row of rows) {
    const parent = row.line.parentSubagentId;
    const parentNode = parent ? byId.get(parent) : undefined;
    if (parentNode && parentNode !== row) parentNode.children.push(row);
    else roots.push(row);
  }
  return roots;
}

/** Kernel statuses include completed / cancelled / failed — not only bare stems. */
function isRunningStatus(raw: string): boolean {
  return /^(running|initializing|cancelling)\b/i.test(raw);
}

function isTerminalStatus(raw: string): boolean {
  return /^(complet|done|success|fail|error|cancel)/i.test(raw.trim());
}

function statusLabel(raw: string | undefined): string {
  if (!raw) return t('subagentTreeRunning');
  if (/unverified|not verified|未验证/i.test(raw)) return t('subagentTreeUnverified');
  if (isRunningStatus(raw)) return t('subagentTreeRunning');
  if (/fail|error/i.test(raw)) return t('subagentTreeFailed');
  if (/complete|done|success/i.test(raw)) return t('subagentTreeComplete');
  if (/cancel/i.test(raw)) return t('subagentTreeCancelled');
  return raw;
}

function NodeRow({
  node,
  depth,
  onCancel,
  onInspect,
}: {
  node: Node;
  depth: number;
  onCancel?: (subagentId: string) => void;
  onInspect?: (subagentId: string) => void;
}) {
  const label = node.line.text.replace(/^子任务\s*·\s*/, '').trim() || node.id.slice(0, 8);
  const status = node.line.toolStatus || '';
  const canCancel = isRunningStatus(status);
  const canInspect = isTerminalStatus(status);
  return (
    <li className="subagent-tree-row" style={{ paddingLeft: depth * 16 }}>
      <div className="subagent-tree-label">
        <IconTool size={13} />
        <span>{label}</span>
        <span className="muted">· {statusLabel(status)}</span>
        {canCancel && onCancel ? (
          <button type="button" className="btn btn-sm" onClick={() => onCancel(node.id)}>
            {t('subagentTreeStop')}
          </button>
        ) : null}
        {canInspect && onInspect ? (
          <button type="button" className="btn btn-sm" onClick={() => onInspect(node.id)}>
            {t('subagentTreeInspect')}
          </button>
        ) : null}
      </div>
      {node.children.length ? (
        <ul className="subagent-tree-list">
          {node.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onCancel={onCancel}
              onInspect={onInspect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SubagentTree({
  lines,
  onCancel,
  onInspect,
}: {
  lines: ChatLine[];
  onCancel?: (subagentId: string) => void;
  onInspect?: (subagentId: string) => void;
}) {
  const roots = subagentTree(lines);
  if (!roots.length) return null;
  return (
    <section className="subagent-tree" aria-label={t('subagentTreeTitle')}>
      <div className="subagent-tree-head">
        <strong>{t('subagentTreeTitle')}</strong>
        <span className="muted">{roots.length}</span>
      </div>
      <p className="subagent-tree-hint">{t('subagentTreeHint')}</p>
      <ul className="subagent-tree-list">
        {roots.map((node) => (
          <NodeRow key={node.id} node={node} depth={0} onCancel={onCancel} onInspect={onInspect} />
        ))}
      </ul>
    </section>
  );
}
