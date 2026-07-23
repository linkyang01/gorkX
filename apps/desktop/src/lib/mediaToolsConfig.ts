import { invoke } from '@tauri-apps/api/core';
export interface MediaToolsConfigSnapshot { grokHome: string; imageGenEnabled?: boolean | null; videoGenEnabled?: boolean | null; note: string }
export const fetchMediaToolsConfig = () => invoke<MediaToolsConfigSnapshot>('media_tools_config_get');
export const setMediaToolEnabled = (kind: 'image' | 'video', enabled: boolean) => invoke<MediaToolsConfigSnapshot>('media_tools_config_set', { kind, enabled });
