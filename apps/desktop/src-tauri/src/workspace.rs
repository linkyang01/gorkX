//! Workspace helpers: fuzzy file list for @ mentions, open paths.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub path: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResourceAttachment {
    pub path: String,
    pub name: String,
    pub size: u64,
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
/// ACP client file writes are intentionally bounded. Larger output should use
/// the engine's normal tools, which have their own streaming/audit surface.
const MAX_CLIENT_WRITE_BYTES: usize = 1_000_000;
const MAX_RESOURCE_ATTACHMENT_BYTES: u64 = 100 * 1024 * 1024;
const MAX_HOOK_DEFINITION_BYTES: usize = 200_000;
const HOOK_VERIFICATION_PREFIX: &str = "gorkx-hook-verify-";
const HOOK_VERIFICATION_MARKER_DIR: &str = ".grok/gorkx-hook-verification";
const HOOK_VERIFICATION_HOOK_FILE: &str = "gorkx-session-start-verification.json";

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

fn relative_write_target(root: &Path, raw_path: &str) -> Result<PathBuf, String> {
    let rel = raw_path.trim().trim_start_matches("./");
    if rel.is_empty() {
        return Err("file path is required".into());
    }
    let path = Path::new(rel);
    if path.is_absolute()
        || path.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("file path must stay inside the current project".into());
    }
    let target = root.join(path);
    let parent = target
        .parent()
        .ok_or_else(|| "file path has no parent".to_string())?;
    let parent = parent
        .canonicalize()
        .map_err(|e| format!("resolve target directory: {e}"))?;
    if !parent.starts_with(root) {
        return Err("file path resolves outside the current project".into());
    }
    Ok(parent.join(
        path.file_name()
            .ok_or_else(|| "file name is required".to_string())?,
    ))
}

fn write_client_text_file(root: &Path, raw_path: &str, content: &str) -> Result<(), String> {
    if content.len() > MAX_CLIENT_WRITE_BYTES || content.as_bytes().contains(&0) {
        return Err(
            "file content must be plain text up to 1 MB and cannot contain NUL bytes".into(),
        );
    }
    let target = relative_write_target(root, raw_path)?;
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() {
            return Err("refusing to write through a symlink".into());
        }
        if !meta.is_file() {
            return Err("target is not a regular file".into());
        }
    }
    let parent = target
        .parent()
        .ok_or_else(|| "file path has no parent".to_string())?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    let tmp = parent.join(format!(".{name}.gorkx-write-{nonce}.tmp"));
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&tmp)
            .map_err(|e| format!("create temporary file: {e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("write temporary file: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("sync temporary file: {e}"))?;
        fs::rename(&tmp, &target).map_err(|e| format!("replace project file: {e}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write_result
}

fn safe_hook_file_name(raw: &str) -> Result<String, String> {
    let name = raw.trim();
    if name.len() < 6 || name.len() > 96 || !name.ends_with(".json") {
        return Err("Hook file name must be 1–90 characters and end in .json".into());
    }
    let stem = &name[..name.len() - ".json".len()];
    if stem.is_empty()
        || !stem
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err("Hook file name may contain only letters, numbers, ., _ and -".into());
    }
    Ok(name.to_string())
}

fn ensure_project_hooks_dir(root: &Path) -> Result<PathBuf, String> {
    let grok_dir = root.join(".grok");
    let hooks_dir = grok_dir.join("hooks");
    for dir in [&grok_dir, &hooks_dir] {
        match fs::symlink_metadata(dir) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err("Refusing to write project Hooks through a symlink".into())
            }
            Ok(meta) if !meta.is_dir() => return Err("Project Hook path is not a directory".into()),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(dir).map_err(|e| format!("create project Hook directory: {e}"))?;
            }
            Err(error) => return Err(format!("inspect project Hook directory: {error}")),
        }
    }
    Ok(hooks_dir)
}

