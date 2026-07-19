//! Multi-provider / custom models → GROK_HOME/config.toml [model.*]
//! OpenCode-style: hang multiple endpoints, pick models in UI.

use crate::paths::{config_toml_path, ensure_dirs, grok_home};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomModelRow {
    /// Config section id, e.g. openai-gpt4o
    pub id: String,
    /// Wire model id sent to API
    pub model: String,
    pub name: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    /// chat_completions | responses | messages
    #[serde(default = "default_backend")]
    pub api_backend: String,
    #[serde(default)]
    pub provider_label: String,
    #[serde(default)]
    pub context_window: Option<u64>,
}

fn default_backend() -> String {
    "chat_completions".into()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsConfigSnapshot {
    pub grok_home: String,
    pub config_path: String,
    pub custom_models: Vec<CustomModelRow>,
    pub default_model: Option<String>,
    pub note: String,
}

fn sanitize_id(raw: &str) -> String {
    let s: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let s = s.trim_matches('-').to_string();
    if s.is_empty() {
        format!("model-{}", chrono_like_id())
    } else {
        s
    }
}

fn chrono_like_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "x".into())
}

/// Parse existing [model.*] blocks (minimal TOML awareness).
pub fn list_custom_models() -> Result<ModelsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let mut models = Vec::new();
    let mut default_model = None;
    let mut cur_id: Option<String> = None;
    let mut cur = CustomModelRow {
        id: String::new(),
        model: String::new(),
        name: String::new(),
        base_url: String::new(),
        api_key: String::new(),
        api_backend: default_backend(),
        provider_label: String::new(),
        context_window: None,
    };
    let mut in_models = false;

    let flush = |id: &Option<String>, cur: &CustomModelRow, out: &mut Vec<CustomModelRow>| {
        if let Some(id) = id {
            if !id.is_empty() && (!cur.base_url.is_empty() || !cur.model.is_empty()) {
                let mut m = cur.clone();
                m.id = id.clone();
                if m.name.is_empty() {
                    m.name = m.model.clone();
                }
                if m.model.is_empty() {
                    m.model = id.clone();
                }
                out.push(m);
            }
        }
    };

    for line in raw.lines() {
        let t = line.trim();
        if t.starts_with('[') {
            if t == "[models]" {
                flush(&cur_id, &cur, &mut models);
                cur_id = None;
                in_models = true;
                continue;
            }
            if let Some(rest) = t.strip_prefix("[model.") {
                flush(&cur_id, &cur, &mut models);
                in_models = false;
                let id = rest.trim_end_matches(']').trim().to_string();
                cur_id = Some(id.clone());
                cur = CustomModelRow {
                    id: id.clone(),
                    model: String::new(),
                    name: String::new(),
                    base_url: String::new(),
                    api_key: String::new(),
                    api_backend: default_backend(),
                    provider_label: String::new(),
                    context_window: None,
                };
                continue;
            }
            flush(&cur_id, &cur, &mut models);
            cur_id = None;
            in_models = false;
            continue;
        }
        if in_models {
            if let Some(v) = parse_str_assign(t, "default") {
                default_model = Some(v);
            }
            continue;
        }
        if cur_id.is_none() {
            continue;
        }
        if let Some(v) = parse_str_assign(t, "model") {
            cur.model = v;
        } else if let Some(v) = parse_str_assign(t, "name") {
            cur.name = v;
        } else if let Some(v) = parse_str_assign(t, "base_url") {
            cur.base_url = v;
        } else if let Some(v) = parse_str_assign(t, "api_key") {
            cur.api_key = v;
        } else if let Some(v) = parse_str_assign(t, "api_backend") {
            cur.api_backend = v;
        } else if let Some(v) = parse_str_assign(t, "env_key") {
            if cur.api_key.is_empty() {
                cur.api_key = format!("env:{v}");
            }
        } else if let Some(n) = parse_u64_assign(t, "context_window") {
            cur.context_window = Some(n);
        }
    }
    flush(&cur_id, &cur, &mut models);

    Ok(ModelsConfigSnapshot {
        grok_home: grok_home().display().to_string(),
        config_path: path.display().to_string(),
        custom_models: models,
        default_model,
        note: "Custom models live in App GROK_HOME config.toml (OpenCode-style multi-provider)."
            .into(),
    })
}

