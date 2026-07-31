import { useState } from 'react';
import { t } from '../lib/i18n';
import {
  buildHookDefinition,
  HOOK_EVENTS,
  type HookEventName,
  type HookHandlerType,
  validateHookHandler,
  writeProjectHook,
} from '../lib/hookAuthoring';

interface Props {
  project: string;
  onSaved?: () => void;
}

export function HookBuilder({ project, onSaved }: Props) {
  const [fileName, setFileName] = useState('gorkx-hook.json');
  const [event, setEvent] = useState<HookEventName>('PreToolUse');
  const [matcher, setMatcher] = useState('');
  const [type, setType] = useState<HookHandlerType>('command');
  const [handler, setHandler] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState(10);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    const trimmedName = fileName.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,89}\.json$/.test(trimmedName)) {
      setMessage(t('settingsHooksFileNameInvalid'));
      return;
    }
    const handlerError = validateHookHandler(type, handler);
    if (handlerError) {
      const messages = {
        required: t('settingsHooksHandlerRequired'),
        'too-long': t('settingsHooksHandlerTooLong'),
        https: t('settingsHooksHttpsRequired'),
        'invalid-url': t('settingsHooksUrlInvalid'),
      } as const;
      setMessage(messages[handlerError]);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const path = await writeProjectHook(
        project,
        trimmedName,
        buildHookDefinition({ event, matcher, type, handler, timeoutSeconds }),
      );
      setMessage(`${t('settingsHooksSaved')}\n${path}`);
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-card hook-builder">
      <div className="settings-row-title">{t('settingsHooksCreateTitle')}</div>
      <p className="settings-row-hint">{t('settingsHooksCreateHint')}</p>
      <div className="hook-builder-grid">
        <label className="field">
          <span>{t('settingsHooksFileName')}</span>
          <input value={fileName} maxLength={96} onChange={(e) => setFileName(e.target.value)} placeholder="gorkx-hook.json" />
        </label>
        <label className="field">
          <span>{t('settingsHooksEvent')}</span>
          <select value={event} onChange={(e) => setEvent(e.target.value as HookEventName)}>
            {HOOK_EVENTS.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('settingsHooksMatcher')}</span>
          <input value={matcher} maxLength={240} onChange={(e) => setMatcher(e.target.value)} placeholder={t('settingsHooksMatcherPlaceholder')} />
        </label>
        <label className="field">
          <span>{t('settingsHooksHandlerType')}</span>
          <select value={type} onChange={(e) => setType(e.target.value as HookHandlerType)}>
            <option value="command">{t('settingsHooksCommandType')}</option>
            <option value="http">{t('settingsHooksHttpType')}</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>{type === 'command' ? t('settingsHooksCommand') : t('settingsHooksUrl')}</span>
        <textarea
          value={handler}
          maxLength={16_000}
          rows={3}
          onChange={(e) => setHandler(e.target.value)}
          placeholder={type === 'command' ? t('settingsHooksCommandPlaceholder') : t('settingsHooksUrlPlaceholder')}
          spellCheck={false}
        />
      </label>
      <div className="field-row hook-builder-footer">
        <label className="hook-timeout-field">
          <span>{t('settingsHooksTimeout')}</span>
          <input className="settings-number-input" type="number" min={1} max={3600} value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(Number(e.target.value) || 1)} />
        </label>
        <button type="button" className="btn primary" disabled={busy || !project} onClick={() => void save()}>
          {busy ? t('settingsHooksSaving') : t('settingsHooksSave')}
        </button>
      </div>
      <p className="settings-row-hint hook-builder-warning">{t('settingsHooksCreateWarning')}</p>
      {message ? <p className="settings-row-hint settings-msg">{message}</p> : null}
    </div>
  );
}