/// Create or replace one project-local Grok Build Hook definition. The
/// renderer supplies a guided, validated JSON document; this backend adds a
/// second boundary around the project path and refuses symlinked .grok/hooks.
#[tauri::command]
pub fn workspace_write_hook_definition(
    cwd: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    if content.len() > MAX_HOOK_DEFINITION_BYTES || content.as_bytes().contains(&0) {
        return Err("Hook definition must be plain text up to 200 KB".into());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("invalid Hook JSON: {e}"))?;
    if !parsed.get("hooks").is_some_and(serde_json::Value::is_object) {
        return Err("Hook JSON must contain a hooks object".into());
    }
    let root = workspace_root(&cwd)?;
    let name = safe_hook_file_name(&file_name)?;
    ensure_project_hooks_dir(&root)?;
    let relative = format!(".grok/hooks/{name}");
    write_client_text_file(&root, &relative, &content)?;
    Ok(root.join(relative).display().to_string())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookVerificationProject {
    pub project_path: String,
    pub marker_relative_path: String,
    pub marker_token: String,
    pub hook_file_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookVerificationMarker {
    pub status: String,
    pub path: String,
}

fn hook_verification_token_is_safe(token: &str) -> bool {
    let bytes = token.as_bytes();
    (8..=128).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn hook_verification_marker_path(
    root: &Path,
    marker_relative_path: &str,
    marker_token: &str,
) -> Result<PathBuf, String> {
    if !hook_verification_token_is_safe(marker_token) {
        return Err("Hook verification marker token is invalid".into());
    }
    let expected = format!("{HOOK_VERIFICATION_MARKER_DIR}/{marker_token}.marker");
    if marker_relative_path.trim() != expected {
        return Err("Hook verification marker must stay in the bounded project directory".into());
    }
    let relative = Path::new(marker_relative_path);
    if relative.is_absolute()
        || relative.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("Hook verification marker path must be project-relative".into());
    }
    let parent = root.join(HOOK_VERIFICATION_MARKER_DIR);
    if let Ok(meta) = fs::symlink_metadata(&parent) {
        if meta.file_type().is_symlink() {
            return Err("Refusing to read a Hook verification marker through a symlink".into());
        }
        if !meta.is_dir() {
            return Err("Hook verification marker directory is not a directory".into());
        }
    }
    let target = root.join(relative);
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() {
            return Err("Refusing to read a Hook verification marker through a symlink".into());
        }
    }
    Ok(target)
}

/// Create a disposable, Git-backed project for the Settings Hook verification
/// flow. The engine's trust action requires a Git worktree root; the project is
/// created directly under the OS temporary directory and never under the
/// user's selected repository.
#[tauri::command]
pub fn workspace_create_hook_verification_project() -> Result<HookVerificationProject, String> {
    let temp_root = std::env::temp_dir();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let project = temp_root.join(format!("{HOOK_VERIFICATION_PREFIX}{nonce}"));
    fs::create_dir(&project)
        .map_err(|e| format!("create temporary Hook verification project: {e}"))?;

    let result = (|| -> Result<HookVerificationProject, String> {
        fs::create_dir_all(project.join(".grok/hooks"))
            .map_err(|e| format!("create temporary Hook directories: {e}"))?;
        let git = Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&project)
            .status()
            .map_err(|e| format!("initialize temporary Hook project Git repository: {e}"))?;
        if !git.success() {
            return Err(format!("initialize temporary Hook project Git repository exited with {git}"));
        }
        let root = project
            .canonicalize()
            .map_err(|e| format!("resolve temporary Hook verification project: {e}"))?;
        let marker_token = format!("gorkx-{nonce}");
        let marker_relative_path = format!("{HOOK_VERIFICATION_MARKER_DIR}/{marker_token}.marker");
        Ok(HookVerificationProject {
            project_path: root.display().to_string(),
            marker_relative_path,
            marker_token,
            hook_file_name: HOOK_VERIFICATION_HOOK_FILE.into(),
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&project);
    }
    result
}

/// Read only the fixed marker shape used by the verification flow. A missing
/// marker is a normal negative result; the renderer must never turn it into a
/// success or create it as a fallback.
#[tauri::command]
pub fn workspace_read_hook_verification_marker(
    cwd: String,
    marker_relative_path: String,
    marker_token: String,
) -> Result<HookVerificationMarker, String> {
    let root = hook_verification_project_root(&cwd)?;
    let target = hook_verification_marker_path(&root, &marker_relative_path, &marker_token)?;
    let path = target.display().to_string();
    let metadata = match fs::symlink_metadata(&target) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(HookVerificationMarker { status: "missing".into(), path });
        }
        Err(error) => return Err(format!("read Hook verification marker metadata: {error}")),
    };
    if !metadata.is_file() {
        return Err("Hook verification marker is not a regular file".into());
    }
    if metadata.len() > 512 {
        return Err("Hook verification marker is unexpectedly large".into());
    }
    let bytes = fs::read(&target).map_err(|e| format!("read Hook verification marker: {e}"))?;
    let expected = format!("{marker_token}\n");
    Ok(HookVerificationMarker {
        status: if bytes == expected.as_bytes() { "match" } else { "mismatch" }.into(),
        path,
    })
}

