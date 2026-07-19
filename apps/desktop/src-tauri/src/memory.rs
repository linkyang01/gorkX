//! Hermes-style persistent memory under App GROK_HOME/memory.
//! Layers: USER.md · AGENT.md · workspaces/<slug>/MEMORY.md · sessions/

use crate::paths::{config_toml_path, ensure_dirs, memory_dir};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFileRow {
    pub path: String,
    pub name: String,
    pub scope: String,
    pub size: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStatus {
    pub enabled: bool,
    pub auto_learn: bool,
    pub memory_dir: String,
    pub config_path: String,
    pub files: Vec<MemoryFileRow>,
    pub note: String,
    pub user_chars: u64,
    pub agent_chars: u64,
    pub project_chars: u64,
}

fn memory_root() -> PathBuf {
    memory_dir()
}

fn config_path() -> PathBuf {
    config_toml_path()
}

fn read_bool_in_section(section: &str, key: &str, default: bool) -> bool {
    let path = config_path();
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return default;
    };
    let mut in_sec = false;
    for line in raw.lines() {
        let t = line.trim();
        if t.starts_with('[') {
            in_sec = t == section || t.starts_with(&format!("{section}."));
            continue;
        }
        if in_sec {
            if let Some(rest) = t.strip_prefix(key) {
                let rest = rest.trim().trim_start_matches('=').trim();
                return matches!(rest, "true" | "1" | "yes");
            }
        }
    }
    if key == "enabled" {
        if matches!(
            std::env::var("GROK_MEMORY").as_deref(),
            Ok("1") | Ok("true") | Ok("TRUE")
        ) {
            return true;
        }
    }
    default
}

/// Normalize section header: `"[memory]"` or `"memory"` → `"[memory]"`.
fn section_header(section: &str) -> String {
    let s = section.trim();
    if s.starts_with('[') {
        s.to_string()
    } else {
        format!("[{s}]")
    }
}

fn write_bool_in_section(section: &str, key: &str, value: bool) -> Result<(), String> {
    let _ = ensure_dirs();
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Repair a past bug that wrote `[[memory]]` (array-of-tables) instead of `[memory]`.
    repair_double_bracket_memory_section(&path)?;

    let header = section_header(section);
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let val = if value { "true" } else { "false" };
    let mut out = String::new();
    let mut in_sec = false;
    let mut wrote = false;
    if raw.trim().is_empty() {
        out.push_str(&format!("{header}\n{key} = {val}\n"));
        std::fs::write(&path, out).map_err(|e| e.to_string())?;
        return Ok(());
    }
    for line in raw.lines() {
        let t = line.trim();
        if t.starts_with('[') {
            if in_sec && !wrote {
                out.push_str(&format!("{key} = {val}\n"));
                wrote = true;
            }
            // Match `[memory]` only — not `[[memory]]` leftovers
            in_sec = t == header;
            out.push_str(line);
            out.push('\n');
            continue;
        }
        if in_sec && t.starts_with(key) {
            out.push_str(&format!("{key} = {val}\n"));
            wrote = true;
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    if in_sec && !wrote {
        out.push_str(&format!("{key} = {val}\n"));
        wrote = true;
    }
    if !wrote {
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&format!("\n{header}\n{key} = {val}\n"));
    }
    std::fs::write(&path, out).map_err(|e| e.to_string())?;
    Ok(())
}

/// Convert accidental `[[memory]]` array tables into a single `[memory]` table.
fn repair_double_bracket_memory_section(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Ok(());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if !raw.contains("[[memory]]") {
        return Ok(());
    }
    let mut out: Vec<String> = Vec::new();
    let mut enabled = true;
    let mut auto_learn = true;
    let mut i = 0;
    let lines: Vec<&str> = raw.lines().collect();
    while i < lines.len() {
        let t = lines[i].trim();
        if t == "[[memory]]" || t == "[memory]" {
            i += 1;
            while i < lines.len() && !lines[i].trim().starts_with('[') {
                let l = lines[i].trim();
                if let Some(rest) = l.strip_prefix("enabled") {
                    let v = rest.trim().trim_start_matches('=').trim();
                    enabled = matches!(v, "true" | "1" | "yes");
                } else if let Some(rest) = l.strip_prefix("auto_learn") {
                    let v = rest.trim().trim_start_matches('=').trim();
                    auto_learn = matches!(v, "true" | "1" | "yes");
                }
                i += 1;
            }
            continue;
        }
        out.push(lines[i].to_string());
        i += 1;
    }
    let mut body = out.join("\n");
    body = body.trim_end().to_string();
    body.push_str(&format!(
        "\n\n[memory]\nenabled = {}\nauto_learn = {}\n",
        if enabled { "true" } else { "false" },
        if auto_learn { "true" } else { "false" },
    ));
    std::fs::write(path, body).map_err(|e| e.to_string())?;
    Ok(())
}

fn read_config_enabled() -> bool {
    // Product default: ON (Hermes-style). User can disable.
    read_bool_in_section("[memory]", "enabled", true)
}

fn read_auto_learn() -> bool {
    read_bool_in_section("[memory]", "auto_learn", true)
}

fn project_slug(project: &str) -> String {
    let p = project.trim();
    if p.is_empty() {
        return "_global".into();
    }
    let name = Path::new(p)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("project");
    let mut s: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if s.is_empty() {
        s = "project".into();
    }
    // keep path hash tail for uniqueness
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        p.hash(&mut h);
        format!("{:x}", h.finish() % 0xffff)
    };
    format!("{s}_{hash}")
}

