import type { ModelInfo, ReasoningEffort } from './acpClient';
import { t } from './i18n';

/** Compact local datetime for menu secondary line only. */
export function formatPeriodEnd(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    }
  } catch {
    // Keep the raw server value readable if it is not a valid local date.
  }
  return s.slice(0, 16).replace('T', ' ');
}

export function effortShortLabel(e: ReasoningEffort): string {
  if (e === 'low') return t('effortLow');
  if (e === 'medium') return t('effortMedium');
  return t('effortHigh');
}

export function modelShortLabel(modelId: string, models: ModelInfo[]): string {
  const hit = models.find((m) => m.modelId === modelId);
  const name = (hit?.name || modelId || 'model').trim();
  return name
    .replace(/^Grok\s+/i, '')
    .replace(/^gpt-?/i, '')
    .replace(/^Claude\s+/i, '')
    .slice(0, 22) || name.slice(0, 22);
}
