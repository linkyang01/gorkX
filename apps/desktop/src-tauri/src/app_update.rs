//! gorkX self-update: check GitHub releases + download DMG and open it.
//! Works for installed .app users without code-signing (manual drag-replace).

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

const OWNER: &str = "linkyang01";
const REPO: &str = "gorkX";
const UA: &str = "gorkX-desktop-updater/0.4.2";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateCheck {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub html_url: Option<String>,
    pub dmg_url: Option<String>,
    pub dmg_name: Option<String>,
    pub dmg_bytes: Option<u64>,
    pub arch: String,
    pub error: Option<String>,
    pub note: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInstallResult {
    pub ok: bool,
    pub path: Option<String>,
    pub note: String,
}

fn host_arch() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        "x86_64" => "x86_64",
        other => other,
    }
}

fn compare_semver(a: &str, b: &str) -> i32 {
    let parse = |s: &str| -> Vec<u32> {
        s.split(|c| c == '.' || c == '+' || c == '-')
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let pa = parse(a);
    let pb = parse(b);
    let n = pa.len().max(pb.len());
    for i in 0..n {
        let da = pa.get(i).copied().unwrap_or(0);
        let db = pb.get(i).copied().unwrap_or(0);
        if da > db {
            return 1;
        }
        if da < db {
            return -1;
        }
    }
    0
}

fn strip_v(s: &str) -> String {
    s.trim().trim_start_matches(['v', 'V']).to_string()
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(UA)
        .build()
        .map_err(|e| e.to_string())
}

/// Prefer assets matching host arch (e.g. aarch64.dmg).
fn pick_dmg_asset(assets: &[serde_json::Value]) -> Option<(String, String, u64)> {
    let arch = host_arch();
    let mut candidates: Vec<(i32, String, String, u64)> = Vec::new();
    for a in assets {
        let name = a.get("name").and_then(|x| x.as_str()).unwrap_or("");
        let url = a
            .get("browser_download_url")
            .and_then(|x| x.as_str())
            .unwrap_or("");
        if name.is_empty() || url.is_empty() {
            continue;
        }
        let lower = name.to_ascii_lowercase();
        if !lower.ends_with(".dmg") {
            continue;
        }
        let mut score = 10;
        if lower.contains(arch) {
            score += 100;
        }
        if arch == "aarch64" && (lower.contains("arm64") || lower.contains("apple")) {
            score += 80;
        }
        if arch == "x86_64" && (lower.contains("x64") || lower.contains("intel")) {
            score += 80;
        }
        let size = a.get("size").and_then(|x| x.as_u64()).unwrap_or(0);
        candidates.push((score, name.to_string(), url.to_string(), size));
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    candidates
        .into_iter()
        .next()
        .map(|(_, n, u, s)| (n, u, s))
}

fn fetch_latest_release_json(
    client: &reqwest::blocking::Client,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.github.com/repos/{OWNER}/{REPO}/releases/latest");
    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("GitHub API network: {e}"))?;
    if resp.status().is_success() {
        return resp.json().map_err(|e| e.to_string());
    }
    let status = resp.status();
    let body = resp.text().unwrap_or_default();
    Err(format!(
        "GitHub API HTTP {status}: {}",
        body.chars().take(120).collect::<String>()
    ))
}

/// Fallback when API is rate-limited: follow /releases/latest → tag URL.
fn fetch_latest_tag_via_redirect(client: &reqwest::blocking::Client) -> Result<String, String> {
    let url = format!("https://github.com/{OWNER}/{REPO}/releases/latest");
    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("release redirect: {e}"))?;
    let final_url = resp.url().to_string();
    if let Some(cap) = final_url
        .rsplit("/tag/")
        .next()
        .map(|s| s.trim_end_matches('/'))
    {
        if !cap.is_empty() && !cap.contains("latest") {
            return Ok(strip_v(cap));
        }
    }
    // Parse path
    if let Some(idx) = final_url.find("/releases/tag/") {
        let tag = &final_url[idx + "/releases/tag/".len()..];
        let tag = tag.split(['?', '#']).next().unwrap_or(tag);
        if !tag.is_empty() {
            return Ok(strip_v(tag));
        }
    }
    Err(format!("could not parse tag from {final_url}"))
}

fn dmg_url_for_tag(tag: &str) -> (String, String) {
    let ver = strip_v(tag);
    let arch = host_arch();
    let name = format!("gorkX_{ver}_{arch}.dmg");
    let url = format!(
        "https://github.com/{OWNER}/{REPO}/releases/download/v{ver}/{name}"
    );
    // also try without v prefix in download path
    (name, url)
}

