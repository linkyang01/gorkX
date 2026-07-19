//! Workspace helpers: fuzzy file list for @ mentions, open paths.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub path: String,
    pub name: String,
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
