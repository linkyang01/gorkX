import { t } from '../lib/i18n';
import { IconMemory, IconPlugins, IconPlus, IconScheduled } from './UiIcons';

interface Props {
  extensionsOpen: boolean;
  scheduledOpen: boolean;
  memoryOpen: boolean;
  onNewTask: () => void;
  onOpenExtensions: () => void;
  onOpenScheduled: () => void;
  onOpenMemory: () => void;
}

/** Stable top navigation; task/project state remains owned by App. */
export function SidebarNav(props: Props) {
  return (
    <nav className="nav-stack" aria-label="main">
      <button type="button" className="nav-item primary" title={t('newSessionHint')} aria-label={t('newSession')} onClick={props.onNewTask}>
        <span className="nav-ico"><IconPlus /></span><span className="nav-label">{t('newSession')}</span>
      </button>
      <button type="button" className={props.extensionsOpen ? 'nav-item on' : 'nav-item'} title={t('navPlugins')} aria-label={t('navPlugins')} onClick={props.onOpenExtensions}>
        <span className="nav-ico"><IconPlugins /></span><span className="nav-label">{t('navPlugins')}</span>
      </button>
      <button type="button" className={props.scheduledOpen ? 'nav-item on' : 'nav-item'} title={t('navScheduled')} aria-label={t('navScheduled')} onClick={props.onOpenScheduled}>
        <span className="nav-ico"><IconScheduled /></span><span className="nav-label">{t('navScheduled')}</span>
      </button>
      <button type="button" className={props.memoryOpen ? 'nav-item on' : 'nav-item'} title={t('navMemoryHint')} aria-label={t('memoryManageNav')} onClick={props.onOpenMemory}>
        <span className="nav-ico"><IconMemory /></span><span className="nav-label">{t('memoryManageNav')}</span>
      </button>
    </nav>
  );
}
