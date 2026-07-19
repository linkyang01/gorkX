import { invoke } from '@tauri-apps/api/core';

export interface CustomModelRow {
  id: string;
  model: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  hasKeychainSecret?: boolean;
  hasPlaintextSecret?: boolean;
  apiBackend: string;
  providerLabel: string;
  contextWindow?: number | null;
}

export interface ModelsConfigSnapshot {
  grokHome: string;
  configPath: string;
  customModels: CustomModelRow[];
  defaultModel?: string | null;
  note: string;
}

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

export async function listCustomModels(): Promise<ModelsConfigSnapshot | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<ModelsConfigSnapshot>('models_list_custom');
  } catch {
    return null;
  }
}

export async function upsertCustomModel(model: CustomModelRow): Promise<ModelsConfigSnapshot> {
  return invoke<ModelsConfigSnapshot>('models_upsert_custom', { model });
}

export async function removeCustomModel(id: string): Promise<ModelsConfigSnapshot> {
  return invoke<ModelsConfigSnapshot>('models_remove_custom', { id });
}

export async function setDefaultModel(modelId: string): Promise<ModelsConfigSnapshot> {
  return invoke<ModelsConfigSnapshot>('models_set_default', { modelId });
}

export async function openModelsConfig(): Promise<string> {
  return invoke<string>('models_open_config');
}

export async function migratePlaintextModelKeys(): Promise<ModelsConfigSnapshot> {
  return invoke<ModelsConfigSnapshot>('models_migrate_plaintext_keys');
}

export interface ModelTestResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  note: string;
}

/** Probe endpoint with a tiny request (does not save config). */
export async function testCustomModel(model: CustomModelRow): Promise<ModelTestResult> {
  return invoke<ModelTestResult>('models_test_connection', { model });
}
