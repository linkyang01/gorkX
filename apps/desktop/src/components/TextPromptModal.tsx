import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

export interface TextPromptRequest {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
}

interface Props {
  request: TextPromptRequest | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Native window.prompt is broken / silent in Tauri WKWebView — use this instead. */
export function TextPromptModal({ request, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.defaultValue ?? '');
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(id);
  }, [request]);

  if (!request) return null;

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div
        className="modal text-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{request.title}</h2>
        {request.message ? <p className="text-prompt-msg">{request.message}</p> : null}
        <div className="field">
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={request.placeholder || ''}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {request.cancelLabel || t('cancel')}
          </button>
          <button type="button" className="btn primary" disabled={!value.trim()} onClick={submit}>
            {request.okLabel || t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
