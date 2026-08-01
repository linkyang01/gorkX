/**
 * Map Settings-panel host/ACP errors to short desktop copy.
 * Never invent success; only shorten or localize known failure shapes.
 */

import {
  humanizeEngineError,
  isGrokBuildAccessDenied,
  sanitizeText,
} from './chatFormat.ts';
import { t } from './i18n.ts';

/** Localized one-line message for Settings catch blocks. */
export function settingsErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const s = sanitizeText(raw);
  if (!s) return t('settingsActionFailed');

  if (isGrokBuildAccessDenied(s) || humanizeEngineError(s) === 'GROKX_BUILD_ACCESS_DENIED') {
    return t('taskErrorBuildAccessDenied');
  }

  if (
    /open a connected task|settingsHooksNeedTask|先打开.*任务|connected task first|not connected|尚未连接/i.test(
      s,
    )
  ) {
    return t('settingsHooksNeedTask');
  }

  if (/hook_name|invalid params/i.test(s)) {
    return t('settingsHooksWireError');
  }

  // Only map method-not-found when the surface is clearly Hooks-related.
  // Generic ACP "Method not found" (e.g. optional Review extensions) must stay
  // machine-detectable for hide-tab logic, not become a Hooks CTA.
  if (
    /hook/i.test(s)
    && (/method not found|not (?:exposed|available)|unsupported/i.test(s))
  ) {
    return t('settingsHooksUnavailable');
  }

  if (/Accessibility permission|辅助功能/i.test(s)) {
    return t('settingsComputerControlPermissionMissing');
  }

  if (/controls? (?:are )?disabled|not enabled|lease/i.test(s)) {
    return t('settingsComputerControlDisabledError');
  }

  if (/unsupported key/i.test(s)) {
    return t('settingsComputerControlKeyInvalid');
  }

  if (/whole-number|coordinates|invalid.*coord/i.test(s)) {
    return t('settingsComputerControlCoordinatesInvalid');
  }

  // Account / network / browser / models common shapes
  if (/network|offline|ECONNREFUSED|ENOTFOUND|timed?\s*out|timeout|fetch failed|connection reset/i.test(s)) {
    return t('settingsErrorNetwork');
  }
  if (/unauthorized|401|invalid.?token|token.*(invalid|expired)|sign.?in|login required|oauth/i.test(s)
    && /github|account|auth|token|keychain|credential/i.test(s)) {
    return t('settingsErrorAuth');
  }
  if (/keychain|secitem|errSec|钥匙串/i.test(s)) {
    return t('settingsErrorKeychain');
  }
  if (/chrome|playwright|mcp|browser/i.test(s) && /fail|error|not found|denied|refused/i.test(s)) {
    return t('settingsErrorBrowser');
  }
  if (/model|endpoint|openai|anthropic|base.?url|api.?key/i.test(s)
    && /fail|invalid|reject|verify|connect|401|403|404/i.test(s)) {
    return t('settingsErrorModel');
  }
  if (/permission denied|EACCES|operation not permitted/i.test(s)) {
    return t('settingsErrorPermission');
  }
  if (/no such file|ENOENT|not a directory/i.test(s)) {
    return t('settingsErrorNotFound');
  }

  // App / kernel update checks
  if (/rate.?limit|API rate limit|403.*github|secondary rate/i.test(s)) {
    return t('settingsErrorUpdateRateLimit');
  }
  if (/404|not found|no releases?|release.*missing/i.test(s) && /update|release|dmg|github/i.test(s)) {
    return t('settingsErrorUpdateNotFound');
  }
  if (/dmg|download|checksum|signature|gatekeeper|notariz/i.test(s) && /fail|error|invalid|mismatch|reject/i.test(s)) {
    return t('settingsErrorUpdateDownload');
  }
  if (/kernel|grok.?build|update --check/i.test(s) && /fail|error|exit|spawn/i.test(s)) {
    return t('settingsErrorUpdateKernel');
  }

  // Account login
  if (/device.?code|login|sign.?in|oauth|browser/i.test(s) && /cancel|timeout|expired|denied|fail/i.test(s)) {
    return t('settingsErrorLogin');
  }

  const human = humanizeEngineError(s);
  if (
    human
    && human !== 'GROKX_BUILD_ACCESS_DENIED'
    && human !== 'GROKX_AGENT_PROCESS_EXITED'
    && human.length <= 240
  ) {
    return human;
  }

  return s.length <= 240 ? s : t('settingsActionFailed');
}

/** Map known Rust `detail` strings to locale labels; pass through unknown text. */
export function computerStatusDetail(detail: string | null | undefined): string {
  const s = sanitizeText(detail || '');
  if (!s) return '';
  if (/emergency stop applied/i.test(s)) return t('settingsComputerControlStopped');
  if (/controls are enabled/i.test(s)) return t('settingsComputerControlEnabledOk');
  if (/controls are disabled/i.test(s)) return t('settingsComputerControlDisabledOk');
  return s;
}
