import { useEffect, useRef } from 'react';
import type { ChatLine } from './MessageList';
import { sanitizeText, summarizeError, toolKindLabel } from '../lib/chatFormat';
import { humanToolTitle } from '../lib/toolHuman';
import { IconClose, IconThought, IconTool, IconSystem, IconWarning, IconRefresh } from './UiIcons';
import { t } from '../lib/i18n';
import { SubagentTree } from './SubagentTree';

interface Props {
  open: boolean;
  onClose: () => void;
  lines: ChatLine[];
  busy?: boolean;
  /** When set, empty state can open the guided subagent launcher. */
  canSpawnSubagent?: boolean;
  onSpawnSubagent?: () => void;
  onCancelSubagent?: (subagentId: string) => void;
  onInspectSubagent?: (subagentId: string) => void;
}

/** Agent process stream (thinking + tools + system). Closed by default — open when you care. */
export function ProcessPanel({
  open,
  onClose,
  lines,
  busy,
  canSpawnSubagent,
  onSpawnSubagent,
  onCancelSubagent,
  onInspectSubagent,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const processLines = lines.filter(
    (l) => l.role === 'thought' || l.role === 'tool' || l.role === 'system',
  );

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, processLines.length, busy]);

  if (!open) return null;

  return (
    <div className="process-panel" aria-label={t('processTitle')}>
      <div className="process-head">
        <div className="process-title">
          <span aria-hidden className="process-title-ico">
            <IconRefresh size={14} />
          </span>
          {t('processTitle')}
          {busy ? <span className="process-live">{t('processLive')}</span> : null}
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
            {processLines.length}
          </span>
        </div>
        <button
          type="button"
          className="btn-icon"
          title={t('processClose')}
          aria-label={t('processClose')}
          onClick={onClose}
        >
          <IconClose size={15} />
        </button>
      </div>
      <div className="process-body">
        <SubagentTree
          lines={processLines}
          onCancel={onCancelSubagent}
          onInspect={onInspectSubagent}
        />
        {processLines.length === 0 ? (
          <div className="ext-empty-card" style={{ margin: '10px 8px' }}>
            <p className="hint" style={{ margin: 0 }}>{t('processEmpty')}</p>
            <p className="settings-row-hint" style={{ marginTop: 8 }}>{t('processEmptyHint')}</p>
            {canSpawnSubagent && onSpawnSubagent ? (
              <div className="field-row" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-sm primary-sm" onClick={onSpawnSubagent}>
                  {t('plusSpawnSubagent')}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          processLines.map((line) => {
            const clean = sanitizeText(line.text);
            if (!clean) return null;
            if (line.role === 'thought') {
              return (
                <div key={line.id} className="process-item thought">
                  <div className="process-item-label">
                    <IconThought size={13} /> {t('thinking')}
                  </div>
                  <pre className="process-item-body">{clean}</pre>
                </div>
              );
            }
            if (line.role === 'tool') {
              const title = humanToolTitle(clean, line.toolKind || toolKindLabel(line.toolKind));
              const failed = /fail|error/i.test(line.toolStatus || '');
              const bodyUseful =
                clean &&
                !/^call-[0-9a-f-]+/i.test(clean) &&
                clean !== title;
              return (
                <div key={line.id} className={`process-item tool${failed ? ' fail' : ''}`}>
                  <div className="process-item-label">
                    {failed ? <IconWarning size={13} /> : <IconTool size={13} />}{' '}
                    {title.slice(0, 120)}
                    {line.toolStatus ? (
                      <span className="muted">
                        {' '}
                        ·{' '}
                        {/fail/i.test(line.toolStatus)
                          ? '失败'
                          : /complete|done|success/i.test(line.toolStatus)
                            ? '已完成'
                            : line.toolStatus}
                      </span>
                    ) : null}
                  </div>
                  {bodyUseful || failed ? (
                    <pre className="process-item-body">
                      {failed ? summarizeError(clean) : clean.slice(0, 4000)}
                      {!failed && clean.length > 4000 ? '\n…' : ''}
                    </pre>
                  ) : null}
                </div>
              );
            }
            return (
              <div key={line.id} className="process-item system">
                <div className="process-item-label">
                  <IconSystem size={13} /> {t('system')}
                </div>
                <pre className="process-item-body">{clean.slice(0, 2000)}</pre>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
