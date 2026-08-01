/**
 * Present GitHub connector status/errors for desktop Settings.
 * Maps host English notes and HTTP failures; never invents a live connection.
 */

import type { GithubStatus } from './github.ts';
import { sanitizeText } from './chatFormat.ts';
import { t } from './i18n.ts';

export function isGithubAuthRevoked(raw: string | null | undefined): boolean {
  const s = sanitizeText(raw || '');
  return /HTTP\s*40[13]|401|403|revoked|expired|no longer accepted|authorization is no longer/i.test(
    s,
  );
}

/** Localize known host `note` / `error` strings; pass through unknown short text. */
export function githubHostMessage(raw: string | null | undefined): string {
  const s = sanitizeText(raw || '');
  if (!s) return '';

  if (/connection verified/i.test(s)) return t('githubVerifiedNote');
  if (/connected with browser authorization/i.test(s)) return t('githubConnectedOauthNote');
  if (/connected with a user-provided token/i.test(s)) return t('githubConnectedTokenNote');
  if (/authorization is stored in macOS Keychain/i.test(s)) return t('githubStoredNote');
  if (/No GitHub authorization configured/i.test(s)) return t('githubNotConnectedNote');
  if (/no longer accepted by GitHub|revoked or expired/i.test(s)) return t('githubRevokedNote');
  if (/could not be verified|Replace or disconnect/i.test(s)) return t('githubUnverifiedNote');
  if (/Enter a GitHub fine-grained/i.test(s)) return t('githubTokenRequired');
  if (/Choose a local Git repository|no origin remote/i.test(s)) return t('githubProjectRequired');
  if (/authorization could not start|could not be completed/i.test(s)) return t('githubOauthFailed');
  if (/authorization request has expired/i.test(s)) return t('githubOauthExpired');
  if (isGithubAuthRevoked(s)) return t('githubRevokedHint');

  // Prefer short human HTTP line when present.
  const http = s.match(/GitHub HTTP\s*(\d{3})[^\n]*/i)?.[0];
  if (http && http.length <= 160) {
    if (isGithubAuthRevoked(http)) return t('githubRevokedHint');
    return http;
  }

  return s.length <= 280 ? s : s.slice(0, 277) + '…';
}

export function formatGithubVerifiedAt(iso: string | null | undefined): string {
  if (!iso) return t('githubLastVerifiedNever');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('githubLastVerifiedNever');
  return d.toLocaleString();
}

/**
 * One-line result after connect / test / status refresh.
 * isError is true when the host reports failure or configured-but-not-connected with error.
 */
export function githubStatusFeedback(status: GithubStatus): { text: string; isError: boolean } {
  if (status.connected && status.login) {
    const when = status.lastVerifiedAt
      ? formatGithubVerifiedAt(status.lastVerifiedAt)
      : '';
    const base = t('githubVerifiedOk').replace('{login}', status.login);
    return {
      text: when ? `${base} · ${when}` : base,
      isError: false,
    };
  }

  if (status.error) {
    const body = githubHostMessage(status.error);
    const hint = isGithubAuthRevoked(status.error)
      ? t('githubRevokedHint')
      : githubHostMessage(status.note) || t('githubVerifyFailed');
    // Avoid duplicating the same sentence twice.
    const text =
      body && hint && body !== hint
        ? `${body}\n${hint}`
        : body || hint || t('githubVerifyFailed');
    return { text, isError: true };
  }

  if (status.configured && !status.connected) {
    return {
      text: githubHostMessage(status.note) || t('githubConfigured'),
      isError: false,
    };
  }

  return {
    text: githubHostMessage(status.note) || t('githubNotConnected'),
    isError: false,
  };
}

export function githubActionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return githubHostMessage(raw) || t('settingsActionFailed');
}
