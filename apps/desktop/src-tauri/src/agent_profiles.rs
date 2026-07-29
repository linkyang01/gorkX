//! Desktop management for Grok Build's native agent definition files.
//!
//! Grok Build discovers `$GROK_HOME/agents/*.md` at process startup.  gorkX
//! writes only files beginning with `gorkx-`, keeping manually-created engine
//! profiles visible but never editing or deleting them.

use serde::Serialize;
use std::path::{Path, PathBuf};

const PREFIX: &str = "gorkx-";
const MAX_BODY_CHARS: usize = 12_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfileSummary {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub source: String,
    pub editable: bool,
    pub content: Option<String>,
}

fn agents_dir() -> PathBuf { crate::paths::grok_home().join("agents") }

fn is_safe_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric())
        && name.len() <= 80
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
}

fn refuse_symlink(path: &Path) -> Result<(), String> {
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() { return Err("Agent profile path must not be a symbolic link.".into()); }
    }
    Ok(())
}

fn quoted(value: &str) -> String {
    value.trim().trim_matches('"').trim_matches('\'').to_string()
}

fn read_profile(path: &Path) -> Result<AgentProfileSummary, String> {
    refuse_symlink(path)?;
    let content = std::fs::read_to_string(path).map_err(|e| format!("read agent profile: {e}"))?;
    if content.len() > 64 * 1024 { return Err("Agent profile is too large.".into()); }
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") { return Err("Agent profile is missing YAML frontmatter.".into()); }
    let Some(end) = trimmed[3..].find("\n---") else { return Err("Agent profile frontmatter is incomplete.".into()); };
    let yaml = &trimmed[3..3 + end];
    let mut name = String::new();
    let mut display_name = String::new();
    let mut description = String::new();
    for line in yaml.lines() {
        if let Some(value) = line.trim().strip_prefix("name:") { name = quoted(value); }
        if let Some(value) = line.trim().strip_prefix("displayName:") { display_name = quoted(value); }
        if let Some(value) = line.trim().strip_prefix("description:") { description = quoted(value); }
    }
    if !is_safe_name(&name) { return Err("Agent profile has an invalid name.".into()); }
    if description.is_empty() { description = "Custom Grok Build role".into(); }
    if display_name.is_empty() { display_name = name.clone(); }
    let editable = name.starts_with(PREFIX) && path.file_name().and_then(|v| v.to_str()) == Some(&format!("{name}.md"));
    Ok(AgentProfileSummary {
        name,
        display_name,
        description,
        source: "个人角色".into(),
        editable,
        content: editable.then_some(content),
    })
}

#[tauri::command]
pub fn agent_profiles_list() -> Result<Vec<AgentProfileSummary>, String> {
    let dir = agents_dir();
    if !dir.exists() { return Ok(Vec::new()); }
    refuse_symlink(&dir)?;
    let mut profiles = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| format!("read agent profiles: {e}"))? {
        let path = entry.map_err(|e| format!("read agent profile: {e}"))?.path();
        if path.extension().and_then(|v| v.to_str()) != Some("md") || !path.is_file() { continue; }
        if let Ok(profile) = read_profile(&path) { profiles.push(profile); }
    }
    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(profiles)
}

#[tauri::command]
pub fn agent_profile_save(display_name: String, description: String, instructions: String) -> Result<AgentProfileSummary, String> {
    let display_name = display_name.trim().replace(['\r', '\n'], " ");
    if display_name.is_empty() || display_name.chars().count() > 80 { return Err("Role name must be between 1 and 80 characters.".into()); }
    let description = description.trim().replace('\n', " ");
    if description.is_empty() || description.chars().count() > 240 { return Err("Role description must be between 1 and 240 characters.".into()); }
    let instructions = instructions.replace("\r\n", "\n").trim().to_string();
    if instructions.is_empty() || instructions.chars().count() > MAX_BODY_CHARS || instructions.contains('\0') { return Err("Role instructions must be between 1 and 12000 valid characters.".into()); }
    let dir = agents_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("create agent profiles folder: {e}"))?;
    refuse_symlink(&dir)?;
    let stem = display_name.to_ascii_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect::<String>();
    let stem = stem.trim_matches('-');
    let name = if stem.is_empty() { format!("{PREFIX}role-{:x}", chrono::Utc::now().timestamp_millis()) } else { format!("{PREFIX}{}", &stem[..stem.len().min(60)]) };
    if !is_safe_name(&name) { return Err("Role name is not supported.".into()); }
    let path = dir.join(format!("{name}.md"));
    refuse_symlink(&path)?;
    let escaped_description = description.replace(['"', '\r'], "'");
    let escaped_display_name = display_name.replace(['"', '\r'], "'");
    let content = format!("---\nname: {name}\ndisplayName: \"{escaped_display_name}\"\ndescription: \"{escaped_description}\"\npromptMode: extend\npermissionMode: default\n---\n\n{instructions}\n");
    let temp = dir.join(format!(".{name}.tmp-{}", std::process::id()));
    refuse_symlink(&temp)?;
    std::fs::write(&temp, content).map_err(|e| format!("write agent profile: {e}"))?;
    std::fs::rename(&temp, &path).map_err(|e| format!("save agent profile: {e}"))?;
    read_profile(&path)
}

#[tauri::command]
pub fn agent_profile_remove(name: String) -> Result<(), String> {
    let name = name.trim();
    if !name.starts_with(PREFIX) || !is_safe_name(name) { return Err("Only gorkX-created roles can be removed here.".into()); }
    let path = agents_dir().join(format!("{name}.md"));
    refuse_symlink(&path)?;
    if path.exists() { std::fs::remove_file(path).map_err(|e| format!("remove agent profile: {e}"))?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_safe_name;
    #[test] fn accepts_engine_safe_role_names() { assert!(is_safe_name("gorkx-report_writer")); assert!(!is_safe_name("gorkx role")); }
}
