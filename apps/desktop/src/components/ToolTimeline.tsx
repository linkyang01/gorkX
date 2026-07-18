import { t } from '../lib/i18n';
import { humanToolTitle } from '../lib/toolHuman';

export interface ToolEvent {
  id: string;
  label: string;
  status?: string;
  kind?: string;
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
        const title = humanToolTitle(tool.label, tool.kind);
        const label = title.replace(/[\u0000-\u001F]/g, '').slice(0, 40);
        return (
          <div key={tool.id} className="tool-chip" title={title}>
            <span className="tool-dot" />
            <span className="tool-label">
              {label}
              {title.length > 40 ? '…' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
