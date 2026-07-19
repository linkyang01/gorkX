//! User-authorized, read-only GitHub REST adapter.
//!
//! A fine-grained PAT is deliberately entered by the user and stored only in
//! macOS Keychain. This is not a substitute for GitHub OAuth/App support and
//! never reads `gh` credentials or performs remote writes.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

const KEYCHAIN_SERVICE: &str = "com.gorkx.github";
const KEYCHAIN_ACCOUNT: &str = "read-token";
const API: &str = "https://api.github.com";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubStatus {
    pub configured: bool,
    pub connected: bool,
    pub login: Option<String>,
    pub error: Option<String>,
    pub note: String,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubCheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: String,
    pub details_url: String,
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

#[tauri::command]
pub fn github_status() -> GithubStatus {
    match token_read() {
        Some(_) => GithubStatus { configured: true, connected: false, login: None, error: None, note: "A GitHub token is stored in macOS Keychain. Test it before reading repository data.".into() },
        None => GithubStatus { configured: false, connected: false, login: None, error: None, note: "No GitHub token configured. gorkX has no access to GitHub until you add a read-only token.".into() },
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
    Ok(GithubStatus { configured: true, connected: true, login: Some(login), error: None, note: "Connected with a user-provided token. gorkX currently performs read-only GitHub requests.".into() })
}

#[tauri::command]
pub fn github_test_connection() -> GithubStatus {
    let Some(token) = token_read() else {
        return github_status();
    };
    match whoami(&token) {
        Ok(login) => GithubStatus {
            configured: true,
            connected: true,
            login: Some(login),
            error: None,
            note: "GitHub read-only connection verified.".into(),
        },
        Err(error) => GithubStatus {
            configured: true,
            connected: false,
            login: None,
            error: Some(error),
            note: "Stored token could not be verified. Replace or disconnect it.".into(),
        },
    }
}

#[tauri::command]
pub fn github_disconnect() -> Result<GithubStatus, String> {
    token_delete()?;
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
    let raw = String::from_utf8_lossy(&out.stdout)
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string();
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
    Ok((owner.to_string(), repo.to_string()))
}

#[tauri::command]
pub fn github_list_open_prs(cwd: String) -> Result<Vec<GithubPullRequest>, String> {
    let token = token_read()
        .ok_or_else(|| "GitHub is not connected. Add a read-only token first.".to_string())?;
    let (owner, repo) = github_repo_from_remote(&cwd)?;
    let response = client()?
        .get(format!(
            "{API}/repos/{owner}/{repo}/pulls?state=open&per_page=30"
        ))
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("GitHub network: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub HTTP {} while reading {owner}/{repo} pull requests",
            response.status()
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
    let token = token_read()
        .ok_or_else(|| "GitHub is not connected. Add a read-only token first.".to_string())?;
    let (owner, repo) = github_repo_from_remote(&cwd)?;
    let pull = client()?
        .get(format!("{API}/repos/{owner}/{repo}/pulls/{pr_number}"))
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("GitHub network: {e}"))?;
    if !pull.status().is_success() {
        return Err(format!(
            "GitHub HTTP {} while reading PR #{pr_number}",
            pull.status()
        ));
    }
    let pull: serde_json::Value = pull.json().map_err(|e| format!("GitHub response: {e}"))?;
    let sha = pull
        .get("head")
        .and_then(|v| v.get("sha"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "GitHub PR response has no head commit.".to_string())?;
    let checks = client()?
        .get(format!(
            "{API}/repos/{owner}/{repo}/commits/{sha}/check-runs"
        ))
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("GitHub network: {e}"))?;
    if !checks.status().is_success() {
        return Err(format!(
            "GitHub HTTP {} while reading checks for PR #{pr_number}",
            checks.status()
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
