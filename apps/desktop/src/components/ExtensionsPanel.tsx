import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchExtensionsSnapshot,
  fetchMarketplace,
  installPlugin,
  openExtensionPath,
  openGrokConfig,
  openSkillsDir,
  enablePlaywrightChromeMcp,
  removeMcp,
  runMcpDoctor,
  setPluginEnabled,
  uninstallPlugin,
  type ExtensionsSnapshot,
  type SkillInfo,
} from '../lib/extensions';
import { t } from '../lib/i18n';

type Tab = 'skills' | 'mcp' | 'plugins' | 'market';

interface Props {
  open: boolean;
  onClose: () => void;
  project: string;
  grokCmd: string;
  onRunSkill: (skill: SkillInfo) => void;
}

export function ExtensionsPanel({ open, onClose, project, grokCmd, onRunSkill }: Props) {
  const [tab, setTab] = useState<Tab>('skills');
  const [snap, setSnap] = useState<ExtensionsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pluginSrc, setPluginSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const [marketRaw, setMarketRaw] = useState('');
  const [marketSources, setMarketSources] = useState<unknown[]>([]);

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

  useEffect(() => {
    if (!open || tab !== 'market') return;
    void fetchMarketplace(grokCmd || undefined)
      .then((m) => {
        setMarketSources(m.sources ?? []);
        setMarketRaw(m.raw ?? '');
      })
      .catch((e) => setMsg(String(e)));
  }, [open, tab, grokCmd]);

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
            )
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
                    </div>
                    <div className="ext-row-actions">
                      <button
                        type="button"
                        className="btn btn-sm primary-sm"
                        disabled={busy}
                        onClick={() => {
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
              {marketSources.length === 0 && !marketRaw ? (
                <div className="hint">{t('extNoPlugins')}</div>
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
