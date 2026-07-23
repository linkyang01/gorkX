import { MarkdownView } from './MarkdownView';
import { t } from '../lib/i18n';

export interface BtwCardState {
  threadId: string;
  question: string;
  status: 'loading' | 'done' | 'error';
  answer?: string;
  error?: string;
}

interface Props {
  state: BtwCardState;
  onDismiss: () => void;
}

/** Native Grok Build `/btw` response, intentionally separate from chat history. */
export function BtwCard({ state, onDismiss }: Props) {
  return (
    <section className={`btw-card btw-${state.status}`} aria-live="polite" aria-label={t('btwTitle')}>
      <header className="btw-card-head">
        <div>
          <span className="btw-card-label">{t('btwTitle')}</span>
          <span className="btw-card-question">{state.question}</span>
        </div>
        <button type="button" className="btn btn-sm" onClick={onDismiss}>{t('btwDismiss')}</button>
      </header>
      {state.status === 'loading' ? <div className="btw-card-loading">{t('btwLoading')}</div> : null}
      {state.status === 'error' ? <pre className="btw-card-error">{state.error}</pre> : null}
      {state.status === 'done' && state.answer ? <MarkdownView text={state.answer} /> : null}
    </section>
  );
}
