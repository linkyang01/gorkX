//! User-owned Grok Build subagent policy in App GROK_HOME/config.toml.
//!
//! The desktop never spawns an agent itself. These values are read by the
//! locked Grok Build kernel for *new* dispatches, matching its documented
//! `[subagents]` and `[subagents.toggle]` configuration.

use crate::paths::{config_toml_path, ensure_dirs, grok_home};
use serde::Serialize;
use std::fs;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentsConfigSnapshot {
    pub grok_home: String,
    pub config_path: String,
    /// `None` means Grok Build's documented default (enabled).
    pub enabled: Option<bool>,
    /// `None` means no per-type override.
    pub explore_enabled: Option<bool>,
    pub plan_enabled: Option<bool>,
    pub note: String,
}

fn parse_bool_assign(line: &str, key: &str) -> Option<bool> {
    let (left, right) = line.split_once('=')?;
    if left.trim() != key {
        return None;
    }
    match right.trim().split('#').next()?.trim() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn read_snapshot() -> Result<SubagentsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let mut section = "";
    let mut enabled = None;
    let mut explore_enabled = None;
    let mut plan_enabled = None;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed.trim_matches(['[', ']']).trim();
            continue;
        }
        match section {
            "subagents" => {
                if let Some(value) = parse_bool_assign(trimmed, "enabled") {
                    enabled = Some(value);
                }
            }
            "subagents.toggle" => {
                if let Some(value) = parse_bool_assign(trimmed, "explore") {
                    explore_enabled = Some(value);
                }
                if let Some(value) = parse_bool_assign(trimmed, "plan") {
                    plan_enabled = Some(value);
                }
            }
            _ => {}
        }
    }
    Ok(SubagentsConfigSnapshot {
        grok_home: grok_home().display().to_string(),
        config_path: path.display().to_string(),
        enabled,
        explore_enabled,
        plan_enabled,
        note: "These are Grok Build policy values for new dispatches. gorkX does not create a second subagent loop.".into(),
    })
}

fn section_range(raw: &str, section: &str) -> Option<(usize, usize)> {
    let marker = format!("[{section}]");
    let start = raw.lines().scan(0usize, |offset, line| {
        let at = *offset;
        *offset += line.len() + 1;
        Some((at, line))
    }).find_map(|(at, line)| (line.trim() == marker).then_some(at))?;
    let tail = &raw[start + marker.len()..];
    let end = tail.find("\n[").map(|at| start + marker.len() + at + 1).unwrap_or(raw.len());
    Some((start, end))
}

fn upsert_bool(raw: &str, section: &str, key: &str, value: bool) -> String {
    let line = format!("{key} = {value}");
    if let Some((start, end)) = section_range(raw, section) {
        let existing = &raw[start..end];
        let mut replaced = false;
        let body = existing.lines().map(|current| {
            if parse_bool_assign(current.trim(), key).is_some() {
                replaced = true;
                line.clone()
            } else {
                current.to_string()
            }
        }).collect::<Vec<_>>().join("\n");
        let body = if replaced { body } else { format!("{body}\n{line}") };
        format!("{}{}{}", &raw[..start], body, &raw[end..])
    } else {
        let prefix = if raw.trim().is_empty() { String::new() } else { format!("{}\n\n", raw.trim_end()) };
        format!("{prefix}[{section}]\n{line}\n")
    }
}

fn write_updated(raw: String) -> Result<SubagentsConfigSnapshot, String> {
    let path = config_toml_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, raw).map_err(|e| e.to_string())?;
    read_snapshot()
}

#[tauri::command]
pub fn subagents_config_get() -> Result<SubagentsConfigSnapshot, String> {
    read_snapshot()
}

#[tauri::command]
pub fn subagents_config_set_enabled(enabled: bool) -> Result<SubagentsConfigSnapshot, String> {
    let path = config_toml_path();
    let raw = fs::read_to_string(path).unwrap_or_default();
    write_updated(upsert_bool(&raw, "subagents", "enabled", enabled))
}

#[tauri::command]
pub fn subagents_config_set_type_enabled(
    agent_type: String,
    enabled: bool,
) -> Result<SubagentsConfigSnapshot, String> {
    let key = match agent_type.as_str() {
        "explore" | "plan" => agent_type,
        _ => return Err("only the built-in explore and plan agent types can be changed here".into()),
    };
    let path = config_toml_path();
    let raw = fs::read_to_string(path).unwrap_or_default();
    write_updated(upsert_bool(&raw, "subagents.toggle", &key, enabled))
}

#[cfg(test)]
mod tests {
    use super::{parse_bool_assign, upsert_bool};

    #[test]
    fn upsert_preserves_unrelated_config_and_replaces_only_target() {
        let raw = "[models]\ndefault = \"grok\"\n\n[subagents]\nenabled = false\n";
        let next = upsert_bool(raw, "subagents", "enabled", true);
        assert!(next.contains("[models]\ndefault = \"grok\""));
        assert!(next.contains("[subagents]\nenabled = true"));
        assert!(!next.contains("enabled = false"));
    }

    #[test]
    fn bool_parser_ignores_non_boolean_values() {
        assert_eq!(parse_bool_assign("enabled = true # explicit", "enabled"), Some(true));
        assert_eq!(parse_bool_assign("enabled = \"true\"", "enabled"), None);
    }
}
