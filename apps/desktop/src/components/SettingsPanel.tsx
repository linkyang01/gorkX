import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { runKernelDoctor, type AcpClient, type GrokStatus, type HookInfo, type HooksSnapshot, type KernelDoctor, type PermissionMode } from '../lib/acpClient';
import type { AccountSummary } from '../lib/account';
import { fetchAccountSummary, fetchSubscriptionModels, logoutAccount, startLoginFlow } from '../lib/account';
import {
  clearChatCache,
  loadThreadMetas,
  NO_PROJECT_KEY,
  projectScopeKey,
  storeDataDir,
  storeDbPath,
} from '../lib/threads';
import { revealInFinder } from '../lib/host';
import {
  checkAppUpdate,
  checkKernelUpdate,
  formatBytes,
  GORKX_GITHUB,
  GROK_KERNEL_GITHUB,
  installAppUpdate,
  openUrlSafe,
  type AppUpdateInfo,
  type KernelUpdateInfo,
} from '../lib/updates';
import { fetchMemoryStatus, setMemoryEnabled, type MemoryStatus } from '../lib/memory';
import {
  listCustomModels,
  migratePlaintextModelKeys,
  openModelsConfig,
  removeCustomModel,
  setDefaultModel,
  testCustomModel,
  upsertCustomModel,
  type CustomModelRow,
  type ModelsConfigSnapshot,
} from '../lib/modelsConfig';
import { t } from '../lib/i18n';
import {
  applyAppearance,
  loadAppearance,
  type AppearancePreferences,
  type DensityPreference,
  type ThemePreference,
} from '../lib/appearance';
import {
  enablePlaywrightChromeMcp,
  fetchExtensionsSnapshot,
  runMcpDoctor,
  type ExtensionsSnapshot,
} from '../lib/extensions';

const APP_VERSION = '0.4.3'; // keep in sync with package.json

/** Codex-style sections. Skip voice/pets; map rest to Grok/gorkX. */
export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'personalization'
  | 'shortcuts'
  | 'usage'
  | 'account'
  | 'plugins'
  | 'models'
  | 'browser'
  | 'computer'
  | 'hooks'
  | 'mcp'
  | 'git'
  | 'environment'
  | 'worktree'
  | 'kernel'
  | 'updates'
  | 'archived'
  | 'about';

export interface ArchivedTaskRow {
  id: string;
  title: string;
  projectKey: string;
  projectLabel: string;
  updatedAt: number;
  sessionId?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  grokCmd: string;
  onGrokCmd: (path: string) => void;
  status: GrokStatus | null;
  onRefresh: () => void;
  project?: string;
  recentProjects?: string[];
  account?: AccountSummary | null;
  onModelsRefreshed?: () => void;
  perm: PermissionMode;
  onPerm: (p: PermissionMode) => void;
  /** Jump out of settings into product surfaces */
  onOpenMemory?: () => void;
  onOpenExtensions?: () => void;
  onOpenShortcuts?: () => void;
  onOpenWorktrees?: () => void;
  onOpenReview?: () => void;
  onCaptureDesktop?: () => Promise<string>;
  onRestoreArchived?: (row: ArchivedTaskRow) => void | Promise<void>;
  activeClient?: AcpClient | null;
  activeSessionId?: string | null;
  initialSection?: SettingsSection;
}

