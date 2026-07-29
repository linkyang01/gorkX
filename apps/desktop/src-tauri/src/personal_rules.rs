//! A single app-owned Grok Build rules file for everyday personal preferences.
//!
//! Grok Build loads `$GROK_HOME/rules/*.md` into every new agent process. The
//! desktop edits only this fixed file instead of exposing a command line or
//! arbitrary filesystem path.

use serde::Serialize;
use std::path::{Path, PathBuf};

const PERSONAL_RULES_FILE: &str = "gorkx-personal.md";
const MAX_RULES_CHARS: usize = 12_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalRulesSnapshot {
    pub content: String,
    pub path: String,
}

fn rules_dir() -> PathBuf {
    crate::paths::grok_home().join("rules")
}

fn rules_path() -> PathBuf {
    rules_dir().join(PERSONAL_RULES_FILE)
}

fn refuse_symlink(path: &Path, label: &str) -> Result<(), String> {
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            return Err(format!("Personal instructions {label} must not be a symbolic link."));
        }
    }
    Ok(())
}

fn normalized_content(content: String) -> Result<String, String> {
    if content.contains('\0') {
        return Err("Personal instructions contain an invalid character.".into());
    }
    if content.chars().count() > MAX_RULES_CHARS {
        return Err(format!("Personal instructions are limited to {MAX_RULES_CHARS} characters."));
    }
    Ok(content.replace("\r\n", "\n").trim().to_string())
}

#[tauri::command]
pub fn personal_rules_get() -> Result<PersonalRulesSnapshot, String> {
    let dir = rules_dir();
    let path = rules_path();
    refuse_symlink(&dir, "folder")?;
    refuse_symlink(&path, "file")?;
    let content = if path.is_file() {
        normalized_content(std::fs::read_to_string(&path).map_err(|e| format!("read personal instructions: {e}"))?)?
    } else {
        String::new()
    };
    Ok(PersonalRulesSnapshot { content, path: path.display().to_string() })
}

#[tauri::command]
pub fn personal_rules_set(content: String) -> Result<PersonalRulesSnapshot, String> {
    let content = normalized_content(content)?;
    let dir = rules_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("create personal instructions folder: {e}"))?;
    refuse_symlink(&dir, "folder")?;
    let path = rules_path();
    refuse_symlink(&path, "file")?;

    if content.is_empty() {
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("clear personal instructions: {e}"))?;
        }
    } else {
        let temp = dir.join(format!(".{PERSONAL_RULES_FILE}.tmp-{}", std::process::id()));
        refuse_symlink(&temp, "temporary file")?;
        std::fs::write(&temp, format!("{content}\n"))
            .map_err(|e| format!("write personal instructions: {e}"))?;
        std::fs::rename(&temp, &path).map_err(|e| format!("save personal instructions: {e}"))?;
    }

    Ok(PersonalRulesSnapshot { content, path: path.display().to_string() })
}

#[cfg(test)]
mod tests {
    use super::normalized_content;

    #[test]
    fn normalizes_line_endings_and_whitespace() {
        assert_eq!(normalized_content("\r\nWrite clearly.\r\n".into()).unwrap(), "Write clearly.");
    }

    #[test]
    fn rejects_nul_character() {
        assert!(normalized_content("No\0pe".into()).is_err());
    }
}
