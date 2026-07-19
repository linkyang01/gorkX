import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ROWS: Array<{ keys: string; action: string }> = [
  { keys: 'Enter', action: 'send' },
  { keys: 'Shift + Enter', action: 'newline' },
  { keys: '↑ / ↓', action: 'Navigate / and @ menus' },
  { keys: 'Enter / Tab', action: 'Insert selected / or @ item' },
  { keys: '⌘/Ctrl + L', action: 'Focus composer' },
  { keys: '⌥⌘ ↑ / ↓', action: 'Previous / next task' },
  { keys: '⌥⌘ [ / ]', action: 'Previous / next task' },
  { keys: '⌘/Ctrl + N', action: 'newThread' },
  { keys: '⌘/Ctrl + D', action: 'Review panel' },
  { keys: '⇧⌘/Ctrl + J', action: 'Terminal dock' },
  { keys: '⇧⌘/Ctrl + E', action: 'Extensions' },
  { keys: '⌘/Ctrl + K', action: 'Kernel settings' },
  { keys: '⌘/Ctrl + /', action: 'Shortcuts' },
  { keys: 'Esc', action: 'Close menus / modals' },
];

export function ShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="modal-head">
          <h2>{t('shortcuts')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ×
          </button>
        </div>
        <table className="shortcuts-table">
          <tbody>
            {ROWS.map((r) => (
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