fn parse_str_assign(line: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}");
    if !line.starts_with(&prefix) {
        return None;
    }
    let rest = line[key.len()..].trim();
    let rest = rest.strip_prefix('=')?.trim();
    let rest = rest.trim_matches('"').trim_matches('\'').to_string();
    Some(rest)
}

fn parse_u64_assign(line: &str, key: &str) -> Option<u64> {
    parse_str_assign(line, key)?.parse().ok()
}

fn escape_toml_str(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Upsert one [model.<id>] block and optional default.
#[tauri::command]
pub fn models_list_custom() -> Result<ModelsConfigSnapshot, String> {
    list_custom_models()
}

#[tauri::command]
pub fn models_upsert_custom(model: CustomModelRow) -> Result<ModelsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let id = sanitize_id(if model.id.trim().is_empty() {
        &model.name
    } else {
        &model.id
    });
    if model.base_url.trim().is_empty() {
        return Err("base_url required".into());
    }
    if model.model.trim().is_empty() {
        return Err("model id required".into());
    }
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let section = format!("[model.{id}]");
    let mut body = String::new();
    body.push_str(&format!("model = \"{}\"\n", escape_toml_str(model.model.trim())));
    body.push_str(&format!(
        "name = \"{}\"\n",
        escape_toml_str(if model.name.trim().is_empty() {
            model.model.trim()
        } else {
            model.name.trim()
        })
    ));
    body.push_str(&format!(
        "base_url = \"{}\"\n",
        escape_toml_str(model.base_url.trim())
    ));
    let backend = match model.api_backend.trim() {
        "responses" | "messages" => model.api_backend.trim(),
        _ => "chat_completions",
    };
    body.push_str(&format!("api_backend = \"{backend}\"\n"));
    if !model.api_key.trim().is_empty() && !model.api_key.starts_with("env:") {
        body.push_str(&format!(
            "api_key = \"{}\"\n",
            escape_toml_str(model.api_key.trim())
        ));
    } else if let Some(env) = model.api_key.strip_prefix("env:") {
        body.push_str(&format!("env_key = \"{}\"\n", escape_toml_str(env.trim())));
    }
    if let Some(cw) = model.context_window {
        body.push_str(&format!("context_window = {cw}\n"));
    }

    let new_raw = upsert_toml_section(&raw, &section, &body);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, new_raw).map_err(|e| e.to_string())?;
    list_custom_models()
}

#[tauri::command]
pub fn models_remove_custom(id: String) -> Result<ModelsConfigSnapshot, String> {
    let id = sanitize_id(&id);
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let section = format!("[model.{id}]");
    let new_raw = remove_toml_section(&raw, &section);
    fs::write(&path, new_raw).map_err(|e| e.to_string())?;
    list_custom_models()
}

#[tauri::command]
pub fn models_set_default(model_id: String) -> Result<ModelsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let id = model_id.trim();
    if id.is_empty() {
        return Err("model id required".into());
    }
    let body = format!("default = \"{}\"\n", escape_toml_str(id));
    let new_raw = upsert_toml_section(&raw, "[models]", &body);
    fs::write(&path, new_raw).map_err(|e| e.to_string())?;
    list_custom_models()
}

#[tauri::command]
pub fn models_open_config() -> Result<String, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    if !path.exists() {
        fs::write(
            &path,
            "# gorkX / Grok engine config (App GROK_HOME)\n\n[models]\n# default = \"grok-build\"\n",
        )
        .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path).status();
    }
    Ok(path.display().to_string())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTestResult {
    pub ok: bool,
    pub status: u16,
    pub latency_ms: u64,
    pub note: String,
}

