import { useEffect, useState } from 'react';
import type { ModelInfo, PlanApprovalRequest } from '../lib/acpClient';
import { t } from '../lib/i18n';
import { MarkdownView } from './MarkdownView';

interface Props {
  request: PlanApprovalRequest;
  onAnswer: (outcome: 'approved' | 'cancelled' | 'abandoned', feedback?: string) => void;
  /** Grok Build 1.0 permits changing the active model while reviewing a plan. */
  availableModels?: ModelInfo[];
  currentModelId?: string;
  onModelChange?: (modelId: string) => void;
}

/** Native `exit_plan_mode` gate: user sees the engine's plan before execution can begin. */
export function PlanApprovalPrompt({ request, onAnswer, availableModels = [], currentModelId, onModelChange }: Props) {
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFeedback('');
    setCopied(false);
  }, [request.jsonrpcId]);

  const hasPlan = Boolean(request.planContent?.trim());
  const copyPlan = async () => {
    const plan = request.planContent?.trim();
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan);
    } catch {
      const area = document.createElement('textarea');
      area.value = plan;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copiedByFallback = document.execCommand('copy');
      area.remove();
      if (!copiedByFallback) throw new Error(t('copyFailed'));
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
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
        {availableModels.length > 1 && onModelChange ? (
          <div className="plan-model-picker" aria-label={t('planApprovalModelTitle')}>
            <span className="plan-model-picker-label">{t('planApprovalModelTitle')}</span>
            <div className="plan-model-picker-options">
              {availableModels.map((model) => (
                <button
                  key={model.modelId}
                  type="button"
                  className={`plan-model-option${currentModelId === model.modelId ? ' active' : ''}`}
                  title={model.description || model.modelId}
                  onClick={() => onModelChange(model.modelId)}
                >
                  {model.name || model.modelId}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="plan-approval-content">
          {hasPlan ? (
            <MarkdownView text={request.planContent ?? ''} className="plan-approval-markdown" />
          ) : (
            <div className="plan-approval-empty">{t('planApprovalEmpty')}</div>
          )}
        </div>
        {hasPlan ? (
          <div className="plan-approval-copy-row">
            <button type="button" className="btn btn-sm" onClick={() => void copyPlan()}>
              {copied ? t('planApprovalCopied') : t('planApprovalCopy')}
            </button>
          </div>
        ) : null}
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
