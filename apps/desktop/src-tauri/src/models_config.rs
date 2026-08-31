//! Multi-provider / custom models → GROK_HOME/config.toml [model.*]
//! OpenCode-style: hang multiple endpoints, pick models in UI.

use crate::paths::{config_toml_path, ensure_dirs, grok_home};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use toml_edit::{value as toml_value, DocumentMut, InlineTable, Item, Value};

const KEYCHAIN_SERVICE: &str = "com.gorkx.model-api-key";
const MAX_CONFIG_BYTES: usize = 4 * 1024 * 1024;

// Deliberately do not derive Debug: this request object transiently carries a
// caller-supplied API key, and accidental structured logging must not expose it.
#[derive(Clone, Serialize, Deserialize)]
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

fn keychain_account(id: &str) -> String {
    format!("gorkx:model:{}", sanitize_id(id))
}
fn key_env_name(id: &str) -> String {
    format!(
        "GORKX_MODEL_{}",
        sanitize_id(id).replace('-', "_").to_ascii_uppercase()
    )
}

#[cfg(target_os = "macos")]
fn keychain_store(id: &str, secret: &SecretString) -> Result<(), String> {
    let status = std::process::Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            &keychain_account(id),
            "-w",
            secret.expose_secret(),
        ])
        .status()
        .map_err(|e| format!("macOS Keychain unavailable: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Could not save the API key in macOS Keychain.".into())
    }
}
#[cfg(not(target_os = "macos"))]
fn keychain_store(_id: &str, _secret: &SecretString) -> Result<(), String> {
    Err("Secure custom-model keys are currently supported on macOS only.".into())
}
#[cfg(target_os = "macos")]
fn keychain_read(id: &str) -> Option<SecretString> {
    let out = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            &keychain_account(id),
            "-w",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let value = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (!value.is_empty()).then_some(value.into())
}
#[cfg(target_os = "macos")]
fn keychain_delete(id: &str) -> Result<(), String> {
    // Avoid reporting an absent item as an error: removal should be idempotent
    // when a model used an external env var or was imported without a secret.
    if keychain_read(id).is_none() {
        return Ok(());
    }
    let status = std::process::Command::new("security")
        .args([
            "delete-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            &keychain_account(id),
        ])
        .status()
        .map_err(|e| format!("macOS Keychain unavailable: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Could not remove the API key from macOS Keychain.".into())
    }
}
#[cfg(not(target_os = "macos"))]
fn keychain_read(_id: &str) -> Option<SecretString> {
    None
}
#[cfg(not(target_os = "macos"))]
fn keychain_delete(_id: &str) -> Result<(), String> {
    Ok(())
}

fn default_backend() -> String {
    "chat_completions".into()
}

#[derive(Clone, Serialize, Deserialize)]
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

fn empty_model_row(id: impl Into<String>) -> CustomModelRow {
    CustomModelRow {
        id: id.into(),
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
    }
}

fn read_config_raw(path: &Path) -> Result<String, String> {
    if let Some(parent) = path.parent() {
        if let Ok(meta) = fs::symlink_metadata(parent) {
            if meta.file_type().is_symlink() {
                return Err("config directory must not be a symbolic link".into());
            }
        }
    }
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            return Err("config.toml must not be a symbolic link".into());
        }
        if !meta.is_file() {
            return Err("config.toml is not a regular file".into());
        }
    }
    match fs::read_to_string(path) {
        Ok(raw) if raw.len() <= MAX_CONFIG_BYTES => Ok(raw),
        Ok(_) => Err(format!(
            "config.toml is too large ({} MB max)",
            MAX_CONFIG_BYTES / (1024 * 1024)
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("read config.toml: {error}")),
    }
}

