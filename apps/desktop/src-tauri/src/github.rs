//! User-authorized GitHub REST adapter.
//!
//! A fine-grained PAT is deliberately entered by the user and stored only in
//! macOS Keychain. This is not a substitute for GitHub OAuth/App support and
//! never reads `gh` credentials. Remote writes are restricted to individually
//! confirmed actions in the UI.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const KEYCHAIN_SERVICE: &str = "com.gorkx.github";
const KEYCHAIN_ACCOUNT: &str = "read-token";
const API: &str = "https://api.github.com";
const GITHUB_OAUTH_CLIENT_ID: &str = "Ov23livbHzJdiRnxlavV";
const GITHUB_OAUTH_SCOPES: &str = "read:user public_repo";
const DEVICE_FLOW_URL: &str = "https://github.com/login/device/code";
const DEVICE_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
/// Non-secret connector metadata (never stores the token). Lives under the
/// app support directory so last-verified time survives process restarts.
const CONNECTOR_META_FILE: &str = "github-connector.json";

#[derive(Debug)]
struct PendingOAuth {
    device_code: String,
    expires_at: Instant,
    next_poll_at: Instant,
}

static PENDING_OAUTH: LazyLock<Mutex<HashMap<String, PendingOAuth>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static OAUTH_ATTEMPT_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubStatus {
    pub configured: bool,
    pub connected: bool,
    pub login: Option<String>,
    pub error: Option<String>,
    pub auth_method: Option<String>,
    /// OAuth requested scopes, or a short PAT disclaimer. Never secrets.
    pub scopes: Vec<String>,
    /// ISO-8601 UTC timestamp of the last successful `whoami` / connection test.
    pub last_verified_at: Option<String>,
    pub note: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GithubConnectorMeta {
    #[serde(default)]
    login: Option<String>,
    #[serde(default)]
    auth_method: Option<String>,
    #[serde(default)]
    scopes: Vec<String>,
    #[serde(default)]
    last_verified_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubOAuthStart {
    pub attempt_id: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubOAuthPoll {
    pub status: String,
    pub github: Option<GithubStatus>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(default)]
    verification_uri_complete: Option<String>,
    expires_in: u64,
    #[serde(default)]
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct GithubDeviceTokenResponse {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
    #[serde(default)]
    interval: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubPullRequest {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub author: String,
    pub updated_at: String,
    pub draft: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubCreatePullRequestInput {
    pub cwd: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    pub base: String,
    #[serde(default)]
    pub draft: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubCreatedPullRequest {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub head: String,
    pub base: String,
    pub draft: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubCreateIssueCommentInput {
    pub cwd: String,
    pub pr_number: u64,
    pub body: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubCreatedIssueComment {
    pub url: String,
    pub author: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubCheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: String,
    pub details_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubComment {
    pub kind: String,
    pub author: String,
    pub body: String,
    pub path: Option<String>,
    pub line: Option<i64>,
    pub url: String,
    pub created_at: String,
}

fn oauth_scope_list() -> Vec<String> {
    GITHUB_OAUTH_SCOPES
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

fn pat_scope_list() -> Vec<String> {
    vec![
        "fine-grained PAT (scopes chosen on GitHub)".into(),
        "never inherits gh CLI credentials".into(),
    ]
}

fn scopes_for_method(method: Option<&str>) -> Vec<String> {
    match method {
        Some("oauth") => oauth_scope_list(),
        Some("token") => pat_scope_list(),
        _ => oauth_scope_list(),
    }
}

fn connector_meta_path() -> std::path::PathBuf {
    crate::paths::app_support_dir().join(CONNECTOR_META_FILE)
}

fn read_connector_meta() -> GithubConnectorMeta {
    let path = connector_meta_path();
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return GithubConnectorMeta::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_connector_meta(meta: &GithubConnectorMeta) -> Result<(), String> {
    let path = connector_meta_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create app support dir: {e}"))?;
    }
    let raw =
        serde_json::to_string_pretty(meta).map_err(|e| format!("serialize GitHub meta: {e}"))?;
    std::fs::write(&path, raw).map_err(|e| format!("write GitHub meta: {e}"))
}

fn clear_connector_meta() {
    let _ = std::fs::remove_file(connector_meta_path());
}

fn now_verified_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn record_verified(token: &str, login: &str) {
    let method = auth_method(token);
    let meta = GithubConnectorMeta {
        login: Some(login.to_string()),
        auth_method: Some(method.clone()),
        scopes: scopes_for_method(Some(method.as_str())),
        last_verified_at: Some(now_verified_iso()),
    };
    let _ = write_connector_meta(&meta);
}

fn clear_last_verified_keep_identity(error_note: &str) -> GithubConnectorMeta {
    let mut meta = read_connector_meta();
    meta.last_verified_at = None;
    // Keep login/scopes for UI identity until the user disconnects, but mark
    // verification as stale when GitHub rejects the token.
    let _ = write_connector_meta(&meta);
    let _ = error_note;
    meta
}

#[cfg(target_os = "macos")]
fn token_read() -> Option<String> {
    let out = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let token = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (!token.is_empty()).then_some(token)
}

#[cfg(not(target_os = "macos"))]
fn token_read() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn token_store(token: &str) -> Result<(), String> {
    let out = Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
            token,
        ])
        .output()
        .map_err(|e| format!("macOS Keychain unavailable: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err("Could not save GitHub token to macOS Keychain.".into())
    }
}

#[cfg(not(target_os = "macos"))]
fn token_store(_token: &str) -> Result<(), String> {
    Err("GitHub token storage currently requires macOS Keychain.".into())
}

#[cfg(target_os = "macos")]
fn token_delete() -> Result<(), String> {
    let out = Command::new("security")
        .args([
            "delete-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
        ])
        .output()
        .map_err(|e| format!("macOS Keychain unavailable: {e}"))?;
    if out.status.success() || out.status.code() == Some(44) {
        Ok(())
    } else {
        Err("Could not remove GitHub token from macOS Keychain.".into())
    }
}

#[cfg(not(target_os = "macos"))]
fn token_delete() -> Result<(), String> {
    Err("GitHub token storage currently requires macOS Keychain.".into())
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("gorkX-desktop")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

/// Public GitHub repository metadata is intentionally available without an
/// account. A user-provided PAT is added only when present, so private repos
/// and higher rate limits continue to work without treating a token as a
/// prerequisite for every read-only Review action.
fn github_get(
    client: &reqwest::blocking::Client,
    url: String,
    token: Option<&str>,
) -> reqwest::blocking::RequestBuilder {
    let request = client
        .get(url)
        .header("Accept", "application/vnd.github+json");
    if let Some(token) = token {
        request.bearer_auth(token)
    } else {
        request
    }
}

fn github_read_error(status: reqwest::StatusCode, context: &str, token_present: bool) -> String {
    if !token_present && matches!(status.as_u16(), 401 | 403) {
        return format!(
            "GitHub HTTP {status} while {context}. Anonymous public reads may be rate-limited or blocked; add a read-only token to continue."
        );
    }
    format!("GitHub HTTP {status} while {context}")
}

fn whoami(token: &str) -> Result<String, String> {
    let response = client()?
        .get(format!("{API}/user"))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("GitHub network: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("GitHub HTTP {}", response.status()));
    }
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("GitHub response: {e}"))?;
    body.get("login")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "GitHub response has no login".into())
}

fn auth_method(token: &str) -> String {
    if token.starts_with("gho_") {
        "oauth".into()
    } else {
        "token".into()
    }
}

fn connected_status(token: &str, login: String, note: impl Into<String>) -> GithubStatus {
    let method = auth_method(token);
    record_verified(token, &login);
    let meta = read_connector_meta();
    GithubStatus {
        configured: true,
        connected: true,
        login: Some(login),
        error: None,
        auth_method: Some(method.clone()),
        scopes: if meta.scopes.is_empty() {
            scopes_for_method(Some(method.as_str()))
        } else {
            meta.scopes
        },
        last_verified_at: meta.last_verified_at,
        note: note.into(),
    }
}

fn oauth_error(response: &GithubDeviceTokenResponse) -> String {
    response
        .error_description
        .clone()
        .or_else(|| response.error.clone())
        .unwrap_or_else(|| "GitHub did not return an access token.".into())
}

#[tauri::command]
pub fn github_start_oauth() -> Result<GithubOAuthStart, String> {
    let response = client()?
        .post(DEVICE_FLOW_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_OAUTH_CLIENT_ID),
            ("scope", GITHUB_OAUTH_SCOPES),
        ])
        .send()
        .map_err(|e| format!("GitHub authorization could not start: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub authorization could not start (HTTP {}).",
            response.status()
        ));
    }
    let body: GithubDeviceCodeResponse = response
        .json()
        .map_err(|e| format!("GitHub authorization response: {e}"))?;
    if body.device_code.is_empty() || body.user_code.is_empty() || body.verification_uri.is_empty()
    {
        return Err("GitHub authorization response is incomplete.".into());
    }
    let interval = body.interval.max(5);
    let nonce = OAUTH_ATTEMPT_COUNTER.fetch_add(1, Ordering::Relaxed);
    let attempt_id = format!("{}-{nonce}", chrono::Utc::now().timestamp_millis());
    let now = Instant::now();
    let mut pending = PENDING_OAUTH
        .lock()
        .map_err(|_| "GitHub authorization state is unavailable.".to_string())?;
    pending.retain(|_, value| value.expires_at > now);
    pending.insert(
        attempt_id.clone(),
        PendingOAuth {
            device_code: body.device_code,
            expires_at: now + Duration::from_secs(body.expires_in),
            next_poll_at: now + Duration::from_secs(interval),
        },
    );
    Ok(GithubOAuthStart {
        attempt_id,
        user_code: body.user_code,
        verification_uri: body.verification_uri,
        verification_uri_complete: body.verification_uri_complete,
        expires_in: body.expires_in,
        interval,
    })
}

#[tauri::command]
pub fn github_poll_oauth(attempt_id: String) -> Result<GithubOAuthPoll, String> {
    let now = Instant::now();
    let device_code = {
        let mut pending = PENDING_OAUTH
            .lock()
            .map_err(|_| "GitHub authorization state is unavailable.".to_string())?;
        let Some(flow) = pending.get_mut(&attempt_id) else {
            return Ok(GithubOAuthPoll {
                status: "expired".into(),
                github: None,
                message: Some("This GitHub authorization request has expired. Start again.".into()),
            });
        };
        if flow.expires_at <= now {
            pending.remove(&attempt_id);
            return Ok(GithubOAuthPoll {
                status: "expired".into(),
                github: None,
                message: Some("This GitHub authorization request has expired. Start again.".into()),
            });
        }
        if flow.next_poll_at > now {
            return Ok(GithubOAuthPoll {
                status: "pending".into(),
                github: None,
                message: None,
            });
        }
        flow.next_poll_at = now + Duration::from_secs(5);
        flow.device_code.clone()
    };
    let response = client()?
        .post(DEVICE_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_OAUTH_CLIENT_ID),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .map_err(|e| format!("GitHub authorization check failed: {e}"))?;
    let body: GithubDeviceTokenResponse = response
        .json()
        .map_err(|e| format!("GitHub authorization response: {e}"))?;
    if let Some(token) = body
        .access_token
        .as_deref()
        .filter(|token| !token.trim().is_empty())
    {
        let login = whoami(token)?;
        token_store(token)?;
        PENDING_OAUTH
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(&attempt_id));
        return Ok(GithubOAuthPoll {
            status: "connected".into(),
            github: Some(connected_status(
                token,
                login,
                "GitHub connected with browser authorization.",
            )),
            message: None,
        });
    }
    match body.error.as_deref() {
        Some("authorization_pending") => Ok(GithubOAuthPoll {
            status: "pending".into(),
            github: None,
            message: None,
        }),
        Some("slow_down") => {
            if let Ok(mut pending) = PENDING_OAUTH.lock() {
                if let Some(flow) = pending.get_mut(&attempt_id) {
                    flow.next_poll_at =
                        Instant::now() + Duration::from_secs(body.interval.unwrap_or(10).max(10));
                }
            }
            Ok(GithubOAuthPoll {
                status: "pending".into(),
                github: None,
                message: None,
            })
        }
        Some("expired_token") | Some("access_denied") => {
            PENDING_OAUTH
                .lock()
                .ok()
                .and_then(|mut pending| pending.remove(&attempt_id));
            Ok(GithubOAuthPoll {
                status: "cancelled".into(),
                github: None,
                message: Some(oauth_error(&body)),
            })
        }
        _ => Ok(GithubOAuthPoll {
            status: "error".into(),
            github: None,
            message: Some(oauth_error(&body)),
        }),
    }
}

#[tauri::command]
pub fn github_status() -> GithubStatus {
    let meta = read_connector_meta();
    match token_read() {
        Some(token) => {
            let method = auth_method(&token);
            GithubStatus {
                configured: true,
                // Keychain presence is not a live connection; only a successful
                // whoami marks connected.
                connected: false,
                login: meta.login.clone(),
                error: None,
                auth_method: Some(method.clone()),
                scopes: if meta.scopes.is_empty() {
                    scopes_for_method(Some(method.as_str()))
                } else {
                    meta.scopes
                },
                last_verified_at: meta.last_verified_at,
                note: "GitHub authorization is stored in macOS Keychain. Test it before reading repository data.".into(),
            }
        }
        None => GithubStatus {
            configured: false,
            connected: false,
            login: None,
            error: None,
            auth_method: None,
            scopes: oauth_scope_list(),
            last_verified_at: None,
            note: "No GitHub authorization configured. Public repository reads are available anonymously; private repositories require a fine-grained token.".into(),
        },
    }
}

#[tauri::command]
pub fn github_connect_readonly(token: String) -> Result<GithubStatus, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Enter a GitHub fine-grained personal access token first.".into());
    }
    let login = whoami(token)?;
    token_store(token)?;
    Ok(connected_status(
        token,
        login,
        "Connected with a user-provided token.",
    ))
}

#[tauri::command]
pub fn github_test_connection() -> GithubStatus {
    let Some(token) = token_read() else {
        return github_status();
    };
    match whoami(&token) {
        Ok(login) => connected_status(&token, login, "GitHub connection verified."),
        Err(error) => {
            let method = auth_method(&token);
            let meta = clear_last_verified_keep_identity(&error);
            let revoked = error.contains("401")
                || error.contains("403")
                || error.contains("HTTP 401")
                || error.contains("HTTP 403");
            GithubStatus {
                configured: true,
                connected: false,
                login: meta.login,
                error: Some(if revoked {
                    format!("{error}. The stored authorization may have been revoked or expired on GitHub.")
                } else {
                    error
                }),
                auth_method: Some(method.clone()),
                scopes: if meta.scopes.is_empty() {
                    scopes_for_method(Some(method.as_str()))
                } else {
                    meta.scopes
                },
                last_verified_at: None,
                note: if revoked {
                    "Stored authorization is no longer accepted by GitHub. Disconnect and reconnect after fixing access on GitHub.".into()
                } else {
                    "Stored token could not be verified. Replace or disconnect it.".into()
                },
            }
        }
    }
}

#[tauri::command]
pub fn github_disconnect() -> Result<GithubStatus, String> {
    token_delete()?;
    clear_connector_meta();
    Ok(github_status())
}

fn github_repo_from_remote(cwd: &str) -> Result<(String, String), String> {
    if !Path::new(cwd).is_dir() {
        return Err("Choose a local Git repository first.".into());
    }
    let out = Command::new("git")
        .args(["-C", cwd, "config", "--get", "remote.origin.url"])
        .output()
        .map_err(|e| format!("read Git remote: {e}"))?;
    if !out.status.success() {
        return Err("This Git repository has no origin remote.".into());
    }
    parse_github_remote(&String::from_utf8_lossy(&out.stdout))
}

fn parse_github_remote(raw: &str) -> Result<(String, String), String> {
    let raw = raw.trim().trim_end_matches('/').trim_end_matches(".git");
    let path = raw
        .strip_prefix("git@github.com:")
        .or_else(|| raw.strip_prefix("https://github.com/"))
        .or_else(|| raw.strip_prefix("ssh://git@github.com/"))
        .ok_or_else(|| "origin is not a GitHub remote.".to_string())?;
    let mut parts = path.split('/');
    let owner = parts
        .next()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "GitHub remote has no owner.".to_string())?;
    let repo = parts
        .next()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "GitHub remote has no repository.".to_string())?;
    if parts.next().is_some() {
        return Err("GitHub remote has an unexpected path.".into());
    }
    if !github_repo_segment(owner) || !github_repo_segment(repo) {
        return Err("GitHub remote has an invalid owner or repository name.".into());
    }
    Ok((owner.to_string(), repo.to_string()))
}

