import { t } from '../lib/i18n';

export interface ToolEvent {
  id: string;
  label: string;
  status?: string;
}

interface Props {
  tools: ToolEvent[];
}

/** Codex hides noisy tool strip; keep only when actively busy (last 3). */
export function ToolTimeline({ tools }: Props) {
  const running = tools.filter((x) => {
    const s = (x.status || '').toLowerCase();
    return s && !/done|completed|success|fail|error/.test(s);
  });
  if (running.length === 0) return null;
  const slice = running.slice(-3);
  return (
    <div className="tool-timeline" aria-label={t('tools')}>
      {slice.map((tool) => {
        const label = tool.label.replace(/[\u0000-\u001F]/g, '').slice(0, 40);
        return (
          <div key={tool.id} className="tool-chip" title={tool.label}>
            <span className="tool-dot" />
            <span className="tool-label">
              {label}
              {tool.label.length > 40 ? '…' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
