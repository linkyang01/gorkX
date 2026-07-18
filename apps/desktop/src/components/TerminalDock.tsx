import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { onPtyExit, onPtyOutput, ptyClose, ptyOpen, ptyResize, ptyWrite } from '../lib/pty';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  cwd: string;
  onClose: () => void;
}

/**
 * Single embedded terminal: xterm.js ↔ portable-pty login shell.
 */
export function TerminalDock({ open, cwd, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Create xterm once when dock opens
  useEffect(() => {
    if (!open) return;
    const host = hostRef.current;
    if (!host) return;

    disposedRef.current = false;
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: 'SF Mono, Menlo, Monaco, ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#1c1c1e',
        foreground: '#e8e8ed',
        cursor: '#0a84ff',
        cursorAccent: '#1c1c1e',
        selectionBackground: 'rgba(10, 132, 255, 0.35)',
        black: '#1c1c1e',
        red: '#ff453a',
        green: '#32d74b',
        yellow: '#ffd60a',
        blue: '#0a84ff',
        magenta: '#bf5af2',
        cyan: '#64d2ff',
        white: '#e8e8ed',
        brightBlack: '#636366',
        brightRed: '#ff6961',
        brightGreen: '#30db5b',
        brightYellow: '#ffd426',
        brightBlue: '#409cff',
        brightMagenta: '#da8fff',
        brightCyan: '#70d7ff',
        brightWhite: '#f5f5f7',
      },
      allowProposedApi: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    term.focus();

    termRef.current = term;
    fitRef.current = fit;

    const onDataDisp = term.onData((data) => {
      const sid = sessionRef.current;
      if (!sid) return;
      void ptyWrite(sid, data).catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
    });

    let unOut: (() => void) | undefined;
    let unExit: (() => void) | undefined;
    void onPtyOutput((sid, data) => {
      if (sid !== sessionRef.current) return;
      term.write(data);
    }).then((u) => {
      unOut = u;
    });
    void onPtyExit((sid) => {
      if (sid !== sessionRef.current) return;
      sessionRef.current = null;
      setSessionId(null);
      setStatus(t('ptyExited'));
      term.writeln(`\r\n\x1b[90m[${t('ptyExited')}]\x1b[0m`);
    }).then((u) => {
      unExit = u;
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const sid = sessionRef.current;
        if (sid && term.cols && term.rows) {
          void ptyResize(sid, term.cols, term.rows);
        }
      } catch {
        /* ignore fit races */
      }
    });
    ro.observe(host);

    return () => {
      disposedRef.current = true;
      onDataDisp.dispose();
      unOut?.();
      unExit?.();
      ro.disconnect();
      const sid = sessionRef.current;
      sessionRef.current = null;
      if (sid) void ptyClose(sid);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      setSessionId(null);
    };
  }, [open]);

  // Spawn / respawn shell when cwd is available
  useEffect(() => {
    if (!open || !cwd) {
      if (open && !cwd) setStatus(t('reviewNeedProject'));
      return;
    }
    let cancelled = false;

    const start = async () => {
      setError(null);
      setStatus(t('terminalWaiting'));
      // close previous session if any
      if (sessionRef.current) {
        const old = sessionRef.current;
        sessionRef.current = null;
        await ptyClose(old).catch(() => {});
      }
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term) return;
      try {
        fit?.fit();
        const cols = term.cols || 100;
        const rows = term.rows || 28;
        const r = await ptyOpen(cwd, cols, rows);
        if (cancelled || disposedRef.current) {
          await ptyClose(r.sessionId).catch(() => {});
          return;
        }
        sessionRef.current = r.sessionId;
        setSessionId(r.sessionId);
        setStatus(r.shell || 'shell');
        term.reset();
        term.focus();
        // resize once more after open
        fit?.fit();
        await ptyResize(r.sessionId, term.cols, term.rows).catch(() => {});
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setStatus('');
          term.writeln(`\r\n\x1b[31m${msg}\x1b[0m`);
        }
      }
    };

    // slight delay so xterm has dimensions
    const tmr = window.setTimeout(() => {
      void start();
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(tmr);
    };
  }, [open, cwd]);

  if (!open) return null;

  const restart = () => {
    // re-trigger cwd effect by force close+open session
    const term = termRef.current;
    const fit = fitRef.current;
    if (!cwd || !term) return;
    setError(null);
    void (async () => {
      if (sessionRef.current) {
        const old = sessionRef.current;
        sessionRef.current = null;
        await ptyClose(old).catch(() => {});
      }
      setStatus(t('terminalWaiting'));
      try {
        fit?.fit();
        const r = await ptyOpen(cwd, term.cols, term.rows);
        sessionRef.current = r.sessionId;
        setSessionId(r.sessionId);
        setStatus(r.shell || 'shell');
        term.reset();
        term.focus();
        await ptyResize(r.sessionId, term.cols, term.rows).catch(() => {});
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  };

  return (
    <div className="terminal-dock">
      <div className="terminal-head">
        <div className="terminal-title">{t('terminalTitle')}</div>
        <span className="muted mono" title={cwd || undefined}>
          {cwd ? cwd.split('/').filter(Boolean).pop() : '—'}
          {status ? ` · ${status}` : ''}
        </span>
        {error ? <span className="terminal-err-inline">{error}</span> : null}
        <div className="diff-actions" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!cwd}
            title={t('ptyRestart')}
            onClick={restart}
          >
            ↻
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div
        className="terminal-xterm-host"
        ref={hostRef}
        onClick={() => termRef.current?.focus()}
      />
      {!sessionId && !error && cwd ? (
        <div className="terminal-overlay-hint">{t('terminalWaiting')}</div>
      ) : null}
      {!cwd ? <div className="terminal-overlay-hint">{t('reviewNeedProject')}</div> : null}
    </div>
  );
}
