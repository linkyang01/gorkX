import { useEffect, useState } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import type { ComposerAttachment } from '../lib/attachments';
import { revealInFinder } from '../lib/host';
import { t } from '../lib/i18n';

interface Props {
  item: ComposerAttachment | null;
  onClose: () => void;
}

export function AttachmentPreview({ item, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    setErr(null);
    if (!item) return;
    if (item.kind === 'text') {
      void readTextFile(item.path)
        .then((body) => setText(body.length > 200_000 ? body.slice(0, 200_000) + '\n…' : body))
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="modal-backdrop att-preview-backdrop" onClick={onClose}>
      <div
        className="att-preview-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={item.name}
      >
        <div className="att-preview-head">
          <div className="att-preview-title" title={item.path}>
            {item.name}
          </div>
          <div className="diff-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void revealInFinder(item.path).catch(() => {})}
            >
              {t('revealFinder')}
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="att-preview-body">
          {item.kind === 'image' && item.previewUrl ? (
            <img className="att-preview-media" src={item.previewUrl} alt={item.name} />
          ) : null}
          {item.kind === 'video' && item.previewUrl ? (
            <video className="att-preview-media" src={item.previewUrl} controls autoPlay />
          ) : null}
          {item.kind === 'audio' && item.previewUrl ? (
            <audio className="att-preview-audio" src={item.previewUrl} controls autoPlay />
          ) : null}
          {item.kind === 'text' ? (
            err ? (
              <div className="hint">{err}</div>
            ) : text == null ? (
              <div className="hint">…</div>
            ) : (
              <pre className="att-preview-text">{text}</pre>
            )
          ) : null}
          {item.kind === 'pdf' || item.kind === 'file' ? (
            <div className="att-preview-fallback">
              <p>{t('attachmentOpenHint')}</p>
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