type NavItem = {
  id: SettingsSection;
  label: string;
  keywords?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

function formatWhen(ts: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function SettingsPanel({
  open: isOpen,
  onClose,
  grokCmd,
  onGrokCmd,
  status,
  onRefresh,
  project,
  recentProjects = [],
  account: accountProp,
  onModelsRefreshed,
  perm,
  onPerm,
  onOpenMemory,
  onOpenExtensions,
  onOpenShortcuts,
  onOpenWorktrees,
  onOpenReview,
  onCaptureDesktop,
  onRestoreArchived,
  activeClient,
  activeSessionId,
  initialSection,
}: Props) {
  const [section, setSection] = useState<SettingsSection>(initialSection || 'general');
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState<AccountSummary | null>(accountProp ?? null);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [kernelUp, setKernelUp] = useState<KernelUpdateInfo | null>(null);
  const [appUp, setAppUp] = useState<AppUpdateInfo | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [memory, setMemory] = useState<MemoryStatus | null>(null);
  const [memBusy, setMemBusy] = useState(false);
  const [archived, setArchived] = useState<ArchivedTaskRow[]>([]);
  const [archBusy, setArchBusy] = useState(false);
  const [modelsSnap, setModelsSnap] = useState<ModelsConfigSnapshot | null>(null);
  const [modelForm, setModelForm] = useState({
    id: '',
    name: '',
    model: '',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    apiBackend: 'chat_completions',
    providerLabel: '',
  });
  const [modelBusy, setModelBusy] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreferences>(() => loadAppearance());
  const [browserSnap, setBrowserSnap] = useState<ExtensionsSnapshot | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [kernelDoctor, setKernelDoctor] = useState<KernelDoctor | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [hooks, setHooks] = useState<HooksSnapshot | null>(null);
  const [hooksBusy, setHooksBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialSection) setSection(initialSection);
    setQuery('');
    setMsg(null);
    void storeDbPath().then(setDbPath);
    void storeDataDir().then(setDataDir);
    void fetchAccountSummary().then(setAccount);
    void fetchMemoryStatus().then(setMemory);
    void listCustomModels().then(setModelsSnap);
    void fetchExtensionsSnapshot(project, grokCmd).then(setBrowserSnap).catch(() => setBrowserSnap(null));
  }, [isOpen, initialSection]);

  const refreshBrowser = async () => {
    const snap = await fetchExtensionsSnapshot(project, grokCmd);
    setBrowserSnap(snap);
    return snap;
  };

  const checkKernelDoctor = async () => {
    setDoctorBusy(true);
    try {
      setKernelDoctor(await runKernelDoctor(grokCmd || undefined));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setDoctorBusy(false);
    }
  };

  const loadHooks = async () => {
    if (!activeClient || !activeSessionId) return;
    setHooksBusy(true);
    try { setHooks(await activeClient.listHooks(activeSessionId)); }
    catch (error) { setMsg(error instanceof Error ? error.message : String(error)); }
    finally { setHooksBusy(false); }
  };
  const manageHook = async (action: Parameters<AcpClient['manageHooks']>[1]) => {
    if (!activeClient || !activeSessionId) return;
    setHooksBusy(true);
    try { setHooks(await activeClient.manageHooks(activeSessionId, action)); }
    catch (error) { setMsg(error instanceof Error ? error.message : String(error)); }
    finally { setHooksBusy(false); }
  };

  useEffect(() => {
    if (accountProp) setAccount(accountProp);
  }, [accountProp]);

  useEffect(() => {
    if (!isOpen || section !== 'archived') return;
    let cancelled = false;
    void (async () => {
      setArchBusy(true);
      try {
        const scopes = Array.from(
          new Set(
            [NO_PROJECT_KEY, projectScopeKey(project || ''), ...recentProjects.map(projectScopeKey)]
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        );
        const rows: ArchivedTaskRow[] = [];
        for (const scope of scopes) {
          const metas = await loadThreadMetas(scope);
          for (const m of metas) {
            if (!m.archived) continue;
            rows.push({
              id: m.id,
              title: m.title || t('emptyTitle'),
              projectKey: m.project || scope,
              projectLabel:
                scope === NO_PROJECT_KEY
                  ? t('threads')
                  : (m.project || scope).split('/').filter(Boolean).pop() || scope,
              updatedAt: m.updatedAt,
              sessionId: m.sessionId,
            });
          }
        }
        rows.sort((a, b) => b.updatedAt - a.updatedAt);
        if (!cancelled) setArchived(rows);
      } finally {
        if (!cancelled) setArchBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, section, project, recentProjects]);

  const groups: NavGroup[] = useMemo(
    () => [
      {
        title: t('settingsGroupPersonal'),
        items: [
          { id: 'general', label: t('settingsGeneral'), keywords: 'permission 权限 常规' },
          { id: 'appearance', label: t('settingsAppearance'), keywords: 'theme 外观 主题' },
          {
            id: 'personalization',
            label: t('settingsPersonalization'),
            keywords: 'memory 记忆 hermes 个性化',
          },
          { id: 'shortcuts', label: t('settingsShortcuts'), keywords: 'keyboard 快捷键' },
          { id: 'usage', label: t('settingsUsage'), keywords: 'quota 额度 计费' },
          { id: 'account', label: t('settingsAccount'), keywords: 'login 登录 账户' },
        ],
      },
      {
        title: t('settingsGroupIntegrations'),
        items: [
          { id: 'plugins', label: t('settingsPlugins'), keywords: 'mcp skill 插件 扩展' },
          {
            id: 'models',
            label: t('settingsModels'),
            keywords: 'openai gpt anthropic 模型 订阅 provider 三方',
          },
          { id: 'browser', label: t('settingsBrowser'), keywords: 'chrome 浏览器' },
          { id: 'computer', label: t('settingsComputer'), keywords: '电脑 操控 desktop' },
        ],
      },
      {
        title: t('settingsGroupCoding'),
        items: [
          { id: 'hooks', label: t('settingsHooks'), keywords: 'hooks 钩子' },
          { id: 'mcp', label: t('settingsMcp'), keywords: 'mcp connect 连接' },
          { id: 'git', label: t('settingsGit'), keywords: 'git' },
          {
            id: 'environment',
            label: t('settingsEnvironment'),
            keywords: 'data grok_home 环境 数据',
          },
          { id: 'worktree', label: t('settingsWorktree'), keywords: 'worktree 工作树' },
          { id: 'kernel', label: t('settingsKernel'), keywords: 'kernel grok 内核' },
          { id: 'updates', label: t('settingsUpdates'), keywords: 'update 更新' },
        ],
      },
      {
        title: t('settingsGroupArchived'),
        items: [
          {
            id: 'archived',
            label: t('settingsArchivedTasks'),
            keywords: 'archive 归档 restore 恢复',
          },
        ],
      },
      {
        title: t('settingsGroupAbout'),
        items: [{ id: 'about', label: t('settingsAbout'), keywords: 'about 关于 version' }],
      },
    ],
    [],
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.label.toLowerCase().includes(q) ||
            it.id.includes(q) ||
            (it.keywords || '').toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  if (!isOpen) return null;

  const browseKernel = async () => {
    const selected = await open({ multiple: false, directory: false });
    if (typeof selected === 'string') onGrokCmd(selected);
  };

  const runSubLogin = async () => {
    setLoginBusy(true);
    setMsg(t('subLoginHint'));
    try {
      const result = await startLoginFlow({
        onTick: (m) => setMsg(m),
      });
      setMsg(result.note || t('subLoginDone'));
      if (result.account) setAccount(result.account);
      else {
        const a = await fetchAccountSummary();
        setAccount(a);
      }
      onRefresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginBusy(false);
    }
  };

  const doLogout = async () => {
    try {
      await logoutAccount();
      setMsg(t('logout'));
      setAccount(null);
      onRefresh();
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
        info.channel === 'source-locked'
          ? t('kernelSourceLocked')
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

  const checkApp = async () => {
    setUpBusy(true);
    setMsg(t('updateChecking'));
    try {
      const info = await checkAppUpdate(APP_VERSION);
      setAppUp(info);
      if (info.error && !info.latestVersion) {
        setMsg(`${t('updateFail')}: ${info.error}`);
      } else if (info.updateAvailable) {
        const size = formatBytes(info.dmgBytes);
        setMsg(
          t('updateAvailable')
            .replace('{cur}', info.currentVersion)
            .replace('{latest}', info.latestVersion) + (size ? ` · ${size}` : ''),
        );
      } else {
        setMsg(t('updateLatest').replace('{v}', info.latestVersion || info.currentVersion));
      }
    } finally {
      setUpBusy(false);
    }
  };

  const applyApp = async () => {
    setUpBusy(true);
    setMsg(t('updateAppDownloading'));
    try {
      let info = appUp;
      if (!info?.dmgUrl) {
        info = await checkAppUpdate(APP_VERSION);
        setAppUp(info);
      }
      const r = await installAppUpdate(info);
      setMsg(r.note || (r.ok ? t('updateAppDone') : t('updateFail')));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUpBusy(false);
    }
  };

  const toggleMemory = async () => {
    setMemBusy(true);
    try {
      const next = await setMemoryEnabled(!memory?.enabled);
      setMemory(next);
      setMsg(next?.enabled ? t('memoryOn') : t('memoryOff'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setMemBusy(false);
    }
  };

  const restoreOne = async (row: ArchivedTaskRow) => {
    if (!onRestoreArchived) return;
    setArchBusy(true);
    try {
      await onRestoreArchived(row);
      setArchived((p) => p.filter((x) => x.id !== row.id));
      setMsg(t('settingsArchivedRestored'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setArchBusy(false);
    }
  };

  const saveCustomModel = async () => {
    setModelBusy(true);
    setMsg(null);
    try {
      const row: CustomModelRow = {
        id: modelForm.id.trim() || modelForm.name.trim() || modelForm.model.trim(),
        model: modelForm.model.trim(),
        name: modelForm.name.trim() || modelForm.model.trim(),
        baseUrl: modelForm.baseUrl.trim(),
        apiKey: modelForm.apiKey.trim(),
        apiBackend: modelForm.apiBackend,
        providerLabel: modelForm.providerLabel.trim(),
      };
      const snap = await upsertCustomModel(row);
      setModelsSnap(snap);
      setMsg(t('settingsModelsSaved'));
      setModelForm((f) => ({ ...f, apiKey: '' }));
      onModelsRefreshed?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setModelBusy(false);
    }
  };

  const makeDefaultModel = async (modelWireId: string) => {
    setModelBusy(true);
    setMsg(null);
    try {
      const snap = await setDefaultModel(modelWireId);
      setModelsSnap(snap);
      try {
        localStorage.setItem('gorkx.modelId', modelWireId);
      } catch {
        /* */
      }
      setMsg(t('settingsModelsDefaultOk').replace('{id}', modelWireId));
      onModelsRefreshed?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setModelBusy(false);
    }
  };

  const deleteCustomModel = async (id: string) => {
    setModelBusy(true);
    try {
      const snap = await removeCustomModel(id);
      setModelsSnap(snap);
      setMsg(t('settingsModelsRemoved'));
      onModelsRefreshed?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setModelBusy(false);
    }
  };

  const Soon = ({ text }: { text: string }) => (
    <div className="settings-card muted-block">
      <p className="hint">{text}</p>
    </div>
  );

  const updateAppearance = <K extends keyof AppearancePreferences>(
    key: K,
    value: AppearancePreferences[K],
  ) => {
    const next = { ...appearance, [key]: value } as AppearancePreferences;
    setAppearance(next);
    applyAppearance(next);
  };

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
          <label className="settings-search">
            <span className="sr-only">{t('settingsSearch')}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settingsSearch')}
              spellCheck={false}
            />
          </label>
          {filteredGroups.map((g) => (
            <div key={g.title} className="settings-nav-group">
              <div className="settings-nav-group-title">{g.title}</div>
              {g.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={section === n.id ? 'settings-nav-item on' : 'settings-nav-item'}
                  onClick={() => setSection(n.id)}
                >
                  {n.label}
                </button>
              ))}
            </div>
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
              <h3 className="subhead">{t('autoCompact')}</h3>
              <div className="settings-card muted-block">
                <p className="hint">{t('settingsAutoCompactAlways')}</p>
              </div>
            </>
          ) : null}

          {section === 'appearance' ? (
            <>
              <h2>{t('settingsAppearance')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsAppearanceHint')}
              </p>
              <h3 className="subhead">{t('settingsTheme')}</h3>
              <div className="settings-card">
                {(
                  [
                    ['system', t('settingsThemeSystem'), t('settingsThemeSystemHint')],
                    ['light', t('settingsThemeLight'), t('settingsThemeLightHint')],
                    ['dark', t('settingsThemeDark'), t('settingsThemeDarkHint')],
                  ] as const
                ).map(([id, title, hint]) => (
                  <label key={id} className="settings-row toggle-row">
                    <div>
                      <div className="settings-row-title">{title}</div>
                      <div className="settings-row-hint">{hint}</div>
                    </div>
                    <input
                      type="radio"
                      name="theme"
                      checked={appearance.theme === id}
                      onChange={() => updateAppearance('theme', id as ThemePreference)}
                    />
                  </label>
                ))}
              </div>
              <h3 className="subhead">{t('settingsDensity')}</h3>
              <div className="settings-card">
                {(
                  [
                    ['compact', t('settingsDensityCompact'), t('settingsDensityCompactHint')],
                    ['comfortable', t('settingsDensityComfortable'), t('settingsDensityComfortableHint')],
                    ['spacious', t('settingsDensitySpacious'), t('settingsDensitySpaciousHint')],
                  ] as const
                ).map(([id, title, hint]) => (
                  <label key={id} className="settings-row toggle-row">
                    <div>
                      <div className="settings-row-title">{title}</div>
                      <div className="settings-row-hint">{hint}</div>
                    </div>
                    <input
                      type="radio"
                      name="density"
                      checked={appearance.density === id}
                      onChange={() => updateAppearance('density', id as DensityPreference)}
                    />
                  </label>
                ))}
              </div>
            </>
          ) : null}

          {section === 'personalization' ? (
            <>
              <h2>{t('settingsPersonalization')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsPersonalizationHint')}
              </p>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">
                      {memory?.enabled ? t('memoryOn') : t('memoryOff')}
                    </div>
                    <div className="settings-row-hint mono">{memory?.memoryDir || '—'}</div>
                    <div className="settings-row-hint">{t('settingsMemoryGrokHint')}</div>
                  </div>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={memBusy}
                    onClick={() => void toggleMemory()}
                  >
                    {memory?.enabled ? t('memoryOff') : t('memoryOn')}
                  </button>
                </div>
                <div className="field-row" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      onClose();
                      onOpenMemory?.();
                    }}
                  >
                    {t('settingsOpenMemoryPanel')}
                  </button>
                </div>
              </div>
              <div className="settings-card muted-block">
                <div className="settings-row-title">{t('settingsMemoryHowTitle')}</div>
                <ul className="settings-list">
                  <li>{t('settingsMemoryHow1')}</li>
                  <li>{t('settingsMemoryHow2')}</li>
                  <li>{t('settingsMemoryHow3')}</li>
                  <li>{t('settingsMemoryHow4')}</li>
                </ul>
              </div>
            </>
          ) : null}

          {section === 'shortcuts' ? (
            <>
              <h2>{t('settingsShortcuts')}</h2>
              <div className="settings-card">
                <p className="hint">{t('settingsShortcutsHint')}</p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onClose();
                    onOpenShortcuts?.();
                  }}
                >
                  {t('settingsOpenShortcuts')}
                </button>
              </div>
            </>
          ) : null}

          {section === 'usage' ? (
            <>
              <h2>{t('settingsUsage')}</h2>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{t('quota')}</div>
                    <div className="settings-row-hint">
                      {account?.quotaLabel || t('quotaUnknown')}
                    </div>
                  </div>
                  <button type="button" className="btn" onClick={() => void fetchAccountSummary().then(setAccount)}>
                    {t('refreshQuota')}
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{t('settingsUsageModels')}</div>
                    <div className="settings-row-hint">{t('settingsUsageModelsHint')}</div>
                  </div>
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
            </>
          ) : null}

          {section === 'account' ? (
            <>
              <h2>{t('settingsAccount')}</h2>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">
                      {(() => {
                        const name =
                          account?.displayName || account?.email || t('statusNeedLogin');
                        const plan = account?.membershipLabel?.trim();
                        return plan ? `${name}（${plan}）` : name;
                      })()}
                    </div>
                    <div className="settings-row-hint mono">{account?.email || '—'}</div>
                    {account?.membershipLabel ? (
                      <div className="settings-row-hint">{account.membershipLabel}</div>
                    ) : null}
                    {account?.quotaLabel ? (
                      <div className="settings-row-hint">{account.quotaLabel}</div>
                    ) : null}
                  </div>
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
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  {t('subLoginHint')}
                </p>
              </div>
            </>
          ) : null}

          {section === 'plugins' ? (
            <>
              <h2>{t('settingsPlugins')}</h2>
              <div className="settings-card">
                <p className="hint">{t('settingsPluginsHint')}</p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onClose();
                    onOpenExtensions?.();
                  }}
                >
                  {t('openPlugins')}
                </button>
              </div>
            </>
          ) : null}

          {section === 'models' ? (
            <>
              <h2>{t('settingsModels')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsModelsHint')}
              </p>
              <div className="settings-card">
                <div className="settings-row-title">{t('settingsModelsGrok')}</div>
                <div className="settings-row-hint">
                  {status?.authenticated
                    ? t('settingsModelsGrokOn')
                    : t('settingsModelsGrokOff')}
                </div>
                <div className="settings-row-hint mono" style={{ marginTop: 4 }}>
                  {status?.grokHome || modelsSnap?.grokHome || '—'}
                </div>
              </div>
              <h3 className="subhead">{t('settingsModelsCustom')}</h3>
              <div className="settings-card">
                <label className="field">
                  <span>{t('settingsModelsFieldName')}</span>
                  <input
                    value={modelForm.name}
                    onChange={(e) => setModelForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="GPT-4o / Claude / Local"
                    spellCheck={false}
                  />
                </label>
                <label className="field">
                  <span>{t('settingsModelsFieldProvider')}</span>
                  <input value={modelForm.providerLabel} onChange={(e) => setModelForm((f) => ({ ...f, providerLabel: e.target.value }))} placeholder="OpenAI / Anthropic / Ollama / 公司网关" spellCheck={false} />
                </label>
                <label className="field">
                  <span>{t('settingsModelsFieldId')}</span>
                  <input
                    value={modelForm.model}
                    onChange={(e) => setModelForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="gpt-4o"
                    spellCheck={false}
                  />
                </label>
                <label className="field">
                  <span>base_url</span>
                  <input
                    value={modelForm.baseUrl}
                    onChange={(e) => setModelForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="https://api.openai.com/v1"
                    spellCheck={false}
                  />
                </label>
                <label className="field">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={modelForm.apiKey}
                    onChange={(e) => setModelForm((f) => ({ ...f, apiKey: e.target.value }))}
                    placeholder="sk-…"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>api_backend</span>
                  <select
                    value={modelForm.apiBackend}
                    onChange={(e) => setModelForm((f) => ({ ...f, apiBackend: e.target.value }))}
                  >
                    <option value="chat_completions">chat_completions (OpenAI)</option>
                    <option value="responses">responses (OpenAI)</option>
                    <option value="messages">messages (Anthropic)</option>
                  </select>
                </label>
                <div className="field-row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={modelBusy || !modelForm.model.trim() || !modelForm.baseUrl.trim()}
                    onClick={() => void saveCustomModel()}
                  >
                    {t('settingsModelsAdd')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={modelBusy || !modelForm.model.trim() || !modelForm.baseUrl.trim()}
                    onClick={() => {
                      setModelBusy(true);
                      setMsg(t('settingsModelsTesting'));
                      const row: CustomModelRow = {
                        id: modelForm.model.trim().replace(/[^a-zA-Z0-9_-]/g, '-'),
                        model: modelForm.model.trim(),
                        name: modelForm.name.trim() || modelForm.model.trim(),
                        baseUrl: modelForm.baseUrl.trim(),
                        apiKey: modelForm.apiKey,
                        apiBackend: modelForm.apiBackend,
                        providerLabel: modelForm.providerLabel.trim(),
                      };
                      void testCustomModel(row)
                        .then((r) => setMsg(r.note))
                        .catch((e) => setMsg(String(e)))
                        .finally(() => setModelBusy(false));
                    }}
                  >
                    {t('settingsModelsTest')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void openModelsConfig()
                        .then((p) => setMsg(p))
                        .catch((e) => setMsg(String(e)))
                    }
                  >
                    {t('settingsModelsEditToml')}
                  </button>
                </div>
              </div>
              {modelsSnap?.defaultModel ? (
                <div className="hint" style={{ marginBottom: 10 }}>
                  {t('settingsModelsDefaultLine').replace('{id}', modelsSnap.defaultModel)}
                </div>
              ) : null}
              {modelsSnap?.customModels?.some((m) => m.hasPlaintextSecret) ? (
                <div className="settings-card" style={{ marginBottom: 10 }}>
                  <div className="settings-row-title">{t('settingsModelsPlaintextTitle')}</div>
                  <div className="settings-row-hint">{t('settingsModelsPlaintextHint')}</div>
                  <button type="button" className="btn" disabled={modelBusy} onClick={() => {
                    setModelBusy(true);
                    void migratePlaintextModelKeys().then(setModelsSnap).then(() => setMsg(t('settingsModelsMigrated'))).catch((e) => setMsg(String(e))).finally(() => setModelBusy(false));
                  }}>{t('settingsModelsMigrate')}</button>
                </div>
              ) : null}
              {(modelsSnap?.customModels?.length ?? 0) > 0 ? (
                <>
                {Object.entries(modelsSnap!.customModels.reduce<Record<string, CustomModelRow[]>>((groups, model) => {
                  const provider = model.providerLabel.trim() || (model.apiBackend === 'messages' ? 'Anthropic-compatible' : /ollama|localhost|127\.0\.0\.1/i.test(model.baseUrl) ? 'Local / Ollama' : 'Custom / OpenAI-compatible');
                  (groups[provider] ||= []).push(model); return groups;
                }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([provider, providerModels]) => <div className="settings-card" key={provider} style={{ marginBottom: 10 }}>
                  <div className="settings-row-title" style={{ marginBottom: 6 }}>{provider}</div>
                  {providerModels.map((m) => {
                    const isDefault =
                      modelsSnap?.defaultModel === m.model ||
                      modelsSnap?.defaultModel === m.id;
                    return (
                      <div key={m.id} className="settings-row">
                        <div>
                          <div className="settings-row-title">
                            {m.name || m.model}
                            {isDefault ? (
                              <span className="muted" style={{ marginLeft: 8, fontWeight: 500 }}>
                                {t('settingsModelsDefaultBadge')}
                              </span>
                            ) : null}
                          </div>
                          <div className="settings-row-hint mono">
                            {m.model} · {m.baseUrl}
                          </div>
                          <div className="settings-row-hint">
                            {m.hasPlaintextSecret ? t('settingsModelsPlaintextStatus') : m.hasKeychainSecret ? t('settingsModelsKeychainStatus') : m.apiKey.startsWith('env:') ? t('settingsModelsEnvStatus') : t('settingsModelsNoKeyStatus')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={modelBusy}
                            onClick={() => {
                              setModelBusy(true);
                              setMsg(t('settingsModelsTesting'));
                              void testCustomModel(m)
                                .then((r) => setMsg(r.note))
                                .catch((e) => setMsg(String(e)))
                                .finally(() => setModelBusy(false));
                            }}
                          >
                            {t('settingsModelsTest')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={modelBusy || isDefault}
                            onClick={() => void makeDefaultModel(m.model)}
                          >
                            {t('settingsModelsSetDefault')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={modelBusy}
                            onClick={() => void deleteCustomModel(m.id)}
                          >
                            {t('settingsModelsRemove')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>)}
                </>
              ) : (
                <div className="settings-card muted-block">
                  <p className="hint">{t('settingsModelsEmpty')}</p>
                </div>
              )}
            </>
          ) : null}

          {section === 'browser' ? (
            <>
              <h2>{t('settingsBrowser')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsBrowserHint')}
              </p>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">
                      {browserSnap?.mcp.some((m) => m.name === 'playwright' && m.enabled)
                        ? t('settingsBrowserConnected')
                        : t('settingsBrowserNotConnected')}
                    </div>
                    <div className="settings-row-hint">
                      {t('settingsBrowserConnectionHint')}
                    </div>
                  </div>
                </div>
                <div className="field-row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={browserBusy}
                    onClick={() => {
                      setBrowserBusy(true);
                      setMsg(t('settingsBrowserConnecting'));
                      void enablePlaywrightChromeMcp(grokCmd || undefined)
                        .then((note) => {
                          setMsg(note);
                          return refreshBrowser();
                        })
                        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                        .finally(() => setBrowserBusy(false));
                    }}
                  >
                    {t('settingsBrowserConnect')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={browserBusy}
                    onClick={() => {
                      setBrowserBusy(true);
                      void runMcpDoctor(grokCmd || undefined)
                        .then((note) => setMsg(note.slice(0, 2000)))
                        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                        .finally(() => setBrowserBusy(false));
                    }}
                  >
                    {t('settingsBrowserDiagnose')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      onClose();
                      onOpenExtensions?.();
                    }}
                  >
                    {t('settingsBrowserManage')}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {section === 'computer' ? (
            <>
              <h2>{t('settingsComputer')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsComputerHint')}
              </p>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{t('settingsComputerCaptureTitle')}</div>
                    <div className="settings-row-hint">{t('settingsComputerCaptureHint')}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!onCaptureDesktop}
                  onClick={() => {
                    setMsg(t('settingsComputerCapturing'));
                    void onCaptureDesktop?.()
                      .then((path) => setMsg(t('settingsComputerCaptured').replace('{path}', path)))
                      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
                  }}
                >
                  {t('settingsComputerCapture')}
                </button>
              </div>
            </>
          ) : null}

          {section === 'hooks' ? (
            <>
              <h2>{t('settingsHooks')}</h2>
              {!activeClient || !activeSessionId ? <Soon text={t('settingsHooksNeedTask')} /> : <>
                <p className="hint">{t('settingsHooksRealHint')}</p>
                <div className="field-row"><button type="button" className="btn primary" disabled={hooksBusy} onClick={() => void loadHooks()}>{hooksBusy ? t('settingsHooksLoading') : t('settingsHooksLoad')}</button>
                  {hooks ? <button type="button" className="btn" disabled={hooksBusy} onClick={() => void manageHook({ type: hooks.projectTrusted ? 'untrust' : 'trust' })}>{hooks.projectTrusted ? t('settingsHooksUntrust') : t('settingsHooksTrust')}</button> : null}
                </div>
                {hooks ? <div className="settings-card" style={{ marginTop: 12 }}>
                  <div className="settings-row-hint">{hooks.projectTrusted ? t('settingsHooksTrusted') : t('settingsHooksUntrusted')}</div>
                  {hooks.loadErrors?.map((e) => <div key={e} className="settings-row-hint">{e}</div>)}
                  {hooks.hooks.map((hook: HookInfo) => <div key={hook.name} className="settings-row"><div><div className="settings-row-title">{hook.name}</div><div className="settings-row-hint">{hook.event} · {hook.handlerType} · {hook.sourceDir}</div></div><button type="button" className="btn btn-sm" disabled={hooksBusy} onClick={() => void manageHook({ type: hook.disabled ? 'enable' : 'disable', hookName: hook.name })}>{hook.disabled ? t('settingsHooksEnable') : t('settingsHooksDisable')}</button></div>)}
                  {!hooks.hooks.length ? <div className="settings-row-hint">{t('settingsHooksEmpty')}</div> : null}
                </div> : null}
              </>}
            </>
          ) : null}

          {section === 'mcp' ? (
            <>
              <h2>{t('settingsMcp')}</h2>
              <div className="settings-card">
                <p className="hint">{t('settingsMcpHint')}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    onClose();
                    onOpenExtensions?.();
                  }}
                >
                  {t('openPlugins')}
                </button>
              </div>
            </>
          ) : null}

          {section === 'git' ? (
            <>
              <h2>{t('settingsGit')}</h2>
              <div className="settings-card">
                <p className="hint">{t('settingsGitRealHint')}</p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onClose();
                    onOpenReview?.();
                  }}
                >
                  {t('settingsGitOpenReview')}
                </button>
              </div>
            </>
          ) : null}

          {section === 'environment' ? (
            <>
              <h2>{t('settingsEnvironment')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsEnvironmentHint')}
              </p>
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
                <div className="upgrade-label" style={{ marginTop: 8 }}>
                  {t('settingsGrokHome')}
                </div>
                <div className="mono path-wrap" style={{ fontSize: 11 }}>
                  {status?.grokHome ||
                    memory?.memoryDir?.replace(/\/memory\/?$/, '') ||
                    modelsSnap?.grokHome ||
                    '—'}
                </div>
                <div className="settings-row-hint" style={{ marginTop: 6 }}>
                  {status?.independentReady
                    ? t('settingsIndepReady')
                    : t('settingsGrokHomeHint')}
                </div>
                <div className="settings-row-hint mono" style={{ marginTop: 4 }}>
                  engine: {status?.channel || '—'} · {status?.grokPath || '—'}
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

          {section === 'worktree' ? (
            <>
              <h2>{t('settingsWorktree')}</h2>
              <div className="settings-card">
                <p className="hint">{t('settingsWorktreeHint')}</p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onClose();
                    onOpenWorktrees?.();
                  }}
                >
                  {t('worktreeManage')}
                </button>
              </div>
            </>
          ) : null}

          {section === 'kernel' ? (
            <>
              <h2>{t('settingsKernel')}</h2>
              <p className="kernel-note">{t('settingsKernelAdvanced')}</p>
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
                <button type="button" className="btn" disabled={doctorBusy} onClick={() => void checkKernelDoctor()}>
                  {doctorBusy ? t('kernelDoctorRunning') : t('kernelDoctor')}
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
              {kernelDoctor ? (
                <div className="settings-card" style={{ marginTop: 12 }}>
                  <div className="settings-row-title">{t('kernelDoctor')}</div>
                  <div className="settings-row-hint">{kernelDoctor.repairHint}</div>
                  <div className="settings-row-hint">
                    {t('kernelDoctorHomeWritable')}: {kernelDoctor.grokHomeWritable ? t('kernelDoctorYes') : t('kernelDoctorNo')}
                  </div>
                  {kernelDoctor.issues.length ? (
                    <ul className="settings-list">
                      {kernelDoctor.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  ) : <div className="settings-row-hint">{t('kernelDoctorClean')}</div>}
                </div>
              ) : null}
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
                        {kernelUp.channel === 'source-locked'
                          ? t('kernelSourceLocked')
                          : kernelUp.updateAvailable
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
                    <div className="settings-row-hint">
                      {appUp?.updateAvailable
                        ? t('updateAppReady')
                            .replace('{v}', appUp.latestVersion)
                            .replace(
                              '{size}',
                              formatBytes(appUp.dmgBytes) || appUp.dmgName || 'DMG',
                            )
                        : appUp?.note || t('updateAppHint')}
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
                    disabled={upBusy || !appUp?.updateAvailable || !appUp?.dmgUrl}
                    onClick={() => void applyApp()}
                  >
                    {t('updateAppNow')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={upBusy}
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

          {section === 'archived' ? (
            <>
              <h2>{t('settingsArchivedTasks')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsArchivedHint')}
              </p>
              {archBusy && !archived.length ? (
                <div className="settings-card muted-block">
                  <p className="hint">…</p>
                </div>
              ) : null}
              {!archBusy && !archived.length ? (
                <div className="settings-card muted-block">
                  <p className="hint">{t('settingsArchivedEmpty')}</p>
                </div>
              ) : null}
              {archived.length ? (
                <div className="settings-card">
                  {archived.map((row) => (
                    <div key={row.id} className="settings-row">
                      <div>
                        <div className="settings-row-title">{row.title}</div>
                        <div className="settings-row-hint">
                          {row.projectLabel} · {formatWhen(row.updatedAt)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={archBusy}
                        onClick={() => void restoreOne(row)}
                      >
                        {t('settingsRestore')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
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
                <div className="settings-row-hint" style={{ marginTop: 8 }}>
                  {status?.independentReady
                    ? t('settingsIndepReady')
                    : t('settingsIndepStatus')}
                </div>
                {status?.grokHome ? (
                  <div className="mono path-wrap" style={{ fontSize: 11, marginTop: 6 }}>
                    GROK_HOME: {status.grokHome}
                  </div>
                ) : null}
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
