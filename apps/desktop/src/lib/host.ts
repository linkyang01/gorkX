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

export interface ComputerAccessibilityStatus {
  granted: boolean;
  enabled: boolean;
  detail: string;
}

export interface ComputerActionResult {
  action: string;
  foregroundApp: string;
  detail: string;
}

export async function computerAccessibilityStatus(): Promise<ComputerAccessibilityStatus> {
  return invoke<ComputerAccessibilityStatus>('computer_accessibility_status');
}

export async function openComputerAccessibilitySettings(): Promise<void> {
  await invoke('computer_open_accessibility_settings');
}

export async function setComputerControlEnabled(enabled: boolean): Promise<ComputerAccessibilityStatus> {
  return invoke<ComputerAccessibilityStatus>('computer_control_set_enabled', { enabled });
}

export async function emergencyStopComputerControl(): Promise<ComputerAccessibilityStatus> {
  return invoke<ComputerAccessibilityStatus>('computer_control_emergency_stop');
}

export async function computerPressKey(key: string): Promise<ComputerActionResult> {
  return invoke<ComputerActionResult>('computer_press_key', { key });
}

export async function computerTypeText(text: string): Promise<ComputerActionResult> {
  return invoke<ComputerActionResult>('computer_type_text', { text });
}

export async function computerClick(x: number, y: number): Promise<ComputerActionResult> {
  return invoke<ComputerActionResult>('computer_click', { x, y });
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
