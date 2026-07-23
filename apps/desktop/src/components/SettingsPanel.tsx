import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { runKernelDoctor, type GrokStatus, type KernelDoctor, type PermissionMode } from '../lib/acpClient';
import type { AccountSummary, SubscriptionModelsSnapshot } from '../lib/account';
import { fetchAccountSummary, fetchSubscriptionModelsSnapshot, logoutAccount, startLoginFlow } from '../lib/account';
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
  isVersionNewer,
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
  type ModelTestResult,
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
import {
  githubConnectReadonly,
  githubDisconnect,
  githubListPrChecks,
  githubListPrComments,
  githubListOpenPrs,
  githubStatus as fetchGithubStatus,
  githubTestConnection,
  type GithubCheckRun,
  type GithubComment,
  type GithubPullRequest,
  type GithubStatus,
} from '../lib/github';
import {
  fetchSubagentsConfig,
  setSubagentTypeEnabled,
  setSubagentsEnabled,
  type SubagentsConfigSnapshot,
} from '../lib/subagentsConfig';

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
  | 'subagents'
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
  initialSection?: SettingsSection;
}

type NavItem = {
  id: SettingsSection;
  label: string;
  keywords?: string;
};

type ModelPreset = 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'ollama' | 'custom';

type StoredModelTestStatus = {
  ok: boolean;
  status: number;
  checkedAt: number;
};

const MODEL_TEST_STATUS_STORAGE_KEY = 'gorkx.modelTestStatus.v1';
const MAX_STORED_MODEL_TESTS = 80;

