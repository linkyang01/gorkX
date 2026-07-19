//! Restricted Grok Build CLI bridge for app administration surfaces.
//! Unlike the user Terminal, it never executes a shell string and always uses
//! gorkX's app-owned engine environment.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokAdminResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[tauri::command]
pub async fn grok_admin_exec(
    args: Vec<String>,
    cwd: Option<String>,
    grok_cmd: Option<String>,
) -> Result<GrokAdminResult, String> {
    if args.is_empty() {
        return Err("Grok admin command requires arguments".into());
    }
    if args.iter().any(|arg| arg.is_empty() || arg.contains('\0')) {
        return Err("Invalid Grok admin argument".into());
    }
    if let Some(dir) = cwd.as_deref().filter(|dir| !dir.trim().is_empty()) {
        if !Path::new(dir).is_dir() {
            return Err(format!("Admin working directory does not exist: {dir}"));
        }
    }
    let bin = crate::paths::resolve_grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        let _ = crate::paths::ensure_dirs();
        let mut cmd = Command::new(&bin);
        cmd.args(&args);
        if let Some(dir) = cwd.as_deref().filter(|dir| !dir.trim().is_empty()) {
            cmd.current_dir(dir);
        }
        crate::paths::apply_engine_env(&mut cmd);
        let output = cmd
            .output()
            .map_err(|e| format!("spawn {}: {e}", bin.display()))?;
        Ok(GrokAdminResult {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            exit_code: output.status.code(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
