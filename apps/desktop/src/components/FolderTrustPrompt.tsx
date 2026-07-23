import type { FolderTrustRequest } from '../lib/acpClient';
import { t } from '../lib/i18n';

interface Props {
  request: FolderTrustRequest;
  onAnswer: (outcome: 'trust' | 'reject') => void;
}

/** Explicit safety gate before Grok Build activates repository-local tooling. */
export function FolderTrustPrompt({ request, onAnswer }: Props) {
  return (
    <div className="modal-backdrop folder-trust-backdrop" role="presentation">
      <section className="modal folder-trust-modal" role="dialog" aria-modal="true" aria-labelledby="folder-trust-title">
        <header className="folder-trust-head">
          <div className="folder-trust-icon" aria-hidden>!</div>
          <div>
            <p className="folder-trust-eyebrow">{t('folderTrustEyebrow')}</p>
            <h2 id="folder-trust-title">{t('folderTrustTitle')}</h2>
          </div>
        </header>
        <p className="folder-trust-explain">{t('folderTrustExplain')}</p>
        <dl className="folder-trust-details">
          <div><dt>{t('folderTrustWorkspace')}</dt><dd>{request.workspace}</dd></div>
          {request.workspace !== request.cwd ? <div><dt>{t('folderTrustFolder')}</dt><dd>{request.cwd}</dd></div> : null}
          <div>
            <dt>{t('folderTrustConfigKinds')}</dt>
            <dd className="folder-trust-kinds">
              {request.configKinds.length ? request.configKinds.map((kind) => <span key={kind}>{kind}</span>) : <span>{t('folderTrustUnknownConfig')}</span>}
            </dd>
          </div>
        </dl>
        <p className="folder-trust-warning">{t('folderTrustWarning')}</p>
        <footer className="folder-trust-actions">
          <button type="button" className="btn" onClick={() => onAnswer('reject')}>{t('folderTrustReject')}</button>
          <button type="button" className="btn primary" onClick={() => onAnswer('trust')}>{t('folderTrustApprove')}</button>
        </footer>
      </section>
    </div>
  );
}
