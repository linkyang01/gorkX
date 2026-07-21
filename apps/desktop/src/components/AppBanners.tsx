import type { GrokStatus } from '../lib/acpClient';
import type { AppUpdateInfo } from '../lib/updates';
import { t } from '../lib/i18n';

interface Props {
  status: GrokStatus | null;
  update: AppUpdateInfo | null;
  onOpenSettings: () => void;
  onRefreshEngine: () => void;
  onInstallUpdate: () => void;
  onDismissUpdate: () => void;
}

/** Global banners only; all state changes remain owned by App. */
export function AppBanners({
  status,
  update,
  onOpenSettings,
  onRefreshEngine,
  onInstallUpdate,
  onDismissUpdate,
}: Props) {
  return (
    <>
      {status && !status.installed ? (
        <div className="banner warn">
          {t('statusMissing') + ' — ' + (status.detail || '')}
          <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
            {t('settings')}
          </button>
          <button type="button" className="btn btn-sm" onClick={onRefreshEngine}>
            {t('kernelRefresh')}
          </button>
        </div>
      ) : null}

      {update?.updateAvailable ? (
        <div className="banner info">
          {t('updateBannerBody')
            .replace('{latest}', update.latestVersion)
            .replace('{cur}', update.currentVersion)}
          <button type="button" className="btn btn-sm primary" onClick={onInstallUpdate}>
            {t('updateBannerAction')}
          </button>
          <button type="button" className="btn btn-sm" onClick={onDismissUpdate}>
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
