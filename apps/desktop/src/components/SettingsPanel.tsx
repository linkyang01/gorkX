import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { GrokStatus, PermissionMode } from '../lib/acpClient';
import type { AccountSummary } from '../lib/account';
import { fetchAccountSummary, fetchSubscriptionModels } from '../lib/account';
import { clearChatCache, storeDataDir, storeDbPath } from '../lib/threads';
import { revealInFinder } from '../lib/host';
import { shellExec } from '../lib/terminal';
import {
  checkAppUpdate,
  checkKernelUpdate,
  GORKX_GITHUB,
  GROK_KERNEL_GITHUB,
  openUrlSafe,
  runKernelUpdate,
  type AppUpdateInfo,
  type KernelUpdateInfo,
} from '../lib/updates';
import { t } from '../lib/i18n';

const APP_VERSION = '0.3.7'; // keep in sync with package.json

type Section =
  | 'general'
  | 'account'
  | 'updates'
  | 'data'
  | 'kernel'
  | 'about';

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
  perm: PermissionMode;
  onPerm: (p: PermissionMode) => void;
  locale?: string;
  onLocale?: (l: string) => void;
}

export function SettingsPanel({
  open: isOpen,
  onClose,
  grokCmd,
  onGrokCmd,
  status,
  onRefresh,
  project,
  account: accountProp,
  onModelsRefreshed,
  perm,
  onPerm,
}: Props) {
  const [section, setSection] = useState<Section>('general');
  const [account, setAccount] = useState<AccountSummary | null>(accountProp ?? null);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [kernelUp, setKernelUp] = useState<KernelUpdateInfo | null>(null);
  const [appUp, setAppUp] = useState<AppUpdateInfo | null>(null);
  const [upBusy, setUpBusy] = useState(false);

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

  const browseKernel = async () => {
    const selected = await open({ multiple: false, directory: false });
    if (typeof selected === 'string') onGrokCmd(selected);
  };

  const runSubLogin = async () => {
    setLoginBusy(true);
    setMsg(t('subLoginHint'));
    try {
      const bin = (status?.grokPath || grokCmd || 'grok').trim() || 'grok';
      const script = `tell application "Terminal" to do script ${JSON.stringify(`${bin} login`)}`;
      await shellExec(`osascript -e ${JSON.stringify(script)}`);
      setMsg(t('subLoginDone'));
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

  const doLogout = async () => {
    try {
      const bin = (status?.grokPath || grokCmd || 'grok').trim() || 'grok';
      await shellExec(`${JSON.stringify(bin)} logout`);
      setMsg(t('logout'));
      onRefresh();
      setAccount(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshModels = async () => {
    setMsg('…');
    try {
      const rows = await fetchSubscriptionModels(true);
      setMsg(
        `${t('refreshModels')}: ${rows.map((r) => r.name || r.modelId).join(', ') || '—'} (${rows.length})`,
      );
      onModelsRefreshed?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const checkKernel = async () => {
    setUpBusy(true);
    setMsg(t('updateChecking'));
    try {
      const info = await checkKernelUpdate(status?.grokPath || grokCmd);
      setKernelUp(info);
      setMsg(
        info.updateAvailable
          ? t('updateAvailable')
              .replace('{cur}', info.currentVersion)
              .replace('{latest}', info.latestVersion)
          : t('updateLatest').replace('{v}', info.latestVersion || info.currentVersion),
      );
    } finally {
      setUpBusy(false);
    }
  };

  const applyKernel = async () => {
    setUpBusy(true);
    setMsg(t('updateInstalling'));
    try {
      const r = await runKernelUpdate(status?.grokPath || grokCmd);
      setMsg(r.ok ? t('updateDone') : r.log.slice(0, 400));
      onRefresh();
      await checkKernel();
    } finally {
      setUpBusy(false);
    }
  };

  const checkApp = async () => {
    setUpBusy(true);
    setMsg(t('updateChecking'));
    try {
      const info = await checkAppUpdate(APP_VERSION);
      setAppUp(info);
      setMsg(
        info.error
          ? `${t('updateFail')}: ${info.error}`
          : info.updateAvailable
            ? t('updateAvailable')
                .replace('{cur}', info.currentVersion)
                .replace('{latest}', info.latestVersion)
            : t('updateLatest').replace('{v}', info.latestVersion || info.currentVersion),
      );
    } finally {
      setUpBusy(false);
    }
  };

  const nav: { id: Section; label: string }[] = [
    { id: 'general', label: t('settingsGeneral') },
    { id: 'account', label: t('settingsAccount') },
    { id: 'updates', label: t('settingsUpdates') },
    { id: 'kernel', label: t('settingsKernel') },
    { id: 'data', label: t('settingsData') },
    { id: 'about', label: t('settingsAbout') },
  ];

  return (
    <div className="modal-backdrop settings-backdrop" onClick={onClose}>
      <div
        className="settings-shell"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('settings')}
      >
        <aside className="settings-nav">
          <button type="button" className="settings-back" onClick={onClose}>
            ← {t('settingsBack')}
          </button>
          <div className="settings-nav-title">{t('settings')}</div>
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              className={section === n.id ? 'settings-nav-item on' : 'settings-nav-item'}
              onClick={() => setSection(n.id)}
            >
              {n.label}
            </button>
          ))}
        </aside>

        <section className="settings-main">
          {section === 'general' ? (
            <>
              <h2>{t('settingsGeneral')}</h2>
              <h3 className="subhead">{t('permission')}</h3>
              <div className="settings-card">
                {(
                  [
                    ['default', t('permDefault'), t('permDefaultHint')],
                    ['auto', t('permAuto'), t('permAutoHint')],
                    ['full', t('permFull'), t('permFullHint')],
                  ] as const
                ).map(([id, title, hint]) => (
                  <label key={id} className="settings-row toggle-row">
                    <div>
                      <div className="settings-row-title">{title}</div>
                      <div className="settings-row-hint">{hint}</div>
                    </div>
                    <input
                      type="radio"
                      name="perm"
                      checked={perm === id}
                      onChange={() => onPerm(id)}
                    />
                  </label>
                ))}
              </div>
              <h3 className="subhead">{t('settingsComposer')}</h3>
              <div className="settings-card muted-block">
                <p className="hint">{t('settingsComposerHint')}</p>
              </div>
            </>
          ) : null}

          {section === 'account' ? (
            <>
              <h2>{t('settingsAccount')}</h2>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">
                      {account?.displayName || account?.email || t('statusNeedLogin')}
                    </div>
                    <div className="settings-row-hint mono">{account?.email || '—'}</div>
                    {account?.quotaLabel ? (
                      <div className="settings-row-hint">{account.quotaLabel}</div>
                    ) : null}
                  </div>
                  <span className="account-sub-badge">{t('subBadge')}</span>
                </div>
                <div className="field-row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={loginBusy || !status?.installed}
                    onClick={() => void runSubLogin()}
                  >
                    {t('subLogin')}
                  </button>
                  <button type="button" className="btn" onClick={() => void doLogout()}>
                    {t('logout')}
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
                <p className="hint" style={{ marginTop: 8 }}>
                  {t('subLoginHint')}
                </p>
              </div>
            </>
          ) : null}

          {section === 'updates' ? (
            <>
              <h2>{t('settingsUpdates')}</h2>
              <h3 className="subhead">{t('updateKernelTitle')}</h3>
              <div className="settings-card">
                <p className="hint">{t('updateKernelHint')}</p>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">
                      {t('kernelVersion')}: {status?.version || kernelUp?.currentVersion || '—'}
                    </div>
                    {kernelUp ? (
                      <div className="settings-row-hint">
                        {kernelUp.updateAvailable
                          ? `${kernelUp.currentVersion} → ${kernelUp.latestVersion}`
                          : t('updateLatest').replace(
                              '{v}',
                              kernelUp.latestVersion || kernelUp.currentVersion,
                            )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="field-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={upBusy}
                    onClick={() => void checkKernel()}
                  >
                    {t('checkUpdate')}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={upBusy || !kernelUp?.updateAvailable}
                    onClick={() => void applyKernel()}
                  >
                    {t('updateNow')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void openUrlSafe(GROK_KERNEL_GITHUB.sourceUrl)}
                  >
                    GitHub
                  </button>
                </div>
              </div>

              <h3 className="subhead">{t('updateAppTitle')}</h3>
              <div className="settings-card">
                <p className="hint">{t('updateAppHint')}</p>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">
                      gorkX v{APP_VERSION}
                      {appUp?.latestVersion && appUp.latestVersion !== '—'
                        ? ` · latest ${appUp.latestVersion}`
                        : ''}
                    </div>
                    <div className="settings-row-hint mono">{GORKX_GITHUB.sourceUrl}</div>
                  </div>
                </div>
                <div className="field-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={upBusy}
                    onClick={() => void checkApp()}
                  >
                    {t('checkUpdate')}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!appUp?.htmlUrl}
                    onClick={() =>
                      void openUrlSafe(appUp?.htmlUrl || GORKX_GITHUB.releasesUrl)
                    }
                  >
                    {t('openReleasePage')}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {section === 'kernel' ? (
            <>
              <h2>{t('settingsKernel')}</h2>
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
                  <button type="button" className="btn" onClick={() => void browseKernel()}>
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
              <div className="kernel-meta" style={{ marginTop: 12 }}>
                <div className="full">
                  <span className="muted">Resolved</span>
                  <div className="mono path-wrap">{status?.grokPath || '—'}</div>
                </div>
                <div className="full">
                  <span className="muted">Status</span>
                  <div>{status?.detail || '—'}</div>
                </div>
              </div>
            </>
          ) : null}

          {section === 'data' ? (
            <>
              <h2>{t('settingsData')}</h2>
              <div className="settings-card">
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
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      void clearChatCache(project).then((n) =>
                        setMsg(t('clearCacheDone').replace('{n}', String(n))),
                      )
                    }
                  >
                    {t('clearChatCache')}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {section === 'about' ? (
            <>
              <h2>{t('settingsAbout')}</h2>
              <div className="settings-card">
                <div className="settings-row-title">gorkX</div>
                <div className="mono">v{APP_VERSION}</div>
                <p className="hint" style={{ marginTop: 8 }}>
                  {t('aboutBlurb')}
                </p>
                <div className="field-row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void openUrlSafe(GORKX_GITHUB.sourceUrl)}
                  >
                    {t('openSourceRepo')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void openUrlSafe(GROK_KERNEL_GITHUB.sourceUrl)}
                  >
                    Grok Build
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {msg ? <div className="settings-msg hint">{msg}</div> : null}
        </section>
      </div>
    </div>
  );
}