fn write_config_raw(path: &Path, content: &str) -> Result<(), String> {
    if content.len() > MAX_CONFIG_BYTES || content.as_bytes().contains(&0) {
        return Err(
            "config.toml must be plain text up to 4 MB and cannot contain NUL bytes".into(),
        );
    }
    let parent = path
        .parent()
        .ok_or_else(|| "config.toml has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("create config directory: {e}"))?;
    if let Ok(meta) = fs::symlink_metadata(parent) {
        if meta.file_type().is_symlink() {
            return Err("config directory must not be a symbolic link".into());
        }
    }
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            return Err("config.toml must not be a symbolic link".into());
        }
        if !meta.is_file() {
            return Err("config.toml is not a regular file".into());
        }
    }
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let tmp = parent.join(format!(".config.toml.gorkx-{nonce}.tmp"));
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&tmp)
            .map_err(|e| format!("create temporary config.toml: {e}"))?;
        #[cfg(unix)]
        {
            let mut permissions = file
                .metadata()
                .map_err(|e| format!("read temporary config.toml permissions: {e}"))?
                .permissions();
            permissions.set_mode(0o600);
            file.set_permissions(permissions)
                .map_err(|e| format!("restrict temporary config.toml: {e}"))?;
        }
        file.write_all(content.as_bytes())
            .map_err(|e| format!("write temporary config.toml: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("sync temporary config.toml: {e}"))?;
        fs::rename(&tmp, path).map_err(|e| format!("replace config.toml: {e}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write_result
}

fn parse_config_document(raw: &str) -> Result<DocumentMut, String> {
    if raw.len() > MAX_CONFIG_BYTES {
        return Err(format!(
            "config.toml is too large ({} MB max)",
            MAX_CONFIG_BYTES / (1024 * 1024)
        ));
    }
    if raw.trim().is_empty() {
        return Ok(DocumentMut::new());
    }
    raw.parse::<DocumentMut>()
        .map_err(|error| format!("config.toml contains invalid TOML: {error}"))
}

fn string_at(table: &toml_edit::Table, key: &str) -> Option<String> {
    table.get(key).and_then(Item::as_str).map(str::to_owned)
}

fn string_map_at(item: Option<&Item>) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    match item {
        Some(Item::Value(value)) => {
            if let Some(table) = value.as_inline_table() {
                for (key, value) in table.iter() {
                    if let Some(value) = value.as_str().filter(|value| !value.trim().is_empty()) {
                        out.insert(key.to_owned(), value.to_owned());
                    }
                }
            }
        }
        Some(Item::Table(table)) => {
            for (key, value) in table.iter() {
                if let Some(value) = value.as_str().filter(|value| !value.trim().is_empty()) {
                    out.insert(key.to_owned(), value.to_owned());
                }
            }
        }
        _ => {}
    }
    out
}

fn model_from_table(id: &str, table: &toml_edit::Table) -> Result<Option<CustomModelRow>, String> {
    let mut model = empty_model_row(id.to_owned());
    model.model = string_at(table, "model").unwrap_or_default();
    model.name = string_at(table, "name").unwrap_or_default();
    model.base_url = string_at(table, "base_url").unwrap_or_default();
    model.api_backend = string_at(table, "api_backend").unwrap_or_else(default_backend);
    model.provider_label = string_at(table, "provider_label").unwrap_or_default();
    model.query_params = string_map_at(table.get("query_params"));
    model.extra_headers = string_map_at(table.get("extra_headers"));
    model.env_http_headers = string_map_at(table.get("env_http_headers"));
    model.context_window = table
        .get("context_window")
        .and_then(Item::as_integer)
        .and_then(|value| u64::try_from(value).ok());
    model.has_plaintext_secret = table
        .get("api_key")
        .and_then(Item::as_str)
        .is_some_and(|value| !value.trim().is_empty());
    if let Some(env_key) = string_at(table, "env_key") {
        let env_key = env_key.trim();
        if !valid_environment_name(env_key) {
            return Err(format!("config.toml model {id} has an invalid env_key"));
        }
        model.api_key = format!("env:{env_key}");
        if env_key == key_env_name(id) {
            model.has_keychain_secret = keychain_read(id).is_some();
        }
    }
    if model.base_url.is_empty() && model.model.is_empty() {
        return Ok(None);
    }
    if model.name.is_empty() {
        model.name = model.model.clone();
    }
    if model.model.is_empty() {
        model.model = id.to_owned();
    }
    Ok(Some(model))
}

/// Parse existing [model.*] blocks with the maintained TOML parser.
///
/// `toml_edit` is intentionally used instead of a line parser: provider
/// metadata may contain quoted commas, escaped strings, comments, or a
/// format-preserving nested table. The renderer still receives only the
/// bounded, non-secret fields selected by `model_from_table`.
pub fn list_custom_models() -> Result<ModelsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    let raw = read_config_raw(&path)?;
    let document = parse_config_document(&raw)?;
    let mut models = Vec::new();
    let default_model = document
        .get("models")
        .and_then(Item::as_table)
        .and_then(|table| string_at(table, "default"));
    if let Some(table) = document.get("model").and_then(Item::as_table) {
        for (id, item) in table.iter() {
            if let Some(table) = item.as_table() {
                if let Some(model) = model_from_table(id, table)? {
                    models.push(model);
                }
            }
        }
    }

    Ok(ModelsConfigSnapshot {
        grok_home: grok_home().display().to_string(),
        config_path: path.display().to_string(),
        custom_models: models,
        default_model,
        note: "Custom models live in App GROK_HOME config.toml (OpenCode-style multi-provider)."
            .into(),
    })
}

fn toml_inline_table(values: &BTreeMap<String, String>) -> Result<Item, String> {
    if values.len() > 32 {
        return Err("at most 32 request parameters or headers".into());
    }
    let mut table = InlineTable::new();
    for (key, value) in values {
        let key = key.trim();
        let value = value.trim();
        if key.is_empty()
            || value.is_empty()
            || key.len() > 160
            || value.len() > 1_000
            || key.contains(['\n', '\r', '\0'])
            || value.contains(['\n', '\r', '\0'])
        {
            return Err(
                "request parameter/header names and values must be single-line text".into(),
            );
        }
        table.insert(key.to_owned(), Value::from(value.to_owned()));
    }
    Ok(Item::Value(Value::InlineTable(table)))
}

/// Only allow endpoints that reqwest can safely send to without embedding a
/// credential in the URL. Local HTTP is intentionally allowed for Ollama.
fn validate_base_url(raw: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(raw.trim())
        .map_err(|_| "base_url must be a valid http(s) URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("base_url must be a valid http(s) URL".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
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
    let Some(first) = chars.next() else {
        return false;
    };
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
        return Err(
            "静态请求头不能保存 Authorization/API Key 等秘密；请改用 API Key 或环境变量请求头"
                .into(),
        );
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
    if model.query_params.len() > 32
        || model.extra_headers.len() > 32
        || model.env_http_headers.len() > 32
    {
        return Err("每类请求参数/请求头最多 32 项".into());
    }
    for (key, value) in &model.query_params {
        if key.trim().is_empty()
            || key.len() > 160
            || key.contains(['\n', '\r'])
            || value.len() > 1_000
            || value.contains(['\n', '\r'])
        {
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
        let value =
            std::env::var(env_name).map_err(|_| format!("环境变量请求头未设置：{env_name}"))?;
        request = request.header(key.as_str(), value);
    }
    Ok(request)
}

fn set_string_field(table: &mut toml_edit::Table, key: &str, value: Option<&str>) {
    match value {
        Some(value) if !value.is_empty() => {
            table[key] = toml_value(value);
        }
        _ => {
            table.remove(key);
        }
    }
}

fn set_map_field(
    table: &mut toml_edit::Table,
    key: &str,
    values: &BTreeMap<String, String>,
) -> Result<(), String> {
    if values.is_empty() {
        table.remove(key);
    } else {
        table[key] = toml_inline_table(values)?;
    }
    Ok(())
}

fn model_table_mut<'a>(
    document: &'a mut DocumentMut,
    id: &str,
) -> Result<&'a mut toml_edit::Table, String> {
    let models = document
        .as_table_mut()
        .entry("model")
        .or_insert(toml_edit::table())
        .as_table_mut()
        .ok_or_else(|| "config.toml has an incompatible [model] value".to_string())?;
    models
        .entry(id)
        .or_insert(toml_edit::table())
        .as_table_mut()
        .ok_or_else(|| format!("config.toml has an incompatible [model.{id}] value"))
}

fn update_model_document(raw: &str, id: &str, model: &CustomModelRow) -> Result<String, String> {
    let mut document = parse_config_document(raw)?;
    let table = model_table_mut(&mut document, id)?;
    set_string_field(table, "model", Some(model.model.trim()));
    set_string_field(
        table,
        "name",
        Some(if model.name.trim().is_empty() {
            model.model.trim()
        } else {
            model.name.trim()
        }),
    );
    set_string_field(table, "base_url", Some(model.base_url.trim()));
    let backend = match model.api_backend.trim() {
        "responses" | "messages" => model.api_backend.trim(),
        _ => "chat_completions",
    };
    set_string_field(table, "api_backend", Some(backend));
    set_string_field(table, "provider_label", {
        let value = model.provider_label.trim();
        (!value.is_empty()).then_some(value)
    });
    set_map_field(table, "query_params", &model.query_params)?;
    set_map_field(table, "extra_headers", &model.extra_headers)?;
    set_map_field(table, "env_http_headers", &model.env_http_headers)?;
    if let Some(context_window) = model.context_window {
        table["context_window"] = toml_value(context_window as i64);
    } else {
        table.remove("context_window");
    }
    let configured_key = model.api_key.trim();
    if !configured_key.is_empty() && !configured_key.starts_with("env:") {
        set_string_field(table, "env_key", Some(&key_env_name(id)));
    } else if let Some(env) = configured_key.strip_prefix("env:") {
        let env = env.trim();
        if !valid_environment_name(env) {
            return Err("无效的 API Key 环境变量名称".into());
        }
        set_string_field(table, "env_key", Some(env));
    } else {
        table.remove("env_key");
    }
    // Do not carry forward a plaintext key supplied by an older config. The
    // migration command is the only route that moves that value to Keychain.
    table.remove("api_key");
    Ok(document.to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum KeychainUpdate {
    Store,
    Delete,
    Keep,
}

fn keychain_update(id: &str, raw_key: &str) -> KeychainUpdate {
    let key = raw_key.trim();
    if key.is_empty() {
        KeychainUpdate::Delete
    } else if let Some(env_name) = key.strip_prefix("env:") {
        if env_name.trim() == key_env_name(id) {
            KeychainUpdate::Keep
        } else {
            // External env vars are caller-owned. A stale app-generated
            // credential must be removed when switching away from its name.
            KeychainUpdate::Delete
        }
    } else {
        KeychainUpdate::Store
    }
}

fn update_default_model_document(raw: &str, model_id: &str) -> Result<String, String> {
    let mut document = parse_config_document(raw)?;
    let models = document
        .as_table_mut()
        .entry("models")
        .or_insert(toml_edit::table())
        .as_table_mut()
        .ok_or_else(|| "config.toml has an incompatible [models] value".to_string())?;
    models["default"] = toml_value(model_id);
    Ok(document.to_string())
}

fn remove_model_from_document(raw: &str, id: &str) -> Result<String, String> {
    let mut document = parse_config_document(raw)?;
    if let Some(models) = document
        .as_table_mut()
        .get_mut("model")
        .and_then(Item::as_table_mut)
    {
        models.remove(id);
    }
    Ok(document.to_string())
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
    let key_update = keychain_update(&id, &model.api_key);
    let raw = read_config_raw(&path)?;
    let new_raw = update_model_document(&raw, &id, &model)?;
    if key_update == KeychainUpdate::Store {
        let secret = SecretString::from(model.api_key.trim().to_owned());
        keychain_store(&id, &secret)?;
    }
    write_config_raw(&path, &new_raw)?;
    if key_update == KeychainUpdate::Delete {
        // The config no longer references the app-owned secret. If cleanup
        // fails, return an error rather than claiming the credential is gone.
        keychain_delete(&id)?;
    }
    list_custom_models()
}

/// Inject Keychain secrets only into the spawned engine process. The persisted model
/// configuration refers to these values via `env_key` and contains no new plaintext key.
pub fn apply_keychain_env_tokio(cmd: &mut tokio::process::Command) {
    if let Ok(snapshot) = list_custom_models() {
        for model in snapshot.custom_models {
            if model.api_key == format!("env:{}", key_env_name(&model.id)) {
                if let Some(secret) = keychain_read(&model.id) {
                    cmd.env(key_env_name(&model.id), secret.expose_secret());
                }
            }
        }
    }
}

#[tauri::command]
pub fn models_migrate_plaintext_keys() -> Result<ModelsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    loop {
        let raw = read_config_raw(&path)?;
        let document = parse_config_document(&raw)?;
        let found = document
            .get("model")
            .and_then(Item::as_table)
            .and_then(|models| {
                models.iter().find_map(|(id, item)| {
                    let table = item.as_table()?;
                    let key = table.get("api_key").and_then(Item::as_str)?.trim();
                    (!key.is_empty()).then(|| (id.to_owned(), key.to_owned()))
                })
            });
        let Some((id, key)) = found else {
            return list_custom_models();
        };

        let secret = SecretString::from(key);
        keychain_store(&id, &secret)?;
        let mut document = parse_config_document(&raw)?;
        let table = document
            .get_mut("model")
            .and_then(Item::as_table_mut)
            .and_then(|models| models.get_mut(&id))
            .and_then(Item::as_table_mut)
            .ok_or_else(|| "Model section disappeared during migration.".to_string())?;
        table.remove("api_key");
        let env_name = key_env_name(&id);
        table["env_key"] = toml_value(env_name);
        write_config_raw(&path, &document.to_string())?;
    }
}

#[tauri::command]
pub fn models_remove_custom(id: String) -> Result<ModelsConfigSnapshot, String> {
    let id = sanitize_id(&id);
    let path = config_toml_path();
    let raw = read_config_raw(&path)?;
    let new_raw = remove_model_from_document(&raw, &id)?;
    write_config_raw(&path, &new_raw)?;
    // A deleted model must not leave a recoverable credential behind.
    keychain_delete(&id)?;
    list_custom_models()
}

#[tauri::command]
pub fn models_set_default(model_id: String) -> Result<ModelsConfigSnapshot, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    let raw = read_config_raw(&path)?;
    let id = model_id.trim();
    if id.is_empty() {
        return Err("model id required".into());
    }
    let new_raw = update_default_model_document(&raw, id)?;
    write_config_raw(&path, &new_raw)?;
    list_custom_models()
}

#[tauri::command]
pub fn models_open_config() -> Result<String, String> {
    let _ = ensure_dirs();
    let path = config_toml_path();
    if !path.exists() {
        write_config_raw(
            &path,
            "# gorkX / Grok engine config (App GROK_HOME)\n\n[models]\n# default = \"grok-build\"\n",
        )?;
    } else {
        let _ = read_config_raw(&path)?;
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
        "messages" => value
            .get("content")
            .and_then(|v| v.as_array())
            .is_some_and(|items| {
                items.iter().any(|item| {
                    item.get("type").and_then(|v| v.as_str()) == Some("text")
                        && item.get("text").is_some_and(text)
                })
            }),
        "responses" => {
            value.get("output_text").is_some_and(text)
                || value
                    .get("output")
                    .and_then(|v| v.as_array())
                    .is_some_and(|items| {
                        items.iter().any(|item| {
                            item.get("content")
                                .and_then(|v| v.as_array())
                                .is_some_and(|content| {
                                    content.iter().any(|part| {
                                        part.get("type").and_then(|v| v.as_str())
                                            == Some("output_text")
                                            && part.get("text").is_some_and(text)
                                    })
                                })
                        })
                    })
        }
        _ => value
            .get("choices")
            .and_then(|v| v.as_array())
            .is_some_and(|choices| {
                choices.iter().any(|choice| {
                    let Some(content) = choice
                        .get("message")
                        .and_then(|message| message.get("content"))
                    else {
                        return false;
                    };
                    text(content)
                        || content.as_array().is_some_and(|parts| {
                            parts.iter().any(|part| part.get("text").is_some_and(text))
                        })
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

fn resolved_model_key(model: &CustomModelRow) -> SecretString {
    let key = model.api_key.trim();
    if let Some(envn) = key.strip_prefix("env:") {
        let envn = envn.trim();
        if !valid_environment_name(envn) {
            return String::new().into();
        }
        if envn == key_env_name(&model.id) {
            return keychain_read(&model.id)
                .or_else(|| std::env::var(envn).ok().map(SecretString::from))
                .unwrap_or_default();
        }
        std::env::var(envn).unwrap_or_default().into()
    } else if key.is_empty() {
        keychain_read(&model.id).unwrap_or_default()
    } else {
        key.into()
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
        return if base.ends_with("/v1") {
            format!("{base}/models")
        } else {
            format!("{base}/v1/models")
        };
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
    let rows = value
        .get("data")
        .or_else(|| value.get("models"))
        .and_then(|v| v.as_array())
        .or_else(|| value.as_array());
    let mut ids = rows
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.as_str().map(str::to_string).or_else(|| {
                item.get("id")
                    .or_else(|| item.get("name"))
                    .or_else(|| item.get("model"))
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            })
        })
        .map(|id| id.trim().to_string())
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
    if !key.expose_secret().is_empty() {
        request = if backend == "messages" {
            request
                .header("x-api-key", key.expose_secret())
                .header("anthropic-version", "2023-06-01")
        } else {
            request.header("Authorization", format!("Bearer {}", key.expose_secret()))
        };
    }
    request = match apply_provider_request_metadata(request, &model) {
        Ok(request) => request,
        Err(error) => {
            return Ok(ModelCatalogResult {
                models: Vec::new(),
                status: 0,
                note: error,
            })
        }
    };
    let response = match request.send() {
        Ok(response) => response,
        Err(error) => {
            return Ok(ModelCatalogResult {
                models: Vec::new(),
                status: 0,
                note: format!("读取模型列表失败：{error}"),
            })
        }
    };
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let note = match status {
            401 | 403 => format!("鉴权失败 HTTP {status} — 检查 API Key"),
            404 => "模型目录路径不存在 HTTP 404 — 可手动填写模型名称".into(),
            _ => format!("读取模型列表失败 HTTP {status}（响应详情已隐藏）"),
        };
        return Ok(ModelCatalogResult {
            models: Vec::new(),
            status,
            note,
        });
    }
    // Bound response parsing and immediately discard provider-controlled data.
    let mut body = Vec::new();
    let _ = response.take(1_048_577).read_to_end(&mut body);
    if body.len() > 1_048_576 {
        return Ok(ModelCatalogResult {
            models: Vec::new(),
            status,
            note: "模型目录过大，已拒绝读取；可手动填写模型名称".into(),
        });
    }
    let models = catalog_model_ids(&body);
    let note = if models.is_empty() {
        format!("HTTP {status}，但未发现可选模型；可手动填写模型名称")
    } else {
        format!("已读取 {} 个可选模型", models.len())
    };
    Ok(ModelCatalogResult {
        models,
        status,
        note,
    })
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
            } else {
                format!("{base}/chat/completions")
            };
            // Prefer /v1/chat/completions when base looks like host root
            let url = if url.ends_with("/chat/completions")
                && !base.contains("/v1")
                && !base.ends_with("/chat/completions")
            {
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
    if !key.expose_secret().is_empty() {
        if auth_header.0 == "x-api-key" {
            req = req
                .header("x-api-key", key.expose_secret())
                .header("anthropic-version", "2023-06-01");
        } else {
            req = req.header("Authorization", format!("Bearer {}", key.expose_secret()));
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
        resp.bytes()
            .ok()
            .is_some_and(|body| has_generated_text(backend, &body))
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

#[allow(dead_code)]
pub fn config_path() -> PathBuf {
    config_toml_path()
}

#[cfg(test)]
mod tests {
    use super::{
        apply_provider_request_metadata, catalog_model_ids, default_backend, has_generated_text,
        keychain_update, model_catalog_url, model_from_table, parse_config_document,
        remove_model_from_document, resolved_model_key, string_map_at, toml_inline_table,
        update_default_model_document, update_model_document, validate_base_url,
        validate_provider_request_metadata, write_config_raw, CustomModelRow,
    };
    use secrecy::ExposeSecret;
    use std::collections::BTreeMap;
    use toml_edit::{DocumentMut, Item};

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
        let mut document = DocumentMut::new();
        document["query_params"] = rendered;
        let parsed = string_map_at(document.get("query_params"));
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
            extra_headers: BTreeMap::from([(
                "Authorization".into(),
                "Bearer should-not-persist".into(),
            )]),
            env_http_headers: BTreeMap::new(),
            context_window: None,
        };
        assert!(validate_provider_request_metadata(&model).is_err());
        model.extra_headers.clear();
        model
            .env_http_headers
            .insert("Authorization".into(), "GORKX_GATEWAY_TOKEN".into());
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
        model
            .env_http_headers
            .insert("X-Workspace".into(), "not a valid env name".into());
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
        assert_eq!(
            request
                .url()
                .query_pairs()
                .find(|(k, _)| k == "api-version")
                .map(|(_, v)| v.into_owned()),
            Some("2026-07-22".to_string())
        );
        assert_eq!(
            request
                .headers()
                .get("x-workspace")
                .and_then(|v| v.to_str().ok()),
            Some("research")
        );
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
        assert!(!has_generated_text(
            "chat_completions",
            br#"{"choices":[]}"#
        ));
        assert!(!has_generated_text("responses", br#"{"output_text":""}"#));
        assert!(!has_generated_text("messages", br#"{"content":[]}"#));
    }

    #[test]
    fn model_catalog_uses_protocol_compatible_paths() {
        assert_eq!(
            model_catalog_url("https://api.openai.com/v1", "responses"),
            "https://api.openai.com/v1/models"
        );
        assert_eq!(
            model_catalog_url("https://api.anthropic.com/v1", "messages"),
            "https://api.anthropic.com/v1/models"
        );
        assert_eq!(
            model_catalog_url("https://openrouter.ai/api/v1", "chat_completions"),
            "https://openrouter.ai/api/v1/models"
        );
        assert_eq!(
            model_catalog_url(
                "https://gateway.example/chat/completions",
                "chat_completions"
            ),
            "https://gateway.example/models"
        );
    }

    #[test]
    fn model_catalog_extracts_only_bounded_ids() {
        let ids = catalog_model_ids(
            br#"{"data":[{"id":"gpt-4o"},{"id":"GPT-4O"},{"name":"claude-test"},{"id":""}]}"#,
        );
        assert_eq!(ids, vec!["claude-test", "gpt-4o"]);
        assert!(catalog_model_ids(br#"not json"#).is_empty());
    }

    #[test]
    fn maintained_toml_parser_handles_comments_quoted_commas_and_env_keys() {
        let raw = r#"
# Keep this comment and the unrelated feature table.
[models]
default = 'gateway'

[features]
image_gen_enabled = true

[model.gateway]
model = "gateway-model"
name = 'Gateway, EU'
base_url = "https://gateway.example/v1"
api_backend = "chat_completions"
query_params = { "prompt" = "hello, world", "quoted" = 'a"b' }
env_key = "GORKX_GATEWAY_TOKEN"
context_window = 32768
"#;
        let document = parse_config_document(raw).expect("valid TOML");
        let table = document
            .get("model")
            .and_then(Item::as_table)
            .and_then(|models| models.get("gateway"))
            .and_then(Item::as_table)
            .expect("gateway model table");
        let model = model_from_table("gateway", table)
            .expect("valid model table")
            .expect("complete model row");
        assert_eq!(model.name, "Gateway, EU");
        assert_eq!(model.query_params["prompt"], "hello, world");
        assert_eq!(model.query_params["quoted"], "a\"b");
        assert_eq!(model.api_key, "env:GORKX_GATEWAY_TOKEN");
        assert_eq!(model.context_window, Some(32768));
    }

    #[test]
    fn document_updates_preserve_unrelated_config_and_remove_plaintext_keys() {
        let raw = r#"# user note
[features]
image_gen_enabled = true

[model.gateway]
model = "old"
name = "Old"
base_url = "https://old.example/v1"
unknown_future_key = "keep me"
api_key = "must not survive an upsert"

[model.other]
model = "other"
base_url = "https://other.example/v1"
"#;
        let model = CustomModelRow {
            id: "gateway".into(),
            model: "new-model".into(),
            name: "New model".into(),
            base_url: "https://gateway.example/v1".into(),
            api_key: "env:GORKX_GATEWAY_TOKEN".into(),
            has_keychain_secret: false,
            has_plaintext_secret: false,
            api_backend: default_backend(),
            provider_label: "Gateway".into(),
            query_params: BTreeMap::from([("prompt".into(), "hello, world".into())]),
            extra_headers: BTreeMap::new(),
            env_http_headers: BTreeMap::new(),
            context_window: Some(16_384),
        };
        let next = update_model_document(raw, "gateway", &model).expect("update model");
        assert!(next.contains("# user note"));
        assert!(next.contains("image_gen_enabled = true"));
        assert!(next.contains("unknown_future_key = \"keep me\""));
        assert!(!next.contains("api_key ="));
        let document = parse_config_document(&next).expect("updated TOML");
        let table = document["model"]["gateway"]
            .as_table()
            .expect("updated model table");
        assert_eq!(table.get("model").and_then(Item::as_str), Some("new-model"));
        assert_eq!(
            table.get("env_key").and_then(Item::as_str),
            Some("GORKX_GATEWAY_TOKEN")
        );
        assert_eq!(
            string_map_at(table.get("query_params"))["prompt"],
            "hello, world"
        );
    }

    #[test]
    fn document_removal_and_default_update_are_toml_safe() {
        let raw = "[models]\ndefault = \"gateway\"\n\n[model.gateway]\nmodel = \"gateway\"\nbase_url = \"https://gateway.example/v1\"\n\n[model.other]\nmodel = \"other\"\nbase_url = \"https://other.example/v1\"\n";
        let without_gateway = remove_model_from_document(raw, "gateway").expect("remove model");
        assert!(!without_gateway.contains("[model.gateway]"));
        assert!(without_gateway.contains("[model.other]"));
        let next = update_default_model_document(&without_gateway, "other").expect("set default");
        let document = parse_config_document(&next).expect("valid TOML after update");
        assert_eq!(document["models"]["default"].as_str(), Some("other"));
    }

    #[test]
    fn invalid_or_oversized_config_is_rejected_instead_of_silently_hidden() {
        assert!(parse_config_document("[model.gateway\n").is_err());
        assert!(parse_config_document(&"x".repeat(super::MAX_CONFIG_BYTES + 1)).is_err());
    }

    #[test]
    fn invalid_model_env_key_is_rejected_and_keychain_lifecycle_is_explicit() {
        let raw = "[model.gateway]\nmodel = \"demo\"\nbase_url = \"https://gateway.example/v1\"\nenv_key = \"PATH;exfiltrate\"\n";
        let document = parse_config_document(raw).expect("TOML syntax is valid");
        let table = document["model"]["gateway"]
            .as_table()
            .expect("model table");
        assert!(model_from_table("gateway", table).is_err());
        assert_eq!(
            keychain_update("gateway", "new-secret"),
            super::KeychainUpdate::Store
        );
        assert_eq!(
            keychain_update("gateway", "env:GORKX_MODEL_GATEWAY"),
            super::KeychainUpdate::Keep
        );
        assert_eq!(
            keychain_update("gateway", "env:OPENAI_API_KEY"),
            super::KeychainUpdate::Delete
        );
        assert_eq!(
            keychain_update("gateway", ""),
            super::KeychainUpdate::Delete
        );
    }

    #[cfg(unix)]
    #[test]
    fn config_file_write_is_private_and_refuses_symlink_targets() {
        use std::fs;
        use std::os::unix::fs::{symlink, PermissionsExt};
        use std::time::{SystemTime, UNIX_EPOCH};

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("gorkx-model-config-{nonce}"));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("config.toml");
        write_config_raw(&path, "[models]\ndefault = \"demo\"\n").unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "[models]\ndefault = \"demo\"\n"
        );
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );

        let outside = base.join("outside.toml");
        fs::write(&outside, "private").unwrap();
        let linked = base.join("linked.toml");
        symlink(&outside, &linked).unwrap();
        assert!(super::read_config_raw(&linked).is_err());
        assert!(write_config_raw(&linked, "[models]\ndefault = \"unsafe\"\n").is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "private");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn resolved_key_is_redacted_by_secrecy_debug_and_exposed_only_for_transport() {
        let model = CustomModelRow {
            id: "gateway".into(),
            model: "demo".into(),
            name: "demo".into(),
            base_url: "https://gateway.example/v1".into(),
            api_key: "inline-secret".into(),
            has_keychain_secret: false,
            has_plaintext_secret: true,
            api_backend: default_backend(),
            provider_label: String::new(),
            query_params: BTreeMap::new(),
            extra_headers: BTreeMap::new(),
            env_http_headers: BTreeMap::new(),
            context_window: None,
        };
        let secret = resolved_model_key(&model);
        assert_eq!(secret.expose_secret(), "inline-secret");
        assert!(!format!("{secret:?}").contains("inline-secret"));
    }
}
