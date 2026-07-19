//! App GROK_HOME auth.json: load, OIDC silent refresh, optional first-run seed.
//!
//! Product rule: **logout means stay logged out**. We never silently re-import
//! `~/.grok` after the user signs out of gorkX. First-run seed (no logout marker)
//! can still copy CLI credentials once for convenience.

use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Prefer refreshing this many seconds before `expires_at`.
const REFRESH_SKEW_SECS: u64 = 5 * 60;

#[derive(Clone, Debug)]
pub struct AuthProfile {
    pub token: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
}

fn logout_marker_path() -> PathBuf {
    crate::paths::grok_home().join(".gorkx_logged_out")
}

/// User explicitly signed out of gorkX — do not re-adopt ~/.grok until they log in again.
pub fn user_logged_out() -> bool {
    logout_marker_path().is_file()
}

fn clear_logout_marker() {
    let _ = std::fs::remove_file(logout_marker_path());
}

fn set_logout_marker() {
    let _ = crate::paths::ensure_dirs();
    let _ = std::fs::write(logout_marker_path(), b"1\n");
}

/// Explicit logout for the App GROK_HOME session.
/// Clears App auth.json; does **not** touch system `~/.grok` (CLI can stay signed in).
/// Sets a marker so ensure_bearer will not auto-import CLI credentials again.
#[tauri::command]
pub fn auth_logout() -> Result<String, String> {
    let _ = crate::paths::ensure_dirs();
    let app_path = crate::paths::auth_json_path();
    if app_path.is_file() {
        std::fs::remove_file(&app_path).map_err(|e| format!("remove auth.json: {e}"))?;
    }
    let auth_dir = crate::paths::grok_home().join("auth");
    if auth_dir.is_dir() {
        let _ = std::fs::remove_dir_all(&auth_dir);
    }
    // Best-effort: also tell engine to drop session under App GROK_HOME
    let bin = crate::paths::resolve_grok_bin(None);
    if bin.exists() || which_ok(&bin) {
        let mut cmd = std::process::Command::new(&bin);
        cmd.arg("logout");
        crate::paths::apply_engine_env(&mut cmd);
        let _ = cmd.output();
    }
    set_logout_marker();
    Ok("logged out — App session cleared (system ~/.grok untouched)".into())
}

fn which_ok(bin: &Path) -> bool {
    // bare name like "grok" — Command will resolve via PATH
    bin.components().count() == 1
}

/// Official Grok Build OIDC client (device-code / refresh).
const OIDC_CLIENT_ID: &str = "b1a00492-073a-47ea-816f-4c329264a828";
const OIDC_ISSUER: &str = "https://auth.x.ai";
const DEVICE_CODE_URL: &str = "https://auth.x.ai/oauth2/device/code";
const TOKEN_URL: &str = "https://auth.x.ai/oauth2/token";
const USERINFO_URL: &str = "https://auth.x.ai/oauth2/userinfo";
/// Must include `grok-cli:access` or billing/models return 403
/// (`Action must be performed by Grok CLI token users`).
const OIDC_SCOPES: &str = "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write workspaces:read workspaces:write";

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthLoginResult {
    pub ok: bool,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub note: String,
    pub verification_uri: Option<String>,
}

/// In-app browser login via OAuth **device code** — no Terminal.
/// Opens the system browser, polls until the user finishes, writes App auth.json.
#[tauri::command]
pub async fn auth_login_browser() -> Result<AuthLoginResult, String> {
    tauri::async_runtime::spawn_blocking(auth_login_browser_sync)
        .await
        .map_err(|e| format!("login task: {e}"))?
}