/// GitHub repository URL path segments never need URL escapes, credentials, or
/// query strings. Validate before interpolating them into REST endpoint paths.
fn github_repo_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

/// Git branch/ref validation is intentionally stricter than git's full ref
/// grammar: this value is displayed to the user and sent to GitHub as a PR
/// head/base, never as an arbitrary git argument.
fn github_branch_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value != "HEAD"
        && !value.starts_with('-')
        && !value.starts_with('/')
        && !value.ends_with('/')
        && !value.contains("..")
        && !value.contains("//")
        && !value.bytes().any(|b| {
            b.is_ascii_control()
                || b == b' '
                || b == b'~'
                || b == b'^'
                || b == b':'
                || b == b'?'
                || b == b'*'
                || b == b'['
                || b == b'\\'
        })
}

fn valid_comment_body(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.len() <= 65_536 && !trimmed.as_bytes().contains(&0)
}

fn current_pushed_branch(cwd: &str) -> Result<String, String> {
    let out = Command::new("git")
        .args(["-C", cwd, "branch", "--show-current"])
        .output()
        .map_err(|e| format!("read current branch: {e}"))?;
    if !out.status.success() {
        return Err("Could not read the current Git branch.".into());
    }
    let branch = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !github_branch_name(&branch) {
        return Err("Create a named Git branch before opening a pull request.".into());
    }
    let remote_ref = format!("refs/remotes/origin/{branch}");
    let pushed = Command::new("git")
        .args(["-C", cwd, "show-ref", "--verify", "--quiet", &remote_ref])
        .status()
        .map_err(|e| format!("check pushed branch: {e}"))?;
    if !pushed.success() {
        return Err("Push the current branch to origin before creating a pull request. gorkX will not push it automatically.".into());
    }
    Ok(branch)
}

