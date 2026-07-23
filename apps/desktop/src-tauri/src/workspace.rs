//! Workspace helpers: fuzzy file list for @ mentions, open paths.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub path: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstructionsSnapshot {
    pub path: String,
    pub exists: bool,
    pub content: String,
}

const AGENTS_FILE: &str = "AGENTS.md";
const MAX_AGENTS_BYTES: usize = 200_000;

fn workspace_root(cwd: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(cwd.trim());
    if !root.is_dir() {
        return Err("not a directory".into());
    }
    root.canonicalize().map_err(|e| format!("resolve workspace: {e}"))
}

fn agents_path(root: &Path) -> PathBuf {
    root.join(AGENTS_FILE)
}

fn read_agents_file(root: &Path) -> Result<ProjectInstructionsSnapshot, String> {
    let path = agents_path(root);
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ProjectInstructionsSnapshot {
                path: path.display().to_string(),
                exists: false,
                content: String::new(),
            });
        }
        Err(error) => return Err(format!("read AGENTS.md metadata: {error}")),
    };
    if meta.file_type().is_symlink() {
        return Err("AGENTS.md must be a project-local regular file, not a symlink.".into());
    }
    if !meta.is_file() {
        return Err("AGENTS.md is not a regular file.".into());
    }
    if meta.len() as usize > MAX_AGENTS_BYTES {
        return Err("AGENTS.md is too large to edit in gorkX (maximum 200 KB).".into());
    }
    let bytes = fs::read(&path).map_err(|e| format!("read AGENTS.md: {e}"))?;
    if bytes.contains(&0) {
        return Err("AGENTS.md contains NUL bytes and cannot be edited as text.".into());
    }
    Ok(ProjectInstructionsSnapshot {
        path: path.display().to_string(),
        exists: true,
        content: String::from_utf8_lossy(&bytes).into_owned(),
    })
}

