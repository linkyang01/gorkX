import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Desktop-first shortcuts. Slash remains expert-only compatibility. */
function shortcutRows(): Array<{ keys: string; action: string }> {
  return [
    { keys: 'Enter', action: t('shortcutSend') },
    { keys: 'Shift + Enter', action: t('shortcutNewline') },
    { keys: '↑ / ↓', action: t('shortcutMenusNav') },
    { keys: 'Enter / Tab', action: t('shortcutMenusPick') },
    { keys: '⌘/Ctrl + L', action: t('shortcutFocusComposer') },
    { keys: '⌥⌘ ↑ / ↓', action: t('shortcutPrevNextTask') },
    { keys: '⌥⌘ [ / ]', action: t('shortcutPrevNextTask') },
    { keys: '⌘/Ctrl + N', action: t('shortcutNewTask') },
    { keys: '⌘/Ctrl + D', action: t('shortcutReview') },
    { keys: '⇧⌘/Ctrl + J', action: t('shortcutTerminal') },
    { keys: '⇧⌘/Ctrl + E', action: t('shortcutExtensions') },
    { keys: '⇧⌘/Ctrl + M', action: t('shortcutMemory') },
    { keys: '⇧⌘/Ctrl + A', action: t('shortcutDecisions') },
    { keys: '⇧⌘/Ctrl + S', action: t('shortcutScheduled') },
    { keys: '⇧⌘/Ctrl + B', action: t('shortcutSpawnSubagent') },
    { keys: '⇧⌘/Ctrl + P', action: t('shortcutProcess') },
    { keys: '⇧⌘/Ctrl + I', action: t('shortcutTaskInfo') },
    { keys: '⇧⌘/Ctrl + F', action: t('shortcutTaskSearch') },
    { keys: '⌘/Ctrl + K', action: t('shortcutSettings') },
    { keys: 'Ctrl + Space / F8', action: t('shortcutVoice') },
    { keys: '⌘/Ctrl + /', action: t('shortcutHelp') },
    { keys: 'Esc', action: t('shortcutEsc') },
  ];
}

export function ShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;
  const rows = shortcutRows();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('shortcuts')}>
        <div className="modal-head">
          <h2>{t('shortcuts')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('cancel')}>
            ×
          </button>
        </div>
        <p className="hint" style={{ margin: '0 0 10px' }}>{t('shortcutDesktopFirstHint')}</p>
        <table className="shortcuts-table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.keys}>
                <td className="mono">{r.keys}</td>
                <td>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