/// Create a pull request only after the UI gives a separate explicit
/// confirmation. This command never creates or pushes a local branch.
#[tauri::command]
pub fn github_create_pull_request(
    input: GithubCreatePullRequestInput,
) -> Result<GithubCreatedPullRequest, String> {
    let token = token_read().ok_or_else(|| {
        "Connect a GitHub token with Pull requests: write permission first.".to_string()
    })?;
    let title = input.title.trim();
    if title.is_empty() || title.len() > 256 || title.bytes().any(|b| b.is_ascii_control()) {
        return Err(
            "Pull request title must be 1–256 characters without control characters.".into(),
        );
    }
    if input.body.len() > 65_536 {
        return Err("Pull request description is too long (maximum 65,536 characters).".into());
    }
    let base = input.base.trim();
    if !github_branch_name(base) {
        return Err("Enter a valid base branch, such as main.".into());
    }
    let (owner, repo) = github_repo_from_remote(&input.cwd)?;
    let head = current_pushed_branch(&input.cwd)?;
    let response = client()?
        .post(format!("{API}/repos/{owner}/{repo}/pulls"))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2026-03-10")
        .json(&serde_json::json!({
            "title": title,
            "body": input.body,
            "head": head,
            "base": base,
            "draft": input.draft,
        }))
        .send()
        .map_err(|e| format!("GitHub network: {e}"))?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 | 403 => "GitHub refused to create the pull request. The token needs Pull requests: write permission for this repository.".into(),
            422 => "GitHub could not create the pull request. Check that the pushed branch differs from the base branch and no equivalent PR is already open.".into(),
            status => format!("GitHub HTTP {status} while creating the pull request (response details hidden)."),
        });
    }
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("GitHub response: {e}"))?;
    Ok(GithubCreatedPullRequest {
        number: body
            .get("number")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| "GitHub create response has no PR number.".to_string())?,
        title: body
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or(title)
            .to_string(),
        url: body
            .get("html_url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        head,
        base: base.to_string(),
        draft: input.draft,
    })
}

