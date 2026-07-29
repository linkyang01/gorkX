//! App-owned Grok Build media-tool policy in `GROK_HOME/config.toml`.
use crate::paths::{config_toml_path, ensure_dirs, grok_home};
use serde::Serialize;
use std::fs;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaToolsConfigSnapshot {
    pub grok_home: String,
    pub image_gen_enabled: Option<bool>,
    pub video_gen_enabled: Option<bool>,
    /// Optional engine-native model preference for the `image_edit` tool.
    /// An empty value means the kernel chooses its default.
    pub image_edit_model_override: Option<String>,
    pub note: String,
}
fn bool_at(raw: &str, key: &str) -> Option<bool> {
    let needle_true = format!("{key} = true");
    let needle_false = format!("{key} = false");
    if raw.contains(&needle_true) {
        Some(true)
    } else if raw.contains(&needle_false) {
        Some(false)
    } else {
        None
    }
}
fn string_at(raw: &str, key: &str) -> Option<String> {
    raw.lines().find_map(|line| {
        let (name, value) = line.split_once('=')?;
        if name.trim() != key {
            return None;
        }
        let value = value.trim();
        value
            .strip_prefix('"')?
            .strip_suffix('"')
            .map(|value| value.replace(r#"\""#, "\"").replace(r#"\\"#, "\\"))
    })
}
fn upsert(raw: &str, key: &str, value: bool) -> String {
    let line = format!("{key} = {value}");
    if let Some(start) = raw
        .lines()
        .scan(0usize, |o, l| {
            let at = *o;
            *o += l.len() + 1;
            Some((at, l))
        })
        .find_map(|(at, l)| (l.trim() == "[features]").then_some(at))
    {
        let tail = &raw[start..];
        let end = tail.find("\n[").map(|n| start + n + 1).unwrap_or(raw.len());
        let body = &raw[start..end];
        let mut seen = false;
        let body = body
            .lines()
            .map(|l| {
                if l.split_once('=').is_some_and(|(a, _)| a.trim() == key) {
                    seen = true;
                    line.clone()
                } else {
                    l.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        format!(
            "{}{}{}",
            &raw[..start],
            if seen {
                body
            } else {
                format!("{body}\n{line}")
            },
            &raw[end..]
        )
    } else {
        format!(
            "{}[features]\n{line}\n",
            if raw.trim().is_empty() {
                String::new()
            } else {
                format!("{}\n\n", raw.trim_end())
            }
        )
    }
}
fn upsert_string(raw: &str, key: &str, value: Option<&str>) -> String {
    let existing = raw.lines().filter(|line| {
        line.split_once('=')
            .is_some_and(|(name, _)| name.trim() == key)
    });
    let contains = existing.count() > 0;
    let without = raw
        .lines()
        .filter(|line| {
            !line
                .split_once('=')
                .is_some_and(|(name, _)| name.trim() == key)
        })
        .collect::<Vec<_>>()
        .join("\n");
    match value {
        Some(value) => {
            let escaped = value.replace('\\', r#"\\"#).replace('"', r#"\""#);
            let next = upsert(&without, key, true);
            let value_line = format!("{key} = \"{escaped}\"");
            next.lines()
                .map(|line| {
                    if line.trim() == format!("{key} = true") {
                        value_line.clone()
                    } else {
                        line.to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
                + "\n"
        }
        None if contains => format!("{}\n", without.trim_end()),
        None => raw.to_string(),
    }
}
fn read() -> Result<MediaToolsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let raw = fs::read_to_string(config_toml_path()).unwrap_or_default();
    Ok(MediaToolsConfigSnapshot{grok_home:grok_home().display().to_string(),image_gen_enabled:bool_at(&raw,"image_gen_enabled"),video_gen_enabled:bool_at(&raw,"video_gen_enabled"),image_edit_model_override:string_at(&raw,"image_edit_model_override"),note:"Applies to newly started Grok Build sessions; account policy and the engine remain the final capability gate.".into()})
}
#[tauri::command]
pub fn media_tools_config_get() -> Result<MediaToolsConfigSnapshot, String> {
    read()
}
#[tauri::command]
pub fn media_tools_config_set(
    kind: String,
    enabled: bool,
) -> Result<MediaToolsConfigSnapshot, String> {
    let key = match kind.as_str() {
        "image" => "image_gen_enabled",
        "video" => "video_gen_enabled",
        _ => return Err("kind must be image or video".into()),
    };
    let p = config_toml_path();
    let raw = fs::read_to_string(&p).unwrap_or_default();
    fs::write(&p, upsert(&raw, key, enabled)).map_err(|e| e.to_string())?;
    read()
}
#[tauri::command]
pub fn media_tools_image_edit_model_set(
    model_id: String,
) -> Result<MediaToolsConfigSnapshot, String> {
    let model_id = model_id.trim();
    if model_id.len() > 256 || model_id.chars().any(|c| c.is_control()) {
        return Err("model ID must be at most 256 printable characters".into());
    }
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    fs::write(
        &path,
        upsert_string(
            &raw,
            "image_edit_model_override",
            (!model_id.is_empty()).then_some(model_id),
        ),
    )
    .map_err(|e| e.to_string())?;
    read()
}

#[cfg(test)]
mod tests {
    use super::{bool_at, string_at, upsert, upsert_string};
    #[test]
    fn only_features_changes() {
        let raw="[models]\ndefault = \"grok\"\n\n[features]\nvideo_gen_enabled = true\n\n[subagents]\nenabled = false\n";
        let next = upsert(raw, "image_gen_enabled", false);
        assert!(next.contains("image_gen_enabled = false"), "{next}");
        assert_eq!(bool_at(&next, "image_gen_enabled"), Some(false));
        assert!(next.contains("video_gen_enabled = true"));
        assert!(next.contains("[models]\ndefault = \"grok\""));
        assert!(next.contains("[subagents]\nenabled = false"));
    }
    #[test]
    fn image_edit_override_is_a_features_value_and_can_be_cleared() {
        let raw = "[models]\ndefault = \"grok\"\n\n[features]\nimage_gen_enabled = true\n";
        let set = upsert_string(
            raw,
            "image_edit_model_override",
            Some("xai/grok-image-edit"),
        );
        assert_eq!(
            string_at(&set, "image_edit_model_override").as_deref(),
            Some("xai/grok-image-edit")
        );
        assert!(set.contains("[models]\ndefault = \"grok\""));
        let cleared = upsert_string(&set, "image_edit_model_override", None);
        assert_eq!(string_at(&cleared, "image_edit_model_override"), None);
        assert!(cleared.contains("image_gen_enabled = true"));
    }
}
