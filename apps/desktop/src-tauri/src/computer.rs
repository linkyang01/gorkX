//! Explicit, foreground-only macOS Computer actions.
//!
//! Grok Build 0.2.116 does not expose a native local mouse/keyboard ACP tool.
//! This module therefore owns the user-facing control surface and the
//! optional app-owned MCP bridge: every action requires an enabled session and
//! is sent to the current foreground application through macOS System Events.
//! The App never runs arbitrary AppleScript supplied by a task or the model.

use base64::Engine as _;
use crate::paths;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
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

    fn set_enabled(&self, enabled: bool) -> Result<(), String> {
        // Write the cross-process lease first. If the filesystem write fails,
        // keeping the atomic flag unchanged makes the in-process UI fail
        // closed as well as the MCP child.
        set_control_lease(enabled)?;
        self.enabled.store(enabled, Ordering::Release);
        Ok(())
    }
}

impl Drop for ComputerControlState {
    fn drop(&mut self) {
        let _ = set_control_lease(false);
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
        enabled: state.enabled() && control_lease_active(),
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

/// Register the app-owned Computer MCP server in the app-owned Grok home.
/// This only writes a fixed `grok mcp add` entry; it never launches the MCP
/// process or enables local control by itself.
#[tauri::command]
pub async fn computer_mcp_install() -> Result<String, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("resolve gorkX executable: {error}"))?
        .canonicalize()
        .map_err(|error| format!("resolve gorkX executable: {error}"))?;
    if !executable.is_file() {
        return Err("The gorkX executable is not available for MCP registration.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bin = paths::resolve_grok_bin(None);
        let args = [
            "mcp".to_string(),
            "add".to_string(),
            "--scope".to_string(),
            "user".to_string(),
            "gorkx-computer".to_string(),
            "--".to_string(),
            executable.display().to_string(),
            "--computer-mcp".to_string(),
        ];
        let mut command = std::process::Command::new(&bin);
        command.args(&args);
        paths::apply_engine_env(&mut command);
        let output = command
            .output()
            .map_err(|error| format!("register gorkX Computer MCP: {error}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !output.status.success() {
            return Err(if stderr.is_empty() { stdout } else { stderr });
        }
        Ok(if stdout.is_empty() {
            "gorkx-computer MCP registered in the app-owned Grok home.".into()
        } else {
            stdout
        })
    })
    .await
    .map_err(|error| format!("Computer MCP registration task: {error}"))?
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
    state.set_enabled(enabled)?;
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
    let _ = state.set_enabled(false);
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
    if !state.enabled() || !control_lease_active() {
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
    if !state.enabled() || !control_lease_active() {
        return Err("Local Computer controls were stopped before the action started.".into());
    }
    execute_osascript(action, script)
}

pub(crate) fn execute_osascript(
    action: &str,
    script: &str,
) -> Result<ComputerActionResult, String> {
    #[cfg(target_os = "macos")]
    {
        if !control_lease_active() {
            return Err("Local Computer controls are disabled or the gorkX session is no longer running.".into());
        }
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
        let _ = (action, script);
        Err("Local Computer controls are available on macOS only.".into())
    }
}

pub(crate) fn capture_full_screen() -> Result<(String, Vec<u8>), String> {
    if !control_lease_active() {
        return Err("Local Computer controls are disabled or the gorkX session is no longer running.".into());
    }
    #[cfg(target_os = "macos")]
    {
        let dir = paths::app_support_dir().join("computer-captures");
        fs::create_dir_all(&dir).map_err(|error| format!("create Computer capture directory: {error}"))?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| format!("clock: {error}"))?
            .as_millis();
        let path = dir.join(format!("computer-{stamp}-{}.png", std::process::id()));
        let output = std::process::Command::new("/usr/sbin/screencapture")
            .args(["-x", "-t", "png"])
            .arg(&path)
            .output()
            .map_err(|error| format!("start macOS screen capture: {error}"))?;
        if !output.status.success() {
            return Err(if output.stderr.is_empty() {
                "macOS rejected the Computer screenshot.".into()
            } else {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            });
        }
        let bytes = fs::read(&path).map_err(|error| format!("read Computer screenshot: {error}"))?;
        let _ = fs::remove_file(&path);
        if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
            return Err("macOS returned an invalid or oversized Computer screenshot.".into());
        }
        return Ok(("image/png".into(), bytes));
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Local Computer controls are available on macOS only.".into())
    }
}

fn control_lease_path() -> std::path::PathBuf {
    let base = if std::env::args().any(|arg| arg == "--computer-mcp") {
        std::env::var_os("GORKX_COMPUTER_LEASE_DIR")
            .map(std::path::PathBuf::from)
            .filter(|path| path.is_absolute())
            .unwrap_or_else(|| paths::app_support_dir().join("computer-control"))
    } else {
        paths::app_support_dir().join("computer-control")
    };
    base.join("session")
}

fn set_control_lease(enabled: bool) -> Result<(), String> {
    let path = control_lease_path();
    if !enabled {
        match fs::remove_file(&path) {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(format!("disable Computer control lease: {error}")),
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("create Computer control state: {error}"))?;
    }
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&path)
        .map_err(|error| format!("write Computer control lease: {error}"))?;
    writeln!(file, "pid={}", std::process::id())
        .map_err(|error| format!("write Computer control lease: {error}"))?;
    Ok(())
}

pub(crate) fn emergency_stop_lease() -> Result<(), String> {
    set_control_lease(false)
}

pub(crate) fn control_lease_active() -> bool {
    let Ok(raw) = fs::read_to_string(control_lease_path()) else {
        return false;
    };
    let Some(pid) = raw
        .lines()
        .find_map(|line| line.strip_prefix("pid=")?.trim().parse::<u32>().ok())
    else {
        return false;
    };
    if pid == 0 {
        return false;
    }
    std::process::Command::new("/bin/kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub(crate) fn screenshot_as_base64() -> Result<(String, String), String> {
    let (mime_type, bytes) = capture_full_screen()?;
    Ok((mime_type, base64::engine::general_purpose::STANDARD.encode(bytes)))
}

pub(crate) fn check_accessibility() -> bool {
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

pub(crate) fn key_code(key: &str) -> Option<u16> {
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

pub(crate) fn validate_text(text: &str) -> Result<(), String> {
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

pub(crate) fn validate_coordinates(x: i32, y: i32) -> Result<(), String> {
    if !(0..=20_000).contains(&x) || !(0..=20_000).contains(&y) {
        return Err("Click coordinates must be between 0 and 20,000.".into());
    }
    Ok(())
}

pub(crate) fn apple_script_string(value: &str) -> String {
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
