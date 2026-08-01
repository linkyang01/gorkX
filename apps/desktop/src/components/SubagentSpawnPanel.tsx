import { useState } from 'react';
import type { AcpClient } from '../lib/acpClient';
import { t } from '../lib/i18n';

type CapabilityMode = 'read-only' | 'read-write' | 'execute' | 'all';
type Isolation = 'none' | 'worktree';

export type SubagentSpawnStarted = {
  subagentId: string;
  description: string;
  subagentType: string;
  capabilityMode: CapabilityMode;
  isolation: Isolation;
};

interface Props {
  open: boolean;
  client: AcpClient | null;
  sessionId: string | null;
  onClose: () => void;
  onStarted: (started: SubagentSpawnStarted) => void;
}

/** Guided launcher for the kernel-native subagent coordinator. */
export function SubagentSpawnPanel({ open, client, sessionId, onClose, onStarted }: Props) {
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [subagentType, setSubagentType] = useState('general-purpose');
  const [capabilityMode, setCapabilityMode] = useState<CapabilityMode>('read-only');
  const [isolation, setIsolation] = useState<Isolation>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;
  const canStart = Boolean(client && sessionId && prompt.trim() && description.trim() && !busy);
  const submit = async () => {
    if (!client || !sessionId || !canStart) return;
    if (capabilityMode !== 'read-only' && isolation !== 'worktree' && !window.confirm(t('subagentSpawnSharedWorkspaceConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.spawnSubagent({
        sessionId,
        prompt: prompt.trim(),
        description: description.trim(),
        subagentType,
        capabilityMode,
        isolation,
      });
      onStarted({
        subagentId: result.subagentId,
        description: description.trim(),
        subagentType,
        capabilityMode: (result.capabilityMode as CapabilityMode) || capabilityMode,
        isolation: (result.isolation as Isolation) || isolation,
      });
      setPrompt('');
      setDescription('');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal ext-modal subagent-spawn-modal" role="dialog" aria-modal="true" aria-label={t('subagentSpawnTitle')} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{t('subagentSpawnTitle')}</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>{t('subagentSpawnHint')}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('subagentSpawnClose')}>×</button>
        </div>
        {!client || !sessionId ? <p className="hint">{t('subagentSpawnNoTask')}</p> : null}
        <label className="field-label" htmlFor="subagent-spawn-description">{t('subagentSpawnDescription')}</label>
        <input id="subagent-spawn-description" className="settings-input" maxLength={120} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('subagentSpawnDescriptionPlaceholder')} />
        <label className="field-label" htmlFor="subagent-spawn-prompt">{t('subagentSpawnPrompt')}</label>
        <textarea id="subagent-spawn-prompt" className="settings-textarea subagent-spawn-prompt" rows={6} maxLength={12000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('subagentSpawnPromptPlaceholder')} />
        <div className="subagent-spawn-grid">
          <label className="field-label">{t('subagentSpawnRole')}
            <select className="settings-input" value={subagentType} onChange={(event) => setSubagentType(event.target.value)}>
              <option value="general-purpose">{t('subagentSpawnRoleGeneral')}</option>
              <option value="explore">{t('subagentSpawnRoleExplore')}</option>
              <option value="plan">{t('subagentSpawnRolePlan')}</option>
            </select>
          </label>
          <label className="field-label">{t('subagentSpawnAccess')}
            <select className="settings-input" value={capabilityMode} onChange={(event) => setCapabilityMode(event.target.value as CapabilityMode)}>
              <option value="read-only">{t('subagentSpawnReadOnly')}</option>
              <option value="read-write">{t('subagentSpawnReadWrite')}</option>
              <option value="execute">{t('subagentSpawnExecute')}</option>
              <option value="all">{t('subagentSpawnAll')}</option>
            </select>
          </label>
        </div>
        <label className="field-label">{t('subagentSpawnIsolation')}
          <select className="settings-input" value={isolation} onChange={(event) => setIsolation(event.target.value as Isolation)}>
            <option value="none">{t('subagentSpawnShared')}</option>
            <option value="worktree">{t('subagentSpawnWorktree')}</option>
          </select>
        </label>
        <p className="hint subagent-spawn-safety">{capabilityMode === 'read-only' ? t('subagentSpawnReadOnlyHint') : t('subagentSpawnWriteHint')}</p>
        {error ? <pre className="ext-msg err">{error}</pre> : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn primary" disabled={!canStart} onClick={() => void submit()}>{busy ? t('subagentSpawnStarting') : t('subagentSpawnStart')}</button>
        </div>
      </section>
    </div>
  );
}
