/**
 * Codex-style project picker: search, recent list, no-project task, new / existing folder.
 */
import { useMemo, useState } from 'react';
import { projectDisplayName } from '../lib/projects';
import { t } from '../lib/i18n';
import {
  IconFolder,
  IconInbox,
  IconPlus,
  IconSearch,
} from './UiIcons';

export type ProjectPickerAction =
  | { type: 'select'; path: string }
  | { type: 'no-project' }
  | { type: 'new-blank' }
  | { type: 'open-folder' };

interface Props {
  open: boolean;
  projects: string[];
  aliases?: Record<string, string>;
  current?: string;
  onClose: () => void;
  onAction: (a: ProjectPickerAction) => void;
}

export function ProjectPicker({
  open,
  projects,
  aliases = {},
  current,
  onClose,
  onAction,
}: Props) {
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return projects;
    return projects.filter((p) => {
      const name = projectDisplayName(p, aliases).toLowerCase();
      return name.includes(qq) || p.toLowerCase().includes(qq);
    });
  }, [projects, aliases, q]);

  if (!open) return null;

  const go = (a: ProjectPickerAction) => {
    onAction(a);
    onClose();
    setNewOpen(false);
    setQ('');
  };

  return (
    <div
      className="pop-menu project-picker-menu"
      role="dialog"
      aria-label={t('projectPickerTitle')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="project-picker-search">
        <span className="project-picker-search-ico" aria-hidden>
          <IconSearch size={14} />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('projectPickerSearch')}
          spellCheck={false}
          autoFocus
        />
      </div>

      <div className="project-picker-list">
        {filtered.map((p) => {
          const name = projectDisplayName(p, aliases);
          const on = current === p;
          return (
            <button
              key={p}
              type="button"
              className={`pop-menu-item project-picker-item${on ? ' on' : ''}`}
              onClick={() => go({ type: 'select', path: p })}
              title={p}
            >
              <span className="project-picker-item-ico" aria-hidden>
                <IconFolder size={15} />
              </span>
              <span className="project-picker-item-text">
                <span className="plus-item-title">{name}</span>
                <span className="plus-item-desc mono">{p}</span>
              </span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <div className="project-picker-empty">{t('projectPickerEmpty')}</div>
        ) : null}
      </div>

      <div className="project-picker-divider" />

      <button
        type="button"
        className="pop-menu-item project-picker-item"
        onClick={() => go({ type: 'no-project' })}
      >
        <span className="project-picker-item-ico" aria-hidden>
          <IconInbox size={15} />
        </span>
        <span className="project-picker-item-text">
          <span className="plus-item-title">{t('projectPickerNoProject')}</span>
          <span className="plus-item-desc">{t('projectPickerNoProjectHint')}</span>
        </span>
      </button>

      <div className="project-picker-new-wrap">
        <button
          type="button"
          className="pop-menu-item project-picker-item"
          onClick={() => setNewOpen((v) => !v)}
        >
          <span className="project-picker-item-ico" aria-hidden>
            <IconPlus size={15} />
          </span>
          <span className="project-picker-item-text">
            <span className="plus-item-title">{t('projectPickerNew')}</span>
            <span className="plus-item-desc">{t('projectPickerNewHint')}</span>
          </span>
          <span className="project-picker-chevron">{newOpen ? '▾' : '›'}</span>
        </button>
        {newOpen ? (
          <div className="project-picker-submenu">
            <button
              type="button"
              className="pop-menu-item"
              onClick={() => go({ type: 'new-blank' })}
            >
              <span className="plus-item-title">{t('projectPickerNewBlank')}</span>
              <span className="plus-item-desc">{t('projectPickerNewBlankHint')}</span>
            </button>
            <button
              type="button"
              className="pop-menu-item"
              onClick={() => go({ type: 'open-folder' })}
            >
              <span className="plus-item-title">{t('projectPickerUseFolder')}</span>
              <span className="plus-item-desc">{t('projectPickerUseFolderHint')}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
