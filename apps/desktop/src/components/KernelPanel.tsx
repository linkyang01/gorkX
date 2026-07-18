import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-dialog';
import type { GrokStatus } from '../lib/acpClient';
import { clearChatCache, storeDataDir, storeDbPath } from '../lib/threads';
import { revealInFinder } from '../lib/host';
import { shellExec } from '../lib/terminal';
import { fetchAccountSummary, fetchSubscriptionModels } from '../lib/account';
import type { AccountSummary } from '../lib/account';
import { t } from '../lib/i18n';

const APP_VERSION = '0.3.6';

interface Props {
  open: boolean;
  onClose: () => void;
  grokCmd: string;
  onGrokCmd: (path: string) => void;
  status: GrokStatus | null;
  onRefresh: () => void;
  project?: string;
  account?: AccountSummary | null;
  onModelsRefreshed?: () => void;
}

function channelLabel(ch: string | undefined): string {
  switch (ch) {
    case 'custom':
      return t('channelCustom');
    case 'env':
      return t('channelEnv');
    case 'missing':
      return t('channelMissing');
    default:
      return t('channelOfficial');
  }
}

export function KernelPanel({
  open: isOpen,
  onClose,
  grokCmd,
  onGrokCmd,
  status,
  onRefresh,
  project,
  account: accountProp,
  onModelsRefreshed,
}: Props) {
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(accountProp ?? null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void storeDbPath().then(setDbPath);
    void storeDataDir().then(setDataDir);
    void fetchAccountSummary().then(setAccount);
  }, [isOpen]);

  useEffect(() => {
    if (accountProp) setAccount(accountProp);
  }, [accountProp]);

  if (!isOpen) return null;

  const browse = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
    });
    if (typeof selected === 'string') {
      onGrokCmd(selected);
    }
  };

  const clearCache = async () => {
    const n = await clearChatCache(project);
    setMsg(t('clearCacheDone').replace('{n}', String(n)));
  };

  const runSubLogin = async () => {
    setLoginBusy(true);
    setMsg(t('subLoginHint'));
    try {
      const bin = (status?.grokPath || grokCmd || 'grok').trim() || 'grok';
      // Interactive OIDC needs a real Terminal (shell_exec has no TTY).
      const script = `tell application "Terminal" to do script ${JSON.stringify(`${bin} login`)}`;
      await shellExec(`osascript -e ${JSON.stringify(script)}`);
      setMsg(t('subLoginDone'));
      // Give user time to finish browser login, then recheck
      window.setTimeout(() => {
        onRefresh();
        void fetchAccountSummary().then(setAccount);
      }, 4000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginBusy(false);
    }
  };

  const refreshModels = async () => {
    setMsg('…');
    try {
      const rows = await fetchSubscriptionModels(true);
      // Cross-check with official CLI `grok models` (same catalog Grok Build uses)
      let cliNote = '';
      try {
        const bin = (status?.grokPath || grokCmd || 'grok').trim() || 'grok';
        const r = await shellExec(`${JSON.stringify(bin)} models`);
        const out = `${r.stdout || ''}\n${r.stderr || ''}`;
        const stars = (out.match(/^\s*\*\s+\S+/gm) || []).length;
        const lines = out
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('*'));
        cliNote =
          lines.length > 0
            ? ` · grok models: ${lines.map((l) => l.replace(/^\*\s+/, '')).join(', ')}`
            : stars
              ? ` · grok models: ${stars}`
              : '';
      } catch {
        /* optional */
      }
      const names = rows.map((r) => r.name || r.modelId).join(', ') || '—';
      setMsg(
        `${t('refreshModels')}: ${names} (${rows.length})${cliNote}` +
          (rows.length <= 1 ? `\n${t('modelSubOnlyOneHint')}` : ''),
      );
      onModelsRefreshed?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal kernel-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('settings')}
      >
        <div className="modal-head">
          <h2>{t('settings')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="kernel-meta" style={{ marginBottom: 12 }}>
          <div>
            <span className="muted">gorkX</span>
            <div className="mono">v{APP_VERSION}</div>
          </div>
          <div>
            <span className="muted">{t('kernelVersion')}</span>
            <div className="mono">{status?.version || '—'}</div>
          </div>
        </div>

        <h3 className="subhead">{t('subAccount')}</h3>
        <div className="upgrade-block" style={{ marginBottom: 12 }}>
          <div className="mono" style={{ fontSize: 12 }}>
            {account?.email ||
              (status?.authenticated ? 'session' : t('statusNeedLogin'))}
          </div>
          {account?.quotaLabel ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {account.quotaLabel}
            </div>
          ) : null}
          <p className="hint" style={{ marginTop: 8 }}>
            {t('subLoginHint')}
          </p>
          <div className="field-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={loginBusy || !status?.installed}
              onClick={() => void runSubLogin()}
            >
              {t('subLogin')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!status?.authenticated}
              onClick={() => void refreshModels()}
            >
              {t('refreshModels')}
            </button>
          </div>
        </div>

        <p className="kernel-note">{t('upgradeNote')}</p>

        <label className="field">
          <span>{t('kernelPath')}</span>
          <div className="field-row">
            <input
              value={grokCmd}
              onChange={(e) => onGrokCmd(e.target.value)}
              placeholder={t('kernelPathHint')}
              spellCheck={false}
            />
            <button type="button" className="btn" onClick={() => void browse()}>
              {t('kernelBrowse')}
            </button>
          </div>
        </label>
        <div className="field-row">
          <button type="button" className="btn" onClick={() => onGrokCmd('')}>
            {t('kernelClear')}
          </button>
          <button type="button" className="btn primary" onClick={onRefresh}>
            {t('kernelRefresh')}
          </button>
        </div>

        <div className="kernel-meta">
          <div>
            <span className="muted">{t('kernelChannel')}</span>
            <div>{channelLabel(status?.channel)}</div>
          </div>
          <div className="full">
            <span className="muted">Resolved</span>
            <div className="mono path-wrap">{status?.grokPath || '—'}</div>
          </div>
          <div className="full">
            <span className="muted">Status</span>
            <div>{status?.detail || '—'}</div>
          </div>
        </div>

        <h3 className="subhead">{t('dataTitle')}</h3>
        <div className="upgrade-block">
          <div className="upgrade-label">{t('dataDir')}</div>
          <div className="mono path-wrap" style={{ fontSize: 11 }}>
            {dataDir || '—'}
          </div>
          <div className="upgrade-label" style={{ marginTop: 8 }}>
            SQLite
          </div>
          <div className="mono path-wrap" style={{ fontSize: 11 }}>
            {dbPath || '—'}
          </div>
          <div className="field-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!dataDir}
              onClick={() => dataDir && void revealInFinder(dataDir).catch(() => {})}
            >
              {t('openDataDir')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void clearCache()}>
              {t('clearChatCache')}
            </button>
          </div>
          {msg ? <div className="hint" style={{ marginTop: 6 }}>{msg}</div> : null}
        </div>

        <h3 className="subhead">{t('upgradeTitle')}</h3>

        <div className="upgrade-block">
          <div className="upgrade-label">{t('upgradeOfficial')}</div>
          <pre className="upgrade-code">{status?.upgradeOfficial}</pre>
        </div>
        <div className="upgrade-block">
          <div className="upgrade-label">{t('upgradeSource')}</div>
          <pre className="upgrade-code">{status?.upgradeSource}</pre>
          {status?.sourceRepoHint ? (
            <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
              hint: {status.sourceRepoHint}
            </div>
          ) : null}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void openUrl(status?.sourceUrl || 'https://github.com/xai-org/grok-build')
            }
          >
            {t('openSourceRepo')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void openUrl(status?.docsUrl || 'https://docs.x.ai/build/overview')
            }
          >
            {t('openDocs')}
          </button>
        </div>
      </div>
    </div>
  );
}
