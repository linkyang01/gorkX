import { useEffect, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { ComposerAttachment } from '../lib/attachments';
import { extOf } from '../lib/attachments';
import {
  isEditableTextDeliverable,
  isBinaryPreviewOnly,
  textEditConflicts,
} from '../lib/deliverables';
import { revealInFinder } from '../lib/host';
import { t } from '../lib/i18n';
import { MarkdownView } from './MarkdownView';

interface Props {
  item: ComposerAttachment | null;
  /** Project cwd required for safe in-project text edit. */
  projectCwd?: string;
  onClose: () => void;
}

/**
 * Rich preview for ACP deliverables. Text/Markdown may be edited when the file
 * is inside the selected project; binaries stay preview-only.
 */
export function AttachmentPreview({ item, projectCwd, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const [mtimeMs, setMtimeMs] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const editable =
    Boolean(item && projectCwd && isEditableTextDeliverable({
      kind: item.kind,
      path: item.path,
      href: item.href,
    }));
  const isMd = item ? extOf(item.path) === 'md' : false;
  const binaryOnly = item ? isBinaryPreviewOnly(item) && !editable : false;

  const loadText = async (target: ComposerAttachment, canEdit: boolean) => {
    setErr(null);
    setConflict(false);
    setStatus(null);
    if (projectCwd && canEdit) {
      try {
        const snap = await invoke<{
          path: string;
          content: string;
          mtimeMs: number;
          size: number;
        }>('workspace_read_text_file', { cwd: projectCwd, path: target.path });
        setText(snap.content);
        setBaseline(snap.content);
        setDraft(snap.content);
        setMtimeMs(snap.mtimeMs);
        return;
      } catch (e) {
        // Fall through to read-only plugin path for non-project media paths.
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const body = await readTextFile(target.path);
      const clipped = body.length > 200_000 ? `${body.slice(0, 200_000)}\n…` : body;
      setText(clipped);
      setBaseline(clipped);
      setDraft(clipped);
      setMtimeMs(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setText(null);
    }
  };

  useEffect(() => {
    setText(null);
    setErr(null);
    setEditing(false);
    setDraft('');
    setConflict(false);
    setStatus(null);
    if (!item) return;
    if (item.href && !item.path) return;
    const canEdit = Boolean(
      projectCwd &&
        isEditableTextDeliverable({ kind: item.kind, path: item.path, href: item.href }),
    );
    const needText =
      item.kind === 'text' || canEdit || extOf(item.path) === 'md';
    if (needText) void loadText(item, canEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.path, projectCwd]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const pdfUrl = (() => {
    if (item.kind !== 'pdf') return null;
    try {
      return convertFileSrc(item.path);
    } catch {
      return null;
    }
  })();

  const saveEdit = async () => {
    if (!item || !projectCwd || !editable) return;
    setSaving(true);
    setErr(null);
    setConflict(false);
    setStatus(null);
    try {
      // Re-read to compare content when mtime is unavailable (0).
      if (mtimeMs === 0) {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const onDisk = await readTextFile(item.path);
        if (textEditConflicts(baseline, onDisk)) {
          setConflict(true);
          setErr(t('deliverablesEditConflict'));
          setSaving(false);
          return;
        }
      }
      const snap = await invoke<{
        path: string;
        content: string;
        mtimeMs: number;
        size: number;
      }>('workspace_write_text_if_mtime', {
        cwd: projectCwd,
        path: item.path,
        content: draft,
        expectedMtimeMs: mtimeMs,
      });
      setText(snap.content);
      setBaseline(snap.content);
      setDraft(snap.content);
      setMtimeMs(snap.mtimeMs);
      setEditing(false);
      setStatus(t('deliverablesEditSaved'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/conflict/i.test(msg)) {
        setConflict(true);
        setErr(t('deliverablesEditConflict'));
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const reloadFromDisk = async () => {
    if (!item) return;
    setEditing(false);
    const canEdit = Boolean(
      projectCwd &&
        isEditableTextDeliverable({ kind: item.kind, path: item.path, href: item.href }),
    );
    await loadText(item, canEdit);
    setStatus(t('deliverablesEditReloaded'));
  };

  return (
    <div className="modal-backdrop att-preview-backdrop" onClick={onClose}>
      <div
        className="att-preview-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={item.name}
      >
        <div className="att-preview-head">
          <div className="att-preview-title" title={item.path || item.href || item.name}>
            {item.name}
          </div>
          <div className="diff-actions">
            {editable ? (
              editing ? (
                <>
                  <button type="button" className="btn btn-sm" disabled={saving} onClick={() => { setDraft(baseline); setEditing(false); setConflict(false); }}>
                    {t('deliverablesEditUndo')}
                  </button>
                  <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void reloadFromDisk()}>
                    {t('deliverablesEditReload')}
                  </button>
                  <button type="button" className="btn btn-sm primary-sm" disabled={saving || draft === baseline} onClick={() => void saveEdit()}>
                    {saving ? '…' : t('deliverablesEditSave')}
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
                  {t('deliverablesEdit')}
                </button>
              )
            ) : null}
            {item.path ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void revealInFinder(item.path).catch(() => {})}
              >
                {t('revealFinder')}
              </button>
            ) : null}
            <button type="button" className="btn btn-sm" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="att-preview-body">
          {err ? <div className={`hint${conflict ? ' att-preview-conflict' : ''}`}>{err}</div> : null}
          {status ? <div className="hint att-preview-status">{status}</div> : null}

          {item.href && !item.path ? (
            <div className="att-preview-fallback">
              <p>{t('deliverablesExternalLink')}</p>
              <a href={item.href} target="_blank" rel="noreferrer">
                {item.href}
              </a>
            </div>
          ) : null}

          {item.kind === 'image' && item.previewUrl ? (
            <img className="att-preview-media" src={item.previewUrl} alt={item.name} />
          ) : null}
          {item.kind === 'video' && item.previewUrl ? (
            <video className="att-preview-media" src={item.previewUrl} controls autoPlay />
          ) : null}
          {item.kind === 'audio' && item.previewUrl ? (
            <audio className="att-preview-audio" src={item.previewUrl} controls autoPlay />
          ) : null}

          {item.kind === 'pdf' ? (
            pdfUrl ? (
              <iframe className="att-preview-pdf" title={item.name} src={pdfUrl} />
            ) : (
              <div className="att-preview-fallback">
                <p>{t('attachmentOpenHint')}</p>
                <code className="mono">{item.path}</code>
              </div>
            )
          ) : null}

          {(item.kind === 'text' || editable) && item.path ? (
            editing ? (
              <textarea
                className="att-preview-editor"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
              />
            ) : text == null && !err ? (
              <div className="hint">…</div>
            ) : text != null ? (
              isMd ? (
                <div className="att-preview-md">
                  <MarkdownView text={text} />
                </div>
              ) : (
                <pre className="att-preview-text">{text}</pre>
              )
            ) : null
          ) : null}

          {item.kind === 'file' && !editable && binaryOnly ? (
            <div className="att-preview-fallback">
              <p>{t('deliverablesBinaryOnly')}</p>
              <code className="mono">{item.path}</code>
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 12 }}
                onClick={() => void revealInFinder(item.path).catch(() => {})}
              >
                {t('revealFinder')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