fn ensure_seed_file(path: &Path, seed: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if !path.exists() {
        std::fs::write(path, seed).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Create USER / AGENT / workspace layout so memory is real files, not empty vapor.
pub fn ensure_memory_layout(project: Option<&str>) -> Result<(), String> {
    let _ = ensure_dirs();
    let root = memory_root();
    std::fs::create_dir_all(root.join("sessions")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(root.join("workspaces")).map_err(|e| e.to_string())?;
    ensure_seed_file(
        &root.join("USER.md"),
        "# 用户画像 (USER)\n\n> 跨任务偏好。Agent 开局会加载此文件。\n\n## 沟通\n- 语言：中文\n\n## 技术偏好\n\n## 禁忌\n\n",
    )?;
    ensure_seed_file(
        &root.join("AGENT.md"),
        "# 工作笔记 (AGENT)\n\n> 环境、工具链、通用习惯。\n\n## 环境\n\n## 教训\n\n",
    )?;
    if let Some(proj) = project.filter(|p| !p.trim().is_empty()) {
        let slug = project_slug(proj);
        let dir = root.join("workspaces").join(&slug);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        ensure_seed_file(
            &dir.join("MEMORY.md"),
            &format!(
                "# 项目记忆\n\n路径：`{proj}`\n\n## 约定\n\n## 命令\n\n## 坑\n\n"
            ),
        )?;
    }
    // Ensure config has memory section with defaults if missing
    let _ = repair_double_bracket_memory_section(&config_path());
    let cfg_raw = std::fs::read_to_string(config_path()).unwrap_or_default();
    if !config_path().exists() || !cfg_raw.contains("[memory]") {
        write_bool_in_section("memory", "enabled", true)?;
        write_bool_in_section("memory", "auto_learn", true)?;
    }
    Ok(())
}

fn walk_md(dir: &Path, scope: &str, out: &mut Vec<MemoryFileRow>) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for ent in rd.flatten() {
        let p = ent.path();
        if p.is_dir() {
            let name = p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("project");
            if name == "sessions" {
                // list session dumps too
                walk_md(&p, "session", out);
                continue;
            }
            walk_md(&p, if scope == "global" { "project" } else { scope }, out);
        } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
            let meta = ent.metadata().ok();
            out.push(MemoryFileRow {
                path: p.display().to_string(),
                name: p
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("MEMORY.md")
                    .to_string(),
                scope: scope.to_string(),
                size: meta.map(|m| m.len()).unwrap_or(0),
            });
        }
    }
}

fn file_chars(path: &Path) -> u64 {
    std::fs::read_to_string(path)
        .map(|s| s.chars().count() as u64)
        .unwrap_or(0)
}

fn strip_seed_noise(s: &str) -> String {
    s.lines()
        .filter(|l| {
            let t = l.trim();
            if t.is_empty() {
                return false;
            }
            if t.starts_with('#') {
                return false;
            }
            if t.starts_with('>') {
                return false;
            }
            true
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[tauri::command]
pub fn memory_status(project: Option<String>) -> Result<MemoryStatus, String> {
    let _ = ensure_memory_layout(project.as_deref())?;
    let root = memory_root();
    let mut files = Vec::new();
    if root.is_dir() {
        walk_md(&root, "global", &mut files);
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let enabled = read_config_enabled();
    let auto_learn = read_auto_learn();
    let user_chars = file_chars(&root.join("USER.md"));
    let agent_chars = file_chars(&root.join("AGENT.md"));
    let project_chars = project
        .as_ref()
        .filter(|p| !p.trim().is_empty())
        .map(|p| {
            let slug = project_slug(p);
            file_chars(&root.join("workspaces").join(slug).join("MEMORY.md"))
        })
        .unwrap_or(0);
    Ok(MemoryStatus {
        enabled,
        auto_learn,
        memory_dir: root.display().to_string(),
        config_path: config_path().display().to_string(),
        files,
        note: if enabled {
            if auto_learn {
                format!(
                    "记忆已开启 · 自动学习开 — 开局注入优先文件最新内容；会话摘要最多保留 {MAX_SESSION_DUMPS} 份，超额合并进 _archive.md"
                )
            } else {
                "记忆已开启 · 自动学习关 — 仅显式「记一条」写入；开局注入优先最新内容".into()
            }
        } else {
            "记忆已关闭 — 在设置中开启后，跨任务才会记住约定".into()
        },
        user_chars,
        agent_chars,
        project_chars,
    })
}

#[tauri::command]
pub fn memory_set_enabled(enabled: bool) -> Result<MemoryStatus, String> {
    write_bool_in_section("[memory]", "enabled", enabled)?;
    if enabled {
        let _ = ensure_memory_layout(None);
    }
    memory_status(None)
}

#[tauri::command]
pub fn memory_set_auto_learn(enabled: bool) -> Result<MemoryStatus, String> {
    write_bool_in_section("[memory]", "auto_learn", enabled)?;
    memory_status(None)
}

#[tauri::command]
pub fn memory_read_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(path.trim());
    let root = memory_root();
    let canon = p.canonicalize().map_err(|e| e.to_string())?;
    let root_c = root.canonicalize().unwrap_or(root.clone());
    if !canon.starts_with(&root_c) {
        return Err("path outside memory directory".into());
    }
    std::fs::read_to_string(&canon).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_open_dir() -> Result<String, String> {
    let _ = ensure_memory_layout(None)?;
    let root = memory_root();
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&root).status();
    }
    Ok(root.display().to_string())
}

/// Append a durable note. scope: user | agent | project
#[tauri::command]
pub fn memory_append_note(
    scope: String,
    text: String,
    project: Option<String>,
) -> Result<MemoryStatus, String> {
    let body = text.trim();
    if body.is_empty() {
        return Err("empty note".into());
    }
    // refuse secrets-ish
    let lower = body.to_lowercase();
    for bad in ["api_key", "apikey", "secret", "password", "token=", "sk-", "begin private"] {
        if lower.contains(bad) {
            return Err("refused: looks like a secret".into());
        }
    }
    let _ = ensure_memory_layout(project.as_deref())?;
    if !read_config_enabled() {
        write_bool_in_section("[memory]", "enabled", true)?;
    }
    let root = memory_root();
    let path = match scope.as_str() {
        "user" => root.join("USER.md"),
        "agent" => root.join("AGENT.md"),
        "project" => {
            let proj = project.as_deref().unwrap_or("").trim();
            if proj.is_empty() {
                root.join("AGENT.md")
            } else {
                let slug = project_slug(proj);
                let dir = root.join("workspaces").join(slug);
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                dir.join("MEMORY.md")
            }
        }
        _ => root.join("AGENT.md"),
    };
    let stamp = chrono_lite_now();
    let entry = format!("\n### {stamp}\n- {body}\n");
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    f.write_all(entry.as_bytes()).map_err(|e| e.to_string())?;
    memory_status(project)
}

/// Build compact context string for new session injection (next-turn / first prompt).
/// Growing files (USER / AGENT / MEMORY) are read from the **tail** so recent
/// appends win when the char budget is exceeded — not the seed headers at the top.
#[tauri::command]
pub fn memory_injection_context(project: Option<String>) -> Result<String, String> {
    let _ = ensure_memory_layout(project.as_deref())?;
    if !read_config_enabled() {
        return Ok(String::new());
    }
    let root = memory_root();
    // Housekeeping: prune session dumps even when the user only starts a task
    let _ = gc_session_dumps(&root.join("sessions"));
    let mut parts: Vec<String> = Vec::new();
    let user = std::fs::read_to_string(root.join("USER.md")).unwrap_or_default();
    let agent = std::fs::read_to_string(root.join("AGENT.md")).unwrap_or_default();
    let u = strip_seed_noise(&user);
    let a = strip_seed_noise(&agent);
    // Tail-prefer: append-heavy memory keeps newest preferences in context
    if !u.is_empty() {
        parts.push(format!("【用户画像】\n{}", truncate_tail(&u, 1200)));
    }
    if !a.is_empty() {
        parts.push(format!("【工作笔记】\n{}", truncate_tail(&a, 1200)));
    }
    if let Some(proj) = project.filter(|p| !p.trim().is_empty()) {
        let slug = project_slug(&proj);
        let pm = std::fs::read_to_string(root.join("workspaces").join(slug).join("MEMORY.md"))
            .unwrap_or_default();
        let p = strip_seed_noise(&pm);
        if !p.is_empty() {
            parts.push(format!("【项目约定 · {proj}】\n{}", truncate_tail(&p, 1500)));
        }
    }
    if parts.is_empty() {
        return Ok(String::new());
    }
    Ok(format!(
        "以下是跨任务长期记忆，请默认遵守（除非用户当次明确改口）：\n\n{}\n\n—— 记忆上下文结束 ——",
        parts.join("\n\n")
    ))
}

/// Keep at most this many raw session dump files under memory/sessions/.
const MAX_SESSION_DUMPS: usize = 24;
/// Soft cap for sessions/_archive.md (chars); older archive lines are dropped from the head.
const MAX_ARCHIVE_CHARS: usize = 24_000;

/// After writing a new dump: index overflow into `_archive.md`, then delete oldest dumps.
fn gc_session_dumps(sessions_dir: &Path) -> Result<u32, String> {
    if !sessions_dir.is_dir() {
        return Ok(0);
    }
    let Ok(rd) = std::fs::read_dir(sessions_dir) else {
        return Ok(0);
    };
    let mut files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    for ent in rd.flatten() {
        let p = ent.path();
        if p.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        // Never GC the merge archive itself
        if name == "_archive.md" {
            continue;
        }
        let mtime = ent
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        files.push((p, mtime));
    }
    if files.len() <= MAX_SESSION_DUMPS {
        return Ok(0);
    }
    // Newest first — drop the tail
    files.sort_by(|a, b| b.1.cmp(&a.1));
    let to_drop: Vec<PathBuf> = files
        .into_iter()
        .skip(MAX_SESSION_DUMPS)
        .map(|(p, _)| p)
        .collect();

    let mut index_lines = String::new();
    for p in &to_drop {
        if let Ok(body) = std::fs::read_to_string(p) {
            let title = body
                .lines()
                .find(|l| l.trim_start().starts_with("- 标题：") || l.trim_start().starts_with("# "))
                .unwrap_or("(session)")
                .trim()
                .trim_start_matches('#')
                .trim()
                .trim_start_matches("- 标题：")
                .trim();
            let preview: String = body
                .lines()
                .filter(|l| {
                    let t = l.trim();
                    !t.is_empty()
                        && !t.starts_with('#')
                        && !t.starts_with("- 标题")
                        && !t.starts_with("- 时间")
                        && !t.starts_with("- 项目")
                })
                .take(2)
                .collect::<Vec<_>>()
                .join(" · ");
            index_lines.push_str(&format!(
                "- {} — {}\n",
                truncate_head(title, 60),
                truncate_head(preview.trim(), 120)
            ));
        } else {
            index_lines.push_str(&format!(
                "- {}\n",
                p.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("dump")
            ));
        }
    }
    if !index_lines.is_empty() {
        let archive = sessions_dir.join("_archive.md");
        let stamp = chrono_lite_now();
        let chunk = format!("\n## 归档 {stamp}\n\n{index_lines}");
        use std::io::Write;
        {
            let mut f = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&archive)
                .map_err(|e| e.to_string())?;
            if archive.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
                f.write_all(
                    "# 会话摘要归档\n\n> 超额 session dump 合并为一行索引；原文文件已删。\n"
                        .as_bytes(),
                )
                .map_err(|e| e.to_string())?;
            }
            f.write_all(chunk.as_bytes()).map_err(|e| e.to_string())?;
        }
        // Cap archive size: keep the newest tail
        if let Ok(raw) = std::fs::read_to_string(&archive) {
            if raw.chars().count() > MAX_ARCHIVE_CHARS {
                let kept = truncate_tail(&raw, MAX_ARCHIVE_CHARS);
                let body = if kept.starts_with('#') {
                    kept
                } else {
                    format!("# 会话摘要归档\n\n{kept}")
                };
                let _ = std::fs::write(&archive, body);
            }
        }
    }

    let mut removed = 0u32;
    for p in to_drop {
        if std::fs::remove_file(&p).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// After a non-trivial session: append a short dump (auto-learn), then GC old dumps.
#[tauri::command]
pub fn memory_record_session(
    project: Option<String>,
    title: String,
    summary: String,
) -> Result<(), String> {
    if !read_config_enabled() || !read_auto_learn() {
        return Ok(());
    }
    let summary = summary.trim();
    if summary.chars().count() < 24 {
        return Ok(());
    }
    let _ = ensure_memory_layout(project.as_deref())?;
    let root = memory_root();
    let sessions = root.join("sessions");
    std::fs::create_dir_all(&sessions).map_err(|e| e.to_string())?;
    let stamp = chrono_lite_now().replace([' ', ':'], "_");
    let safe_title: String = title
        .chars()
        .take(40)
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let path = sessions.join(format!("{stamp}_{safe_title}.md"));
    let body = format!(
        "# 会话沉淀\n\n- 标题：{}\n- 时间：{}\n- 项目：{}\n\n## 摘要\n\n{}\n",
        title.trim(),
        chrono_lite_now(),
        project.as_deref().unwrap_or("（无）"),
        // Written dump: keep the start of the model summary (usually the gist)
        truncate_head(summary, 4000)
    );
    std::fs::write(&path, body).map_err(|e| e.to_string())?;

    // Promote durable-looking lines into AGENT or project MEMORY
    let promote = extract_preference_lines(summary);
    if !promote.is_empty() {
        let target = if project.as_ref().map(|p| !p.trim().is_empty()).unwrap_or(false) {
            "project"
        } else {
            "agent"
        };
        for line in promote.into_iter().take(5) {
            let _ = memory_append_note(target.into(), line, project.clone());
        }
    }
    // Cap growth: merge old dumps into _archive.md index, delete raw files
    let _ = gc_session_dumps(&sessions);
    Ok(())
}

fn extract_preference_lines(summary: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in summary.lines() {
        let t = line.trim().trim_start_matches(['-', '*', '•', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ')', ' ']);
        if t.chars().count() < 8 || t.chars().count() > 200 {
            continue;
        }
        let lower = t.to_lowercase();
        if lower.contains("记住")
            || lower.contains("偏好")
            || lower.contains("约定")
            || lower.contains("不要")
            || lower.contains("必须")
            || lower.contains("prefer")
            || lower.contains("always")
            || lower.contains("never")
            || lower.contains("always use")
        {
            out.push(t.to_string());
        }
    }
    out
}

/// Prefer the **start** of the text (coherent summaries / one-liners).
fn truncate_head(s: &str, max: usize) -> String {
    let n = s.chars().count();
    if n <= max {
        return s.to_string();
    }
    s.chars().take(max).collect::<String>() + "…"
}

/// Prefer the **end** of the text (newest appends in growing memory files).
/// Snaps to the next line boundary so injection does not start mid-bullet.
fn truncate_tail(s: &str, max: usize) -> String {
    let trimmed = s.trim();
    let n = trimmed.chars().count();
    if n <= max {
        return trimmed.to_string();
    }
    let skip = n.saturating_sub(max);
    let tail: String = trimmed.chars().skip(skip).collect();
    if let Some(pos) = tail.find('\n') {
        if pos + 1 < tail.len() {
            return format!("…\n{}", &tail[pos + 1..]);
        }
    }
    format!("…{tail}")
}

fn chrono_lite_now() -> String {
    // Local-ish stamp without extra crate
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // format as unix for portability; UI can show as-is
    format!("{secs}")
}

fn assert_under_memory(path: &Path) -> Result<PathBuf, String> {
    let root = memory_root();
    let root_c = root.canonicalize().unwrap_or(root.clone());
    let ps = path.display().to_string();
    let rs = root.display().to_string();
    if let Ok(canon) = path.canonicalize() {
        if !canon.starts_with(&root_c) {
            return Err("path outside memory directory".into());
        }
        return Ok(canon);
    }
    if !ps.starts_with(&rs) {
        return Err("path outside memory directory".into());
    }
    Ok(path.to_path_buf())
}

/// Remove matching content from a markdown memory file.
/// Drops any `###` section whose body matches, plus standalone matching bullet lines.
fn forget_in_file(path: &Path, query: &str) -> Result<u32, String> {
    if !path.is_file() {
        return Ok(0);
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(0);
    }
    let lines: Vec<&str> = raw.lines().collect();
    let mut out: Vec<String> = Vec::new();
    let mut removed = 0u32;
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        let is_heading = line.trim_start().starts_with("### ");
        if is_heading {
            let start = i;
            i += 1;
            while i < lines.len() && !lines[i].trim_start().starts_with("### ") {
                i += 1;
            }
            let section = &lines[start..i];
            let hit = section.iter().any(|l| l.to_lowercase().contains(&q));
            if hit {
                removed += section.len() as u32;
            } else {
                for l in section {
                    out.push((*l).to_string());
                }
            }
            continue;
        }
        if line.to_lowercase().contains(&q) {
            let t = line.trim();
            if t.starts_with('#') && !t.starts_with("###") {
                out.push(line.to_string());
            } else {
                removed += 1;
            }
        } else {
            out.push(line.to_string());
        }
        i += 1;
    }
    if removed > 0 {
        let mut body = out.join("\n");
        if !body.ends_with('\n') {
            body.push('\n');
        }
        std::fs::write(path, body).map_err(|e| e.to_string())?;
    }
    Ok(removed)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryForgetResult {
    pub removed_lines: u32,
    pub files_touched: Vec<String>,
    pub status: MemoryStatus,
}

/// Forget by keyword: scrub USER / AGENT / project MEMORY / session dumps.
/// scope: all | user | agent | project | sessions
#[tauri::command]
pub fn memory_forget(
    query: String,
    scope: Option<String>,
    project: Option<String>,
) -> Result<MemoryForgetResult, String> {
    let q = query.trim();
    if q.chars().count() < 2 {
        return Err("forget query too short".into());
    }
    let _ = ensure_memory_layout(project.as_deref())?;
    let root = memory_root();
    let sc = scope.unwrap_or_else(|| "all".into());
    let mut paths: Vec<PathBuf> = Vec::new();
    match sc.as_str() {
        "user" => paths.push(root.join("USER.md")),
        "agent" => paths.push(root.join("AGENT.md")),
        "project" => {
            if let Some(proj) = project.as_ref().filter(|p| !p.trim().is_empty()) {
                let slug = project_slug(proj);
                paths.push(root.join("workspaces").join(slug).join("MEMORY.md"));
            } else {
                paths.push(root.join("AGENT.md"));
            }
        }
        "sessions" => {
            let sess = root.join("sessions");
            if let Ok(rd) = std::fs::read_dir(sess) {
                for ent in rd.flatten() {
                    let p = ent.path();
                    if p.extension().and_then(|e| e.to_str()) == Some("md") {
                        paths.push(p);
                    }
                }
            }
        }
        _ => {
            paths.push(root.join("USER.md"));
            paths.push(root.join("AGENT.md"));
            if let Some(proj) = project.as_ref().filter(|p| !p.trim().is_empty()) {
                let slug = project_slug(proj);
                paths.push(root.join("workspaces").join(slug).join("MEMORY.md"));
            }
            let sess = root.join("sessions");
            if let Ok(rd) = std::fs::read_dir(sess) {
                for ent in rd.flatten() {
                    let p = ent.path();
                    if p.extension().and_then(|e| e.to_str()) == Some("md") {
                        paths.push(p);
                    }
                }
            }
        }
    }
    let mut removed = 0u32;
    let mut touched: Vec<String> = Vec::new();
    for p in paths {
        if let Ok(n) = forget_in_file(&p, q) {
            if n > 0 {
                removed += n;
                touched.push(p.display().to_string());
            }
        }
    }
    let status = memory_status(project)?;
    Ok(MemoryForgetResult {
        removed_lines: removed,
        files_touched: touched,
        status,
    })
}

/// Delete one memory file under GROK_HOME/memory.
/// USER/AGENT/MEMORY.md are reset to seed instead of removed.
#[tauri::command]
pub fn memory_delete_file(path: String) -> Result<MemoryStatus, String> {
    let p = PathBuf::from(path.trim());
    let safe = assert_under_memory(&p)?;
    let name = safe
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if name == "USER.md" || name == "AGENT.md" || name == "MEMORY.md" {
        let seed = if name == "USER.md" {
            "# 用户画像 (USER)\n\n> 跨任务偏好。Agent 开局会加载此文件。\n\n## 沟通\n\n## 技术偏好\n\n## 禁忌\n\n"
        } else if name == "AGENT.md" {
            "# 工作笔记 (AGENT)\n\n> 环境、工具链、通用习惯。\n\n## 环境\n\n## 教训\n\n"
        } else {
            "# 项目记忆\n\n## 约定\n\n## 命令\n\n## 坑\n\n"
        };
        std::fs::write(&safe, seed).map_err(|e| e.to_string())?;
    } else if safe.is_file() {
        std::fs::remove_file(&safe).map_err(|e| e.to_string())?;
    }
    memory_status(None)
}
