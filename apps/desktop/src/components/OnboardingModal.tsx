/**
 * First-run checklist: engine → login → project.
 * Dismissible; auto-hides when all three steps are done (and remembers).
 */
import type { GrokStatus } from '../lib/acpClient';
import type { AccountSummary } from '../lib/account';
import { t } from '../lib/i18n';
import { IconClose } from './UiIcons';

const STORAGE_KEY = 'gorkx.onboard.v1';

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* */
  }
}

export function clearOnboardingDismiss(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}

interface Props {
  open: boolean;
  status: GrokStatus | null;
  account: AccountSummary | null;
  project: string | null;
  onClose: () => void;
  onOpenSettings: () => void;
  onLogin: () => void;
  onPickProject: () => void;
  onRefresh: () => void;
}

export function OnboardingModal({
  open,
  status,
  account,
  project,
  onClose,
  onOpenSettings,
  onLogin,
  onPickProject,
  onRefresh,
}: Props) {
  if (!open) return null;

  const kernelOk = Boolean(status?.installed);
  const authOk = Boolean(
    status?.authenticated || account?.authenticated || account?.email,
  );
  const projectOk = Boolean(project && project.trim());
  const allOk = kernelOk && authOk && projectOk;

  return (
    <div className="modal-backdrop onboard-backdrop" onClick={onClose}>
      <div
        className="modal onboard-modal"
        role="dialog"
        aria-label={t('onboardTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{t('onboardTitle')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="close">
            <IconClose size={14} />
          </button>
        </div>
        <p className="text-prompt-msg">{t('onboardIntro')}</p>

        <ol className="onboard-steps">
          <li className={kernelOk ? 'onboard-step ok' : 'onboard-step'}>
            <div className="onboard-step-main">
              <strong>{t('onboardStepKernel')}</strong>
              <span className="hint">
                {kernelOk
                  ? `${t('onboardKernelOk')}${status?.version ? ` · ${status.version}` : ''}`
                  : t('onboardKernelNeed')}
              </span>
            </div>
            {!kernelOk ? (
              <div className="onboard-step-actions">
                <button type="button" className="btn btn-sm primary" onClick={onOpenSettings}>
                  {t('settings')}
                </button>
                <button type="button" className="btn btn-sm" onClick={onRefresh}>
                  {t('kernelRefresh')}
                </button>
              </div>
            ) : (
              <span className="onboard-check">✓</span>
            )}
          </li>

          <li className={authOk ? 'onboard-step ok' : 'onboard-step'}>
            <div className="onboard-step-main">
              <strong>{t('onboardStepAuth')}</strong>
              <span className="hint">
                {authOk
                  ? `${t('onboardAuthOk')}${account?.email ? ` · ${account.email}` : ''}`
                  : t('onboardAuthNeed')}
              </span>
            </div>
            {!authOk ? (
              <div className="onboard-step-actions">
                <button
                  type="button"
                  className="btn btn-sm primary"
                  onClick={onLogin}
                  disabled={!kernelOk}
                >
                  {t('subLogin')}
                </button>
              </div>
            ) : (
              <span className="onboard-check">✓</span>
            )}
          </li>

          <li className={projectOk ? 'onboard-step ok' : 'onboard-step'}>
            <div className="onboard-step-main">
              <strong>{t('onboardStepProject')}</strong>
              <span className="hint mono">
                {projectOk ? project : t('onboardPickProject')}
              </span>
            </div>
            {!projectOk ? (
              <div className="onboard-step-actions">
                <button type="button" className="btn btn-sm primary" onClick={onPickProject}>
                  {t('onboardPickProject')}
                </button>
              </div>
            ) : (
              <span className="onboard-check">✓</span>
            )}
          </li>
        </ol>

        <div className="onboard-foot">
          {allOk ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                dismissOnboarding();
                onClose();
              }}
            >
              {t('onboardStart')}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => {
                dismissOnboarding();
                onClose();
              }}
            >
              {t('onboardLater')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