#[tauri::command]
pub fn app_update_check(current_version: Option<String>) -> Result<AppUpdateCheck, String> {
    let cur = strip_v(
        current_version
            .as_deref()
            .unwrap_or(env!("CARGO_PKG_VERSION")),
    );
    let arch = host_arch().to_string();
    let client = http_client()?;

    match fetch_latest_release_json(&client) {
        Ok(j) => {
            let latest = strip_v(j.get("tag_name").and_then(|x| x.as_str()).unwrap_or(""));
            let html = j
                .get("html_url")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            let assets = j
                .get("assets")
                .and_then(|x| x.as_array())
                .cloned()
                .unwrap_or_default();
            let (dmg_name, dmg_url, dmg_bytes) = pick_dmg_asset(&assets)
                .map(|(n, u, s)| (Some(n), Some(u), Some(s)))
                .unwrap_or_else(|| {
                    if latest.is_empty() {
                        (None, None, None)
                    } else {
                        let (n, u) = dmg_url_for_tag(&latest);
                        (Some(n), Some(u), None)
                    }
                });
            let update_available =
                !latest.is_empty() && !cur.is_empty() && compare_semver(&latest, &cur) > 0;
            Ok(AppUpdateCheck {
                current_version: cur,
                latest_version: if latest.is_empty() {
                    "—".into()
                } else {
                    latest
                },
                update_available,
                html_url: html.or_else(|| {
                    Some(format!("https://github.com/{OWNER}/{REPO}/releases"))
                }),
                dmg_url,
                dmg_name,
                dmg_bytes,
                arch,
                error: None,
                note: if update_available {
                    "有新版本可下载安装包".into()
                } else {
                    "已是最新版本".into()
                },
            })
        }
        Err(api_err) => {
            // Redirect fallback — may lack asset metadata
            match fetch_latest_tag_via_redirect(&client) {
                Ok(latest) => {
                    let (n, u) = dmg_url_for_tag(&latest);
                    let update_available =
                        !latest.is_empty() && !cur.is_empty() && compare_semver(&latest, &cur) > 0;
                    Ok(AppUpdateCheck {
                        current_version: cur,
                        latest_version: latest.clone(),
                        update_available,
                        html_url: Some(format!(
                            "https://github.com/{OWNER}/{REPO}/releases/tag/v{latest}"
                        )),
                        dmg_url: Some(u),
                        dmg_name: Some(n),
                        dmg_bytes: None,
                        arch,
                        error: Some(format!("API 不可用，已用发布页解析（{api_err}）")),
                        note: if update_available {
                            "有新版本可下载（经发布页解析）".into()
                        } else {
                            "已是最新版本（经发布页解析）".into()
                        },
                    })
                }
                Err(redir_err) => Ok(AppUpdateCheck {
                    current_version: cur,
                    latest_version: "—".into(),
                    update_available: false,
                    html_url: Some(format!("https://github.com/{OWNER}/{REPO}/releases")),
                    dmg_url: None,
                    dmg_name: None,
                    dmg_bytes: None,
                    arch,
                    error: Some(format!("{api_err}; {redir_err}")),
                    note: "无法检查更新".into(),
                }),
            }
        }
    }
}

fn downloads_dir() -> PathBuf {
    dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
        .unwrap_or_else(|| std::env::temp_dir())
}

/// Download the latest (or given) DMG into Downloads and open it for the user to install.
#[tauri::command]
pub fn app_update_install(dmg_url: Option<String>, dmg_name: Option<String>) -> Result<AppUpdateInstallResult, String> {
    let client = http_client()?;
    let (url, name) = if let (Some(u), Some(n)) = (dmg_url.clone(), dmg_name.clone()) {
        if !u.trim().is_empty() && !n.trim().is_empty() {
            (u, n)
        } else {
            // re-check
            let chk = app_update_check(None)?;
            let u = chk
                .dmg_url
                .ok_or_else(|| "无可用安装包下载地址".to_string())?;
            let n = chk.dmg_name.unwrap_or_else(|| "gorkX-update.dmg".into());
            (u, n)
        }
    } else {
        let chk = app_update_check(None)?;
        if !chk.update_available {
            // still allow re-download of current latest
            let u = chk
                .dmg_url
                .ok_or_else(|| "无可用安装包".to_string())?;
            let n = chk.dmg_name.unwrap_or_else(|| "gorkX-update.dmg".into());
            (u, n)
        } else {
            let u = chk
                .dmg_url
                .ok_or_else(|| "无可用安装包下载地址".to_string())?;
            let n = chk.dmg_name.unwrap_or_else(|| "gorkX-update.dmg".into());
            (u, n)
        }
    };

    let dest_dir = downloads_dir();
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let safe_name: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let dest = dest_dir.join(&safe_name);

    let resp = client
        .get(&url)
        .header("Accept", "application/octet-stream")
        .send()
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Ok(AppUpdateInstallResult {
            ok: false,
            path: None,
            note: format!("下载 HTTP {} — {}", resp.status(), url),
        });
    }
    let bytes = resp
        .bytes()
        .map_err(|e| format!("读取下载内容失败: {e}"))?;
    if bytes.len() < 1_000_000 {
        // DMG should be tens of MB; tiny body is likely an error page
        let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]);
        if preview.contains("Not Found") || preview.contains("<!DOCTYPE") {
            return Ok(AppUpdateInstallResult {
                ok: false,
                path: None,
                note: format!("安装包不存在或地址错误（{safe_name}）"),
            });
        }
    }
    {
        let mut f = File::create(&dest).map_err(|e| format!("写入失败: {e}"))?;
        f.write_all(&bytes).map_err(|e| format!("写入失败: {e}"))?;
    }

    // Open DMG so user can drag into Applications
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dest).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dest).spawn();
    }

    let mb = bytes.len() as f64 / (1024.0 * 1024.0);
    Ok(AppUpdateInstallResult {
        ok: true,
        path: Some(dest.display().to_string()),
        note: format!(
            "已下载 {safe_name}（{mb:.1} MB）并打开。请将 gorkX 拖入「应用程序」替换旧版，然后重新打开。"
        ),
    })
}

#[tauri::command]
pub fn app_current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
