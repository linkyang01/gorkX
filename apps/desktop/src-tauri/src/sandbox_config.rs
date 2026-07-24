//! Desktop-safe selection of Grok Build's built-in sandbox profiles.
//!
//! This writes only the documented `[sandbox].profile` value in the App-owned
//! `GROK_HOME/config.toml`. The kernel applies it when a *new* agent process
//! starts; gorkX never pretends it can retrofit an OS sandbox onto a live task.

use crate::paths::{config_toml_path, ensure_dirs, grok_home};
use serde::Serialize;
use std::fs;

const BUILTIN_PROFILES: &[&str] = &["off", "workspace", "read-only", "strict", "devbox"];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxConfigSnapshot {
    pub grok_home: String,
    pub config_path: String,
    /// `None` means the kernel default (`off`) is in effect.
    pub profile: Option<String>,
    pub note: String,
}

fn parse_string_assign(line: &str, key: &str) -> Option<String> {
    let (left, right) = line.split_once('=')?;
    if left.trim() != key {
        return None;
    }
    let value = right.trim().split('#').next()?.trim();
    let value = value.strip_prefix('"')?.strip_suffix('"')?;
    (!value.is_empty()).then(|| value.to_string())
}

fn section_range(raw: &str, section: &str) -> Option<(usize, usize)> {
    let marker = format!("[{section}]");
    let start = raw
        .lines()
        .scan(0usize, |offset, line| {
            let at = *offset;
            *offset += line.len() + 1;
            Some((at, line))
        })
        .find_map(|(at, line)| (line.trim() == marker).then_some(at))?;
    let tail = &raw[start + marker.len()..];
    let end = tail
        .find("\n[")
        .map(|at| start + marker.len() + at + 1)
        .unwrap_or(raw.len());
    Some((start, end))
}

fn upsert_profile(raw: &str, profile: &str) -> String {
    let line = format!("profile = \"{profile}\"");
    if let Some((start, end)) = section_range(raw, "sandbox") {
        let existing = &raw[start..end];
        let mut replaced = false;
        let body = existing
            .lines()
            .map(|current| {
                if parse_string_assign(current.trim(), "profile").is_some() {
                    replaced = true;
                    line.clone()
                } else {
                    current.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        let body = if replaced { body } else { format!("{body}\n{line}") };
        format!("{}{}{}", &raw[..start], body, &raw[end..])
    } else {
        let prefix = if raw.trim().is_empty() {
            String::new()
        } else {
            format!("{}\n\n", raw.trim_end())
        };
        format!("{prefix}[sandbox]\n{line}\n")
    }
}

fn read_snapshot() -> Result<SandboxConfigSnapshot, String> {
    ensure_dirs()?;
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let mut section = "";
    let mut profile = None;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed.trim_matches(['[', ']']).trim();
            continue;
        }
        if section == "sandbox" {
            if let Some(value) = parse_string_assign(trimmed, "profile") {
                profile = Some(value);
            }
        }
    }
    Ok(SandboxConfigSnapshot {
        grok_home: grok_home().display().to_string(),
        config_path: path.display().to_string(),
        profile,
        note: "Applies only when gorkX starts a new Grok Build agent for a project. Running tasks keep their existing kernel sandbox.".into(),
    })
}

#[tauri::command]
pub fn sandbox_config_get() -> Result<SandboxConfigSnapshot, String> {
    read_snapshot()
}

#[tauri::command]
pub fn sandbox_config_set_profile(profile: String) -> Result<SandboxConfigSnapshot, String> {
    if !BUILTIN_PROFILES.contains(&profile.as_str()) {
        return Err("profile must be one of: off, workspace, read-only, strict, devbox".into());
    }
    ensure_dirs()?;
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    fs::write(&path, upsert_profile(&raw, &profile)).map_err(|e| e.to_string())?;
    read_snapshot()
}

#[cfg(test)]
mod tests {
    use super::{parse_string_assign, upsert_profile};

    #[test]
    fn sandbox_upsert_preserves_other_sections() {
        let raw = "[models]\ndefault = \"grok\"\n\n[sandbox]\nprofile = \"off\"\n\n[subagents]\nenabled = true\n";
        let next = upsert_profile(raw, "read-only");
        assert!(next.contains("[models]\ndefault = \"grok\""));
        assert!(next.contains("[sandbox]\nprofile = \"read-only\""));
        assert!(next.contains("[subagents]\nenabled = true"));
    }

    #[test]
    fn parser_requires_a_quoted_string() {
        assert_eq!(parse_string_assign("profile = \"strict\" # explicit", "profile"), Some("strict".into()));
        assert_eq!(parse_string_assign("profile = strict", "profile"), None);
    }
}