/// Probe a custom OpenAI/Anthropic-compatible endpoint (does not change config).
#[tauri::command]
pub fn models_test_connection(model: CustomModelRow) -> Result<ModelTestResult, String> {
    let base = model.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("base_url required".into());
    }
    let mid = model.model.trim();
    if mid.is_empty() {
        return Err("model id required".into());
    }
    let key = model.api_key.trim();
    let key = if let Some(envn) = key.strip_prefix("env:") {
        std::env::var(envn.trim()).unwrap_or_default()
    } else {
        key.to_string()
    };
    let backend = match model.api_backend.trim() {
        "responses" | "messages" => model.api_backend.trim(),
        _ => "chat_completions",
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .user_agent("gorkX-model-test/0.4.3")
        .build()
        .map_err(|e| e.to_string())?;

    let started = std::time::Instant::now();
    let (url, body, auth_header) = match backend {
        "messages" => {
            // Anthropic Messages API
            let url = if base.ends_with("/v1") {
                format!("{base}/messages")
            } else {
                format!("{base}/v1/messages")
            };
            let body = serde_json::json!({
                "model": mid,
                "max_tokens": 8,
                "messages": [{"role":"user","content":"ping"}]
            });
            (url, body, ("x-api-key", "anthropic-version"))
        }
        "responses" => {
            let url = if base.contains("/responses") {
                base.to_string()
            } else if base.ends_with("/v1") {
                format!("{base}/responses")
            } else {
                format!("{base}/v1/responses")
            };
            let body = serde_json::json!({
                "model": mid,
                "input": "ping",
                "max_output_tokens": 8
            });
            (url, body, ("authorization", ""))
        }
        _ => {
            let url = if base.ends_with("/chat/completions") {
                base.to_string()
            } else if base.ends_with("/v1") {
                format!("{base}/chat/completions")
            } else {
                format!("{base}/chat/completions")
            };
            // Prefer /v1/chat/completions when base looks like host root
            let url = if url.ends_with("/chat/completions") && !base.contains("/v1") && !base.ends_with("/chat/completions") {
                format!("{base}/v1/chat/completions")
            } else {
                url
            };
            let body = serde_json::json!({
                "model": mid,
                "messages": [{"role":"user","content":"ping"}],
                "max_tokens": 4
            });
            (url, body, ("authorization", ""))
        }
    };

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body);
    if !key.is_empty() {
        if auth_header.0 == "x-api-key" {
            req = req
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01");
        } else {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
    }
    let resp = match req.send() {
        Ok(r) => r,
        Err(e) => {
            return Ok(ModelTestResult {
                ok: false,
                status: 0,
                latency_ms: started.elapsed().as_millis() as u64,
                note: format!("网络错误: {e}"),
            });
        }
    };
    let status = resp.status().as_u16();
    let latency_ms = started.elapsed().as_millis() as u64;
    let text = resp.text().unwrap_or_default();
    let ok = (200..300).contains(&status);
    let snippet: String = text.chars().take(160).collect();
    let note = if ok {
        format!("连接成功 · HTTP {status} · {latency_ms} ms")
    } else if status == 401 || status == 403 {
        format!("鉴权失败 HTTP {status} — 检查 API Key · {snippet}")
    } else if status == 404 {
        format!("路径不存在 HTTP 404 — 检查 base_url 是否含 /v1 · {snippet}")
    } else {
        format!("HTTP {status} · {snippet}")
    };
    Ok(ModelTestResult {
        ok,
        status,
        latency_ms,
        note,
    })
}

/// Merge keys from `body` into section; keep other keys in section when possible (replace whole section for simplicity).
fn upsert_toml_section(raw: &str, section_header: &str, body: &str) -> String {
    let lines: Vec<&str> = raw.lines().collect();
    let mut out = String::new();
    let mut i = 0;
    let mut replaced = false;
    while i < lines.len() {
        let t = lines[i].trim();
        if t == section_header || t.starts_with(&format!("{section_header}")) && t == section_header
        {
            // skip old section
            i += 1;
            while i < lines.len() {
                let n = lines[i].trim();
                if n.starts_with('[') {
                    break;
                }
                i += 1;
            }
            if !out.ends_with('\n') && !out.is_empty() {
                out.push('\n');
            }
            out.push_str(section_header);
            out.push('\n');
            out.push_str(body);
            if !body.ends_with('\n') {
                out.push('\n');
            }
            replaced = true;
            continue;
        }
        out.push_str(lines[i]);
        out.push('\n');
        i += 1;
    }
    if !replaced {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        out.push('\n');
        out.push_str(section_header);
        out.push('\n');
        out.push_str(body);
        if !body.ends_with('\n') {
            out.push('\n');
        }
    }
    out
}

fn remove_toml_section(raw: &str, section_header: &str) -> String {
    let lines: Vec<&str> = raw.lines().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < lines.len() {
        let t = lines[i].trim();
        if t == section_header {
            i += 1;
            while i < lines.len() {
                let n = lines[i].trim();
                if n.starts_with('[') {
                    break;
                }
                i += 1;
            }
            continue;
        }
        out.push_str(lines[i]);
        out.push('\n');
        i += 1;
    }
    out
}

#[allow(dead_code)]
pub fn config_path() -> PathBuf {
    config_toml_path()
}
