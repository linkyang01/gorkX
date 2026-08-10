//! Multi-provider / custom models → GROK_HOME/config.toml [model.*]
//! OpenCode-style: hang multiple endpoints, pick models in UI.

use crate::paths::{config_toml_path, ensure_dirs, grok_home};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;

const KEYCHAIN_SERVICE: &str = "com.gorkx.model-api-key";

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
    #[serde(default)]
    pub has_keychain_secret: bool,
    #[serde(default)]
    pub has_plaintext_secret: bool,
    /// chat_completions | responses | messages
    #[serde(default = "default_backend")]
    pub api_backend: String,
    #[serde(default)]
    pub provider_label: String,
    /// App-owned representation of Grok Build's `query_params` inline table.
    #[serde(default)]
    pub query_params: BTreeMap<String, String>,
    /// Static per-model request headers. Never use this for API keys.
    #[serde(default)]
    pub extra_headers: BTreeMap<String, String>,
    /// Header name -> environment variable name. Values never enter gorkX.
    #[serde(default)]
    pub env_http_headers: BTreeMap<String, String>,
    #[serde(default)]
    pub context_window: Option<u64>,
}

fn keychain_account(id: &str) -> String { format!("gorkx:model:{}", sanitize_id(id)) }
fn key_env_name(id: &str) -> String { format!("GORKX_MODEL_{}", sanitize_id(id).replace('-', "_").to_ascii_uppercase()) }

