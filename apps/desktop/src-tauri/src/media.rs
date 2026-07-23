//! Safe persistence for binary ACP image blocks.
//!
//! Images are written under App data, never embedded in SQLite, logs, or a
//! transcript string. The WebView receives only an app-local file path.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};

const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const MAX_BASE64_CHARS: usize = 17 * 1024 * 1024;
static IMAGE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedAgentImage {
    pub path: String,
    pub name: String,
    pub size: usize,
}

fn safe_thread_id(thread_id: &str) -> Result<&str, String> {
    if thread_id.is_empty()
        || thread_id.len() > 128
        || !thread_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid media thread id".into());
    }
    Ok(thread_id)
}

fn media_kind(mime_type: &str, bytes: &[u8]) -> Result<(&'static str, &'static str), String> {
    match mime_type {
        "image/png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Ok(("png", "image")),
        "image/jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Ok(("jpg", "image")),
        "image/gif" if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => Ok(("gif", "image")),
        "image/webp"
            if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" =>
        {
            Ok(("webp", "image"))
        }
        "image/png" | "image/jpeg" | "image/gif" | "image/webp" => {
            Err("image data does not match its declared MIME type".into())
        }
        _ => Err("unsupported ACP image MIME type".into()),
    }
}

fn media_dir(thread_id: &str) -> Result<std::path::PathBuf, String> {
    let root = crate::store::db_path()?
        .parent()
        .ok_or_else(|| "missing app data directory".to_string())?
        .join("media")
        .join(safe_thread_id(thread_id)?);
    fs::create_dir_all(&root).map_err(|e| format!("create media directory: {e}"))?;
    Ok(root)
}

fn persist_image(dir: &std::path::Path, mime_type: &str, bytes: &[u8]) -> Result<SavedAgentImage, String> {
    let (extension, _) = media_kind(mime_type.trim(), bytes)?;
    fs::create_dir_all(dir).map_err(|e| format!("create media directory: {e}"))?;
    let seq = IMAGE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let name = format!("agent-{}-{}.{}", chrono::Utc::now().timestamp_millis(), seq, extension);
    let final_path = dir.join(&name);
    let temp_path = dir.join(format!(".{name}.tmp"));
    fs::write(&temp_path, bytes).map_err(|e| format!("write agent image: {e}"))?;
    fs::rename(&temp_path, &final_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("finalize agent image: {e}")
    })?;
    Ok(SavedAgentImage {
        path: final_path.display().to_string(),
        name,
        size: bytes.len(),
    })
}

#[tauri::command]
pub fn media_save_agent_image(
    thread_id: String,
    data: String,
    mime_type: String,
) -> Result<SavedAgentImage, String> {
    if data.is_empty() || data.len() > MAX_BASE64_CHARS || data.contains(',') {
        return Err("invalid or oversized ACP image payload".into());
    }
    let bytes = STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "invalid ACP image encoding".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err("ACP image exceeds the 12 MiB limit".into());
    }
    let dir = media_dir(&thread_id)?;
    persist_image(&dir, &mime_type, &bytes)
}

pub fn remove_thread_media(thread_id: &str) {
    let Ok(root) = crate::store::db_path().map(|path| path.parent().map(|p| p.join("media")).unwrap_or_default()) else {
        return;
    };
    let Ok(id) = safe_thread_id(thread_id) else { return };
    let _ = fs::remove_dir_all(root.join(id));
}

#[cfg(test)]
mod tests {
    use super::{media_kind, persist_image};
    use std::fs;

    #[test]
    fn accepts_only_matching_raster_headers() {
        assert_eq!(media_kind("image/png", b"\x89PNG\r\n\x1a\nbody").unwrap().0, "png");
        assert_eq!(media_kind("image/jpeg", &[0xff, 0xd8, 0xff, 0xdb]).unwrap().0, "jpg");
        assert!(media_kind("image/png", b"not an image").is_err());
        assert!(media_kind("image/svg+xml", b"<svg/>").is_err());
    }

    #[test]
    fn persists_and_reads_back_validated_image() {
        let dir = std::env::temp_dir().join(format!(
            "gorkx-media-test-{}-{}",
            std::process::id(),
            super::IMAGE_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        ));
        let bytes = b"\x89PNG\r\n\x1a\nvalidated-image";
        let saved = persist_image(&dir, "image/png", bytes).unwrap();
        assert_eq!(saved.size, bytes.len());
        assert_eq!(fs::read(&saved.path).unwrap(), bytes);
        assert!(!dir.join(format!(".{}.tmp", saved.name)).exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