const modelPresetValues: Record<ModelPreset, Pick<CustomModelRow, 'baseUrl' | 'apiBackend' | 'providerLabel'>> = {
  openai: { baseUrl: 'https://api.openai.com/v1', apiBackend: 'responses', providerLabel: 'OpenAI API' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', apiBackend: 'messages', providerLabel: 'Anthropic API' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiBackend: 'chat_completions', providerLabel: 'OpenRouter API' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiBackend: 'chat_completions', providerLabel: 'Google Gemini API' },
  ollama: { baseUrl: 'http://127.0.0.1:11434/v1', apiBackend: 'chat_completions', providerLabel: 'Local / Ollama' },
  custom: { baseUrl: '', apiBackend: 'chat_completions', providerLabel: '' },
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

/** This deliberately excludes display names and API keys. */
function modelTestStatusKey(model: Pick<CustomModelRow, 'apiBackend' | 'baseUrl' | 'model'>): string {
  return [model.apiBackend, model.baseUrl.trim().toLowerCase(), model.model.trim().toLowerCase()].join('|');
}

function loadStoredModelTestStatuses(): Record<string, StoredModelTestStatus> {
  try {
    const raw = localStorage.getItem(MODEL_TEST_STATUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, StoredModelTestStatus> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as StoredModelTestStatus).ok === 'boolean' &&
        typeof (value as StoredModelTestStatus).status === 'number' &&
        Number.isFinite((value as StoredModelTestStatus).checkedAt)
      ) {
        result[key] = value as StoredModelTestStatus;
      }
    }
    return result;
  } catch {
    return {};
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
  const [subagentsSnap, setSubagentsSnap] = useState<SubagentsConfigSnapshot | null>(null);
  const [subagentsBusy, setSubagentsBusy] = useState(false);
  const [subscriptionModels, setSubscriptionModels] = useState<SubscriptionModelsSnapshot | null>(null);
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
  const [modelPreset, setModelPreset] = useState<ModelPreset>('openai');
  const [modelTestStatuses, setModelTestStatuses] = useState<Record<string, StoredModelTestStatus>>(
    () => loadStoredModelTestStatuses(),
  );
  const [appearance, setAppearance] = useState<AppearancePreferences>(() => loadAppearance());
  const [browserSnap, setBrowserSnap] = useState<ExtensionsSnapshot | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserAllowedOrigins, setBrowserAllowedOrigins] = useState(() => {
    try { return localStorage.getItem('gorkx.browserAllowedOrigins') || ''; } catch { return ''; }
  });
  const [kernelDoctor, setKernelDoctor] = useState<KernelDoctor | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [github, setGithub] = useState<GithubStatus | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [githubPrs, setGithubPrs] = useState<GithubPullRequest[]>([]);
  const [githubChecks, setGithubChecks] = useState<Record<number, GithubCheckRun[]>>({});
  const [githubComments, setGithubComments] = useState<Record<number, GithubComment[]>>({});
  const [githubBusy, setGithubBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialSection) setSection(initialSection);
    setQuery('');
    setMsg(null);
    void storeDbPath().then(setDbPath);
    void storeDataDir().then(setDataDir);
    void fetchAccountSummary().then(setAccount);
    void fetchSubscriptionModelsSnapshot(false).then(setSubscriptionModels);
    void fetchMemoryStatus().then(setMemory);
    void listCustomModels().then(setModelsSnap);
    void fetchSubagentsConfig().then(setSubagentsSnap).catch(() => setSubagentsSnap(null));
    void fetchExtensionsSnapshot(project, grokCmd).then(setBrowserSnap).catch(() => setBrowserSnap(null));
    void fetchGithubStatus().then(setGithub).catch(() => setGithub(null));
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

  const withGithub = async (action: () => Promise<GithubStatus>) => {
    setGithubBusy(true);
    try {
      const next = await action();
      setGithub(next);
      setMsg(next.error || next.note);
      return next;
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setGithubBusy(false);
    }
  };

  const connectGithub = async () => {
    const next = await withGithub(() => githubConnectReadonly(githubToken));
    if (next?.connected) setGithubToken('');
  };

  const loadGithubPrs = async () => {
    if (!project) {
      setMsg(t('githubProjectRequired'));
      return;
    }
    setGithubBusy(true);
    try {
      const prs = await githubListOpenPrs(project);
      setGithubPrs(prs);
      setMsg(prs.length ? t('githubPrsLoaded').replace('{n}', String(prs.length)) : t('githubPrsEmpty'));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setGithubBusy(false);
    }
  };

  const loadGithubChecks = async (prNumber: number) => {
    if (!project) return;
    setGithubBusy(true);
    try {
      const checks = await githubListPrChecks(project, prNumber);
      setGithubChecks((current) => ({ ...current, [prNumber]: checks }));
      setMsg(t('githubChecksLoaded').replace('{n}', String(checks.length)));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setGithubBusy(false);
    }
  };

  const loadGithubComments = async (prNumber: number) => {
    if (!project) return;
    setGithubBusy(true);
    try {
      const comments = await githubListPrComments(project, prNumber);
      setGithubComments((current) => ({ ...current, [prNumber]: comments }));
      setMsg(t('githubCommentsLoaded').replace('{n}', String(comments.length)));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setGithubBusy(false);
    }
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
          { id: 'subagents', label: t('settingsSubagents'), keywords: 'subagent 子任务 委派 worktree 隔离' },
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
      const snapshot = await fetchSubscriptionModelsSnapshot(true);
      setSubscriptionModels(snapshot);
      const rows = snapshot.models;
      const source =
        snapshot.source === 'live'
          ? t('settingsModelsSourceLive')
          : snapshot.source === 'cache'
            ? t('settingsModelsSourceCache')
            : t('settingsModelsSourceNone');
      setMsg(
        `${t('refreshModels')}: ${rows.map((r) => r.name || r.modelId).join(', ') || '—'} (${rows.length}) · ${source}` +
          (snapshot.refreshError ? `\n${t('settingsModelsRefreshFailed')}: ${snapshot.refreshError}` : ''),
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
        setMsg(
          info.note || t('updateLatest').replace('{v}', info.latestVersion || info.currentVersion),
        );
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

  const chooseModelPreset = (preset: ModelPreset) => {
    setModelPreset(preset);
    const values = modelPresetValues[preset];
    setModelForm((current) => ({
      ...current,
      baseUrl: values.baseUrl,
      apiBackend: values.apiBackend,
      providerLabel: values.providerLabel,
      apiKey: preset === 'ollama' ? '' : current.apiKey,
    }));
  };

  const recordModelTest = (model: CustomModelRow, result: ModelTestResult) => {
    setModelTestStatuses((previous) => {
      const next = {
        ...previous,
        [modelTestStatusKey(model)]: {
          ok: result.ok,
          status: result.status,
          checkedAt: Date.now(),
        },
      };
      const kept = Object.entries(next)
        .sort(([, a], [, b]) => b.checkedAt - a.checkedAt)
        .slice(0, MAX_STORED_MODEL_TESTS);
      const trimmed = Object.fromEntries(kept);
      try {
        localStorage.setItem(MODEL_TEST_STATUS_STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // This is only non-secret UI metadata; the connection test itself remains valid.
      }
      return trimmed;
    });
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
                  onClick={() => {
                    // Action feedback belongs to the panel that triggered it.
                    // Do not leave a stale MCP/CLI transcript below another
                    // setting such as Updates.
                    setMsg(null);
                    setSection(n.id);
                  }}
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
                <div className="settings-row" style={{ marginTop: 14 }}>
                  <div>
                    <div className="settings-row-title">{t('settingsModelsEntitled')}</div>
                    <div className="settings-row-hint">
                      {subscriptionModels?.source === 'live'
                        ? t('settingsModelsSourceLiveHint')
                        : subscriptionModels?.source === 'cache'
                          ? t('settingsModelsSourceCacheHint')
                          : t('settingsModelsSourceNoneHint')}
                    </div>
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
                {subscriptionModels?.models.length ? (
                  <div className="settings-list mono" style={{ marginTop: 10 }}>
                    {subscriptionModels.models.map((model) => (
                      <div key={model.modelId}>
                        {model.name || model.modelId}
                        {model.name && model.name !== model.modelId ? ` · ${model.modelId}` : ''}
                      </div>
                    ))}
                  </div>
                ) : null}
                {subscriptionModels?.refreshError ? (
                  <div className="settings-row-hint" style={{ marginTop: 8 }}>
                    {t('settingsModelsRefreshFailed')}: {subscriptionModels.refreshError}
                  </div>
                ) : null}
              </div>
              <h3 className="subhead">{t('settingsModelsCustom')}</h3>
              <div className="settings-card">
                <div className="settings-row-title">{t('settingsModelsQuickSetup')}</div>
                <p className="settings-row-hint" style={{ marginBottom: 10 }}>{t('settingsModelsQuickSetupHint')}</p>
                <div className="model-preset-list" role="radiogroup" aria-label={t('settingsModelsQuickSetup')}>
                  {(
                    [
                      ['openai', t('settingsModelsPresetOpenAI')],
                      ['anthropic', t('settingsModelsPresetAnthropic')],
                      ['openrouter', t('settingsModelsPresetOpenRouter')],
                      ['gemini', t('settingsModelsPresetGemini')],
                      ['ollama', t('settingsModelsPresetOllama')],
                      ['custom', t('settingsModelsPresetCustom')],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`model-preset${modelPreset === id ? ' selected' : ''}`}
                      aria-pressed={modelPreset === id}
                      onClick={() => chooseModelPreset(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {modelPreset === 'openai' ? (
                  <button type="button" className="link-btn model-preset-guide" onClick={() => void openUrlSafe('https://platform.openai.com/api-keys')}>
                    {t('settingsModelsOpenAIKeys')}
                  </button>
                ) : null}
                {modelPreset === 'anthropic' ? (
                  <button type="button" className="link-btn model-preset-guide" onClick={() => void openUrlSafe('https://platform.claude.com/settings/keys')}>
                    {t('settingsModelsAnthropicKeys')}
                  </button>
                ) : null}
                {modelPreset === 'openrouter' ? (
                  <button type="button" className="link-btn model-preset-guide" onClick={() => void openUrlSafe('https://openrouter.ai/keys')}>
                    {t('settingsModelsOpenRouterKeys')}
                  </button>
                ) : null}
                {modelPreset === 'gemini' ? (
                  <button type="button" className="link-btn model-preset-guide" onClick={() => void openUrlSafe('https://aistudio.google.com/app/apikey')}>
                    {t('settingsModelsGeminiKeys')}
                  </button>
                ) : null}
                {modelPreset === 'ollama' ? (
                  <button type="button" className="link-btn model-preset-guide" onClick={() => void openUrlSafe('https://ollama.com/download')}>
                    {t('settingsModelsOllamaDownload')}
                  </button>
                ) : null}
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
                        .then((r) => {
                          recordModelTest(row, r);
                          setMsg(r.note);
                        })
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
                <p className="settings-row-hint" style={{ marginTop: 8 }}>
                  {t('settingsModelsTestHint')}
                </p>
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
                    const testStatus = modelTestStatuses[modelTestStatusKey(m)];
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
                          <div className={`settings-row-hint model-test-status${testStatus ? (testStatus.ok ? ' verified' : ' failed') : ' unverified'}`}>
                            {testStatus
                              ? (testStatus.ok ? t('settingsModelsVerifiedAt') : t('settingsModelsTestFailedAt')).replace('{when}', formatWhen(testStatus.checkedAt))
                              : t('settingsModelsNotTested')}
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
                                .then((r) => {
                                  recordModelTest(m, r);
                                  setMsg(r.note);
                                })
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
                        ? t('settingsBrowserConfigured')
                        : t('settingsBrowserNotConfigured')}
                    </div>
                    <div className="settings-row-hint">
                      {t('settingsBrowserConnectionHint')}
                    </div>
                  </div>
                </div>
                <label className="field-label" htmlFor="browser-allowed-origins" style={{ marginTop: 12 }}>
                  {t('settingsBrowserAllowedOrigins')}
                </label>
                <input
                  id="browser-allowed-origins"
                  value={browserAllowedOrigins}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBrowserAllowedOrigins(next);
                    try { localStorage.setItem('gorkx.browserAllowedOrigins', next); } catch { /* */ }
                  }}
                  placeholder={t('settingsBrowserAllowedOriginsPlaceholder')}
                  spellCheck={false}
                />
                <p className="settings-row-hint">{t('settingsBrowserAllowedOriginsHint')}</p>
                <div className="field-row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={browserBusy}
                    onClick={() => {
                      setBrowserBusy(true);
                      setMsg(t('settingsBrowserConnecting'));
                      void enablePlaywrightChromeMcp(grokCmd || undefined, browserAllowedOrigins)
                        .then(() => {
                          setMsg(t('settingsBrowserConnected'));
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

          {section === 'subagents' ? (
            <>
              <h2>{t('settingsSubagents')}</h2>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('settingsSubagentsHint')}
              </p>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">{t('settingsSubagentsEnabled')}</div>
                    <div className="settings-row-hint">{t('settingsSubagentsEnabledHint')}</div>
                  </div>
                  <button
                    type="button"
                    className={`btn${(subagentsSnap?.enabled ?? true) ? ' primary' : ''}`}
                    disabled={subagentsBusy}
                    onClick={() => {
                      const next = !(subagentsSnap?.enabled ?? true);
                      setSubagentsBusy(true);
                      void setSubagentsEnabled(next)
                        .then((snapshot) => {
                          setSubagentsSnap(snapshot);
                          setMsg(next ? t('settingsSubagentsEnabledNow') : t('settingsSubagentsDisabledNow'));
                        })
                        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                        .finally(() => setSubagentsBusy(false));
                    }}
                  >
                    {(subagentsSnap?.enabled ?? true) ? t('settingsSubagentsEnabledNow') : t('settingsSubagentsDisabledNow')}
                  </button>
                </div>
                <div className="settings-row" style={{ marginTop: 12 }}>
                  <div>
                    <div className="settings-row-title">{t('settingsSubagentsExplore')}</div>
                    <div className="settings-row-hint">{t('settingsSubagentsExploreHint')}</div>
                  </div>
                  <button
                    type="button"
                    className={`btn${(subagentsSnap?.exploreEnabled ?? true) ? ' primary' : ''}`}
                    disabled={subagentsBusy || !(subagentsSnap?.enabled ?? true)}
                    onClick={() => {
                      const next = !(subagentsSnap?.exploreEnabled ?? true);
                      setSubagentsBusy(true);
                      void setSubagentTypeEnabled('explore', next)
                        .then(setSubagentsSnap)
                        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                        .finally(() => setSubagentsBusy(false));
                    }}
                  >
                    {(subagentsSnap?.exploreEnabled ?? true) ? t('settingsSubagentsEnabledNow') : t('settingsSubagentsDisabledNow')}
                  </button>
                </div>
                <div className="settings-row" style={{ marginTop: 12 }}>
                  <div>
                    <div className="settings-row-title">{t('settingsSubagentsPlan')}</div>
                    <div className="settings-row-hint">{t('settingsSubagentsPlanHint')}</div>
                  </div>
                  <button
                    type="button"
                    className={`btn${(subagentsSnap?.planEnabled ?? true) ? ' primary' : ''}`}
                    disabled={subagentsBusy || !(subagentsSnap?.enabled ?? true)}
                    onClick={() => {
                      const next = !(subagentsSnap?.planEnabled ?? true);
                      setSubagentsBusy(true);
                      void setSubagentTypeEnabled('plan', next)
                        .then(setSubagentsSnap)
                        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)))
                        .finally(() => setSubagentsBusy(false));
                    }}
                  >
                    {(subagentsSnap?.planEnabled ?? true) ? t('settingsSubagentsEnabledNow') : t('settingsSubagentsDisabledNow')}
                  </button>
                </div>
                <p className="settings-row-hint" style={{ marginTop: 12 }}>
                  {t('settingsSubagentsRecoveryHint')}
                </p>
              </div>
            </>
          ) : null}

          {section === 'hooks' ? (
            <>
              <h2>{t('settingsHooks')}</h2>
              <Soon text={t('settingsHooksUnavailable')} />
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
              <h3 className="subhead">{t('githubTitle')}</h3>
              <div className="settings-card">
                <p className="hint">{t('githubHint')}</p>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">
                      {github?.connected
                        ? t('githubConnected').replace('{login}', github.login || 'GitHub')
                        : github?.configured
                          ? t('githubConfigured')
                          : t('githubNotConnected')}
                    </div>
                    {github?.error ? <div className="settings-row-hint">{github.error}</div> : null}
                  </div>
                </div>
                {!github?.configured ? (
                  <>
                    <div className="settings-card muted-block" style={{ marginTop: 10 }}>
                      <div className="settings-row-title">{t('githubTokenGuideTitle')}</div>
                      <ol className="settings-list" style={{ marginTop: 7 }}>
                        <li>{t('githubTokenGuide1')}</li>
                        <li>{t('githubTokenGuide2')}</li>
                        <li>{t('githubTokenGuide3')}</li>
                      </ol>
                      <div className="field-row" style={{ marginTop: 9 }}>
                        <button type="button" className="btn" onClick={() => void openUrlSafe('https://github.com/settings/personal-access-tokens/new')}>{t('githubCreateToken')}</button>
                        <button type="button" className="btn" onClick={() => void openUrlSafe('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens')}>{t('githubTokenDocs')}</button>
                      </div>
                    </div>
                    <div className="field-row" style={{ marginTop: 10 }}>
                      <input type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder={t('githubTokenPlaceholder')} aria-label={t('githubTokenPlaceholder')} />
                      <button type="button" className="btn primary" disabled={githubBusy || !githubToken.trim()} onClick={() => void connectGithub()}>{t('githubConnect')}</button>
                    </div>
                  </>
                ) : (
                  <div className="field-row" style={{ marginTop: 10 }}>
                    <button type="button" className="btn" disabled={githubBusy} onClick={() => void withGithub(githubTestConnection)}>{t('githubTest')}</button>
                    <button type="button" className="btn" disabled={githubBusy} onClick={() => void loadGithubPrs()}>{t('githubLoadPrs')}</button>
                    <button type="button" className="btn" disabled={githubBusy} onClick={() => void withGithub(githubDisconnect)}>{t('githubDisconnect')}</button>
                  </div>
                )}
                {githubPrs.length ? (
                  <ul className="settings-list" style={{ marginTop: 10 }}>
                    {githubPrs.map((pr) => (
                      <li key={pr.number}>
                        <button type="button" className="link-btn" onClick={() => void openUrlSafe(pr.url)}>#{pr.number} {pr.title}</button>
                        <span className="muted"> · {pr.author}{pr.draft ? ` · ${t('githubDraft')}` : ''}</span>
                        <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} disabled={githubBusy} onClick={() => void loadGithubChecks(pr.number)}>{t('githubLoadChecks')}</button>
                        <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} disabled={githubBusy} onClick={() => void loadGithubComments(pr.number)}>{t('githubLoadComments')}</button>
                        {githubChecks[pr.number] ? (
                          <ul className="settings-list" style={{ margin: '6px 0 0 12px' }}>
                            {githubChecks[pr.number].map((check) => (
                              <li key={`${check.name}-${check.url}`}>
                                {check.url || check.detailsUrl ? <button type="button" className="link-btn" onClick={() => void openUrlSafe(check.detailsUrl || check.url)}>{check.name}</button> : check.name}
                                <span className="muted"> · {check.conclusion || check.status}</span>
                              </li>
                            ))}
                            {!githubChecks[pr.number].length ? <li className="muted">{t('githubChecksEmpty')}</li> : null}
                          </ul>
                        ) : null}
                        {githubComments[pr.number] ? (
                          <ul className="settings-list" style={{ margin: '6px 0 0 12px' }}>
                            {githubComments[pr.number].map((comment, index) => (
                              <li key={`${comment.url}-${index}`}>
                                {comment.url ? <button type="button" className="link-btn" onClick={() => void openUrlSafe(comment.url)}>{comment.author}</button> : comment.author}
                                <span className="muted"> · {comment.kind}{comment.path ? ` · ${comment.path}${comment.line ? `:${comment.line}` : ''}` : ''} · {comment.body.slice(0, 240)}</span>
                              </li>
                            ))}
                            {!githubComments[pr.number].length ? <li className="muted">{t('githubCommentsEmpty')}</li> : null}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
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
                      {appUp?.latestVersion &&
                      appUp.latestVersion !== '—' &&
                      isVersionNewer(appUp.latestVersion, APP_VERSION)
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