/// Add a discussion comment to an existing pull request. The UI must present a
/// separate confirmation before calling this command; no model/tool call can
/// silently publish text through the GitHub adapter.
#[tauri::command]
pub fn github_create_pr_comment(
    input: GithubCreateIssueCommentInput,
) -> Result<GithubCreatedIssueComment, String> {
    let token = token_read().ok_or_else(|| {
        "Connect a GitHub token with Issues: write or Pull requests: write permission first."
            .to_string()
    })?;
    if input.pr_number == 0 {
        return Err("Choose a pull request before commenting.".into());
    }
    let body = input.body.trim();
    if !valid_comment_body(body) {
        return Err("Comment must be 1–65,536 characters and cannot contain NUL bytes.".into());
    }
    let (owner, repo) = github_repo_from_remote(&input.cwd)?;
    let response = client()?
        .post(format!(
            "{API}/repos/{owner}/{repo}/issues/{}/comments",
            input.pr_number
        ))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2026-03-10")
        .json(&serde_json::json!({ "body": body }))
        .send()
        .map_err(|e| format!("GitHub network: {e}"))?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 | 403 => "GitHub refused to post the comment. The token needs Issues: write or Pull requests: write permission for this repository.".into(),
            404 => "GitHub could not find this pull request in the current origin repository.".into(),
            422 => "GitHub could not post this comment. Check the text and try again later.".into(),
            status => format!("GitHub HTTP {status} while posting the comment (response details hidden)."),
        });
    }
    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("GitHub response: {e}"))?;
    Ok(GithubCreatedIssueComment {
        url: body
            .get("html_url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        author: body
            .get("user")
            .and_then(|v| v.get("login"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        created_at: body
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

#[tauri::command]
pub fn github_list_open_prs(cwd: String) -> Result<Vec<GithubPullRequest>, String> {
    list_open_prs(&cwd, token_read().as_deref())
}

fn list_open_prs(cwd: &str, token: Option<&str>) -> Result<Vec<GithubPullRequest>, String> {
    let (owner, repo) = github_repo_from_remote(cwd)?;
    let http = client()?;
    let response = github_get(
        &http,
        format!("{API}/repos/{owner}/{repo}/pulls?state=open&per_page=100"),
        token,
    )
    .send()
    .map_err(|e| format!("GitHub network: {e}"))?;
    if !response.status().is_success() {
        return Err(github_read_error(
            response.status(),
            &format!("reading {owner}/{repo} pull requests"),
            token.is_some(),
        ));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .map_err(|e| format!("GitHub response: {e}"))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            Some(GithubPullRequest {
                number: row.get("number")?.as_u64()?,
                title: row.get("title")?.as_str()?.to_string(),
                state: row
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("open")
                    .to_string(),
                url: row
                    .get("html_url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                author: row
                    .get("user")
                    .and_then(|v| v.get("login"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                updated_at: row
                    .get("updated_at")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                draft: row.get("draft").and_then(|v| v.as_bool()).unwrap_or(false),
            })
        })
        .collect())
}

#[tauri::command]
pub fn github_list_pr_checks(cwd: String, pr_number: u64) -> Result<Vec<GithubCheckRun>, String> {
    let token = token_read();
    let (owner, repo) = github_repo_from_remote(&cwd)?;
    let http = client()?;
    let pull = github_get(
        &http,
        format!("{API}/repos/{owner}/{repo}/pulls/{pr_number}"),
        token.as_deref(),
    )
    .send()
    .map_err(|e| format!("GitHub network: {e}"))?;
    if !pull.status().is_success() {
        return Err(github_read_error(
            pull.status(),
            &format!("reading PR #{pr_number}"),
            token.is_some(),
        ));
    }
    let pull: serde_json::Value = pull.json().map_err(|e| format!("GitHub response: {e}"))?;
    let sha = pull
        .get("head")
        .and_then(|v| v.get("sha"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "GitHub PR response has no head commit.".to_string())?;
    let checks = github_get(
        &http,
        format!("{API}/repos/{owner}/{repo}/commits/{sha}/check-runs?per_page=100"),
        token.as_deref(),
    )
    .send()
    .map_err(|e| format!("GitHub network: {e}"))?;
    if !checks.status().is_success() {
        return Err(github_read_error(
            checks.status(),
            &format!("reading checks for PR #{pr_number}"),
            token.is_some(),
        ));
    }
    let body: serde_json::Value = checks.json().map_err(|e| format!("GitHub response: {e}"))?;
    Ok(body
        .get("check_runs")
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .map(|row| GithubCheckRun {
            name: row
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unnamed check")
                .to_string(),
            status: row
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            conclusion: row
                .get("conclusion")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            url: row
                .get("html_url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            details_url: row
                .get("details_url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
        .collect())
}

#[tauri::command]
pub fn github_list_pr_comments(cwd: String, pr_number: u64) -> Result<Vec<GithubComment>, String> {
    let token = token_read();
    let (owner, repo) = github_repo_from_remote(&cwd)?;
    let http = client()?;
    let get_rows = |url: String| -> Result<Vec<serde_json::Value>, String> {
        let response = github_get(&http, url, token.as_deref())
            .send()
            .map_err(|e| format!("GitHub network: {e}"))?;
        if !response.status().is_success() {
            return Err(github_read_error(
                response.status(),
                &format!("reading comments for PR #{pr_number}"),
                token.is_some(),
            ));
        }
        response.json().map_err(|e| format!("GitHub response: {e}"))
    };
    let mut comments = Vec::new();
    for (kind, rows) in [
        (
            "discussion",
            get_rows(format!(
                "{API}/repos/{owner}/{repo}/issues/{pr_number}/comments?per_page=100"
            ))?,
        ),
        (
            "review",
            get_rows(format!(
                "{API}/repos/{owner}/{repo}/pulls/{pr_number}/comments?per_page=100"
            ))?,
        ),
    ] {
        for row in rows {
            comments.push(GithubComment {
                kind: kind.into(),
                author: row
                    .get("user")
                    .and_then(|v| v.get("login"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                body: row
                    .get("body")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                path: row.get("path").and_then(|v| v.as_str()).map(str::to_string),
                line: row
                    .get("line")
                    .and_then(|v| v.as_i64())
                    .or_else(|| row.get("original_line").and_then(|v| v.as_i64())),
                url: row
                    .get("html_url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                created_at: row
                    .get("created_at")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            });
        }
    }
    comments.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(comments)
}

#[cfg(test)]
mod tests {
    use super::{
        github_branch_name, github_read_error, oauth_scope_list, parse_github_remote,
        scopes_for_method, valid_comment_body,
    };

    #[test]
    fn oauth_scopes_match_device_flow_request() {
        let scopes = oauth_scope_list();
        assert!(scopes.iter().any(|s| s == "read:user"));
        assert!(scopes.iter().any(|s| s == "public_repo"));
        assert_eq!(scopes_for_method(Some("oauth")), scopes);
        let pat = scopes_for_method(Some("token"));
        assert!(pat.iter().any(|s| s.contains("fine-grained")));
    }

    #[test]
    fn parses_supported_github_remote_forms() {
        for raw in [
            "git@github.com:owner/repo.git",
            "https://github.com/owner/repo.git",
            "ssh://git@github.com/owner/repo",
        ] {
            assert_eq!(
                parse_github_remote(raw).unwrap(),
                ("owner".into(), "repo".into())
            );
        }
    }

    #[test]
    fn rejects_non_github_remote() {
        assert!(parse_github_remote("https://gitlab.com/owner/repo.git").is_err());
    }

    #[test]
    fn rejects_non_repository_path_segments() {
        for raw in [
            "https://github.com/owner/repo?query=1",
            "https://github.com/owner/repo%2Fother",
            "https://github.com/owner/repo#fragment",
            "git@github.com:owner/repo name.git",
        ] {
            assert!(parse_github_remote(raw).is_err(), "accepted {raw}");
        }
    }

    #[test]
    fn anonymous_rate_limit_explains_the_pat_recovery_path() {
        let message = github_read_error(
            reqwest::StatusCode::FORBIDDEN,
            "reading owner/repo pull requests",
            false,
        );
        assert!(message.contains("rate-limited"));
        assert!(message.contains("read-only token"));
    }

    #[test]
    fn accepts_safe_branch_names_for_pr_creation() {
        for branch in ["main", "feature/model-catalog", "release_1.0"] {
            assert!(github_branch_name(branch), "rejected {branch}");
        }
        for branch in ["HEAD", "-bad", "a..b", "a b", "a:ref", "a//b"] {
            assert!(!github_branch_name(branch), "accepted {branch}");
        }
    }

    #[test]
    fn comment_body_requires_bounded_visible_content() {
        assert!(valid_comment_body("Looks good."));
        assert!(!valid_comment_body(" \n\t "));
        assert!(!valid_comment_body("bad\0comment"));
        assert!(!valid_comment_body(&"a".repeat(65_537)));
    }
}
