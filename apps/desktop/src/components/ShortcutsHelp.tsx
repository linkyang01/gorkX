import { t } from '../lib/i18n';
import { desktopShortcutHelpTable } from '../lib/desktopShortcuts';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Desktop-first shortcuts. Slash remains expert-only compatibility. */
export function ShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;
  const rows = desktopShortcutHelpTable();
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
