import type { PlanEntry } from '../lib/acpClient';
import { t } from '../lib/i18n';
import { humanPlanStatus } from '../lib/toolHuman';

interface Props {
  entries: PlanEntry[];
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}

export function PlanCard({ entries, onToggle, onToggleAll }: Props) {
  if (entries.length === 0) return null;
  const allOn = entries.every((e) => e.checked);
  return (
    <div className="plan-card">
      <div className="plan-card-head">
        <span className="msg-role">{t('modePlan')}</span>
        <button type="button" className="btn btn-sm" onClick={() => onToggleAll(!allOn)}>
          {allOn ? t('planUncheckAll') : t('planCheckAll')}
        </button>
      </div>
      <ul className="plan-list">
        {entries.map((e, i) => (
          <li key={e.id} className={e.checked ? 'on' : 'off'}>
            <label>
              <input
                type="checkbox"
                checked={e.checked}
                onChange={() => onToggle(e.id)}
              />
              <span className="plan-idx">{i + 1}.</span>
              <span className="plan-text">{e.text}</span>
              {e.status ? (
                <span className="plan-st">{humanPlanStatus(e.status)}</span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