#[cfg(target_os = "macos")]
fn keychain_store(id: &str, secret: &str) -> Result<(), String> {
    let status = std::process::Command::new("security")
        .args(["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", &keychain_account(id), "-w", secret])
        .status().map_err(|e| format!("macOS Keychain unavailable: {e}"))?;
    if status.success() { Ok(()) } else { Err("Could not save the API key in macOS Keychain.".into()) }
}
#[cfg(not(target_os = "macos"))]
fn keychain_store(_id: &str, _secret: &str) -> Result<(), String> { Err("Secure custom-model keys are currently supported on macOS only.".into()) }
#[cfg(target_os = "macos")]
fn keychain_read(id: &str) -> Option<String> {
    let out = std::process::Command::new("security").args(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", &keychain_account(id), "-w"]).output().ok()?;
    if !out.status.success() { return None; }
    let value = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (!value.is_empty()).then_some(value)
}
#[cfg(target_os = "macos")]
fn keychain_delete(id: &str) -> Result<(), String> {
    // Avoid reporting an absent item as an error: removal should be idempotent
    // when a model used an external env var or was imported without a secret.
    if keychain_read(id).is_none() {
        return Ok(());
    }
    let status = std::process::Command::new("security")
        .args(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", &keychain_account(id)])
        .status().map_err(|e| format!("macOS Keychain unavailable: {e}"))?;
    if status.success() { Ok(()) } else { Err("Could not remove the API key from macOS Keychain.".into()) }
}
#[cfg(not(target_os = "macos"))]
fn keychain_read(_id: &str) -> Option<String> { None }
#[cfg(not(target_os = "macos"))]
fn keychain_delete(_id: &str) -> Result<(), String> { Ok(()) }

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

/// A bounded, non-secret model id catalog returned by an already user-authorized
/// provider endpoint. Response bodies and keys never leave this command.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogResult {
    pub models: Vec<String>,
    pub status: u16,
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
        has_keychain_secret: false,
        has_plaintext_secret: false,
        api_backend: default_backend(),
        provider_label: String::new(),
        query_params: BTreeMap::new(),
        extra_headers: BTreeMap::new(),
        env_http_headers: BTreeMap::new(),
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
                    has_keychain_secret: false,
                    has_plaintext_secret: false,
                    api_backend: default_backend(),
                    provider_label: String::new(),
                    query_params: BTreeMap::new(),
                    extra_headers: BTreeMap::new(),
                    env_http_headers: BTreeMap::new(),
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
            cur.has_plaintext_secret = !v.is_empty();
        } else if let Some(v) = parse_str_assign(t, "api_backend") {
            cur.api_backend = v;
        } else if let Some(v) = parse_str_assign(t, "provider_label") {
            cur.provider_label = v;
        } else if let Some(v) = parse_inline_table_assign(t, "query_params") {
            cur.query_params = v;
        } else if let Some(v) = parse_inline_table_assign(t, "extra_headers") {
            cur.extra_headers = v;
        } else if let Some(v) = parse_inline_table_assign(t, "env_http_headers") {
            cur.env_http_headers = v;
        } else if let Some(v) = parse_str_assign(t, "env_key") {
            cur.api_key = format!("env:{v}");
            if v == key_env_name(cur_id.as_deref().unwrap_or_default()) {
                cur.has_keychain_secret = keychain_read(cur_id.as_deref().unwrap_or_default()).is_some();
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

/// Parse the bounded string-to-string TOML inline tables that gorkX emits for
/// model request metadata. Unknown/complex TOML stays untouched in the source
/// file; it simply is not surfaced as an editable row rather than being lost.
fn parse_inline_table_assign(line: &str, key: &str) -> Option<BTreeMap<String, String>> {
    let raw = line.strip_prefix(key)?.trim().strip_prefix('=')?.trim();
    let inner = raw.strip_prefix('{')?.strip_suffix('}')?.trim();
    let mut out = BTreeMap::new();
    if inner.is_empty() { return Some(out); }
    for pair in inner.split(',') {
        let (name, value) = pair.split_once('=')?;
        let name = name.trim().trim_matches('"').trim_matches('\'').to_string();
        let value = value.trim().trim_matches('"').trim_matches('\'').to_string();
        if !name.is_empty() && !value.is_empty() { out.insert(name, value); }
    }
    Some(out)
}

fn toml_inline_table(values: &BTreeMap<String, String>) -> Result<String, String> {
    if values.len() > 32 { return Err("at most 32 request parameters or headers".into()); }
    let mut items = Vec::new();
    for (key, value) in values {
        let key = key.trim();
        let value = value.trim();
        if key.is_empty() || value.is_empty() || key.len() > 160 || value.len() > 1_000 || key.contains(['\n', '\r', '"']) || value.contains(['\n', '\r']) {
            return Err("request parameter/header names and values must be single-line text".into());
        }
        items.push(format!("\"{}\" = \"{}\"", escape_toml_str(key), escape_toml_str(value)));
    }
    Ok(format!("{{ {} }}", items.join(", ")))
}

fn escape_toml_str(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Only allow endpoints that reqwest can safely send to without embedding a
/// credential in the URL. Local HTTP is intentionally allowed for Ollama.
fn validate_base_url(raw: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(raw.trim()).map_err(|_| "base_url must be a valid http(s) URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("base_url must be a valid http(s) URL".into());
    }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("base_url must not contain credentials, a query, or a fragment".into());
    }
    Ok(())
}

fn sensitive_request_field(raw: &str) -> bool {
    let key = raw.trim().to_ascii_lowercase().replace('_', "-");
    key == "authorization"
        || key == "proxy-authorization"
        || key == "cookie"
        || key == "set-cookie"
        || key == "api-key"
        || key == "x-api-key"
        || key == "apikey"
        || key.contains("token")
        || key.contains("secret")
        || key.contains("password")
}

fn valid_environment_name(raw: &str) -> bool {
    let mut chars = raw.chars();
    let Some(first) = chars.next() else { return false; };
    (first == '_' || first.is_ascii_alphabetic())
        && chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
        && raw.len() <= 128
}

fn validate_header_name(raw: &str, allow_secret: bool) -> Result<String, String> {
    let name = raw.trim();
    if name.is_empty() || name.len() > 160 {
        return Err("请求头名称不能为空且不能超过 160 个字符".into());
    }
    if !allow_secret && sensitive_request_field(name) {
        return Err("静态请求头不能保存 Authorization/API Key 等秘密；请改用 API Key 或环境变量请求头".into());
    }
    reqwest::header::HeaderName::from_bytes(name.as_bytes())
        .map_err(|_| format!("无效的请求头名称：{name}"))?;
    Ok(name.to_string())
}

fn validate_header_value(value: &str) -> Result<(), String> {
    if value.len() > 2_048 || value.contains(['\n', '\r']) {
        return Err("请求头值必须是单行且不超过 2048 个字符".into());
    }
    reqwest::header::HeaderValue::from_str(value)
        .map_err(|_| "请求头值包含无效字符".to_string())?;
    Ok(())
}

fn validate_provider_request_metadata(model: &CustomModelRow) -> Result<(), String> {
    if model.query_params.len() > 32 || model.extra_headers.len() > 32 || model.env_http_headers.len() > 32 {
        return Err("每类请求参数/请求头最多 32 项".into());
    }
    for (key, value) in &model.query_params {
        if key.trim().is_empty() || key.len() > 160 || key.contains(['\n', '\r']) || value.len() > 1_000 || value.contains(['\n', '\r']) {
            return Err("查询参数名称和值必须是单行文本".into());
        }
        if sensitive_request_field(key) {
            return Err("查询参数不能保存 API Key、token 或 secret".into());
        }
    }
    for (key, value) in &model.extra_headers {
        validate_header_name(key, false)?;
        validate_header_value(value)?;
    }
    for (key, env_name) in &model.env_http_headers {
        validate_header_name(key, true)?;
        let env_name = env_name.trim();
        if !valid_environment_name(env_name) {
            return Err(format!("无效的环境变量请求头名称：{env_name}"));
        }
    }
    Ok(())
}

/// Apply the user-confirmed provider metadata to a real HTTP request. API keys
/// remain in Keychain/environment; only the resolved value is placed in the
/// in-flight request and never returned to the renderer.
fn apply_provider_request_metadata(
    mut request: reqwest::blocking::RequestBuilder,
    model: &CustomModelRow,
) -> Result<reqwest::blocking::RequestBuilder, String> {
    validate_provider_request_metadata(model)?;
    if !model.query_params.is_empty() {
        let query = model
            .query_params
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect::<Vec<_>>();
        request = request.query(&query);
    }
    for (key, value) in &model.extra_headers {
        request = request.header(key.as_str(), value.as_str());
    }
    for (key, env_name) in &model.env_http_headers {
        let env_name = env_name.trim();
        let value = std::env::var(env_name)
            .map_err(|_| format!("环境变量请求头未设置：{env_name}"))?;
        request = request.header(key.as_str(), value);
    }
    Ok(request)
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
    validate_base_url(model.base_url.trim())?;
    if model.model.trim().is_empty() {
        return Err("model id required".into());
    }
    validate_provider_request_metadata(&model)?;
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
    if !model.provider_label.trim().is_empty() {
        body.push_str(&format!(
            "provider_label = \"{}\"\n",
            escape_toml_str(model.provider_label.trim())
        ));
    }
    if !model.query_params.is_empty() {
        body.push_str(&format!("query_params = {}\n", toml_inline_table(&model.query_params)?));
    }
    if !model.extra_headers.is_empty() {
        body.push_str(&format!("extra_headers = {}\n", toml_inline_table(&model.extra_headers)?));
    }
    if !model.env_http_headers.is_empty() {
        body.push_str(&format!("env_http_headers = {}\n", toml_inline_table(&model.env_http_headers)?));
    }
    if !model.api_key.trim().is_empty() && !model.api_key.starts_with("env:") {
        keychain_store(&id, model.api_key.trim())?;
        body.push_str(&format!("env_key = \"{}\"\n", key_env_name(&id)));
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

/// Inject Keychain secrets only into the spawned engine process. The persisted model
/// configuration refers to these values via `env_key` and contains no new plaintext key.
pub fn apply_keychain_env_tokio(cmd: &mut tokio::process::Command) {
    if let Ok(snapshot) = list_custom_models() {
        for model in snapshot.custom_models {
            if model.api_key == format!("env:{}", key_env_name(&model.id)) {
                if let Some(secret) = keychain_read(&model.id) {
                    cmd.env(key_env_name(&model.id), secret);
                }
            }
        }
    }
}

#[tauri::command]
pub fn models_migrate_plaintext_keys() -> Result<ModelsConfigSnapshot, String> {
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let mut current: Option<String> = None;
    let mut found: Option<(String, String)> = None;
    for line in raw.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("[model.") {
            current = Some(rest.trim_end_matches(']').trim().to_string());
        } else if t.starts_with('[') {
            current = None;
        } else if let (Some(id), Some(key)) = (current.as_deref(), parse_str_assign(t, "api_key")) {
            if !key.is_empty() { found = Some((id.to_string(), key)); break; }
        }
    }
    let Some((id, key)) = found else { return list_custom_models(); };
    keychain_store(&id, &key)?;
    let section = format!("[model.{id}]");
    let start = raw.find(&section).ok_or_else(|| "Model section disappeared during migration.".to_string())?;
    let tail = &raw[start..];
    let end = tail.find("\n[").map(|n| start + n + 1).unwrap_or(raw.len());
    let replacement = raw[start..end].lines().map(|line| {
        if parse_str_assign(line.trim(), "api_key").is_some() {
            format!("env_key = \"{}\"", key_env_name(&id))
        } else { line.to_string() }
    }).collect::<Vec<_>>().join("\n");
    fs::write(&path, format!("{}{}{}", &raw[..start], replacement, &raw[end..])).map_err(|e| e.to_string())?;
    models_migrate_plaintext_keys()
}

#[tauri::command]
pub fn models_remove_custom(id: String) -> Result<ModelsConfigSnapshot, String> {
    let id = sanitize_id(&id);
    let path = config_toml_path();
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let section = format!("[model.{id}]");
    let new_raw = remove_toml_section(&raw, &section);
    fs::write(&path, new_raw).map_err(|e| e.to_string())?;
    // A deleted model must not leave a recoverable credential behind.
    keychain_delete(&id)?;
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

/// Confirm a provider returned generated text without exposing provider-owned
/// response data to the renderer or logs. A successful HTTP status alone is
/// not evidence that the configured model can answer a request.
fn has_generated_text(backend: &str, body: &[u8]) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) else {
        return false;
    };
    let text = |value: &serde_json::Value| value.as_str().is_some_and(|s| !s.trim().is_empty());
    match backend {
        "messages" => value.get("content").and_then(|v| v.as_array()).is_some_and(|items| {
            items.iter().any(|item| {
                item.get("type").and_then(|v| v.as_str()) == Some("text")
                    && item.get("text").is_some_and(text)
            })
        }),
        "responses" => {
            value.get("output_text").is_some_and(text)
                || value.get("output").and_then(|v| v.as_array()).is_some_and(|items| {
                    items.iter().any(|item| {
                        item.get("content").and_then(|v| v.as_array()).is_some_and(|content| {
                            content.iter().any(|part| {
                                part.get("type").and_then(|v| v.as_str()) == Some("output_text")
                                    && part.get("text").is_some_and(text)
                            })
                        })
                    })
                })
        }
        _ => value.get("choices").and_then(|v| v.as_array()).is_some_and(|choices| {
            choices.iter().any(|choice| {
                let Some(content) = choice.get("message").and_then(|message| message.get("content")) else {
                    return false;
                };
                text(content)
                    || content.as_array().is_some_and(|parts| parts.iter().any(|part| {
                        part.get("text").is_some_and(text)
                    }))
            })
        }),
    }
}

fn normalized_backend(raw: &str) -> &str {
    match raw.trim() {
        "responses" | "messages" => raw.trim(),
        _ => "chat_completions",
    }
}

fn resolved_model_key(model: &CustomModelRow) -> String {
    let key = model.api_key.trim();
    if let Some(envn) = key.strip_prefix("env:") {
        let envn = envn.trim();
        std::env::var(envn).unwrap_or_else(|_| {
            if envn == key_env_name(&model.id) {
                keychain_read(&model.id).unwrap_or_default()
            } else {
                String::new()
            }
        })
    } else if key.is_empty() {
        keychain_read(&model.id).unwrap_or_default()
    } else {
        key.to_string()
    }
}

/// Convert a configured inference base URL to its conventional model catalog
/// endpoint. This is deliberately protocol-driven instead of provider-name
/// driven, so compatible enterprise gateways remain usable.
fn model_catalog_url(base: &str, backend: &str) -> String {
    let base = base.trim_end_matches('/');
    if let Some(root) = base.strip_suffix("/chat/completions") {
        return format!("{root}/models");
    }
    if let Some(root) = base.strip_suffix("/responses") {
        return format!("{root}/models");
    }
    if normalized_backend(backend) == "messages" {
        return if base.ends_with("/v1") { format!("{base}/models") } else { format!("{base}/v1/models") };
    }
    if base.contains("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    }
}

fn catalog_model_ids(body: &[u8]) -> Vec<String> {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) else {
        return Vec::new();
    };
    let rows = value.get("data").or_else(|| value.get("models")).and_then(|v| v.as_array())
        .or_else(|| value.as_array());
    let mut ids = rows.into_iter().flatten().filter_map(|item| {
        item.as_str().map(str::to_string).or_else(|| {
            item.get("id").or_else(|| item.get("name")).or_else(|| item.get("model"))
                .and_then(|v| v.as_str()).map(str::to_string)
        })
    }).map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty() && id.len() <= 256)
        .collect::<Vec<_>>();
    ids.sort_by_key(|id| id.to_ascii_lowercase());
    ids.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    ids.truncate(500);
    ids
}

/// Read model identifiers from a provider's standard catalog endpoint. This
/// does not persist a key, configuration or provider response body.
#[tauri::command]
pub fn models_list_available(model: CustomModelRow) -> Result<ModelCatalogResult, String> {
    let base = model.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("base_url required".into());
    }
    validate_base_url(base)?;
    let backend = normalized_backend(&model.api_backend);
    let key = resolved_model_key(&model);
    let url = model_catalog_url(base, backend);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("gorkX-model-catalog/1.2.0")
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.get(&url).header("Accept", "application/json");
    if !key.is_empty() {
        request = if backend == "messages" {
            request.header("x-api-key", &key).header("anthropic-version", "2023-06-01")
        } else {
            request.header("Authorization", format!("Bearer {key}"))
        };
    }
    request = match apply_provider_request_metadata(request, &model) {
        Ok(request) => request,
        Err(error) => return Ok(ModelCatalogResult { models: Vec::new(), status: 0, note: error }),
    };
    let response = match request.send() {
        Ok(response) => response,
        Err(error) => return Ok(ModelCatalogResult {
            models: Vec::new(), status: 0, note: format!("读取模型列表失败：{error}"),
        }),
    };
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let note = match status {
            401 | 403 => format!("鉴权失败 HTTP {status} — 检查 API Key"),
            404 => "模型目录路径不存在 HTTP 404 — 可手动填写模型名称".into(),
            _ => format!("读取模型列表失败 HTTP {status}（响应详情已隐藏）"),
        };
        return Ok(ModelCatalogResult { models: Vec::new(), status, note });
    }
    // Bound response parsing and immediately discard provider-controlled data.
    let mut body = Vec::new();
    let _ = response.take(1_048_577).read_to_end(&mut body);
    if body.len() > 1_048_576 {
        return Ok(ModelCatalogResult { models: Vec::new(), status, note: "模型目录过大，已拒绝读取；可手动填写模型名称".into() });
    }
    let models = catalog_model_ids(&body);
    let note = if models.is_empty() {
        format!("HTTP {status}，但未发现可选模型；可手动填写模型名称")
    } else {
        format!("已读取 {} 个可选模型", models.len())
    };
    Ok(ModelCatalogResult { models, status, note })
}

