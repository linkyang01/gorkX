import { invoke } from '@tauri-apps/api/core';

export interface CustomModelRow {
  id: string;
  model: string;
  name: string;
  baseUrl: string;
  apiKey: string;
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
