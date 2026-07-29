import { invoke } from '@tauri-apps/api/core';
export interface MediaToolsConfigSnapshot { grokHome: string; imageGenEnabled?: boolean | null; videoGenEnabled?: boolean | null; imageEditModelOverride?: string | null; note: string }
export const fetchMediaToolsConfig = () => invoke<MediaToolsConfigSnapshot>('media_tools_config_get');
export const setMediaToolEnabled = (kind: 'image' | 'video', enabled: boolean) => invoke<MediaToolsConfigSnapshot>('media_tools_config_set', { kind, enabled });
/** Empty value restores the Grok Build default image-edit model. */
export const setImageEditModelOverride = (modelId: string) => invoke<MediaToolsConfigSnapshot>('media_tools_image_edit_model_set', { modelId });
