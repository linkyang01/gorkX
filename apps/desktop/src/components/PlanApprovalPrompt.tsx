import { useEffect, useState } from 'react';
import type { PlanApprovalRequest } from '../lib/acpClient';
import { t } from '../lib/i18n';
import { MarkdownView } from './MarkdownView';

interface Props {
  request: PlanApprovalRequest;
  onAnswer: (outcome: 'approved' | 'cancelled' | 'abandoned', feedback?: string) => void;
}

/** Native `exit_plan_mode` gate: user sees the engine's plan before execution can begin. */
export function PlanApprovalPrompt({ request, onAnswer }: Props) {
  const [feedback, setFeedback] = useState('');

  useEffect(() => setFeedback(''), [request.jsonrpcId]);

  const hasPlan = Boolean(request.planContent?.trim());
  return (
    <div className="modal-backdrop plan-approval-backdrop" role="presentation">
      <section className="modal plan-approval-modal" role="dialog" aria-modal="true" aria-labelledby="plan-approval-title">
        <header className="plan-approval-head">
          <div>
            <p className="plan-approval-eyebrow">{t('planApprovalEyebrow')}</p>
            <h2 id="plan-approval-title">{t('planApprovalTitle')}</h2>
          </div>
          <span className="plan-approval-badge">{t('modePlan')}</span>
        </header>
        <p className="plan-approval-explain">{t('planApprovalExplain')}</p>
        <div className="plan-approval-content">
          {hasPlan ? (
            <MarkdownView text={request.planContent ?? ''} className="plan-approval-markdown" />
          ) : (
            <div className="plan-approval-empty">{t('planApprovalEmpty')}</div>
          )}
        </div>
        <label className="plan-approval-feedback">
          <span>{t('planApprovalFeedback')}</span>
          <textarea
            value={feedback}
            maxLength={4000}
            placeholder={t('planApprovalFeedbackPlaceholder')}
            onChange={(event) => setFeedback(event.target.value)}
          />
        </label>
        <footer className="plan-approval-actions">
          <button type="button" className="btn" onClick={() => onAnswer('abandoned')}>{t('planApprovalAbandon')}</button>
          <button type="button" className="btn" onClick={() => onAnswer('cancelled', feedback)}>{t('planApprovalRevise')}</button>
          <button type="button" className="btn primary" onClick={() => onAnswer('approved')}>{t('planApprovalApprove')}</button>
        </footer>
      </section>
    </div>
  );
}
