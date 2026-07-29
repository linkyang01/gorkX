/** App-owned `$GROK_HOME/rules/gorkx-personal.md` controls. */
import { invoke } from '@tauri-apps/api/core';

export type PersonalRulesSnapshot = {
  content: string;
  path: string;
};

export function getPersonalRules(): Promise<PersonalRulesSnapshot> {
  return invoke<PersonalRulesSnapshot>('personal_rules_get');
}

export function savePersonalRules(content: string): Promise<PersonalRulesSnapshot> {
  return invoke<PersonalRulesSnapshot>('personal_rules_set', { content });
}
