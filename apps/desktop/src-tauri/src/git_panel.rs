//! Local git status/diff for the Diff dock.
//! (Grok ACP x.ai/git/* methods are not exposed on current agent stdio.)

use serde::Serialize;
use std::path::{Component, Path};
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
    /// true when cwd is a git work tree; false = plain workspace listing
    #[serde(default)]
    pub is_git: bool,
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

/// Tauri commands accept a project-relative Git path only. Git itself guards
/// pathspec handling with `--`, but rejecting absolute and parent paths here
/// also prevents a compromised renderer from selecting files outside the
/// project for preview, staging, or unstaging.
fn relative_project_path(path: &str) -> Result<String, String> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err("empty project path".into());
    }
    let parsed = Path::new(raw);
    if parsed.components().any(|part| {
        matches!(
            part,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("path must stay inside the project".into());
    }
    Ok(raw.to_string())
}

/// Resolve an existing preview target and prove it remains below the chosen
/// project. `Path::join` alone is insufficient here: a harmless-looking
/// project-relative symlink may point to a file outside the project.
fn existing_project_child(root: &Path, rel: &str) -> Result<std::path::PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("cannot resolve project root: {e}"))?;
    let full = root.join(rel);
    let resolved = full
        .canonicalize()
        .map_err(|e| format!("cannot resolve project file: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err("path resolves outside the project".into());
    }
    Ok(resolved)
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
            is_git: false,
            branch: String::new(),
            dirty: false,
            files: vec![],
            diff: String::new(),
            error: format!("Not a directory: {cwd}"),
        });
    }

    // Not a git repo → still show a workspace file summary (not an empty dead panel)
    if run_git(root, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(workspace_snapshot(root));
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
        is_git: true,
        branch,
        dirty: !files.is_empty(),
        files,
        diff,
        error: String::new(),
    })
}

/// Non-git project: list recent / top-level files so Review is not an empty wall.
fn workspace_snapshot(root: &Path) -> GitSnapshot {
    let skip = [
        "node_modules",
        "target",
        ".git",
        "dist",
        "build",
        ".next",
        "__pycache__",
        ".turbo",
        "vendor",
        ".cache",
    ];
    let mut scored: Vec<(u64, String)> = Vec::new();
    fn walk(
        dir: &Path,
        root: &Path,
        depth: usize,
        skip: &[&str],
        out: &mut Vec<(u64, String)>,
    ) {
        if depth > 3 || out.len() > 80 {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for ent in rd.flatten() {
            if out.len() > 80 {
                break;
            }
            let name = ent.file_name().to_string_lossy().into_owned();
            // Do not turn Review into a way to recursively enumerate files
            // outside the chosen workspace through a symlink.
            if ent.file_type().map(|ty| ty.is_symlink()).unwrap_or(true) {
                continue;
            }
            if name.starts_with('.') && name != ".env.example" {
                continue;
            }
            if skip.iter().any(|s| *s == name) {
                continue;
            }
            let path = ent.path();
            if path.is_dir() {
                walk(&path, root, depth + 1, skip, out);
            } else if path.is_file() {
                let rel = path
                    .strip_prefix(root)
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| name.clone());
                let mtime = ent
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push((mtime, rel));
            }
        }
    }
    walk(root, root, 0, &skip, &mut scored);
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.truncate(48);
    let files: Vec<GitFileEntry> = scored
        .iter()
        .map(|(_, p)| GitFileEntry {
            path: p.clone(),
            status: "WS".into(),
        })
        .collect();
    let mut diff = String::from("### 工作区文件（非 Git）\n\n");
    diff.push_str("当前目录不是 Git 仓库。下列为最近修改的文件（最多 48 个），供审阅参考：\n\n");
    for f in &files {
        diff.push_str(&format!("· {}\n", f.path));
    }
    if files.is_empty() {
        diff.push_str("（目录下暂无明显文件）\n");
    }
    GitSnapshot {
        ok: true,
        is_git: false,
        branch: "workspace".into(),
        dirty: !files.is_empty(),
        files,
        diff,
        error: String::new(),
    }
}

#[tauri::command]
pub async fn git_file_diff(cwd: String, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&cwd);
        let rel = relative_project_path(path.trim_end_matches('/'))?;
        let full = root.join(&rel);

        let is_git = run_git(root, &["rev-parse", "--is-inside-work-tree"]).is_ok();
        if !is_git {
            if !root.is_dir() {
                return Err("project is not a directory".into());
            }
            // Preserve the existing "missing file" response, but any existing
            // file or directory must prove it is contained after resolution.
            let full = if full.exists() {
                existing_project_child(root, &rel)?
            } else {
                full
            };
            if full.is_file() {
                match std::fs::read_to_string(&full) {
                    Ok(raw) => {
                        let mut out = format!("### 工作区文件: {rel}\n\n");
                        let max = 12_000;
                        if raw.len() > max {
                            out.push_str(&raw[..max]);
                            out.push_str("\n… [truncated]\n");
                        } else {
                            out.push_str(&raw);
                        }
                        return Ok(out);
                    }
                    Err(e) => return Ok(format!("无法读取 {rel}: {e}")),
                }
            }
            if full.is_dir() {
                return Ok(format!("### 目录: {rel}/\n（非 Git 工作区）\n"));
            }
            return Ok(format!("文件不存在: {rel}"));
        }

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
            Some(p) if !p.is_empty() => {
                let p = relative_project_path(&p)?;
                run_git(root, &["add", "--", &p]).map(|_| ())
            }
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
                let p = relative_project_path(&p)?;
                run_git(root, &["restore", "--staged", "--", &p]).map(|_| ())
            }
            _ => run_git(root, &["restore", "--staged", "."]).map(|_| ()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{existing_project_child, relative_project_path, workspace_snapshot};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn accepts_only_relative_project_paths() {
        assert_eq!(relative_project_path("src/main.rs").as_deref(), Ok("src/main.rs"));
        assert_eq!(relative_project_path("./README.md").as_deref(), Ok("./README.md"));
        assert!(relative_project_path("../secret").is_err());
        assert!(relative_project_path("/etc/passwd").is_err());
        assert!(relative_project_path("").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn non_git_preview_rejects_symlink_outside_project() {
        use std::os::unix::fs::symlink;

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("gorkx-git-panel-{suffix}"));
        let project = base.join("project");
        let outside = base.join("outside.txt");
        fs::create_dir_all(&project).unwrap();
        fs::write(&outside, "private").unwrap();
        symlink(&outside, project.join("outside-link")).unwrap();

        assert!(existing_project_child(&project, "outside-link").is_err());
        let snapshot = workspace_snapshot(&project);
        assert!(!snapshot.files.iter().any(|f| f.path == "outside-link"));

        fs::remove_dir_all(base).unwrap();
    }
}
