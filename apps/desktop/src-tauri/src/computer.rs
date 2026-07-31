//! Explicit, foreground-only macOS Computer actions.
//!
//! Grok Build 0.2.116 does not expose a local mouse/keyboard ACP tool. This
//! module therefore remains a user-facing desktop control surface: every
//! action is requested by the UI, requires an enabled session, and is sent to
//! the current foreground application through macOS System Events. The App
//! never runs arbitrary AppleScript supplied by a task or the model.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::State;

#[derive(Default)]
pub struct ComputerControlState {
    enabled: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerAccessibilityStatus {
    pub granted: bool,
    pub enabled: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerActionResult {
    pub action: String,
    pub foreground_app: String,
    pub detail: String,
}

impl ComputerControlState {
    fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Release);
    }
}

#[tauri::command]
pub async fn computer_accessibility_status(
    state: State<'_, Arc<ComputerControlState>>,
) -> Result<ComputerAccessibilityStatus, String> {
    let granted = tauri::async_runtime::spawn_blocking(check_accessibility)
        .await
        .map_err(|error| format!("accessibility status task: {error}"))?;
    Ok(ComputerAccessibilityStatus {
        granted,
        enabled: state.enabled(),
        detail: if granted {
            "macOS Accessibility permission is available.".into()
        } else {
            "Allow gorkX in System Settings → Privacy & Security → Accessibility.".into()
        },
    })
}

#[tauri::command]
pub fn computer_open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .status()
            .map_err(|error| format!("open Accessibility settings: {error}"))?
            .success()
            .then_some(())
            .ok_or_else(|| "macOS could not open Accessibility settings.".into())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Local Computer controls are available on macOS only.".into())
    }
}

#[tauri::command]
pub async fn computer_control_set_enabled(
    state: State<'_, Arc<ComputerControlState>>,
    enabled: bool,
) -> Result<ComputerAccessibilityStatus, String> {
    if enabled {
        let granted = tauri::async_runtime::spawn_blocking(check_accessibility)
            .await
            .map_err(|error| format!("accessibility status task: {error}"))?;
        if !granted {
            return Err(
                "macOS Accessibility permission is required before local Computer controls can be enabled."
                    .into(),
            );
        }
    }
    state.set_enabled(enabled);
    Ok(ComputerAccessibilityStatus {
        granted: enabled || check_accessibility(),
        enabled,
        detail: if enabled {
            "Foreground Computer controls are enabled. Use the emergency stop button to disable them.".into()
        } else {
            "Foreground Computer controls are disabled.".into()
        },
    })
}

#[tauri::command]
pub fn computer_control_emergency_stop(
    state: State<'_, Arc<ComputerControlState>>,
) -> ComputerAccessibilityStatus {
    state.set_enabled(false);
    ComputerAccessibilityStatus {
        granted: check_accessibility(),
        enabled: false,
        detail: "Emergency stop applied. No further local Computer action will run until re-enabled.".into(),
    }
}

#[tauri::command]
pub async fn computer_press_key(
    state: State<'_, Arc<ComputerControlState>>,
    key: String,
) -> Result<ComputerActionResult, String> {
    let key = key.trim().to_ascii_lowercase();
    let code = key_code(&key).ok_or_else(|| format!("Unsupported key: {key}"))?;
    run_action(
        state.inner().clone(),
        "press-key".into(),
        format!(
            "tell application \"System Events\"\n    key code {code}\n    tell first application process whose frontmost is true to return name\nend tell"
        ),
    )
    .await
}

#[tauri::command]
pub async fn computer_type_text(
    state: State<'_, Arc<ComputerControlState>>,
    text: String,
) -> Result<ComputerActionResult, String> {
    validate_text(&text)?;
    let value = apple_script_string(&text);
    run_action(
        state.inner().clone(),
        "type-text".into(),
        format!(
            "tell application \"System Events\"\n    keystroke {value}\n    tell first application process whose frontmost is true to return name\nend tell"
        ),
    )
    .await
}

#[tauri::command]
pub async fn computer_click(
    state: State<'_, Arc<ComputerControlState>>,
    x: i32,
    y: i32,
) -> Result<ComputerActionResult, String> {
    validate_coordinates(x, y)?;
    run_action(
        state.inner().clone(),
        "click".into(),
        format!(
            "tell application \"System Events\"\n    click at {{{x}, {y}}}\n    tell first application process whose frontmost is true to return name\nend tell"
        ),
    )
    .await
}

