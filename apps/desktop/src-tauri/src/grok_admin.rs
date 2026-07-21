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

fn session_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|&i| bytes[i] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(i, byte)| [8, 13, 18, 23].contains(&i) || byte.is_ascii_hexdigit())
}

fn positive_limit(value: &str) -> bool {
    value.parse::<u16>().is_ok_and(|n| (1..=200).contains(&n))
}

fn worktree_id(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value.len() <= 200
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

/// `grok_admin_exec` backs fixed UI actions, not a second terminal. Keep its
/// grammar deliberately small so a compromised renderer cannot invoke `grok
/// update`, change auth, or pass arbitrary subcommands through this bridge.
fn allowed_admin_args(args: &[String]) -> bool {
    let words = args.iter().map(String::as_str).collect::<Vec<_>>();
    match words.as_slice() {
        ["--version"] | ["models"] | ["inspect", "--json"] | ["worktree", "list", "--json"] | ["worktree", "gc"] => true,
        ["worktree", "list", "--json", "--repo", repo] => !repo.is_empty() && !repo.starts_with('-'),
        ["sessions", "list", "-n", limit] => positive_limit(limit),
        ["sessions", "search", "-n", limit, "--", query] => positive_limit(limit) && !query.is_empty(),
        ["sessions", "delete", id] => session_id(id),
        ["export", id, "--clipboard"] => session_id(id),
        ["export", id, output] => session_id(id) && output.ends_with(".md") && !output.is_empty(),
        ["worktree", "rm", "-f", ids @ ..] => !ids.is_empty() && ids.iter().all(|id| worktree_id(id)),
        ["worktree", "rm", ids @ ..] => !ids.is_empty() && ids.iter().all(|id| worktree_id(id)),
        ["memory", "clear", "--workspace", "-y"]
        | ["memory", "clear", "--global", "-y"]
        | ["memory", "clear", "--all", "-y"] => true,
        _ => false,
    }
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
    if !allowed_admin_args(&args) {
        return Err("Grok admin command is not allowed by gorkX.".into());
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

#[cfg(test)]
mod tests {
    use super::allowed_admin_args;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn permits_only_ui_backed_admin_commands() {
        assert!(allowed_admin_args(&args(&["--version"])));
        assert!(allowed_admin_args(&args(&["inspect", "--json"])));
        assert!(allowed_admin_args(&args(&["sessions", "search", "-n", "40", "--", "auth failure"])));
        assert!(allowed_admin_args(&args(&["export", "12345678-1234-1234-1234-123456789abc", "--clipboard"])));
        assert!(allowed_admin_args(&args(&["memory", "clear", "--workspace", "-y"])));
    }

    #[test]
    fn rejects_arbitrary_cli_passthrough() {
        assert!(!allowed_admin_args(&args(&["update"])));
        assert!(!allowed_admin_args(&args(&["logout"])));
        assert!(!allowed_admin_args(&args(&["sessions", "search", "-n", "40", "--dangerous", "query"])));
        assert!(!allowed_admin_args(&args(&["worktree", "rm", "--all"])));
    }
}
