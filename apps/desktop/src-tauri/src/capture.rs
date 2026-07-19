//! User-initiated desktop capture. The system picker and macOS Screen Recording
//! permission remain in control; gorkX never captures in the background.

use crate::paths;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub async fn capture_screen_region() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(capture_screen_region_sync)
        .await
        .map_err(|e| format!("screen capture task: {e}"))?
}

#[cfg(target_os = "macos")]
fn capture_screen_region_sync() -> Result<String, String> {
    let dir = paths::app_support_dir().join("captures");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create captures directory: {e}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("clock: {e}"))?
        .as_millis();
    let path = dir.join(format!("screen-{stamp}.png"));

    // -i opens Apple's selection UI; -x avoids a shutter sound. This waits until
    // the user selects an area or cancels, without capturing anything implicitly.
    let status = Command::new("/usr/sbin/screencapture")
        .args(["-i", "-x"])
        .arg(&path)
        .status()
        .map_err(|e| format!("start macOS screen capture: {e}"))?;

    let valid = status.success()
        && std::fs::metadata(&path)
            .map(|meta| meta.len() > 0)
            .unwrap_or(false);
    if !valid {
        let _ = std::fs::remove_file(&path);
        return Err("Screen capture was cancelled or macOS did not grant permission.".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(not(target_os = "macos"))]
fn capture_screen_region_sync() -> Result<String, String> {
    Err("Interactive screen capture is currently available on macOS only.".into())
}
