import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

export interface ActionPromptRequest {
  title: string;
  message: string;
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
}

interface Props {
  request: ActionPromptRequest | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Desktop-first request form for an engine capability that needs user intent. */
export function ActionPromptModal({ request, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.initialValue ?? '');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [request]);

  if (!request) return null;
  const submit = () => {
    const text = value.trim();
    if (text) onSubmit(text);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section
        className="modal action-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{request.title}</h2>
        <p className="text-prompt-msg">{request.message}</p>
        <textarea
          ref={inputRef}
          value={value}
          rows={6}
          placeholder={request.placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel();
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="action-prompt-help">{t('actionPromptSendHint')}</div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>{t('cancel')}</button>
          <button type="button" className="btn primary" disabled={!value.trim()} onClick={submit}>
            {request.submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