/// Probe a custom OpenAI/Anthropic-compatible endpoint (does not change config).
#[tauri::command]
pub fn models_test_connection(model: CustomModelRow) -> Result<ModelTestResult, String> {
    let base = model.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("base_url required".into());
    }
    validate_base_url(base)?;
    let mid = model.model.trim();
    if mid.is_empty() {
        return Err("model id required".into());
    }
    let key = resolved_model_key(&model);
    let backend = normalized_backend(&model.api_backend);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .user_agent("gorkX-model-test/1.2.0")
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
    req = apply_provider_request_metadata(req, &model)?;
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
    // Never put an endpoint-controlled response body in UI state. Error bodies
    // frequently echo request metadata and can contain credentials on broken
    // compatible gateways. We inspect the success body only in-process to
    // verify a real generated response, then discard it.
    let generated = if (200..300).contains(&status) {
        resp.bytes().ok().is_some_and(|body| has_generated_text(backend, &body))
    } else {
        false
    };
    let ok = (200..300).contains(&status) && generated;
    let note = if ok {
        format!("模型响应成功 · HTTP {status} · {latency_ms} ms")
    } else if (200..300).contains(&status) {
        format!("HTTP {status}，但未确认有效模型输出（响应详情已隐藏）")
    } else if status == 401 || status == 403 {
        format!("鉴权失败 HTTP {status} — 检查 API Key")
    } else if status == 404 {
        "路径不存在 HTTP 404 — 检查 base_url 是否含 /v1".into()
    } else {
        format!("HTTP {status}（响应详情已隐藏）")
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

#[cfg(test)]
mod tests {
    use super::{apply_provider_request_metadata, catalog_model_ids, default_backend, has_generated_text, model_catalog_url, parse_inline_table_assign, toml_inline_table, validate_base_url, validate_provider_request_metadata, CustomModelRow};
    use std::collections::BTreeMap;

    #[test]
    fn accepts_https_and_local_http_model_endpoints() {
        assert!(validate_base_url("https://api.example.com/v1").is_ok());
        assert!(validate_base_url("http://127.0.0.1:11434/v1").is_ok());
    }

    #[test]
    fn rejects_credential_bearing_or_non_http_model_endpoints() {
        assert!(validate_base_url("https://token@example.com/v1").is_err());
        assert!(validate_base_url("https://api.example.com/v1?api_key=nope").is_err());
        assert!(validate_base_url("file:///tmp/model").is_err());
    }

    #[test]
    fn round_trips_native_provider_request_maps() {
        let mut values = BTreeMap::new();
        values.insert("api-version".to_string(), "2026-07-22".to_string());
        values.insert("X-Workspace".to_string(), "research".to_string());
        let rendered = toml_inline_table(&values).expect("safe request map");
        let parsed = parse_inline_table_assign(&format!("query_params = {rendered}"), "query_params")
            .expect("parse emitted inline table");
        assert_eq!(parsed, values);
    }

    #[test]
    fn rejects_multiline_provider_request_values() {
        let mut values = BTreeMap::new();
        values.insert("X-Test".to_string(), "unsafe\nvalue".to_string());
        assert!(toml_inline_table(&values).is_err());
    }

    #[test]
    fn rejects_secret_static_headers_but_allows_env_header_names() {
        let mut model = CustomModelRow {
            id: "gateway".into(),
            model: "demo".into(),
            name: "demo".into(),
            base_url: "https://gateway.example/v1".into(),
            api_key: String::new(),
            has_keychain_secret: false,
            has_plaintext_secret: false,
            api_backend: default_backend(),
            provider_label: "Gateway".into(),
            query_params: BTreeMap::new(),
            extra_headers: BTreeMap::from([("Authorization".into(), "Bearer should-not-persist".into())]),
            env_http_headers: BTreeMap::new(),
            context_window: None,
        };
        assert!(validate_provider_request_metadata(&model).is_err());
        model.extra_headers.clear();
        model.env_http_headers.insert("Authorization".into(), "GORKX_GATEWAY_TOKEN".into());
        assert!(validate_provider_request_metadata(&model).is_ok());
    }

    #[test]
    fn rejects_sensitive_query_parameters_and_invalid_env_names() {
        let mut model = CustomModelRow {
            id: "gateway".into(),
            model: "demo".into(),
            name: "demo".into(),
            base_url: "https://gateway.example/v1".into(),
            api_key: String::new(),
            has_keychain_secret: false,
            has_plaintext_secret: false,
            api_backend: default_backend(),
            provider_label: "Gateway".into(),
            query_params: BTreeMap::from([("api_key".into(), "nope".into())]),
            extra_headers: BTreeMap::new(),
            env_http_headers: BTreeMap::new(),
            context_window: None,
        };
        assert!(validate_provider_request_metadata(&model).is_err());
        model.query_params.clear();
        model.env_http_headers.insert("X-Workspace".into(), "not a valid env name".into());
        assert!(validate_provider_request_metadata(&model).is_err());
    }

    #[test]
    fn applies_query_and_static_headers_to_built_request() {
        let model = CustomModelRow {
            id: "gateway".into(),
            model: "demo".into(),
            name: "demo".into(),
            base_url: "https://gateway.example/v1".into(),
            api_key: String::new(),
            has_keychain_secret: false,
            has_plaintext_secret: false,
            api_backend: default_backend(),
            provider_label: "Gateway".into(),
            query_params: BTreeMap::from([("api-version".into(), "2026-07-22".into())]),
            extra_headers: BTreeMap::from([("X-Workspace".into(), "research".into())]),
            env_http_headers: BTreeMap::new(),
            context_window: None,
        };
        let request = apply_provider_request_metadata(
            reqwest::blocking::Client::new().get("https://gateway.example/v1/models"),
            &model,
        )
        .expect("metadata should validate")
        .build()
        .expect("request should build without a network call");
        assert_eq!(request.url().query_pairs().find(|(k, _)| k == "api-version").map(|(_, v)| v.into_owned()), Some("2026-07-22".to_string()));
        assert_eq!(request.headers().get("x-workspace").and_then(|v| v.to_str().ok()), Some("research"));
    }

    #[test]
    fn model_probe_requires_generated_content_for_each_supported_protocol() {
        assert!(has_generated_text(
            "chat_completions",
            br#"{"choices":[{"message":{"content":"pong"}}]}"#,
        ));
        assert!(has_generated_text(
            "responses",
            br#"{"output":[{"content":[{"type":"output_text","text":"pong"}]}]}"#,
        ));
        assert!(has_generated_text(
            "messages",
            br#"{"content":[{"type":"text","text":"pong"}]}"#,
        ));
        assert!(!has_generated_text("chat_completions", br#"{"choices":[]}"#));
        assert!(!has_generated_text("responses", br#"{"output_text":""}"#));
        assert!(!has_generated_text("messages", br#"{"content":[]}"#));
    }

    #[test]
    fn model_catalog_uses_protocol_compatible_paths() {
        assert_eq!(model_catalog_url("https://api.openai.com/v1", "responses"), "https://api.openai.com/v1/models");
        assert_eq!(model_catalog_url("https://api.anthropic.com/v1", "messages"), "https://api.anthropic.com/v1/models");
        assert_eq!(model_catalog_url("https://openrouter.ai/api/v1", "chat_completions"), "https://openrouter.ai/api/v1/models");
        assert_eq!(model_catalog_url("https://gateway.example/chat/completions", "chat_completions"), "https://gateway.example/models");
    }

    #[test]
    fn model_catalog_extracts_only_bounded_ids() {
        let ids = catalog_model_ids(br#"{"data":[{"id":"gpt-4o"},{"id":"GPT-4O"},{"name":"claude-test"},{"id":""}]}"#);
        assert_eq!(ids, vec!["claude-test", "gpt-4o"]);
        assert!(catalog_model_ids(br#"not json"#).is_empty());
    }
}