fn hook_verification_project_root(raw: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(raw.trim());
    if !requested.is_absolute() {
        return Err("Hook verification project must be an absolute path".into());
    }
    let temp_root = std::env::temp_dir()
        .canonicalize()
        .map_err(|e| format!("resolve temporary directory: {e}"))?;
    let parent = requested
        .parent()
        .ok_or_else(|| "Hook verification project has no parent".to_string())?
        .canonicalize()
        .map_err(|e| format!("resolve Hook verification project parent: {e}"))?;
    let name = requested
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Hook verification project has no valid name".to_string())?;
    if parent != temp_root || !name.starts_with(HOOK_VERIFICATION_PREFIX) {
        return Err("Refusing to remove a non-temporary Hook verification project".into());
    }
    let meta = fs::symlink_metadata(&requested)
        .map_err(|e| format!("read Hook verification project metadata: {e}"))?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err("Hook verification project is not a regular directory".into());
    }
    requested
        .canonicalize()
        .map_err(|e| format!("resolve Hook verification project: {e}"))
}

#[tauri::command]
pub fn workspace_remove_hook_verification_project(project_path: String) -> Result<(), String> {
    let root = hook_verification_project_root(&project_path)?;
    fs::remove_dir_all(&root).map_err(|e| format!("remove temporary Hook verification project: {e}"))
}

/// ACP client-side text-file write. This is only called by the renderer when
/// the user has explicitly started the task in Full permission mode; the
/// backend still confines it to the selected project and rejects symlinks.
#[tauri::command]
pub fn workspace_write_client_text(
    cwd: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let root = workspace_root(&cwd)?;
    write_client_text_file(&root, &path, &content)
}