fn write_agents_file(root: &Path, content: &str) -> Result<ProjectInstructionsSnapshot, String> {
    if content.len() > MAX_AGENTS_BYTES || content.as_bytes().contains(&0) {
        return Err("AGENTS.md must be plain text up to 200 KB and cannot contain NUL bytes.".into());
    }
    let path = agents_path(root);
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.file_type().is_symlink() {
            return Err("Refusing to write AGENTS.md through a symlink.".into());
        }
        if !meta.is_file() {
            return Err("AGENTS.md is not a regular file.".into());
        }
    }
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let tmp = root.join(format!(".{AGENTS_FILE}.gorkx-{nonce}.tmp"));
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&tmp)
            .map_err(|e| format!("create temporary AGENTS.md: {e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("write temporary AGENTS.md: {e}"))?;
        file.sync_all().map_err(|e| format!("sync temporary AGENTS.md: {e}"))?;
        fs::rename(&tmp, &path).map_err(|e| format!("replace AGENTS.md: {e}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write_result?;
    read_agents_file(root)
}

/// Project-root instructions editor. This manages a conventional AGENTS.md
/// file only; it does not claim the unavailable ACP Hooks lifecycle.
#[tauri::command]
pub fn workspace_read_agents_md(cwd: String) -> Result<ProjectInstructionsSnapshot, String> {
    let root = workspace_root(&cwd)?;
    read_agents_file(&root)
}

#[tauri::command]
pub fn workspace_write_agents_md(cwd: String, content: String) -> Result<ProjectInstructionsSnapshot, String> {
    let root = workspace_root(&cwd)?;
    write_agents_file(&root, &content)
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    ".git",
    "dist",
    "build",
    ".next",
    "vendor",
    "__pycache__",
    ".cache",
    "coverage",
    ".turbo",
];

fn should_skip(name: &str) -> bool {
    SKIP_DIRS.iter().any(|s| *s == name) || name.starts_with('.')
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<FileHit>, limit: usize) {
    if out.len() >= limit {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for ent in rd.flatten() {
        if out.len() >= limit {
            return;
        }
        let path = ent.path();
        let name = ent.file_name().to_string_lossy().to_string();
        // `Path::is_dir` and `is_file` follow symlinks. File discovery feeds
        // the @ attachment picker, so never turn a project-local symlink into
        // an index of files outside the chosen workspace.
        if ent.file_type().map(|ty| ty.is_symlink()).unwrap_or(true) {
            continue;
        }
        if path.is_dir() {
            if should_skip(&name) {
                continue;
            }
            walk(&path, root, out, limit);
        } else if path.is_file() {
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(FileHit {
                path: rel.clone(),
                name,
            });
        }
    }
}

#[tauri::command]
pub async fn workspace_list_files(cwd: String, query: Option<String>, limit: Option<usize>) -> Result<Vec<FileHit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&cwd);
        if !root.is_dir() {
            return Err(format!("not a directory: {cwd}"));
        }
        let lim = limit.unwrap_or(80).min(200);
        let mut all = Vec::with_capacity(lim * 2);
        walk(&root, &root, &mut all, 4000);
        let q = query.unwrap_or_default().to_ascii_lowercase();
        if q.is_empty() {
            all.truncate(lim);
            return Ok(all);
        }
        let mut scored: Vec<(i32, FileHit)> = all
            .into_iter()
            .filter_map(|h| {
                let p = h.path.to_ascii_lowercase();
                let n = h.name.to_ascii_lowercase();
                if !p.contains(&q) && !n.contains(&q) {
                    return None;
                }
                let mut score = 0i32;
                if n.starts_with(&q) {
                    score += 100;
                }
                if n.contains(&q) {
                    score += 40;
                }
                if p.contains(&q) {
                    score += 10;
                }
                score -= p.len() as i32 / 20;
                Some((score, h))
            })
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        Ok(scored.into_iter().take(lim).map(|(_, h)| h).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read-only preview of a workspace file (first N lines) for non-git review.
#[tauri::command]
pub fn read_workspace_file_preview(
    cwd: String,
    path: String,
    max_lines: Option<u32>,
) -> Result<String, String> {
    let root = PathBuf::from(cwd.trim());
    if !root.is_dir() {
        return Err("not a directory".into());
    }
    let rel = path.trim().trim_start_matches("./");
    let full = if Path::new(rel).is_absolute() {
        PathBuf::from(rel)
    } else {
        root.join(rel)
    };
    let full = full
        .canonicalize()
        .map_err(|e| format!("resolve path: {e}"))?;
    let root_c = root
        .canonicalize()
        .map_err(|e| format!("resolve cwd: {e}"))?;
    if !full.starts_with(&root_c) {
        return Err("path outside workspace".into());
    }
    if !full.is_file() {
        return Err("not a file".into());
    }
    // Skip huge / binary files
    let meta = fs::metadata(&full).map_err(|e| e.to_string())?;
    if meta.len() > 1_500_000 {
        return Ok(format!("(file too large to preview: {} bytes)", meta.len()));
    }
    let raw = fs::read(&full).map_err(|e| e.to_string())?;
    if raw.iter().take(800).any(|&b| b == 0) {
        return Ok("(binary file — no text preview)".into());
    }
    let text = String::from_utf8_lossy(&raw);
    let lim = max_lines.unwrap_or(120).min(400) as usize;
    let mut out = String::new();
    for (i, line) in text.lines().enumerate() {
        if i >= lim {
            out.push_str(&format!("\n… ({} more lines truncated)", text.lines().count().saturating_sub(lim)));
            break;
        }
        out.push_str(line);
        out.push('\n');
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{read_agents_file, walk, write_agents_file, FileHit};
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[cfg(unix)]
    #[test]
    fn discovery_skips_symlinks_that_leave_the_workspace() {
        use std::os::unix::fs::symlink;

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("gorkx-workspace-{nonce}"));
        let project = base.join("project");
        let outside = base.join("outside");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(project.join("inside.txt"), "ok").unwrap();
        fs::write(outside.join("private.txt"), "private").unwrap();
        symlink(&outside, project.join("outside-link")).unwrap();

        let mut hits: Vec<FileHit> = Vec::new();
        walk(Path::new(&project), Path::new(&project), &mut hits, 80);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "inside.txt");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn project_instructions_are_written_atomically_and_read_back() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let project = std::env::temp_dir().join(format!("gorkx-agents-{nonce}"));
        fs::create_dir_all(&project).unwrap();
        let initial = read_agents_file(&project).unwrap();
        assert!(!initial.exists);
        let saved = write_agents_file(&project, "# Project rules\n\nRun tests first.\n").unwrap();
        assert!(saved.exists);
        assert_eq!(saved.content, "# Project rules\n\nRun tests first.\n");
        assert_eq!(read_agents_file(&project).unwrap().content, saved.content);
        assert!(!project.join(".AGENTS.md.gorkx-0.tmp").exists());
        fs::remove_dir_all(project).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn project_instructions_refuse_symlink_targets() {
        use std::os::unix::fs::symlink;

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("gorkx-agents-link-{nonce}"));
        let project = base.join("project");
        fs::create_dir_all(&project).unwrap();
        let outside = base.join("outside.md");
        fs::write(&outside, "private").unwrap();
        symlink(&outside, project.join("AGENTS.md")).unwrap();
        assert!(read_agents_file(&project).is_err());
        assert!(write_agents_file(&project, "unsafe").is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "private");
        fs::remove_dir_all(base).unwrap();
    }
}
