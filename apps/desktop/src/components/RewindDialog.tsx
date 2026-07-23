import { useEffect, useMemo, useState } from 'react';
import type { RewindMode, RewindPoint } from '../lib/acpClient';
import { t } from '../lib/i18n';

interface Props {
  points: RewindPoint[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (point: RewindPoint, mode: RewindMode) => void;
}

const modes: Array<{ id: RewindMode; titleKey: 'rewindModeConversation' | 'rewindModeFiles' | 'rewindModeAll'; hintKey: 'rewindModeConversationHint' | 'rewindModeFilesHint' | 'rewindModeAllHint' }> = [
  { id: 'conversation_only', titleKey: 'rewindModeConversation', hintKey: 'rewindModeConversationHint' },
  { id: 'files_only', titleKey: 'rewindModeFiles', hintKey: 'rewindModeFilesHint' },
  { id: 'all', titleKey: 'rewindModeAll', hintKey: 'rewindModeAllHint' },
];

/**
 * A deliberate destructive-action gate for Grok Build's native rewind API.
 * A failed conflict check remains visible and never offers automatic force.
 */
export function RewindDialog({ points, busy = false, error, onClose, onConfirm }: Props) {
  const sorted = useMemo(
    () => [...points].sort((a, b) => b.promptIndex - a.promptIndex),
    [points],
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<RewindMode>('conversation_only');

  useEffect(() => {
    setSelected(sorted[0]?.promptIndex ?? null);
    setMode('conversation_only');
  }, [sorted]);

  const point = sorted.find((item) => item.promptIndex === selected) ?? null;
  return (
    <div className="modal-backdrop rewind-backdrop" role="presentation">
      <section className="modal rewind-modal" role="dialog" aria-modal="true" aria-labelledby="rewind-title">
        <header className="rewind-head">
          <div>
            <p className="rewind-eyebrow">{t('rewindEyebrow')}</p>
            <h2 id="rewind-title">{t('rewindTitle')}</h2>
          </div>
          <span className="rewind-badge">{t('rewindSafetyBadge')}</span>
        </header>
        <p className="rewind-explain">{t('rewindExplain')}</p>

        {sorted.length ? (
          <div className="rewind-points" role="radiogroup" aria-label={t('rewindPointTitle')}>
            <strong>{t('rewindPointTitle')}</strong>
            {sorted.map((item) => (
              <label className={`rewind-point${item.promptIndex === selected ? ' selected' : ''}`} key={item.promptIndex}>
                <input type="radio" checked={item.promptIndex === selected} onChange={() => setSelected(item.promptIndex)} />
                <span className="rewind-point-main">
                  <span>{item.promptPreview?.trim() || t('rewindPointUntitled')}</span>
                  <small>{t('rewindPointNumber').replace('{n}', String(item.promptIndex + 1))}</small>
                </span>
                <span className="rewind-point-files">
                  {item.hasFileChanges
                    ? t('rewindPointFiles').replace('{n}', String(item.numFileSnapshots))
                    : t('rewindPointNoFiles')}
                </span>
              </label>
            ))}
          </div>
        ) : <div className="rewind-empty">{t('rewindEmpty')}</div>}

        {point ? (
          <fieldset className="rewind-modes" disabled={busy}>
            <legend>{t('rewindScopeTitle')}</legend>
            {modes.map((item) => (
              <label className={`rewind-mode${mode === item.id ? ' selected' : ''}`} key={item.id}>
                <input type="radio" name="rewind-mode" checked={mode === item.id} onChange={() => setMode(item.id)} />
                <span><strong>{t(item.titleKey)}</strong><small>{t(item.hintKey)}</small></span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {error ? <p className="rewind-error" role="alert">{error}</p> : null}
        <p className="rewind-warning">{t('rewindWarning')}</p>
        <footer className="rewind-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn danger" disabled={!point || busy} onClick={() => point && onConfirm(point, mode)}>
            {busy ? t('rewindWorking') : t('rewindConfirm')}
          </button>
        </footer>
      </section>
    </div>
  );
}