/// Validates an ACP-returned file as a workspace-local deliverable.  This is
/// intentionally stricter than a generic file picker: an agent cannot cause
/// the renderer to preview arbitrary files from the user's machine.
#[tauri::command]
pub fn workspace_validate_resource_attachment(
    cwd: String,
    path: String,
) -> Result<WorkspaceResourceAttachment, String> {
    let root = workspace_root(&cwd)?;
    let requested = PathBuf::from(path.trim());
    if !requested.is_absolute() {
        return Err("resource path must be absolute".into());
    }
    let original_meta = fs::symlink_metadata(&requested)
        .map_err(|e| format!("read resource metadata: {e}"))?;
    if original_meta.file_type().is_symlink() {
        return Err("resource attachment cannot be a symlink".into());
    }
    let resolved = requested
        .canonicalize()
        .map_err(|e| format!("resolve resource path: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err("resource attachment is outside the current project".into());
    }
    let meta = fs::metadata(&resolved).map_err(|e| format!("read resource metadata: {e}"))?;
    if !meta.is_file() {
        return Err("resource attachment is not a regular file".into());
    }
    if meta.len() > MAX_RESOURCE_ATTACHMENT_BYTES {
        return Err("resource attachment is too large to open in gorkX".into());
    }
    let name = resolved
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "resource attachment has no usable file name".to_string())?
        .to_string();
    Ok(WorkspaceResourceAttachment {
        path: resolved.display().to_string(),
        name,
        size: meta.len(),
    })
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTextFile {
    pub path: String,
    pub content: String,
    /// Milliseconds since UNIX epoch; used for optimistic conflict detection on save.
    pub mtime_ms: u64,
    pub size: u64,
}

/// Read full text for in-app edit. Project-bounded, rejects symlinks/binary/oversize.
#[tauri::command]
pub fn workspace_read_text_file(cwd: String, path: String) -> Result<WorkspaceTextFile, String> {
    let root = workspace_root(&cwd)?;
    let requested = PathBuf::from(path.trim());
    if !requested.is_absolute() {
        return Err("path must be absolute".into());
    }
    let original_meta = fs::symlink_metadata(&requested)
        .map_err(|e| format!("read file metadata: {e}"))?;
    if original_meta.file_type().is_symlink() {
        return Err("refusing to read a symlink".into());
    }
    let resolved = requested
        .canonicalize()
        .map_err(|e| format!("resolve path: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err("path outside the current project".into());
    }
    let meta = fs::metadata(&resolved).map_err(|e| format!("stat file: {e}"))?;
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    if meta.len() > MAX_CLIENT_WRITE_BYTES as u64 {
        return Err("file is too large to edit in gorkX (1 MB max)".into());
    }
    let raw = fs::read(&resolved).map_err(|e| format!("read file: {e}"))?;
    if raw.contains(&0) {
        return Err("binary file cannot be edited as text".into());
    }
    let content = String::from_utf8(raw).map_err(|_| "file is not valid UTF-8 text".to_string())?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(WorkspaceTextFile {
        path: resolved.display().to_string(),
        content,
        mtime_ms,
        size: meta.len(),
    })
}

/// Save text only if the on-disk mtime still matches the value loaded for edit.
/// Prevents silently overwriting another window's changes.
#[tauri::command]
pub fn workspace_write_text_if_mtime(
    cwd: String,
    path: String,
    content: String,
    expected_mtime_ms: u64,
) -> Result<WorkspaceTextFile, String> {
    let root = workspace_root(&cwd)?;
    let requested = PathBuf::from(path.trim());
    if !requested.is_absolute() {
        return Err("path must be absolute".into());
    }
    let original_meta = fs::symlink_metadata(&requested)
        .map_err(|e| format!("read file metadata: {e}"))?;
    if original_meta.file_type().is_symlink() {
        return Err("refusing to write through a symlink".into());
    }
    let resolved = requested
        .canonicalize()
        .map_err(|e| format!("resolve path: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err("path outside the current project".into());
    }
    let meta = fs::metadata(&resolved).map_err(|e| format!("stat file: {e}"))?;
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    let current_mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    if current_mtime != expected_mtime_ms {
        return Err("conflict: file changed on disk since you opened it".into());
    }
    if content.len() > MAX_CLIENT_WRITE_BYTES || content.as_bytes().contains(&0) {
        return Err("content must be plain text up to 1 MB without NUL bytes".into());
    }
    let parent = resolved
        .parent()
        .ok_or_else(|| "file path has no parent".to_string())?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let name = resolved
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    let tmp = parent.join(format!(".{name}.gorkx-edit-{nonce}.tmp"));
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&tmp)
            .map_err(|e| format!("create temporary file: {e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("write temporary file: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("sync temporary file: {e}"))?;
        fs::rename(&tmp, &resolved).map_err(|e| format!("replace file: {e}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write_result?;
    workspace_read_text_file(cwd, resolved.display().to_string())
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
    use super::{
        read_agents_file,
        safe_hook_file_name,
        walk,
        workspace_create_hook_verification_project,
        workspace_read_hook_verification_marker,
        workspace_remove_hook_verification_project,
        workspace_validate_resource_attachment,
        write_agents_file,
        write_client_text_file,
        FileHit,
    };
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

    #[test]
    fn client_file_write_stays_in_project_and_replaces_atomically() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("gorkx-client-write-{nonce}"));
        let project = base.join("project");
        let outside = base.join("outside.txt");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::write(project.join("src/main.txt"), "before").unwrap();
        fs::write(&outside, "private").unwrap();
        let root = project.canonicalize().unwrap();

        write_client_text_file(&root, "src/main.txt", "after\n").unwrap();
        assert_eq!(fs::read_to_string(project.join("src/main.txt")).unwrap(), "after\n");
        assert!(write_client_text_file(&root, "../outside.txt", "unsafe").is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "private");

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn hook_definition_name_is_bounded() {
        assert_eq!(safe_hook_file_name("check-shell.json").unwrap(), "check-shell.json");
        assert!(safe_hook_file_name("../unsafe.json").is_err());
        assert!(safe_hook_file_name("hook.toml").is_err());
        assert!(safe_hook_file_name("hook file.json").is_err());
    }

    #[test]
    fn project_hook_definition_is_written_under_grok_hooks() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let project = std::env::temp_dir().join(format!("gorkx-hook-{nonce}"));
        fs::create_dir_all(&project).unwrap();
        let content = r#"{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"printf ok"}]}]}}"#;
        let path = super::workspace_write_hook_definition(
            project.display().to_string(),
            "startup.json".into(),
            content.into(),
        )
        .unwrap();
        assert!(path.ends_with("/.grok/hooks/startup.json"));
        assert_eq!(fs::read_to_string(path).unwrap(), content);
        fs::remove_dir_all(project).unwrap();
    }

    #[test]
    fn hook_verification_project_is_git_backed_and_marker_reader_is_strict() {
        let verification = workspace_create_hook_verification_project().unwrap();
        let project = Path::new(&verification.project_path);
        assert!(project.join(".git").is_dir());
        assert_eq!(verification.hook_file_name, "gorkx-session-start-verification.json");

        let missing = workspace_read_hook_verification_marker(
            verification.project_path.clone(),
            verification.marker_relative_path.clone(),
            verification.marker_token.clone(),
        )
        .unwrap();
        assert_eq!(missing.status, "missing");

        let marker = project.join(&verification.marker_relative_path);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(&marker, format!("{}\n", verification.marker_token)).unwrap();
        let matched = workspace_read_hook_verification_marker(
            verification.project_path.clone(),
            verification.marker_relative_path.clone(),
            verification.marker_token.clone(),
        )
        .unwrap();
        assert_eq!(matched.status, "match");
        fs::write(&marker, "not-the-token\n").unwrap();
        let mismatched = workspace_read_hook_verification_marker(
            verification.project_path.clone(),
            verification.marker_relative_path.clone(),
            verification.marker_token,
        )
        .unwrap();
        assert_eq!(mismatched.status, "mismatch");

        workspace_remove_hook_verification_project(verification.project_path.clone()).unwrap();
        assert!(!project.exists());
    }

    #[test]
    fn hook_verification_cleanup_rejects_non_temporary_directory() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let project = std::env::temp_dir().join(format!("gorkx-not-verification-{nonce}"));
        fs::create_dir_all(&project).unwrap();
        let result = workspace_remove_hook_verification_project(project.display().to_string());
        assert!(result.is_err());
        fs::remove_dir_all(project).unwrap();
    }

    #[test]
    fn resource_attachment_must_be_a_regular_file_inside_workspace() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("gorkx-resource-{nonce}"));
        let project = base.join("project");
        let outside = base.join("outside.txt");
        fs::create_dir_all(&project).unwrap();
        let delivered = project.join("report.md");
        fs::write(&delivered, "# Done\n").unwrap();
        fs::write(&outside, "private").unwrap();

        let item = workspace_validate_resource_attachment(
            project.display().to_string(),
            delivered.display().to_string(),
        ).unwrap();
        assert_eq!(item.name, "report.md");
        assert_eq!(item.size, 7);
        assert!(workspace_validate_resource_attachment(
            project.display().to_string(),
            outside.display().to_string(),
        ).is_err());
        assert!(workspace_validate_resource_attachment(
            project.display().to_string(),
            "report.md".into(),
        ).is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn resource_attachment_refuses_symlink_even_when_target_is_inside_workspace() {
        use std::os::unix::fs::symlink;

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let project = std::env::temp_dir().join(format!("gorkx-resource-link-{nonce}"));
        fs::create_dir_all(&project).unwrap();
        let actual = project.join("actual.txt");
        let linked = project.join("linked.txt");
        fs::write(&actual, "ok").unwrap();
        symlink(&actual, &linked).unwrap();
        assert!(workspace_validate_resource_attachment(
            project.display().to_string(),
            linked.display().to_string(),
        ).is_err());
        fs::remove_dir_all(project).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn client_file_write_refuses_symlink_targets() {
        use std::os::unix::fs::symlink;

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("gorkx-client-write-link-{nonce}"));
        let project = base.join("project");
        let outside = base.join("outside.txt");
        fs::create_dir_all(&project).unwrap();
        fs::write(&outside, "private").unwrap();
        symlink(&outside, project.join("linked.txt")).unwrap();
        let root = project.canonicalize().unwrap();

        assert!(write_client_text_file(&root, "linked.txt", "unsafe").is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "private");
        fs::remove_dir_all(base).unwrap();
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
