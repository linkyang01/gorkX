import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export async function revealInFinder(path: string): Promise<void> {
  await invoke('reveal_in_finder', { path });
}

/** Opens the macOS selection UI and returns a user-selected PNG stored by gorkX. */
export async function captureScreenRegion(): Promise<string> {
  return invoke<string>('capture_screen_region');
}

export async function notifyPermission(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // optional — ignore if plugin unavailable in browser preview
  }
}