async fn run_action(
    state: Arc<ComputerControlState>,
    action: String,
    script: String,
) -> Result<ComputerActionResult, String> {
    if !state.enabled() {
        return Err("Local Computer controls are disabled. Enable them explicitly first.".into());
    }
    tauri::async_runtime::spawn_blocking(move || run_osascript(&state, &action, &script))
        .await
        .map_err(|error| format!("Computer action task: {error}"))?
}

fn run_osascript(
    state: &ComputerControlState,
    action: &str,
    script: &str,
) -> Result<ComputerActionResult, String> {
    if !state.enabled() {
        return Err("Local Computer controls were stopped before the action started.".into());
    }
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/bin/osascript")
            .args(["-e", script])
            .output()
            .map_err(|error| format!("start macOS Computer action: {error}"))?;
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if error.contains("-10827") || error.to_ascii_lowercase().contains("not allowed") {
                return Err(
                    "macOS denied Accessibility control. Allow gorkX in System Settings → Privacy & Security → Accessibility.".into(),
                );
            }
            return Err(if error.is_empty() {
                "macOS rejected the Computer action.".into()
            } else {
                format!("macOS rejected the Computer action: {error}")
            });
        }
        let foreground_app = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(ComputerActionResult {
            action: action.into(),
            foreground_app: if foreground_app.is_empty() {
                "当前前台应用".into()
            } else {
                foreground_app
            },
            detail: "Action completed in the foreground application.".into(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, action, script);
        Err("Local Computer controls are available on macOS only.".into())
    }
}

fn check_accessibility() -> bool {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/bin/osascript")
            .args([
                "-e",
                "tell application \"System Events\" to get UI elements enabled",
            ])
            .output();
        return output
            .map(|result| {
                result.status.success()
                    && String::from_utf8_lossy(&result.stdout)
                        .trim()
                        .eq_ignore_ascii_case("true")
            })
            .unwrap_or(false);
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

fn key_code(key: &str) -> Option<u16> {
    Some(match key {
        "escape" | "esc" => 53,
        "return" | "enter" => 36,
        "tab" => 48,
        "space" => 49,
        "backspace" => 51,
        "delete" => 117,
        "left" => 123,
        "right" => 124,
        "down" => 125,
        "up" => 126,
        "home" => 115,
        "end" => 119,
        "pageup" => 116,
        "pagedown" => 121,
        "f1" => 122,
        "f2" => 120,
        "f3" => 99,
        "f4" => 118,
        "f5" => 96,
        "f6" => 97,
        "f7" => 98,
        "f8" => 100,
        "f9" => 101,
        "f10" => 109,
        "f11" => 103,
        "f12" => 111,
        _ => return None,
    })
}

fn validate_text(text: &str) -> Result<(), String> {
    let length = text.chars().count();
    if text.is_empty() {
        return Err("Text input cannot be empty.".into());
    }
    if length > 2_000 {
        return Err("Text input is limited to 2,000 characters per action.".into());
    }
    if text.chars().any(|character| character == '\0' || (character.is_control() && character != '\n' && character != '\t')) {
        return Err("Text input contains unsupported control characters.".into());
    }
    Ok(())
}

fn validate_coordinates(x: i32, y: i32) -> Result<(), String> {
    if !(0..=20_000).contains(&x) || !(0..=20_000).contains(&y) {
        return Err("Click coordinates must be between 0 and 20,000.".into());
    }
    Ok(())
}

fn apple_script_string(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::{apple_script_string, key_code, validate_coordinates, validate_text};

    #[test]
    fn key_map_is_fixed_and_bounded() {
        assert_eq!(key_code("enter"), Some(36));
        assert_eq!(key_code("left"), Some(123));
        assert_eq!(key_code("cmd"), None);
    }

    #[test]
    fn text_is_bounded_and_escaped() {
        assert!(validate_text("hello\nworld").is_ok());
        assert!(validate_text("bad\u{0}").is_err());
        assert!(validate_text(&"x".repeat(2_001)).is_err());
        assert_eq!(apple_script_string("a\\\"b"), "\"a\\\\\\\"b\"");
    }

    #[test]
    fn coordinates_are_bounded() {
        assert!(validate_coordinates(0, 0).is_ok());
        assert!(validate_coordinates(20_001, 0).is_err());
        assert!(validate_coordinates(-1, 2).is_err());
    }
}
