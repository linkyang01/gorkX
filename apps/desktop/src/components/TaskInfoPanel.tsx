import { useCallback, useEffect, useState } from 'react';
import type { AcpClient, SessionSnapshot } from '../lib/acpClient';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  client: AcpClient | null;
  sessionId: string | null;
  onClose: () => void;
  onManageAuth?: (destination: 'account' | 'models') => void;
}

function number(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '—';
}

/** A readable desktop surface for the engine's read-only session snapshot. */
function authSourceLabel(source: SessionSnapshot['authSource']) {
  switch (source) {
    case 'oauth': return t('taskInfoAuthOAuth');
    case 'api_key': return t('taskInfoAuthApiKey');
    case 'external': return t('taskInfoAuthExternal');
    case 'not_authenticated': return t('taskInfoAuthNone');
    default: return '—';
  }
}

export function TaskInfoPanel({ open, client, sessionId, onClose, onManageAuth }: Props) {
  const [info, setInfo] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!client || !sessionId) {
      setInfo(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setInfo(await client.getSessionInfo(sessionId));
    } catch (cause) {
      setInfo(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [client, sessionId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  if (!open) return null;
  const context = info?.context;
  const usedPct = typeof context?.usagePct === 'number'
    ? Math.max(0, Math.min(100, context.usagePct))
    : context?.total ? Math.round(((context.used ?? 0) / context.total) * 100) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal ext-modal task-info-modal" role="dialog" aria-modal="true" aria-label={t('taskInfoTitle')} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{t('taskInfoTitle')}</h2>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t('taskInfoHint')}</div>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('taskInfoClose')}>×</button>
        </div>
        <div className="ext-toolbar task-info-toolbar">
          <button type="button" className="btn btn-sm" disabled={loading || !client || !sessionId} onClick={() => void load()}>
            {loading ? t('taskInfoLoading') : t('extRefresh')}
          </button>
        </div>
        {!client || !sessionId ? <div className="hint">{t('taskInfoNoTask')}</div> : null}
        {error ? <pre className="ext-msg err">{error}</pre> : null}
        {info ? <div className="task-info-content">
          <div className="task-info-grid">
            <div><span>{t('taskInfoModel')}</span><strong>{info.modelDisplayName || info.model || '—'}</strong></div>
            <div><span>{t('taskInfoAgent')}</span><strong>{info.agentName || '—'}</strong></div>
            <div><span>{t('taskInfoTurns')}</span><strong>{number(info.turns)}</strong></div>
            <div><span>{t('taskInfoAuthSource')}</span><strong>{authSourceLabel(info.authSource)}</strong></div>
          </div>
          {onManageAuth && (info.authManagement === 'account' || info.authManagement === 'models') ? (
            <div className="task-info-auth-action">
              <button type="button" className="btn btn-sm" onClick={() => onManageAuth(info.authManagement as 'account' | 'models')}>
                {info.authManagement === 'models' ? t('taskInfoManageModels') : t('taskInfoManageAccount')}
              </button>
            </div>
          ) : null}
          <section className="task-info-context">
            <div className="task-info-context-head"><strong>{t('taskInfoContext')}</strong><span>{usedPct}%</span></div>
            <div className="task-info-meter" aria-label={t('taskInfoContext')}><i style={{ width: `${usedPct}%` }} /></div>
            <div className="task-info-grid task-info-metrics">
              <div><span>{t('taskInfoUsed')}</span><strong>{number(context?.used)}</strong></div>
              <div><span>{t('taskInfoAvailable')}</span><strong>{number(context?.freeTokens)}</strong></div>
              <div><span>{t('taskInfoCapacity')}</span><strong>{number(context?.total)}</strong></div>
              <div><span>{t('taskInfoToolCalls')}</span><strong>{number(context?.toolCallCount)}</strong></div>
            </div>
          </section>
          <div className="task-info-path"><span>{t('taskInfoFolder')}</span><code>{info.cwd}</code></div>
        </div> : null}
      </section>
    </div>
  );
}