fn auth_login_browser_sync() -> Result<AuthLoginResult, String> {
    let _ = crate::paths::ensure_dirs();
    clear_logout_marker();

    // Fast path: still-valid *CLI-scoped* session from system ~/.grok
    let app_path = crate::paths::auth_json_path();
    if let Some(home) = dirs::home_dir() {
        let leg = home.join(".grok/auth.json");
        if leg.is_file() {
            if let Ok(leg_file) = load_auth_file(&leg) {
                if access_token_usable(&leg_file, 0) {
                    if let Some((tok, _, _)) = pick_session(&leg_file) {
                        if token_has_cli_access(&tok) {
                            let _ = std::fs::copy(&leg, &app_path);
                            if let Ok(p) = ensure_bearer_token() {
                                return Ok(AuthLoginResult {
                                    ok: true,
                                    email: p.email,
                                    display_name: p.display_name,
                                    note: "已从系统 Grok 会话同步登录".into(),
                                    verification_uri: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Drop previous weak OIDC session (missing grok-cli:access) so we re-mint properly
    if app_path.is_file() {
        if let Ok(f) = load_auth_file(&app_path) {
            if let Some((tok, _, _)) = pick_session(&f) {
                if !token_has_cli_access(&tok) {
                    let _ = std::fs::remove_file(&app_path);
                }
            }
        }
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("gorkX/0.4.1")
        .build()
        .map_err(|e| e.to_string())?;

    // 1) Start device authorization — scopes must include grok-cli:access
    let form = [
        ("client_id", OIDC_CLIENT_ID),
        ("scope", OIDC_SCOPES),
    ];
    let resp = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .header("x-grok-client-surface", "grok-build")
        .header("x-grok-client-version", "0.2.103")
        .form(&form)
        .send()
        .map_err(|e| format!("device code request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        return Err(format!(
            "device code HTTP {status}: {}",
            body.chars().take(160).collect::<String>()
        ));
    }
    let dev: Value = resp.json().map_err(|e| e.to_string())?;
    let device_code = dev
        .get("device_code")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "no device_code".to_string())?
        .to_string();
    let interval = dev
        .get("interval")
        .and_then(|x| x.as_u64())
        .unwrap_or(5)
        .max(2);
    let expires_in = dev
        .get("expires_in")
        .and_then(|x| x.as_u64())
        .unwrap_or(1800);
    let verify_url = dev
        .get("verification_uri_complete")
        .and_then(|x| x.as_str())
        .or_else(|| dev.get("verification_uri").and_then(|x| x.as_str()))
        .unwrap_or("https://accounts.x.ai/oauth2/device")
        .to_string();
    let user_code = dev
        .get("user_code")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    // 2) Open system browser — no Terminal
    open_url_in_browser(&verify_url);

    // 3) Poll token endpoint
    let deadline = now_unix().saturating_add(expires_in.min(600)); // cap wait 10 min
    let mut sleep_secs = interval;
    loop {
        if now_unix() >= deadline {
            return Ok(AuthLoginResult {
                ok: false,
                email: None,
                display_name: None,
                note: format!(
                    "登录超时。请再点登录，浏览器打开后完成授权（验证码 {user_code}）"
                ),
                verification_uri: Some(verify_url),
            });
        }
        std::thread::sleep(Duration::from_secs(sleep_secs));

        let tok_form = [
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code",
            ),
            ("device_code", device_code.as_str()),
            ("client_id", OIDC_CLIENT_ID),
        ];
        let tok_resp = match client
            .post(TOKEN_URL)
            .header("Accept", "application/json")
            .form(&tok_form)
            .send()
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[auth] token poll network: {e}");
                continue;
            }
        };
        let status = tok_resp.status();
        let body_txt = tok_resp.text().unwrap_or_default();
        if status.is_success() {
            let body: Value = serde_json::from_str(&body_txt).map_err(|e| e.to_string())?;
            let access = body
                .get("access_token")
                .and_then(|x| x.as_str())
                .ok_or_else(|| "token missing access_token".to_string())?
                .to_string();
            let refresh = body
                .get("refresh_token")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let exp_in = body
                .get("expires_in")
                .and_then(|x| x.as_u64().or_else(|| x.as_i64().map(|i| i as u64)))
                .unwrap_or(21_600);
            let expires_at = format_expires_at(now_unix().saturating_add(exp_in));

            if !token_has_cli_access(&access) {
                return Ok(AuthLoginResult {
                    ok: false,
                    email: None,
                    display_name: None,
                    note: "登录未授予 Grok CLI 权限（缺 grok-cli:access）。请再点一次登录并在浏览器确认授权。".into(),
                    verification_uri: Some(verify_url),
                });
            }

            // Optional profile (name + avatar asset)
            let (email, first, last, user_id, picture) = fetch_userinfo(&client, &access);
            // Prefer /v1/user profile image when available
            let picture = fetch_profile_asset_id(&access).or(picture);

            let provider_key = format!("{OIDC_ISSUER}::{OIDC_CLIENT_ID}");
            let mut entry = Map::new();
            entry.insert("key".into(), json!(access));
            entry.insert("auth_mode".into(), json!("oauth"));
            entry.insert("refresh_token".into(), json!(refresh));
            entry.insert("expires_at".into(), json!(expires_at));
            entry.insert("oidc_issuer".into(), json!(OIDC_ISSUER));
            entry.insert("oidc_client_id".into(), json!(OIDC_CLIENT_ID));
            if let Some(e) = email.clone() {
                entry.insert("email".into(), json!(e));
            }
            if let Some(f) = first.clone() {
                entry.insert("first_name".into(), json!(f));
            }
            if let Some(l) = last.clone() {
                entry.insert("last_name".into(), json!(l));
            }
            if let Some(u) = user_id {
                entry.insert("user_id".into(), json!(u));
            }
            if let Some(ref pic) = picture {
                entry.insert("profile_image_asset_id".into(), json!(pic));
            }

            let mut root = Map::new();
            root.insert(provider_key, Value::Object(entry));
            let pretty =
                serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())?;
            std::fs::write(&app_path, format!("{pretty}\n")).map_err(|e| e.to_string())?;
            clear_logout_marker();

            let display = match (first, last) {
                (Some(f), Some(l)) => Some(format!("{f}{l}")),
                (Some(f), None) => Some(f),
                (None, Some(l)) => Some(l),
                _ => None,
            };
            return Ok(AuthLoginResult {
                ok: true,
                email,
                display_name: display,
                note: "登录成功".into(),
                verification_uri: None,
            });
        }

        // Pending / slow down
        if let Ok(err) = serde_json::from_str::<Value>(&body_txt) {
            let code = err.get("error").and_then(|x| x.as_str()).unwrap_or("");
            match code {
                "authorization_pending" => continue,
                "slow_down" => {
                    sleep_secs = sleep_secs.saturating_add(2);
                    continue;
                }
                "expired_token" | "access_denied" => {
                    return Ok(AuthLoginResult {
                        ok: false,
                        email: None,
                        display_name: None,
                        note: format!("登录失败：{code}。请重试。"),
                        verification_uri: Some(verify_url),
                    });
                }
                _ => {
                    return Err(format!(
                        "token error {code}: {}",
                        body_txt.chars().take(120).collect::<String>()
                    ));
                }
            }
        }
        return Err(format!(
            "token HTTP {status}: {}",
            body_txt.chars().take(120).collect::<String>()
        ));
    }
}

fn open_url_in_browser(url: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn();
    }
}

/// email, first, last, user_id, profile picture asset id or URL
fn fetch_userinfo(
    client: &reqwest::blocking::Client,
    access: &str,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let resp = client
        .get(USERINFO_URL)
        .header("Authorization", format!("Bearer {access}"))
        .header("Accept", "application/json")
        .send();
    let Ok(resp) = resp else {
        return (None, None, None, None, None);
    };
    if !resp.status().is_success() {
        return (None, None, None, None, None);
    }
    let Ok(v) = resp.json::<Value>() else {
        return (None, None, None, None, None);
    };
    let email = v
        .get("email")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let first = v
        .get("given_name")
        .or_else(|| v.get("first_name"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let last = v
        .get("family_name")
        .or_else(|| v.get("last_name"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let uid = v
        .get("sub")
        .or_else(|| v.get("user_id"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let picture = v
        .get("picture")
        .or_else(|| v.get("profile_image_asset_id"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    (email, first, last, uid, picture)
}

/// Public CDN base for xAI profile assets (verified: returns image/webp).
const ASSETS_CDN: &str = "https://assets.x.ai/";

/// Turn asset id or absolute URL into CDN URL (may be bot-blocked in WebView).
pub fn avatar_url_from_asset(asset: &str) -> Option<String> {
    let s = asset.trim();
    if s.is_empty() {
        return None;
    }
    if s.starts_with("http://") || s.starts_with("https://") {
        return Some(s.to_string());
    }
    // e.g. users/<uuid>/xxx-profile-picture.webp
    Some(format!("{ASSETS_CDN}{}", s.trim_start_matches('/')))
}

fn avatar_cache_paths() -> (std::path::PathBuf, std::path::PathBuf) {
    let dir = crate::paths::app_support_dir().join("cache");
    let _ = std::fs::create_dir_all(&dir);
    (dir.join("avatar.asset"), dir.join("avatar.img"))
}

/// Download profile image with a browser User-Agent and return a data URL.
/// On failure returns None → UI must show the default letter avatar.
/// Cloudflare on assets.x.ai returns 403 (error 1010) without a normal UA.
pub fn resolve_avatar_data_url(token: &str) -> Option<String> {
    let asset = profile_asset_from_auth_file()
        .or_else(|| {
            let a = fetch_profile_asset_id(token)?;
            persist_profile_asset_id(&a);
            Some(a)
        })?;
    let (meta_path, img_path) = avatar_cache_paths();
    // Local cache hit
    if let Ok(cached_asset) = std::fs::read_to_string(&meta_path) {
        if cached_asset.trim() == asset.trim() {
            if let Ok(bytes) = std::fs::read(&img_path) {
                if let Some(url) = bytes_to_data_url(&bytes, None) {
                    return Some(url);
                }
            }
        }
    }

    let url = avatar_url_from_asset(&asset)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        )
        .build()
        .ok()?;
    // Cloudflare blocks bare clients (error 1010); browser UA + bearer works.
    let mut bytes: Option<Vec<u8>> = None;
    let mut ct: Option<String> = None;
    for with_auth in [true, false] {
        let mut req = client.get(&url);
        if with_auth {
            req = req.header("Authorization", format!("Bearer {token}"));
        }
        let Ok(resp) = req.send() else {
            continue;
        };
        let status = resp.status();
        ct = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let Ok(b) = resp.bytes() else {
            continue;
        };
        if status.is_success() && !b.is_empty() && b.len() < 2_000_000 {
            bytes = Some(b.to_vec());
            break;
        }
    }
    let bytes = bytes?;
    // Persist cache for next open
    let _ = std::fs::write(&img_path, &bytes);
    let _ = std::fs::write(&meta_path, asset.trim());
    bytes_to_data_url(&bytes, ct.as_deref())
}

fn bytes_to_data_url(bytes: &[u8], content_type: Option<&str>) -> Option<String> {
    if bytes.is_empty() || bytes.len() > 2_000_000 {
        return None;
    }
    let mime = content_type
        .map(|s| s.split(';').next().unwrap_or(s).trim())
        .filter(|s| s.starts_with("image/"))
        .unwrap_or_else(|| {
            if bytes.starts_with(b"\x89PNG") {
                "image/png"
            } else if bytes.starts_with(b"\xff\xd8\xff") {
                "image/jpeg"
            } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
                "image/webp"
            } else if bytes.starts_with(b"GIF8") {
                "image/gif"
            } else {
                "image/webp"
            }
        });
    Some(format!("data:{mime};base64,{}", base64_standard_encode(bytes)))
}

fn base64_standard_encode(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | (data[i + 2] as u32);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(T[((n >> 6) & 63) as usize] as char);
        out.push(T[(n & 63) as usize] as char);
        i += 3;
    }
    match data.len() - i {
        1 => {
            let n = (data[i] as u32) << 16;
            out.push(T[((n >> 18) & 63) as usize] as char);
            out.push(T[((n >> 12) & 63) as usize] as char);
            out.push('=');
            out.push('=');
        }
        2 => {
            let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
            out.push(T[((n >> 18) & 63) as usize] as char);
            out.push(T[((n >> 12) & 63) as usize] as char);
            out.push(T[((n >> 6) & 63) as usize] as char);
            out.push('=');
        }
        _ => {}
    }
    out
}

/// Read profile_image_asset_id from App auth.json if present.
pub fn profile_asset_from_auth_file() -> Option<String> {
    let path = crate::paths::auth_json_path();
    if !path.is_file() {
        return None;
    }
    let raw = std::fs::read_to_string(&path).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    let obj = v.as_object()?;
    for val in obj.values() {
        if let Some(o) = val.as_object() {
            for key in [
                "profile_image_asset_id",
                "profileImageAssetId",
                "picture",
                "avatar",
            ] {
                if let Some(s) = o.get(key).and_then(|x| x.as_str()) {
                    if !s.trim().is_empty() {
                        return Some(s.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Fetch avatar asset id from cli-chat-proxy /v1/user (authoritative).
pub fn fetch_profile_asset_id(token: &str) -> Option<String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("gorkX/0.4.1")
        .build()
        .ok()?;
    let resp = client
        .get("https://cli-chat-proxy.grok.com/v1/user")
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json")
        .header("x-grok-client-mode", "cli")
        .header("X-XAI-Token-Auth", "xai-grok-cli")
        .send()
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: Value = resp.json().ok()?;
    v.get("profileImageAssetId")
        .or_else(|| v.get("profile_image_asset_id"))
        .or_else(|| v.get("picture"))
        .and_then(|x| x.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
}

/// Persist asset id into auth.json so next open is offline-friendly.
pub fn persist_profile_asset_id(asset: &str) {
    let path = crate::paths::auth_json_path();
    if !path.is_file() {
        return;
    }
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(mut root) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    let Some(obj) = root.as_object_mut() else {
        return;
    };
    for (_k, val) in obj.iter_mut() {
        if let Some(o) = val.as_object_mut() {
            if o.get("key").or_else(|| o.get("access_token")).is_some() {
                o.insert("profile_image_asset_id".into(), json!(asset));
                break;
            }
        }
    }
    if let Ok(pretty) = serde_json::to_string_pretty(&root) {
        let _ = std::fs::write(&path, format!("{pretty}\n"));
    }
}

/// Whether App home currently has an auth.json.
#[tauri::command]
pub fn auth_session_present() -> Result<bool, String> {
    Ok(crate::paths::auth_json_path().is_file())
}

/// Load a usable bearer token for billing / models.
/// Refreshes OIDC when near expiry. Does **not** re-import ~/.grok after logout.
pub fn ensure_bearer_token() -> Result<AuthProfile, String> {
    let _ = crate::paths::ensure_dirs();
    let app_path = crate::paths::auth_json_path();
    let legacy_path = dirs::home_dir().map(|h| h.join(".grok/auth.json"));

    // App auth present → user is logged in (even if they logged out of CLI later)
    if app_path.is_file() {
        clear_logout_marker();
    } else if user_logged_out() {
        return Err("logged out".into());
    } else if let Some(ref leg) = legacy_path {
        // First-run convenience only: no App auth, never logged out of gorkX
        if leg.is_file() {
            if let Ok(bytes) = std::fs::read(leg) {
                let _ = std::fs::write(&app_path, bytes);
            }
        }
    }

    if !app_path.is_file() {
        return Err("not logged in — no auth.json".into());
    }

    let mut file = load_auth_file(&app_path)?;

    // Keep App token alive via OIDC refresh. Only adopt ~/.grok if App token is
    // unusable *and* user has not explicitly logged out (marker already cleared above).
    if !access_token_usable(&file, REFRESH_SKEW_SECS) {
        match refresh_and_persist(&app_path, &file) {
            Ok(updated) => file = updated,
            Err(e) => {
                eprintln!("[auth] OIDC refresh failed: {e}");
                // Optional recovery: newer system CLI session — only if not logged out
                if !user_logged_out() {
                    if let Some(ref leg) = legacy_path {
                        if leg.is_file() {
                            if let Ok(leg_file) = load_auth_file(leg) {
                                if access_token_usable(&leg_file, 0)
                                    && auth_expiry_unix(&leg_file) > auth_expiry_unix(&file)
                                {
                                    let _ = std::fs::copy(leg, &app_path);
                                    file = load_auth_file(&app_path)?;
                                }
                            }
                        }
                    }
                }
                if !access_token_usable(&file, 0) {
                    return Err(format!(
                        "token expired — refresh failed ({e}); re-login in Settings or run grok login"
                    ));
                }
            }
        }
    }

    let (token, email, display) = pick_session(&file)
        .ok_or_else(|| "auth.json has no access token".to_string())?;
    Ok(AuthProfile {
        token,
        email,
        display_name: display,
    })
}

/// After a 401 from the API: force OIDC refresh once (no silent re-login if logged out).
pub fn force_refresh_bearer_token() -> Result<AuthProfile, String> {
    if user_logged_out() && !crate::paths::auth_json_path().is_file() {
        return Err("logged out".into());
    }
    let app_path = crate::paths::auth_json_path();
    if !app_path.is_file() {
        return ensure_bearer_token();
    }
    let file = load_auth_file(&app_path)?;
    match refresh_and_persist(&app_path, &file) {
        Ok(_) => ensure_bearer_token(),
        Err(e) => {
            if !user_logged_out() {
                if let Some(home) = dirs::home_dir() {
                    let leg = home.join(".grok/auth.json");
                    if leg.is_file() {
                        if let Ok(leg_file) = load_auth_file(&leg) {
                            if access_token_usable(&leg_file, 0) {
                                let _ = std::fs::copy(&leg, &app_path);
                                clear_logout_marker();
                                return ensure_bearer_token();
                            }
                        }
                    }
                }
            }
            Err(e)
        }
    }
}

struct AuthFile {
    /// Full JSON root (object keyed by provider).
    root: Value,
    /// Selected provider key in root object.
    provider_key: String,
}

fn load_auth_file(path: &Path) -> Result<AuthFile, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let root: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let obj = root
        .as_object()
        .ok_or_else(|| "auth.json root is not an object".to_string())?;
    let provider_key = select_provider_key(obj)
        .ok_or_else(|| "auth.json has no provider entry".to_string())?;
    Ok(AuthFile {
        root,
        provider_key,
    })
}

fn select_provider_key(obj: &Map<String, Value>) -> Option<String> {
    let mut best: Option<(String, u64)> = None;
    for (k, v) in obj {
        let Some(o) = v.as_object() else { continue };
        let has_tok = o
            .get("key")
            .or_else(|| o.get("access_token"))
            .or_else(|| o.get("token"))
            .and_then(|x| x.as_str())
            .is_some();
        if !has_tok {
            continue;
        }
        let exp = parse_expires_at(o.get("expires_at").and_then(|x| x.as_str())).unwrap_or(0);
        let score = exp
            .saturating_add(if o.get("refresh_token").is_some() {
                1_000_000_000
            } else {
                0
            });
        if best.as_ref().map(|(_, s)| score > *s).unwrap_or(true) {
            best = Some((k.clone(), score));
        }
    }
    // Flat top-level fallback
    if best.is_none()
        && obj
            .get("key")
            .or_else(|| obj.get("access_token"))
            .and_then(|x| x.as_str())
            .is_some()
    {
        return Some(String::new()); // empty = root is the entry
    }
    best.map(|(k, _)| k)
}

fn entry_map<'a>(file: &'a AuthFile) -> Option<&'a Map<String, Value>> {
    if file.provider_key.is_empty() {
        return file.root.as_object();
    }
    file.root
        .get(&file.provider_key)
        .and_then(|v| v.as_object())
}

fn entry_map_mut<'a>(file: &'a mut AuthFile) -> Option<&'a mut Map<String, Value>> {
    if file.provider_key.is_empty() {
        return file.root.as_object_mut();
    }
    file.root
        .get_mut(&file.provider_key)
        .and_then(|v| v.as_object_mut())
}

fn pick_session(file: &AuthFile) -> Option<(String, Option<String>, Option<String>)> {
    let o = entry_map(file)?;
    let token = o
        .get("key")
        .or_else(|| o.get("access_token"))
        .or_else(|| o.get("token"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())?;
    let email = o
        .get("email")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let first = o
        .get("first_name")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let last = o
        .get("last_name")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let display = match (first, last) {
        (Some(f), Some(l)) => Some(format!("{f}{l}")),
        (Some(f), None) => Some(f),
        (None, Some(l)) => Some(l),
        _ => None,
    };
    Some((token, email, display))
}

fn auth_expiry_unix(file: &AuthFile) -> u64 {
    let Some(o) = entry_map(file) else {
        return 0;
    };
    parse_expires_at(o.get("expires_at").and_then(|x| x.as_str())).unwrap_or_else(|| {
        // Fall back to JWT `exp` claim
        let tok = o
            .get("key")
            .or_else(|| o.get("access_token"))
            .and_then(|x| x.as_str())
            .unwrap_or("");
        jwt_exp_unix(tok).unwrap_or(0)
    })
}

fn access_token_usable(file: &AuthFile, skew_secs: u64) -> bool {
    let now = now_unix();
    let exp = auth_expiry_unix(file);
    if exp == 0 {
        // Unknown expiry: assume usable (API will 401 if not)
        return entry_map(file)
            .and_then(|o| {
                o.get("key")
                    .or_else(|| o.get("access_token"))
                    .and_then(|x| x.as_str())
            })
            .map(|t| !t.is_empty())
            .unwrap_or(false);
    }
    exp > now.saturating_add(skew_secs)
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Parse ISO-8601-ish expires_at (`2026-07-19T08:37:21.104128Z`).
fn parse_expires_at(s: Option<&str>) -> Option<u64> {
    let s = s?.trim();
    if s.is_empty() {
        return None;
    }
    // Prefer chrono-less parse: RFC3339 via `time` crate not available — manual.
    // Format: YYYY-MM-DDTHH:MM:SS(.frac)?Z or +00:00
    let s = s.trim_end_matches('Z');
    let s = s.split('+').next().unwrap_or(s);
    let (date, time) = s.split_once('T')?;
    let mut d = date.split('-');
    let y: i32 = d.next()?.parse().ok()?;
    let mo: u32 = d.next()?.parse().ok()?;
    let day: u32 = d.next()?.parse().ok()?;
    let time = time.split('.').next().unwrap_or(time);
    let mut t = time.split(':');
    let h: u32 = t.next()?.parse().ok()?;
    let mi: u32 = t.next()?.parse().ok()?;
    let se: u32 = t.next()?.parse().ok()?;
    // days from civil date (Howard Hinnant algorithm)
    let days = days_from_civil(y, mo, day)?;
    let secs = days * 86400i64 + (h as i64) * 3600 + (mi as i64) * 60 + se as i64;
    if secs < 0 {
        return None;
    }
    Some(secs as u64)
}

fn days_from_civil(y: i32, m: u32, d: u32) -> Option<i64> {
    if m < 1 || m > 12 || d < 1 || d > 31 {
        return None;
    }
    let y = y as i64;
    let m = m as i64;
    let d = d as i64;
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    // Unix epoch is 1970-01-01 = days 719468 from civil 0000-03-01 era system
    Some(era * 146097 + doe - 719468)
}

fn jwt_exp_unix(token: &str) -> Option<u64> {
    jwt_claim(token, "exp")?.as_u64()
}

fn jwt_claim(token: &str, key: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let padded = match payload.len() % 4 {
        0 => payload.to_string(),
        2 => format!("{payload}=="),
        3 => format!("{payload}="),
        _ => return None,
    };
    let bytes = base64url_decode(&padded)?;
    let v: Value = serde_json::from_slice(&bytes).ok()?;
    v.get(key).cloned()
}

/// Billing / models require `grok-cli:access` on the access token.
pub fn token_has_cli_access(token: &str) -> bool {
    let scope = jwt_claim(token, "scope")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    scope.split_whitespace().any(|s| s == "grok-cli:access")
        || scope.contains("grok-cli")
}

/// Human membership name from access-token JWT + optional plan id string.
/// Prefer explicit `subscription_tier` / plan id when present; else JWT `tier`.
pub fn membership_label_from_token(token: &str) -> Option<String> {
    // String plan ids first (if present)
    for key in ["subscription_tier", "plan", "plan_id", "tier_name", "product"] {
        if let Some(v) = jwt_claim(token, key) {
            if let Some(s) = v.as_str() {
                if let Some(label) = plan_id_to_label(s) {
                    return Some(label);
                }
                if !s.trim().is_empty() {
                    return Some(s.trim().to_string());
                }
            }
        }
    }
    // Numeric `tier` is what auth.x.ai currently embeds (e.g. tier: 1 → SuperGrok)
    if let Some(v) = jwt_claim(token, "tier") {
        if let Some(n) = v.as_i64().or_else(|| v.as_u64().map(|u| u as i64)) {
            if let Some(label) = jwt_tier_to_label(n) {
                return Some(label);
            }
        }
        if let Some(s) = v.as_str() {
            if let Ok(n) = s.parse::<i64>() {
                if let Some(label) = jwt_tier_to_label(n) {
                    return Some(label);
                }
            }
            if let Some(label) = plan_id_to_label(s) {
                return Some(label);
            }
        }
    }
    None
}

/// Map xAI plan id (from binary enums / telemetry) → display name.
pub fn plan_id_to_label(id: &str) -> Option<String> {
    let s = id.trim().to_ascii_lowercase().replace('-', "_").replace(' ', "_");
    let label = match s.as_str() {
        "supergrok_heavy" | "super_grok_heavy" => "SuperGrok Heavy",
        "supergrok" | "super_grok" => "SuperGrok",
        "supergrok_lite" | "super_grok_lite" => "SuperGrok Lite",
        "x_premium_plus" | "xpremium_plus" | "premium_plus" => "X Premium+",
        "x_premium" | "xpremium" | "premium" => "X Premium",
        "x_basic" | "xbasic" | "basic" => "X Basic",
        "api_key" | "apikey" => "API Key",
        "free" | "free_tier" => "Free",
        _ => return None,
    };
    Some(label.into())
}

/// JWT numeric `tier` claim (observed on auth.x.ai access tokens).
fn jwt_tier_to_label(tier: i64) -> Option<String> {
    // Heuristic from live tokens + product lineup (Free / SuperGrok / SuperGrok Heavy…)
    let label = match tier {
        0 => "Free",
        1 => "SuperGrok",
        2 => "SuperGrok Heavy",
        3 => "SuperGrok Lite",
        4 => "X Premium+",
        5 => "X Premium",
        6 => "X Basic",
        n if n > 0 => return Some(format!("Tier {n}")),
        _ => return None,
    };
    Some(label.into())
}

fn base64url_decode(s: &str) -> Option<Vec<u8>> {
    // Minimal base64url decoder (no padding handled by caller)
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'-' | b'+' => Some(62),
            b'_' | b'/' => Some(63),
            b'=' => Some(0),
            _ => None,
        }
    }
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let a = val(bytes[i])?;
        let b = val(bytes[i + 1])?;
        let c = val(bytes[i + 2])?;
        let d = val(bytes[i + 3])?;
        out.push((a << 2) | (b >> 4));
        if bytes[i + 2] != b'=' {
            out.push((b << 4) | (c >> 2));
        }
        if bytes[i + 3] != b'=' {
            out.push((c << 6) | d);
        }
        i += 4;
    }
    Some(out)
}

fn refresh_and_persist(path: &Path, file: &AuthFile) -> Result<AuthFile, String> {
    let o = entry_map(file).ok_or_else(|| "no auth entry".to_string())?;
    let refresh = o
        .get("refresh_token")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "no refresh_token in auth.json".to_string())?
        .to_string();
    let client_id = o
        .get("oidc_client_id")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            // provider key is often `https://auth.x.ai::CLIENT_ID`
            if file.provider_key.contains("::") {
                file.provider_key
                    .rsplit("::")
                    .next()
                    .map(|s| s.to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| "no oidc_client_id".to_string())?;
    let issuer = o
        .get("oidc_issuer")
        .and_then(|x| x.as_str())
        .unwrap_or("https://auth.x.ai")
        .trim_end_matches('/')
        .to_string();

    let token_url = discover_token_endpoint(&issuer)
        .unwrap_or_else(|| format!("{issuer}/oauth2/token"));

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("gorkX/0.4.1")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&token_url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!(
            "grant_type=refresh_token&refresh_token={}&client_id={}&scope={}",
            urlencoding_form(&refresh),
            urlencoding_form(&client_id),
            urlencoding_form(OIDC_SCOPES),
        ))
        .send()
        .map_err(|e| format!("refresh network: {e}"))?;
    let status = resp.status();
    let body_txt = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "OIDC refresh HTTP {status}: {}",
            body_txt.chars().take(120).collect::<String>()
        ));
    }
    let body: Value = serde_json::from_str(&body_txt).map_err(|e| e.to_string())?;
    let access = body
        .get("access_token")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "refresh response missing access_token".to_string())?
        .to_string();
    let new_refresh = body
        .get("refresh_token")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .unwrap_or(refresh);
    let expires_in = body
        .get("expires_in")
        .and_then(|x| x.as_u64().or_else(|| x.as_i64().map(|i| i as u64)))
        .unwrap_or(21_600);
    let expires_at = format_expires_at(now_unix().saturating_add(expires_in));

    let mut updated = AuthFile {
        root: file.root.clone(),
        provider_key: file.provider_key.clone(),
    };
    {
        let ent = entry_map_mut(&mut updated).ok_or_else(|| "auth entry missing".to_string())?;
        ent.insert("key".into(), json!(access));
        ent.insert("refresh_token".into(), json!(new_refresh));
        ent.insert("expires_at".into(), json!(expires_at));
    }
    let pretty = serde_json::to_string_pretty(&updated.root).map_err(|e| e.to_string())?;
    // Atomic-ish write
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, format!("{pretty}\n")).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::rename(&tmp, path) {
        std::fs::write(path, format!("{pretty}\n")).map_err(|e2| format!("write auth: {e} / {e2}"))?;
        let _ = std::fs::remove_file(&tmp);
    }
    Ok(updated)
}

fn discover_token_endpoint(issuer: &str) -> Option<String> {
    let url = format!("{issuer}/.well-known/openid-configuration");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("gorkX/0.4.1")
        .build()
        .ok()?;
    let resp = client.get(&url).send().ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: Value = resp.json().ok()?;
    v.get("token_endpoint")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

fn format_expires_at(unix: u64) -> String {
    // UTC ISO without external crate
    let secs = unix as i64;
    let days = secs.div_euclid(86400);
    let tod = secs.rem_euclid(86400) as u32;
    let h = tod / 3600;
    let mi = (tod % 3600) / 60;
    let se = tod % 60;
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{se:02}.000000Z")
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    // Inverse of days_from_civil (Howard Hinnant)
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

fn urlencoding_form(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Path helper for tests / diagnostics.
#[allow(dead_code)]
pub fn app_auth_path() -> PathBuf {
    crate::paths::auth_json_path()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_expires_at() {
        // 2026-07-19T09:20:32Z → 1784452832
        assert_eq!(
            parse_expires_at(Some("2026-07-19T09:20:32.000000Z")),
            Some(1_784_452_832)
        );
        assert_eq!(parse_expires_at(Some("1970-01-01T00:00:00Z")), Some(0));
    }

    #[test]
    fn roundtrip_civil_days() {
        for days in [0i64, 1, 365, 20_000, 20_650] {
            let (y, m, d) = civil_from_days(days);
            assert_eq!(days_from_civil(y, m, d), Some(days));
        }
    }
}
