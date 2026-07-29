import { useCallback, useEffect, useMemo, useState } from 'react';
import { open as openFile } from '@tauri-apps/plugin-dialog';
import {
  fetchExtensionsSnapshot,
  fetchMarketplace,
  addMarketplace,
  updateMarketplace,
  removeMarketplace,
  addRemoteMcp,
  addLocalMcp,
  installPlugin,
  pluginDetails,
  validatePlugin,
  openExtensionPath,
  openGrokConfig,
  openSkillsDir,
  enablePlaywrightChromeMcp,
  removeMcp,
  runMcpDoctor,
  setPluginEnabled,
  uninstallPlugin,
  updatePlugin,
  type ExtensionsSnapshot,
  type SkillInfo,
} from '../lib/extensions';
import { t } from '../lib/i18n';
import type { AcpClient, LiveMcpServer } from '../lib/acpClient';

type Tab = 'skills' | 'mcp' | 'plugins' | 'market';

interface Props {
  open: boolean;
  onClose: () => void;
  project: string;
  grokCmd: string;
  onRunSkill: (skill: SkillInfo) => void;
  liveClient?: AcpClient | null;
  liveSessionId?: string | null;
}

export function ExtensionsPanel({ open, onClose, project, grokCmd, onRunSkill, liveClient, liveSessionId }: Props) {
  const [tab, setTab] = useState<Tab>('skills');
  const [snap, setSnap] = useState<ExtensionsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pluginSrc, setPluginSrc] = useState('');
  const [pluginReadout, setPluginReadout] = useState<{ name: string; text: string; kind: 'details' | 'validate' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [marketRaw, setMarketRaw] = useState('');
  const [marketSources, setMarketSources] = useState<unknown[]>([]);
  const [marketSourceDraft, setMarketSourceDraft] = useState('');
  const [liveMcp, setLiveMcp] = useState<LiveMcpServer[]>([]);
  const [mcpSetupChoices, setMcpSetupChoices] = useState<Record<string, string>>({});
  const [remoteMcpName, setRemoteMcpName] = useState('');
  const [remoteMcpUrl, setRemoteMcpUrl] = useState('');
  const [remoteMcpTransport, setRemoteMcpTransport] = useState<'http' | 'sse'>('http');
  const [remoteMcpScope, setRemoteMcpScope] = useState<'user' | 'project'>('user');
  const [localMcpName, setLocalMcpName] = useState('');
  const [localMcpCommand, setLocalMcpCommand] = useState('');
  const [localMcpArgs, setLocalMcpArgs] = useState('');
  const [localMcpScope, setLocalMcpScope] = useState<'user' | 'project'>('user');

  const refresh = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const s = await fetchExtensionsSnapshot(project || undefined, grokCmd || undefined);
      setSnap(s);
      if (s.error) setMsg(s.error);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [project, grokCmd]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const refreshMarketplace = useCallback(async () => {
    try {
      const m = await fetchMarketplace(grokCmd || undefined);
      setMarketSources(m.sources ?? []);
      setMarketRaw(m.raw ?? '');
    } catch (e) {
      setMsg(String(e));
    }
  }, [grokCmd]);

  useEffect(() => {
    if (open && tab === 'market') void refreshMarketplace();
  }, [open, tab, refreshMarketplace]);
  const refreshLiveMcp = useCallback(async (fresh = false) => {
    if (!liveClient || !liveSessionId) { setLiveMcp([]); return; }
    setLiveMcp(await liveClient.listLiveMcp(liveSessionId, fresh));
  }, [liveClient, liveSessionId]);
  useEffect(() => { if (open && tab === 'mcp') void refreshLiveMcp().catch((e) => setMsg(String(e))); }, [open, tab, refreshLiveMcp]);

  const skills = useMemo(() => {
    const list = snap?.skills ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(qq) ||
        s.description.toLowerCase().includes(qq) ||
        s.scope.toLowerCase().includes(qq),
    );
  }, [snap, q]);

  const mcp = useMemo(() => {
    const list = snap?.mcp ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(qq) ||
        m.detail.toLowerCase().includes(qq) ||
        m.scope.toLowerCase().includes(qq),
    );
  }, [snap, q]);

  const plugins = useMemo(() => {
    const list = snap?.plugins ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(qq) ||
        p.description.toLowerCase().includes(qq) ||
        p.scope.toLowerCase().includes(qq),
    );
  }, [snap, q]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal kernel-modal ext-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('extensions')}
      >
        <div className="modal-head">
          <h2>{t('extensions')}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-sm" disabled={loading} onClick={() => void refresh()}>
              {loading ? '…' : t('extRefresh')}
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <p className="kernel-note">{t('extNote')}</p>

        <div className="ext-tabs">
          {(
            [
              ['skills', t('extSkills'), snap?.skills.length ?? 0],
              ['mcp', t('extMcp'), snap?.mcp.length ?? 0],
              ['plugins', t('extPlugins'), snap?.plugins.length ?? 0],
              ['market', t('marketplace'), marketSources.length],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'ext-tab on' : 'ext-tab'}
              onClick={() => setTab(id)}
            >
              {label}
              <span className="ext-count">{n}</span>
            </button>
          ))}
        </div>

        <div className="ext-toolbar">
          <input
            className="ext-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('extSearch')}
          />
          {tab === 'skills' ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void openSkillsDir().catch((e) => setMsg(String(e)))}
            >
              {t('extOpenSkillsDir')}
            </button>
          ) : null}
          {tab === 'mcp' ? (
            <>
              {liveClient && liveSessionId ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void refreshLiveMcp(true).catch((e) => setMsg(String(e)))}>{t('extMcpRefreshLive')}</button> : null}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void openGrokConfig().catch((e) => setMsg(String(e)))}
              >
                {t('extOpenConfig')}
              </button>
              <button
                type="button"
                className="btn btn-sm primary-sm"
                disabled={busy}
                title="npx @playwright/mcp --browser chrome"
                onClick={() => {
                  setBusy(true);
                  void enablePlaywrightChromeMcp(grokCmd || undefined)
                    .then((s) => {
                      setMsg(s);
                      return refresh();
                    })
                    .catch((e) => setMsg(String(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {t('enableChromeMcp')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void runMcpDoctor(grokCmd || undefined)
                    .then((s) => setMsg(s.slice(0, 2000)))
                    .catch((e) => setMsg(String(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {t('extMcpDoctor')}
              </button>
            </>
          ) : null}
          {tab === 'plugins' ? (
            <button type="button" className="btn btn-sm" disabled={busy || !(snap?.plugins.length)} onClick={() => {
              setBusy(true);
              void updatePlugin(undefined, grokCmd || undefined).then((s) => { setMsg(s || t('extPluginUpdateDone')); return refresh(); }).catch((e) => setMsg(String(e))).finally(() => setBusy(false));
            }}>{t('extPluginUpdateAll')}</button>
          ) : null}
        </div>

        {msg ? <pre className="ext-msg">{msg}</pre> : null}

        <div className="ext-list">
          {tab === 'skills' ? (
            skills.length === 0 ? (
              <div className="hint">{t('extNoSkills')}</div>
            ) : (
              skills.map((s) => (
                <div key={`${s.scope}:${s.path}`} className="ext-row">
                  <div className="ext-row-main">
                    <div className="ext-row-title">
                      <span className="mono">/{s.name}</span>
                      <span className="pill">{s.scope}</span>
                      {!s.userInvocable ? <span className="pill">{t('extNotSlash')}</span> : null}
                    </div>
                    <div className="ext-row-desc">{s.description || s.whenToUse || '—'}</div>
                    <div className="ext-row-path mono" title={s.path}>
                      {s.path}
                    </div>
                  </div>
                  <div className="ext-row-actions">
                    <button
                      type="button"
                      className="btn btn-sm primary-sm"
                      disabled={!s.userInvocable}
                      onClick={() => {
                        onRunSkill(s);
                        onClose();
                      }}
                    >
                      {t('extRun')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void openExtensionPath(s.path).catch((e) => setMsg(String(e)))}
                    >
                      {t('openFolder')}
                    </button>
                  </div>
                </div>
              ))
            )
          ) : null}

          {tab === 'mcp' ? (
            <>
            <div className="ext-install ext-mcp-add" aria-label={t('extMcpAddRemote')}>
              <div className="ext-row-title">{t('extMcpAddRemote')}</div>
              <p className="hint" style={{ margin: '5px 0 8px' }}>{t('extMcpRemoteHint')}</p>
              <div className="field-row" style={{ flexWrap: 'wrap' }}>
                <input className="ext-search" value={remoteMcpName} onChange={(e) => setRemoteMcpName(e.target.value)} placeholder={t('extMcpRemoteName')} aria-label={t('extMcpRemoteName')} />
                <input className="ext-search" value={remoteMcpUrl} onChange={(e) => setRemoteMcpUrl(e.target.value)} placeholder={t('extMcpRemoteUrl')} aria-label={t('extMcpRemoteUrl')} />
                <select value={remoteMcpTransport} onChange={(e) => setRemoteMcpTransport(e.target.value === 'sse' ? 'sse' : 'http')} aria-label={t('extMcpRemoteTransport')}>
                  <option value="http">HTTP</option><option value="sse">SSE</option>
                </select>
                <select value={remoteMcpScope} onChange={(e) => setRemoteMcpScope(e.target.value === 'project' ? 'project' : 'user')} aria-label={t('extMcpRemoteScope')}>
                  <option value="user">{t('extMcpRemoteScopeUser')}</option><option value="project" disabled={!project}>{t('extMcpRemoteScopeProject')}</option>
                </select>
                <button type="button" className="btn btn-sm primary-sm" disabled={busy || !remoteMcpName.trim() || !remoteMcpUrl.trim()} onClick={() => {
                  setBusy(true);
                  void addRemoteMcp(remoteMcpName, remoteMcpUrl, remoteMcpTransport, remoteMcpScope, project || undefined, grokCmd || undefined)
                    .then((s) => { setMsg(s || t('extMcpRemoteAdded')); setRemoteMcpName(''); setRemoteMcpUrl(''); return refresh(); })
                    .catch((e) => setMsg(String(e)))
                    .finally(() => setBusy(false));
                }}>{t('extInstall')}</button>
              </div>
            </div>
            <div className="ext-install ext-mcp-add" aria-label={t('extMcpAddLocal')}>
              <div className="ext-row-title">{t('extMcpAddLocal')}</div>
              <p className="hint" style={{ margin: '5px 0 8px' }}>{t('extMcpLocalHint')}</p>
              <div className="field-row" style={{ flexWrap: 'wrap' }}>
                <input className="ext-search" value={localMcpName} onChange={(e) => setLocalMcpName(e.target.value)} placeholder={t('extMcpRemoteName')} aria-label={t('extMcpRemoteName')} />
                <input className="ext-search" value={localMcpCommand} readOnly placeholder={t('extMcpLocalExecutable')} aria-label={t('extMcpLocalExecutable')} />
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void openFile({ multiple: false, directory: false }).then((selected) => { if (typeof selected === 'string') setLocalMcpCommand(selected); }).catch((e) => setMsg(String(e)))}>{t('extMcpChooseExecutable')}</button>
                <select value={localMcpScope} onChange={(e) => setLocalMcpScope(e.target.value === 'project' ? 'project' : 'user')} aria-label={t('extMcpRemoteScope')}>
                  <option value="user">{t('extMcpRemoteScopeUser')}</option><option value="project" disabled={!project}>{t('extMcpRemoteScopeProject')}</option>
                </select>
              </div>
              <textarea className="ext-search" value={localMcpArgs} onChange={(e) => setLocalMcpArgs(e.target.value)} placeholder={t('extMcpLocalArgs')} aria-label={t('extMcpLocalArgs')} rows={2} style={{ marginTop: 8, width: '100%' }} />
              <div className="field-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm primary-sm" disabled={busy || !localMcpName.trim() || !localMcpCommand.trim()} onClick={() => {
                  const args = localMcpArgs.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
                  const scopeLabel = localMcpScope === 'project' ? t('extMcpRemoteScopeProject') : t('extMcpRemoteScopeUser');
                  if (!window.confirm(t('extMcpLocalConfirm').replace('{name}', localMcpName.trim()).replace('{command}', localMcpCommand).replace('{scope}', scopeLabel))) return;
                  setBusy(true);
                  void addLocalMcp(localMcpName, localMcpCommand, args, localMcpScope, project || undefined, grokCmd || undefined)
                    .then((s) => { setMsg(s || t('extMcpLocalAdded')); setLocalMcpName(''); setLocalMcpCommand(''); setLocalMcpArgs(''); return refresh(); })
                    .catch((e) => setMsg(String(e))).finally(() => setBusy(false));
                }}>{t('extInstall')}</button>
              </div>
            </div>
            {liveMcp.length > 0 ? (
              liveMcp.map((server) => (
                <div key={`live:${server.name}`} className="ext-row">
                  <div className="ext-row-main"><div className="ext-row-title"><strong>{server.displayName || server.name}</strong><span className="pill">{server.session?.status || 'configured'}</span></div><div className="ext-row-desc">{server.session?.tools?.length ?? 0} tools</div>
                    {server.session?.setupRequired && server.setup?.fields?.length === 1 && server.setup.fields[0].type === 'select' ? (() => { const field = server.setup!.fields![0]; const selected = mcpSetupChoices[server.name] ?? field.default ?? field.options?.[0]?.value ?? ''; return <div className="field-row" style={{ marginTop: 8 }}><select value={selected} onChange={(e) => setMcpSetupChoices((old) => ({ ...old, [server.name]: e.target.value }))} aria-label={field.label}>{(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" className="btn btn-sm primary-sm" disabled={busy || !selected} onClick={() => { setBusy(true); void liveClient!.setupLiveMcp(liveSessionId!, server.name, { [field.id]: selected }).then(() => refreshLiveMcp(true)).catch((e) => setMsg(String(e))).finally(() => setBusy(false)); }}>{t('extMcpApplySetup')}</button></div>; })() : null}
                    {server.session?.tools?.length ? <div className="field-row" style={{ marginTop: 7, flexWrap: 'wrap' }}>{server.session.tools.slice(0, 16).map((tool) => <button key={tool.name} type="button" className={`btn btn-sm${tool.enabled ? '' : ' danger'}`} disabled={busy} title={tool.description || tool.name} onClick={() => { setBusy(true); void liveClient!.toggleLiveMcpTool(liveSessionId!, server.name, tool.name, !tool.enabled).then(() => refreshLiveMcp()).catch((e) => setMsg(String(e))).finally(() => setBusy(false)); }}>{tool.displayName || tool.name}{tool.enabled ? ` · ${t('extMcpToolOn')}` : ` · ${t('extMcpToolOff')}`}</button>)}</div> : null}
                  </div>
                  <div className="ext-row-actions">
                    {server.session?.authRequired ? <button type="button" className="btn btn-sm primary-sm" disabled={busy} onClick={() => { setBusy(true); void liveClient!.triggerLiveMcpAuth(liveSessionId!, server.name).then((r) => { setMsg(r.error || r.status || t('extMcpAuthStarted')); return refreshLiveMcp(true); }).catch((e) => setMsg(String(e))).finally(() => setBusy(false)); }}>{t('extMcpAuthenticate')}</button> : null}
                    {server.session ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setBusy(true); void liveClient!.toggleLiveMcp(liveSessionId!, server.name, !server.session!.enabled).then(() => refreshLiveMcp()).catch((e) => setMsg(String(e))).finally(() => setBusy(false)); }}>{server.session.enabled ? t('extMcpDisableLive') : t('extMcpEnableLive')}</button> : null}
                  </div>
                </div>
              ))
            ) : (
            mcp.length === 0 ? (
              <div className="hint">{t('extNoMcp')}</div>
            ) : (
              mcp.map((m) => (
                <div key={`${m.scope}:${m.name}`} className="ext-row">
                  <div className="ext-row-main">
                    <div className="ext-row-title">
                      <strong>{m.name}</strong>
                      <span className={m.enabled ? 'pill' : 'pill err'}>
                        {m.enabled ? t('extEnabled') : t('extDisabled')}
                      </span>
                      <span className="pill">{m.scope}</span>
                    </div>
                    <div className="ext-row-desc mono">{m.detail || '—'}</div>
                    {m.envKeys.length > 0 ? (
                      <div className="hint">
                        env: {m.envKeys.join(', ')} ({t('extEnvRedacted')})
                      </div>
                    ) : null}
                  </div>
                  <div className="ext-row-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(t('mcpRemoveConfirm').replace('{name}', m.name))) return;
                        setBusy(true);
                        void removeMcp(m.name, grokCmd || undefined)
                          .then((s) => {
                            setMsg(s || 'removed');
                            return refresh();
                          })
                          .catch((e) => setMsg(String(e)))
                          .finally(() => setBusy(false));
                      }}
                    >
                      {t('mcpRemove')}
                    </button>
                  </div>
                </div>
              ))
            ))}
            </>
          ) : null}

          {tab === 'plugins' ? (
            <>
              <div className="ext-install">
                <input
                  className="ext-search"
                  value={pluginSrc}
                  onChange={(e) => setPluginSrc(e.target.value)}
                  placeholder={t('extPluginPlaceholder')}
                />
                <button
                  type="button"
                  className="btn btn-sm primary-sm"
                  disabled={busy || !pluginSrc.trim()}
                  onClick={() => {
                    setBusy(true);
                    void installPlugin(pluginSrc.trim(), grokCmd || undefined)
                      .then((s) => {
                        setMsg(s || t('extInstallOk'));
                        setPluginSrc('');
                        return refresh();
                      })
                      .catch((e) => setMsg(String(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  {t('extInstall')}
                </button>
              </div>
              {plugins.length === 0 ? (
                <div className="hint">{t('extNoPlugins')}</div>
              ) : (
                plugins.map((p) => (
                  <div key={`${p.scope}:${p.name}`} className="ext-row">
                    <div className="ext-row-main">
                      <div className="ext-row-title">
                        <strong>{p.name}</strong>
                        {p.version ? <span className="pill">v{p.version}</span> : null}
                        <span className={p.enabled ? 'pill' : 'pill err'}>
                          {p.enabled ? t('extEnabled') : t('extDisabled')}
                        </span>
                        <span className="pill">{p.scope}</span>
                      </div>
                      <div className="ext-row-desc">{p.description || '—'}</div>
                      {p.path ? (
                        <div className="ext-row-path mono" title={p.path}>
                          {p.path}
                        </div>
                      ) : null}
                      {pluginReadout?.name === p.name ? (
                        <div className="ext-plugin-readout">
                          <div className="ext-row-title">
                            <strong>{pluginReadout.kind === 'details' ? t('extPluginDetails') : t('extPluginValidate')}</strong>
                            <button type="button" className="btn btn-sm" onClick={() => setPluginReadout(null)}>{t('extCloseReadout')}</button>
                          </div>
                          <pre className="ext-msg">{pluginReadout.text}</pre>
                        </div>
                      ) : null}
                    </div>
                    <div className="ext-row-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void pluginDetails(p.name, grokCmd || undefined)
                            .then((text) => setPluginReadout({ name: p.name, text, kind: 'details' }))
                            .catch((e) => setMsg(String(e)))
                            .finally(() => setBusy(false));
                        }}
                      >
                        {t('extPluginDetails')}
                      </button>
                      {p.path ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void validatePlugin(p.path!, grokCmd || undefined)
                              .then((text) => setPluginReadout({ name: p.name, text, kind: 'validate' }))
                              .catch((e) => setMsg(String(e)))
                              .finally(() => setBusy(false));
                          }}
                        >
                          {t('extPluginValidate')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-sm primary-sm"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t('pluginUninstallConfirm').replace('{name}', p.name))) return;
                          setBusy(true);
                          void setPluginEnabled(p.name, !p.enabled, grokCmd || undefined)
                            .then((s) => {
                              setMsg(s || 'ok');
                              return refresh();
                            })
                            .catch((e) => setMsg(String(e)))
                            .finally(() => setBusy(false));
                        }}
                      >
                        {p.enabled ? t('pluginDisable') : t('pluginEnable')}
                      </button>
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => {
                        setBusy(true);
                        void updatePlugin(p.name, grokCmd || undefined).then((s) => { setMsg(s || t('extPluginUpdateDone')); return refresh(); }).catch((e) => setMsg(String(e))).finally(() => setBusy(false));
                      }}>{t('extPluginUpdate')}</button>
                      {p.path ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            void openExtensionPath(p.path!).catch((e) => setMsg(String(e)))
                          }
                        >
                          {t('openFolder')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void uninstallPlugin(p.name, grokCmd || undefined)
                            .then((s) => {
                              setMsg(s || 'uninstalled');
                              return refresh();
                            })
                            .catch((e) => setMsg(String(e)))
                            .finally(() => setBusy(false));
                        }}
                      >
                        {t('pluginUninstall')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          ) : null}

          {tab === 'market' ? (
            <>
              <div className="ext-install" aria-label={t('marketAdd')}>
                <input
                  value={marketSourceDraft}
                  onChange={(e) => setMarketSourceDraft(e.target.value)}
                  placeholder={t('marketSourcePlaceholder')}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy || !marketSourceDraft.trim()}
                  onClick={() => {
                    const source = marketSourceDraft.trim();
                    if (!source) return;
                    setBusy(true);
                    void addMarketplace(source, grokCmd || undefined)
                      .then((s) => {
                        setMarketSourceDraft('');
                        setMsg(s || t('marketAddDone'));
                        return refreshMarketplace();
                      })
                      .catch((e) => setMsg(String(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  {t('marketAdd')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void updateMarketplace(undefined, grokCmd || undefined)
                      .then((s) => {
                        setMsg(s || t('marketUpdateDone'));
                        return refreshMarketplace();
                      })
                      .catch((e) => setMsg(String(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  {t('marketUpdateAll')}
                </button>
              </div>
              {marketSources.length === 0 && !marketRaw ? (
                <div className="hint">{t('marketNoSources')}</div>
              ) : null}
              {marketSources.map((src, i) => {
                const o = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
                const name = String(o.name ?? o.id ?? `source-${i}`);
                const url =
                  typeof o.source === 'object' && o.source
                    ? String((o.source as { url?: string }).url ?? '')
                    : String(o.url ?? o.git ?? '');
                return (
                  <div key={name} className="ext-row">
                    <div className="ext-row-main">
                      <div className="ext-row-title">
                        <strong>{name}</strong>
                        <span className="pill">{String(o.kind ?? 'git')}</span>
                      </div>
                      <div className="ext-row-desc mono">{url || JSON.stringify(src).slice(0, 200)}</div>
                    </div>
                    <div className="ext-row-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void updateMarketplace(url || name, grokCmd || undefined)
                            .then((s) => {
                              setMsg(s || t('marketUpdateDone'));
                              return refreshMarketplace();
                            })
                            .catch((e) => setMsg(String(e)))
                            .finally(() => setBusy(false));
                        }}
                      >
                        {t('marketUpdate')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t('marketRemoveConfirm').replace('{name}', name))) return;
                          setBusy(true);
                          void removeMarketplace(url || name, grokCmd || undefined)
                            .then((s) => {
                              setMsg(s || t('marketRemoveDone'));
                              return refreshMarketplace();
                            })
                            .catch((e) => setMsg(String(e)))
                            .finally(() => setBusy(false));
                        }}
                      >
                        {t('marketRemove')}
                      </button>
                    </div>
                  </div>
                );
              })}
              {marketRaw ? <pre className="ext-msg">{marketRaw}</pre> : null}
              <div className="hint" style={{ marginTop: 8 }}>
                {t('extPluginPlaceholder')} → Plugins tab
              </div>
            </>
          ) : null}
        </div>

        {snap?.skillRoots?.length ? (
          <div className="hint" style={{ marginTop: 10 }}>
            {t('extRoots')}: {snap.skillRoots.slice(0, 4).join(' · ')}
            {snap.skillRoots.length > 4 ? ' …' : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}
