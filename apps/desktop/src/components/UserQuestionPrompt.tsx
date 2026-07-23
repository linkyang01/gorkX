import { useEffect, useMemo, useState } from 'react';
import type {
  UserQuestionAnnotations,
  UserQuestionAnswers,
  UserQuestionRequest,
} from '../lib/acpClient';
import { t } from '../lib/i18n';

interface Props {
  request: UserQuestionRequest;
  /** Current-task interviews can live in the transcript; background ones stay modal. */
  presentation?: 'modal' | 'inline';
  onAccept: (answers: UserQuestionAnswers, annotations: UserQuestionAnnotations) => void;
  onPlanAction: (action: 'chat_about_this' | 'skip_interview', partialAnswers: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * Native Grok Build interview UI. It intentionally stays outside Markdown:
 * every click produces the ACP tool response, never an ambiguous chat message.
 */
export function UserQuestionPrompt({ request, presentation = 'modal', onAccept, onPlanAction, onCancel }: Props) {
  const [selected, setSelected] = useState<UserQuestionAnswers>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelected({});
    setNotes({});
  }, [request.jsonrpcId]);

  const answeredCount = useMemo(
    () => request.questions.filter((question) => (selected[question.question] ?? []).length || notes[question.question]?.trim()).length,
    [notes, request.questions, selected],
  );

  const toggle = (question: UserQuestionRequest['questions'][number], label: string) => {
    setSelected((previous) => {
      const current = previous[question.question] ?? [];
      const next = question.multiSelect
        ? current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
        : current.includes(label) ? [] : [label];
      return { ...previous, [question.question]: next };
    });
  };

  const accept = () => {
    const answers: UserQuestionAnswers = {};
    const annotations: UserQuestionAnnotations = {};
    for (const question of request.questions) {
      const labels = selected[question.question] ?? [];
      const note = notes[question.question]?.trim();
      if (labels.length) {
        answers[question.question] = labels;
        const preview = !question.multiSelect && labels.length === 1
          ? question.options.find((option) => option.label === labels[0])?.preview
          : undefined;
        if (preview || note) annotations[question.question] = { preview, notes: note || undefined };
      } else if (note) {
        // Exact kernel convention for its built-in Other field.
        answers[question.question] = ['Other'];
        annotations[question.question] = { notes: note };
      }
    }
    onAccept(answers, annotations);
  };

  const partialAnswers = () => Object.fromEntries(
    Object.entries(selected).flatMap(([question, labels]) => labels[0] ? [[question, labels[0]]] : []),
  );

  const content = (
    <section
      className="modal user-question-modal"
      role={presentation === 'modal' ? 'dialog' : 'region'}
      aria-modal={presentation === 'modal' ? true : undefined}
      aria-labelledby="user-question-title"
    >
        <header className="user-question-head">
          <div>
            <p className="user-question-eyebrow">{request.mode === 'plan' ? t('userQuestionPlanEyebrow') : t('userQuestionEyebrow')}</p>
            <h2 id="user-question-title">{t('userQuestionTitle')}</h2>
          </div>
          <span className="user-question-count">{t('userQuestionProgress').replace('{answered}', String(answeredCount)).replace('{total}', String(request.questions.length))}</span>
        </header>
        <p className="user-question-explain">{t('userQuestionExplain')}</p>

        <div className="user-question-list">
          {request.questions.map((question, questionIndex) => {
            const selectedLabels = selected[question.question] ?? [];
            return (
              <article className="user-question-card" key={`${question.id ?? question.question}-${questionIndex}`}>
                <div className="user-question-card-head">
                  <span>{questionIndex + 1}</span>
                  <div>
                    <h3>{question.question}</h3>
                    <p>{question.multiSelect ? t('userQuestionMultiHint') : t('userQuestionSingleHint')}</p>
                  </div>
                </div>
                <div className="user-question-options" role={question.multiSelect ? 'group' : 'radiogroup'}>
                  {question.options.map((option) => {
                    const isSelected = selectedLabels.includes(option.label);
                    return (
                      <button
                        key={option.id ?? option.label}
                        type="button"
                        className={`user-question-option${isSelected ? ' selected' : ''}`}
                        aria-pressed={isSelected}
                        onClick={() => toggle(question, option.label)}
                      >
                        <span className="user-question-mark" aria-hidden>{isSelected ? '✓' : ''}</span>
                        <span className="user-question-option-copy">
                          <strong>{option.label}</strong>
                          {option.description ? <small>{option.description}</small> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label className="user-question-other">
                  <span>{t('userQuestionOther')}</span>
                  <input
                    value={notes[question.question] ?? ''}
                    maxLength={1000}
                    placeholder={t('userQuestionOtherPlaceholder')}
                    onChange={(event) => setNotes((previous) => ({ ...previous, [question.question]: event.target.value }))}
                  />
                </label>
              </article>
            );
          })}
        </div>

        <footer className="user-question-actions">
          <button type="button" className="btn" onClick={onCancel}>{t('userQuestionCancel')}</button>
          {request.mode === 'plan' ? (
            <>
              <button type="button" className="btn" onClick={() => onPlanAction('chat_about_this', partialAnswers())}>{t('userQuestionChat')}</button>
              <button type="button" className="btn" onClick={() => onPlanAction('skip_interview', partialAnswers())}>{t('userQuestionSkip')}</button>
            </>
          ) : null}
          <button type="button" className="btn primary" onClick={accept}>{t('userQuestionSubmit')}</button>
        </footer>
    </section>
  );

  if (presentation === 'inline') {
    return <div className="user-question-inline">{content}</div>;
  }
  return <div className="modal-backdrop user-question-backdrop" role="presentation">{content}</div>;
}
