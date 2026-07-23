import { t } from '../lib/i18n';

export type ResponseChoice = {
  label: string;
  value: string;
};

export type ResponseChoicesBlock = {
  text: string;
  choices: ResponseChoice[];
};

/**
 * Opt-in response controls. The engine must deliberately emit a fenced
 * `choices` / `options` block; ordinary numbered lists stay as ordinary
 * Markdown so gorkX never turns an explanatory list into an accidental send.
 *
 * ```choices
 * - 方案 A：保守上线
 * - 方案 B：先做试点
 * ```
 */
export function extractResponseChoices(text: string): ResponseChoicesBlock {
  let choices: ResponseChoice[] = [];
  const clean = text.replace(/```(?:choices|options|gorkx-choices)\s*\n([\s\S]*?)```/gi, (_match, body: string) => {
    if (choices.length) return _match;
    const parsed = parseChoices(body);
    if (!parsed.length) return _match;
    choices = parsed;
    return '';
  });
  return { text: clean.trim(), choices };
}

function parseChoices(raw: string): ResponseChoice[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const json = JSON.parse(trimmed) as unknown;
    if (Array.isArray(json)) {
      const values = json.flatMap((item) => {
        if (typeof item === 'string') return [{ label: item, value: item }];
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string, unknown>;
        const label = typeof row.label === 'string' ? row.label : '';
        const value = typeof row.value === 'string' ? row.value : label;
        return label ? [{ label, value }] : [];
      });
      return normalizeChoices(values);
    }
  } catch {
    // A human-readable list is the primary syntax, JSON is just convenient
    // for an engine that already has structured choices.
  }
  const values = trimmed.split('\n').flatMap((line) => {
    const match = /^\s*(?:[-*]|\d+[.)])\s+(.+?)\s*$/.exec(line);
    const label = match?.[1]?.trim() || '';
    return label ? [{ label, value: label }] : [];
  });
  return normalizeChoices(values);
}

function normalizeChoices(items: ResponseChoice[]): ResponseChoice[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const label = item.label.replace(/\s+/g, ' ').trim().slice(0, 160);
    const value = item.value.trim().slice(0, 500);
    if (!label || !value || seen.has(value)) return [];
    seen.add(value);
    return [{ label, value }];
  }).slice(0, 8);
}

export function ResponseChoices({
  choices,
  onSelect,
  disabled = false,
}: {
  choices: ResponseChoice[];
  onSelect?: (value: string) => void;
  disabled?: boolean;
}) {
  if (!choices.length) return null;
  return (
    <section className="response-choices" aria-label={t('responseChoicesTitle')}>
      <div className="response-choices-head">
        <strong>{t('responseChoicesTitle')}</strong>
        <span>{t('responseChoicesHint')}</span>
      </div>
      <div className="response-choices-list">
        {choices.map((choice, index) => (
          <button
            key={choice.value}
            type="button"
            className="response-choice"
            title={choice.label}
            disabled={disabled}
            onClick={() => onSelect?.(choice.value)}
          >
            <span className="response-choice-index" aria-hidden>{index + 1}</span>
            <span>{choice.label}</span>
            <span className="response-choice-arrow" aria-hidden>→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
