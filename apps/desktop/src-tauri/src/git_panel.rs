//! Local git status/diff for the Diff dock.
//! (Grok ACP x.ai/git/* methods are not exposed on current agent stdio.)

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileEntry {
    pub path: String,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub ok: bool,
    pub branch: String,
    pub dirty: bool,
    pub files: Vec<GitFileEntry>,
    pub diff: String,
    pub error: String,
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("git {:?} exit {}", args, out.status)
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[tauri::command]
pub async fn git_snapshot(cwd: String) -> Result<GitSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git_snapshot_blocking(cwd))
        .await
        .map_err(|e| e.to_string())?
}

fn git_snapshot_blocking(cwd: String) -> Result<GitSnapshot, String> {
    let root = Path::new(&cwd);
    if !root.is_dir() {
        return Ok(GitSnapshot {
            ok: false,
            branch: String::new(),
            dirty: false,
            files: vec![],
            diff: String::new(),
            error: format!("Not a directory: {cwd}"),
        });
    }

    // Not a git repo?
    if run_git(root, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(GitSnapshot {
            ok: false,
            branch: String::new(),
            dirty: false,
            files: vec![],
            diff: String::new(),
            error: "不是 Git 仓库".into(),
        });
    }

    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".into())
        .trim()
        .to_string();

    let status_raw = run_git(root, &["status", "--porcelain"]).unwrap_or_default();
    let mut files = Vec::new();
    for line in status_raw.lines() {
        if line.len() < 4 {
            continue;
        }
        let st = line[..2].trim().to_string();
        let path = line[3..].trim().to_string();
        if !path.is_empty() {
            files.push(GitFileEntry { path, status: st });
        }
    }

    // staged + unstaged unified
    let mut diff = String::new();
    if let Ok(staged) = run_git(root, &["diff", "--cached"]) {
        if !staged.trim().is_empty() {
            diff.push_str("### 已暂存\n");
            diff.push_str(&staged);
            if !diff.ends_with('\n') {
                diff.push('\n');
            }
        }
    }
    if let Ok(unstaged) = run_git(root, &["diff"]) {
        if !unstaged.trim().is_empty() {
            diff.push_str("### 未暂存\n");
            diff.push_str(&unstaged);
        }
    }
    // untracked names only
    if let Ok(untracked) = run_git(root, &["ls-files", "--others", "--exclude-standard"]) {
        let u = untracked.trim();
        if !u.is_empty() {
            diff.push_str("\n### 未跟踪\n");
            for p in u.lines() {
                diff.push_str(p);
                diff.push('\n');
            }
        }
    }

    // cap size for UI
    const MAX: usize = 400_000;
    if diff.len() > MAX {
        diff.truncate(MAX);
        diff.push_str("\n… [diff truncated]\n");
    }

    Ok(GitSnapshot {
        ok: true,
        branch,
        dirty: !files.is_empty(),
        files,
        diff,
        error: String::new(),
    })
}

#[tauri::command]
pub async fn git_file_diff(cwd: String, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&cwd);
        let rel = path.trim_end_matches('/').to_string();
        let full = root.join(&rel);

        // try unstaged then staged
        if let Ok(u) = run_git(root, &["diff", "--", &rel]) {
            if !u.trim().is_empty() {
                return Ok(u);
            }
        }
        if let Ok(s) = run_git(root, &["diff", "--cached", "--", &rel]) {
            if !s.trim().is_empty() {
                return Ok(s);
            }
        }

        // Untracked / new directory: list entries (no file hunk)
        if full.is_dir() {
            let mut out = format!("### 未跟踪目录: {rel}/\n\n");
            out.push_str("# 此处显示 Git 变更内容。\n");
            out.push_str("# 目录无法做行级 diff，下列为目录内容（最多 80 项）：\n\n");
            let mut names: Vec<String> = Vec::new();
            if let Ok(rd) = std::fs::read_dir(&full) {
                for e in rd.flatten() {
                    let n = e.file_name().to_string_lossy().into_owned();
                    let suffix = if e.path().is_dir() { "/" } else { "" };
                    names.push(format!("+ {n}{suffix}"));
                }
            }
            names.sort();
            let total = names.len();
            for n in names.into_iter().take(80) {
                out.push_str(&n);
                out.push('\n');
            }
            if total > 80 {
                out.push_str(&format!("… 另有 {} 项\n", total - 80));
            }
            if total == 0 {
                out.push_str("（空目录）\n");
            }
            return Ok(out);
        }

        // new / untracked file
        if full.is_file() {
            match std::fs::read_to_string(&full) {
                Ok(content) => {
                    let mut out = format!("### 新文件: {rel}\n");
                    for line in content.lines().take(400) {
                        out.push('+');
                        out.push_str(line);
                        out.push('\n');
                    }
                    if content.lines().count() > 400 {
                        out.push_str("…\n");
                    }
                    return Ok(out);
                }
                Err(_) => {
                    return Ok(format!(
                        "### binary or unreadable file: {rel}\n(no text diff available)\n"
                    ));
                }
            }
        }

        Ok(format!(
            "### {rel}\n(no diff — file may be clean, missing, or not in this working tree)\n"
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_stage(cwd: String, path: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&cwd);
        match path {
            Some(p) if !p.is_empty() => run_git(root, &["add", "--", &p]).map(|_| ()),
            _ => run_git(root, &["add", "-A"]).map(|_| ()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_unstage(cwd: String, path: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&cwd);
        match path {
            Some(p) if !p.is_empty() => {
                run_git(root, &["restore", "--staged", "--", &p]).map(|_| ())
            }
            _ => run_git(root, &["restore", "--staged", "."]).map(|_| ()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
