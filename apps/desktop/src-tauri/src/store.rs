//! Local SQLite store for thread metadata + recent chat snapshots.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppStore {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMetaRow {
    pub id: String,
    pub project: String,
    pub title: String,
    pub session_id: Option<String>,
    pub model_id: Option<String>,
    pub cwd: String,
    pub worktree_path: Option<String>,
    pub effort: String,
    pub chat_mode: String,
    pub updated_at: i64,
    #[serde(default)]
    pub archived: bool,
    /// Active /goal text for task banner
    #[serde(default)]
    pub session_goal_text: Option<String>,
    /// active | paused | complete | blocked
    #[serde(default)]
    pub session_goal_status: Option<String>,
    #[serde(default)]
    pub session_goal_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatLineRow {
    pub id: String,
    pub role: String,
    pub text: String,
    pub tool_key: Option<String>,
    pub parent_subagent_id: Option<String>,
    pub tool_status: Option<String>,
    pub tool_kind: Option<String>,
}

pub fn db_path() -> Result<PathBuf, String> {
    let base = dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Library/Application Support")))
        .ok_or_else(|| "no data dir".to_string())?;
    let dir = base.join("gorkX");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("gorkx.db"))
}

impl AppStore {
    pub fn open() -> Result<Self, String> {
        let path = db_path()?;
        let conn = Connection::open(&path).map_err(|e| format!("sqlite open: {e}"))?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS thread_meta (
              id TEXT NOT NULL,
              project TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              session_id TEXT,
              model_id TEXT,
              cwd TEXT NOT NULL DEFAULT '',
              worktree_path TEXT,
              effort TEXT NOT NULL DEFAULT 'high',
              chat_mode TEXT NOT NULL DEFAULT 'agent',
              updated_at INTEGER NOT NULL,
              archived INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (project, id)
            );
            CREATE INDEX IF NOT EXISTS idx_thread_project_updated
              ON thread_meta(project, updated_at DESC);

            CREATE TABLE IF NOT EXISTS chat_lines (
              thread_id TEXT NOT NULL,
              project TEXT NOT NULL,
              seq INTEGER NOT NULL,
              id TEXT NOT NULL,
              role TEXT NOT NULL,
              text TEXT NOT NULL,
              tool_key TEXT,
              parent_subagent_id TEXT,
              tool_status TEXT,
              tool_kind TEXT,
              PRIMARY KEY (project, thread_id, seq)
            );
            CREATE INDEX IF NOT EXISTS idx_chat_thread
              ON chat_lines(project, thread_id, seq);

            CREATE TABLE IF NOT EXISTS kv (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            "#,
        )
        .map_err(|e| format!("sqlite migrate: {e}"))?;
        // Best-effort add columns for older DBs
        let _ = conn.execute(
            "ALTER TABLE thread_meta ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE thread_meta ADD COLUMN session_goal_text TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE thread_meta ADD COLUMN session_goal_status TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE thread_meta ADD COLUMN session_goal_message TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE chat_lines ADD COLUMN parent_subagent_id TEXT",
            [],
        );
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

#[tauri::command]
pub fn store_list_threads(store: State<'_, AppStore>, project: String) -> Result<Vec<ThreadMetaRow>, String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, project, title, session_id, model_id, cwd, worktree_path,
                   effort, chat_mode, updated_at, COALESCE(archived, 0),
                   session_goal_text, session_goal_status, session_goal_message
            FROM thread_meta
            WHERE project = ?1
            ORDER BY updated_at DESC
            LIMIT 48
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project], |r| {
            let arch: i64 = r.get(10)?;
            Ok(ThreadMetaRow {
                id: r.get(0)?,
                project: r.get(1)?,
                title: r.get(2)?,
                session_id: r.get(3)?,
                model_id: r.get(4)?,
                cwd: r.get(5)?,
                worktree_path: r.get(6)?,
                effort: r.get(7)?,
                chat_mode: r.get(8)?,
                updated_at: r.get(9)?,
                archived: arch != 0,
                session_goal_text: r.get(11)?,
                session_goal_status: r.get(12)?,
                session_goal_message: r.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn store_upsert_thread(store: State<'_, AppStore>, meta: ThreadMetaRow) -> Result<(), String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        r#"
        INSERT INTO thread_meta (
          id, project, title, session_id, model_id, cwd, worktree_path,
          effort, chat_mode, updated_at, archived,
          session_goal_text, session_goal_status, session_goal_message
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
        ON CONFLICT(project, id) DO UPDATE SET
          title=excluded.title,
          session_id=excluded.session_id,
          model_id=excluded.model_id,
          cwd=excluded.cwd,
          worktree_path=excluded.worktree_path,
          effort=excluded.effort,
          chat_mode=excluded.chat_mode,
          updated_at=excluded.updated_at,
          archived=excluded.archived,
          session_goal_text=excluded.session_goal_text,
          session_goal_status=excluded.session_goal_status,
          session_goal_message=excluded.session_goal_message
        "#,
        params![
            meta.id,
            meta.project,
            meta.title,
            meta.session_id,
            meta.model_id,
            meta.cwd,
            meta.worktree_path,
            meta.effort,
            meta.chat_mode,
            meta.updated_at,
            if meta.archived { 1 } else { 0 },
            meta.session_goal_text,
            meta.session_goal_status,
            meta.session_goal_message,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.display().to_string())
        .ok_or_else(|| "home dir not found".into())
}

/// Default root for app-created projects: `~/.gorkx/projects`
#[tauri::command]
pub fn projects_root() -> Result<String, String> {
    let home = dirs::home_dir().ok_or_else(|| "home dir not found".to_string())?;
    let root = home.join(".gorkx").join("projects");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root.display().to_string())
}

/// Create `~/.gorkx/projects/<safe_name>` (and a small README). Returns absolute path.
/// Rename a project folder on disk. Returns the new absolute path.
#[tauri::command]
pub fn rename_project_folder(old_path: String, new_name: String) -> Result<String, String> {
    let old = PathBuf::from(old_path.trim());
    if !old.is_dir() {
        return Err(format!("not a directory: {}", old.display()));
    }
    let raw = new_name.trim();
    if raw.is_empty() {
        return Err("new name is empty".into());
    }
    let mut safe = String::new();
    for ch in raw.chars() {
        if ch.is_alphanumeric() || ch == '-' || ch == '_' {
            safe.push(ch);
        } else if ch.is_whitespace() {
            if !safe.ends_with('-') {
                safe.push('-');
            }
        }
    }
    let safe = safe.trim_matches('-').to_string();
    if safe.is_empty() {
        return Err("invalid name".into());
    }
    let parent = old
        .parent()
        .ok_or_else(|| "no parent directory".to_string())?;
    let new_path = parent.join(&safe);
    if new_path == old {
        return Ok(old.display().to_string());
    }
    if new_path.exists() {
        return Err(format!("already exists: {}", new_path.display()));
    }
    std::fs::rename(&old, &new_path).map_err(|e| format!("rename failed: {e}"))?;
    Ok(new_path.display().to_string())
}

/// Move SQLite thread_meta + chat_lines from one project key to another; fix cwd prefix.
#[tauri::command]
pub fn store_rekey_project(
    store: State<'_, AppStore>,
    old_project: String,
    new_project: String,
) -> Result<(), String> {
    let old = old_project.trim();
    let new = new_project.trim();
    if old.is_empty() || new.is_empty() || old == new {
        return Ok(());
    }
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    // Update cwd if it was exactly old or under old/
    conn.execute(
        "UPDATE thread_meta SET project = ?1,
         cwd = CASE
           WHEN cwd = ?2 THEN ?1
           WHEN cwd LIKE ?3 THEN ?1 || substr(cwd, length(?2) + 1)
           ELSE cwd
         END,
         worktree_path = CASE
           WHEN worktree_path IS NULL THEN NULL
           WHEN worktree_path = ?2 THEN ?1
           WHEN worktree_path LIKE ?3 THEN ?1 || substr(worktree_path, length(?2) + 1)
           ELSE worktree_path
         END
         WHERE project = ?2",
        params![new, old, format!("{old}/%")],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE chat_lines SET project = ?1 WHERE project = ?2",
        params![new, old],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_named_project(name: String) -> Result<String, String> {
    let raw = name.trim();
    if raw.is_empty() {
        return Err("project name is empty".into());
    }
    // Allow unicode letters/numbers, dash, underscore, space → hyphen
    let mut safe = String::new();
    for ch in raw.chars() {
        if ch.is_alphanumeric() || ch == '-' || ch == '_' {
            safe.push(ch);
        } else if ch.is_whitespace() {
            if !safe.ends_with('-') {
                safe.push('-');
            }
        }
    }
    let safe = safe.trim_matches('-').to_string();
    if safe.is_empty() {
        return Err("invalid project name".into());
    }
    if safe.len() > 80 {
        return Err("project name too long".into());
    }
    let home = dirs::home_dir().ok_or_else(|| "home dir not found".to_string())?;
    let root = home.join(".gorkx").join("projects");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = root.join(&safe);
    if path.exists() {
        return Err(format!("already exists: {}", path.display()));
    }
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    // Marker so users know it was created by gorkX
    let readme = path.join("README.md");
    let body = format!(
        "# {safe}\n\nCreated by gorkX on {}.\n\nPath: `{}`\n",
        chrono_like_now(),
        path.display()
    );
    let _ = std::fs::write(&readme, body);
    Ok(path.display().to_string())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub authenticated: bool,
    /// Membership plan label e.g. "SuperGrok" / "SuperGrok Heavy" (from token/API).
    pub membership_label: Option<String>,
    /// Profile photo URL (https://assets.x.ai/…)
    pub avatar_url: Option<String>,
    /// Human label e.g. "已用 80%" or "剩余额度充足"
    pub quota_label: Option<String>,
    /// 0–100 used percent when known
    pub credit_usage_percent: Option<f64>,
    pub prepaid_balance: Option<f64>,
    pub on_demand_used: Option<f64>,
    pub on_demand_cap: Option<f64>,
    pub period_end: Option<String>,
    pub product_usage: Option<Vec<ProductUsageRow>>,
    pub quota_note: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductUsageRow {
    pub product: String,
    pub usage_percent: Option<f64>,
}

/// Load profile + a **usable** bearer (OIDC refresh / adopt ~/.grok when needed).
fn load_auth_token_and_profile() -> Result<(Option<String>, Option<String>, Option<String>), String> {
    match crate::auth::ensure_bearer_token() {
        Ok(p) => Ok((Some(p.token), p.email, p.display_name)),
        Err(e) => {
            // Soft: still try to surface email from stale auth for UI
            let path = crate::paths::auth_json_path();
            if path.is_file() {
                if let Ok(raw) = std::fs::read_to_string(&path) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                        let email = v
                            .as_object()
                            .and_then(|obj| {
                                obj.values().find_map(|val| {
                                    val.get("email").and_then(|x| x.as_str()).map(|s| s.to_string())
                                })
                            });
                        return Ok((None, email, None));
                    }
                }
            }
            eprintln!("[auth] {e}");
            Ok((None, None, None))
        }
    }
}

fn money_val(v: &serde_json::Value) -> Option<f64> {
    v.get("val")
        .and_then(|x| x.as_f64().or_else(|| x.as_i64().map(|i| i as f64)))
        .or_else(|| v.as_f64())
}

fn account_shell(
    email: Option<String>,
    display: Option<String>,
    authenticated: bool,
    membership: Option<String>,
    avatar_url: Option<String>,
    note: String,
) -> AccountSummary {
    AccountSummary {
        email,
        display_name: display,
        authenticated,
        membership_label: membership,
        avatar_url,
        quota_label: None,
        credit_usage_percent: None,
        prepaid_balance: None,
        on_demand_used: None,
        on_demand_cap: None,
        period_end: None,
        product_usage: None,
        quota_note: note,
    }
}

/// Fetch avatar as a `data:` URL so WebView CSP / Cloudflare bot rules cannot block it.
fn resolve_avatar_url(token: &str) -> Option<String> {
    crate::auth::resolve_avatar_data_url(token)
}

/// Safe account + **real** billing/credits from cli-chat-proxy (never returns tokens).
#[tauri::command]
pub fn account_summary() -> Result<AccountSummary, String> {
    let (token, email, display) = load_auth_token_and_profile()?;
    if token.is_none() {
        return Ok(account_shell(
            email,
            display,
            false,
            None,
            None,
            "not logged in — open Settings → Account, or run `grok login`".into(),
        ));
    }
    let mut token = token.unwrap();
    let mut email = email;
    let mut display = display;
    let mut membership = crate::auth::membership_label_from_token(&token);
    let mut avatar = resolve_avatar_url(&token);

    // Weak login (browser OIDC without grok-cli:access) cannot read quota
    if !crate::auth::token_has_cli_access(&token) {
        return Ok(account_shell(
            email,
            display,
            true,
            membership,
            avatar,
            "登录缺少 CLI 权限，请先「退出登录」再重新「登录」以读取额度".into(),
        ));
    }

    // Official CLI billing endpoint (same as Grok Build credits view)
    let url = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("gorkX/0.4.2")
        .build()
        .map_err(|e| e.to_string())?;

    let send_billing = |tok: &str| {
        client
            .get(url)
            .header("Authorization", format!("Bearer {tok}"))
            .header("Accept", "application/json")
            .header("x-grok-client-mode", "cli")
            // Official CLI middleware flag for session tokens
            .header("X-XAI-Token-Auth", "xai-grok-cli")
            .send()
    };

    let mut resp = match send_billing(&token) {
        Ok(r) => r,
        Err(e) => {
            return Ok(account_shell(
                email,
                display,
                true,
                membership,
                avatar,
                format!("billing network error: {e}"),
            ));
        }
    };

    // One forced refresh + retry on auth failure (token can die mid-session)
    if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
        if let Ok(p) = crate::auth::force_refresh_bearer_token() {
            token = p.token;
            email = p.email.or(email);
            display = p.display_name.or(display);
            membership = crate::auth::membership_label_from_token(&token).or(membership);
            avatar = resolve_avatar_url(&token).or(avatar);
            if crate::auth::token_has_cli_access(&token) {
                match send_billing(&token) {
                    Ok(r) => resp = r,
                    Err(e) => {
                        return Ok(account_shell(
                            email,
                            display,
                            true,
                            membership,
                            avatar,
                            format!("billing network error after refresh: {e}"),
                        ));
                    }
                }
            }
        }
    }

    let status = resp.status();
    if !status.is_success() {
        let body_txt = resp.text().unwrap_or_default();
        let hint = if body_txt.contains("grok-cli-token")
            || body_txt.contains("Grok Code CLI")
            || body_txt.contains("CLI permission")
        {
            "当前登录无 CLI 额度权限 — 请退出后重新登录"
        } else if status.as_u16() == 401 || status.as_u16() == 403 {
            "token 失效 — 请退出后重新登录"
        } else {
            "billing API error"
        };
        return Ok(account_shell(
            email,
            display,
            true,
            membership,
            avatar,
            format!(
                "{hint} (HTTP {status}) {}",
                body_txt.chars().take(60).collect::<String>()
            ),
        ));
    }
    let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    // Enrich membership from billing JSON if present
    membership = membership_from_billing(&body).or(membership);
    if avatar.is_none() {
        avatar = resolve_avatar_url(&token);
    }
    parse_billing_body(body, email, display, membership, avatar)
}

/// Pull plan name from billing payload when the API includes it.
fn membership_from_billing(body: &serde_json::Value) -> Option<String> {
    let cfg = body.get("config").unwrap_or(body);
    for key in [
        "subscriptionTier",
        "subscription_tier",
        "plan",
        "planName",
        "plan_name",
        "tier",
        "tierName",
        "productPlan",
    ] {
        if let Some(v) = cfg.get(key).or_else(|| body.get(key)) {
            if let Some(s) = v.as_str() {
                if let Some(l) = crate::auth::plan_id_to_label(s) {
                    return Some(l);
                }
                if !s.is_empty() {
                    return Some(s.to_string());
                }
            }
            if let Some(n) = v.as_i64().or_else(|| v.as_u64().map(|u| u as i64)) {
                // reuse jwt tier mapping via membership_label path
                let fake = format!(r#"{{"tier":{n}}}"#);
                // direct map
                if let Some(l) = match n {
                    0 => Some("Free"),
                    1 => Some("SuperGrok"),
                    2 => Some("SuperGrok Heavy"),
                    3 => Some("SuperGrok Lite"),
                    4 => Some("X Premium+"),
                    5 => Some("X Premium"),
                    6 => Some("X Basic"),
                    _ => None,
                } {
                    return Some(l.into());
                }
                let _ = fake;
            }
        }
    }
    None
}

fn parse_billing_body(
    body: serde_json::Value,
    email: Option<String>,
    display: Option<String>,
    membership: Option<String>,
    avatar_url: Option<String>,
) -> Result<AccountSummary, String> {
    let cfg = body.get("config").unwrap_or(&body);
    let mut pct = cfg.get("creditUsagePercent").and_then(|x| x.as_f64());
    // Fallback: GrokBuild product usage
    if pct.is_none() {
        if let Some(arr) = cfg.get("productUsage").and_then(|x| x.as_array()) {
            for p in arr {
                let name = p.get("product").and_then(|x| x.as_str()).unwrap_or("");
                if name.eq_ignore_ascii_case("GrokBuild") || name.contains("Build") {
                    pct = p.get("usagePercent").and_then(|x| x.as_f64());
                    break;
                }
            }
        }
    }
    // Fallback: monthly used/limit dollars → percent
    if pct.is_none() {
        let used = cfg.get("used").and_then(money_val);
        let limit = cfg.get("monthlyLimit").and_then(money_val);
        if let (Some(u), Some(l)) = (used, limit) {
            if l > 0.0 {
                pct = Some((u / l * 100.0).clamp(0.0, 100.0));
            }
        }
    }
    let prepaid = cfg.get("prepaidBalance").and_then(money_val);
    let on_used = cfg.get("onDemandUsed").and_then(money_val);
    let on_cap = cfg.get("onDemandCap").and_then(money_val);
    let period_end = cfg
        .get("currentPeriod")
        .and_then(|p| p.get("end"))
        .and_then(|x| x.as_str())
        .or_else(|| cfg.get("billingPeriodEnd").and_then(|x| x.as_str()))
        .map(|s| s.to_string());
    let mut products = Vec::new();
    if let Some(arr) = cfg.get("productUsage").and_then(|x| x.as_array()) {
        for p in arr {
            let name = p
                .get("product")
                .and_then(|x| x.as_str())
                .unwrap_or("?")
                .to_string();
            let up = p.get("usagePercent").and_then(|x| x.as_f64());
            products.push(ProductUsageRow {
                product: name,
                usage_percent: up,
            });
        }
    }
    // Keep label short for sidebar/footer — no reset timestamp in the compact line.
    let label = if let Some(p) = pct {
        let rem = (100.0 - p).max(0.0);
        Some(format!("已用 {p:.0}% · 剩 {rem:.0}%"))
    } else {
        None
    };
    Ok(AccountSummary {
        email,
        display_name: display,
        authenticated: true,
        membership_label: membership,
        avatar_url,
        quota_label: label,
        credit_usage_percent: pct,
        prepaid_balance: prepaid,
        on_demand_used: on_used,
        on_demand_cap: on_cap,
        period_end,
        product_usage: if products.is_empty() {
            None
        } else {
            Some(products)
        },
        quota_note: if pct.is_some() {
            "live from cli-chat-proxy /v1/billing?format=credits".into()
        } else {
            "billing ok but no creditUsagePercent field".into()
        },
    })
}


#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelContextInfo {
    pub model_id: String,
    pub name: Option<String>,
    pub context_window: u64,
    pub auto_compact_percent: u32,
    pub compactions_remaining: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedModelRow {
    pub model_id: String,
    pub name: Option<String>,
    pub context_window: Option<u64>,
    pub hidden: Option<bool>,
}

fn models_cache_path() -> std::path::PathBuf {
    crate::paths::grok_home().join("models_cache.json")
}

fn read_models_cache_value() -> Result<Option<serde_json::Value>, String> {
    let _ = crate::paths::ensure_dirs();
    let path = models_cache_path();
    let path = if path.exists() {
        path
    } else if let Some(home) = dirs::home_dir() {
        let legacy = home.join(".grok/models_cache.json");
        if legacy.exists() {
            legacy
        } else {
            return Ok(None);
        }
    } else {
        return Ok(None);
    };
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(Some(v))
}

fn models_map_from_cache(v: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    v.get("models")
        .and_then(|m| m.as_object())
        .cloned()
        .unwrap_or_default()
}

fn first_model_id(models: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    // Prefer non-hidden entries; fall back to first key
    for (k, entry) in models {
        let info = entry.get("info").unwrap_or(entry);
        let hidden = info.get("hidden").and_then(|x| x.as_bool()).unwrap_or(false);
        if !hidden {
            return Some(k.clone());
        }
    }
    models.keys().next().cloned()
}

/// List models from App GROK_HOME models cache + custom [model.*] entries.
#[tauri::command]
pub fn list_available_models(refresh: Option<bool>) -> Result<Vec<CachedModelRow>, String> {
    let do_refresh = refresh.unwrap_or(false);
    if do_refresh {
        let _ = refresh_models_cache_from_network();
    }
    let mut rows: Vec<CachedModelRow> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    if let Some(v) = read_models_cache_value()? {
        let models = models_map_from_cache(&v);
        for (id, entry) in models.iter() {
            let info = entry.get("info").unwrap_or(entry);
            let hidden = info.get("hidden").and_then(|x| x.as_bool()).unwrap_or(false);
            if hidden {
                continue;
            }
            let name = info
                .get("name")
                .or_else(|| info.get("system_prompt_label"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .or_else(|| Some(id.clone()));
            let context_window = info.get("context_window").and_then(|x| x.as_u64());
            seen.insert(id.clone());
            rows.push(CachedModelRow {
                model_id: id.clone(),
                name,
                context_window,
                hidden: Some(false),
            });
        }
    }
    // Custom / third-party models from config.toml
    if let Ok(snap) = crate::models_config::list_custom_models() {
        for m in snap.custom_models {
            let id = if m.id.is_empty() { m.model.clone() } else { m.id.clone() };
            if seen.contains(&id) {
                continue;
            }
            seen.insert(id.clone());
            rows.push(CachedModelRow {
                model_id: id,
                name: Some(if m.name.is_empty() {
                    m.model
                } else {
                    format!("{} · custom", m.name)
                }),
                context_window: m.context_window,
                hidden: Some(false),
            });
        }
    }
    rows.sort_by(|a, b| a.model_id.cmp(&b.model_id));
    Ok(rows)
}

fn refresh_models_cache_from_network() -> Result<(), String> {
    let (token, _, _) = load_auth_token_and_profile()?;
    let token = token.ok_or_else(|| "not logged in (no auth session in App GROK_HOME)".to_string())?;
    if !crate::auth::token_has_cli_access(&token) {
        return Err("login missing grok-cli:access — sign out and log in again".into());
    }
    let url = "https://cli-chat-proxy.grok.com/v1/models";
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json")
        .header("x-grok-client-mode", "cli")
        .header("X-XAI-Token-Auth", "xai-grok-cli")
        .header("User-Agent", "gorkX/0.4.2")
        .send()
        .map_err(|e| format!("models request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("models HTTP {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    // Accept either { models: { id: {...} } } or { data: [ { id, ... } ] }
    let mut map = serde_json::Map::new();
    if let Some(obj) = body.get("models").and_then(|m| m.as_object()) {
        for (k, v) in obj {
            map.insert(k.clone(), v.clone());
        }
    } else if let Some(arr) = body.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            let id = item
                .get("id")
                .or_else(|| item.get("model"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if id.is_empty() {
                continue;
            }
            map.insert(
                id,
                serde_json::json!({ "info": item }),
            );
        }
    } else if let Some(obj) = body.as_object() {
        // flat map of id -> info
        for (k, v) in obj {
            if k == "object" || k == "data" {
                continue;
            }
            if v.get("info").is_some() || v.get("name").is_some() || v.get("context_window").is_some() {
                map.insert(k.clone(), v.clone());
            }
        }
    }
    if map.is_empty() {
        return Err("models response empty".into());
    }
    let _ = crate::paths::ensure_dirs();
    let path = models_cache_path();
    let out = serde_json::json!({
        "fetched_at": chrono_like_now(),
        "auth_method": "session",
        "origin": url,
        "models": map,
    });
    std::fs::write(&path, serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn chrono_like_now() -> String {
    // Avoid extra chrono dep: use system time ISO-ish
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

/// Read context_window / auto_compact from ~/.grok/models_cache.json
/// (subscription models — no hardcoded model id when cache exists).
#[tauri::command]
pub fn model_context_info(model_id: Option<String>) -> Result<ModelContextInfo, String> {
    let cache = read_models_cache_value()?;
    let models = cache
        .as_ref()
        .map(models_map_from_cache)
        .unwrap_or_default();
    let mid = model_id
        .filter(|s| !s.trim().is_empty())
        .or_else(|| first_model_id(&models))
        .unwrap_or_else(|| "grok-4.5".into());
    let default = ModelContextInfo {
        model_id: mid.clone(),
        name: Some(mid.clone()),
        context_window: 500_000,
        auto_compact_percent: 80,
        compactions_remaining: None,
    };
    let Some(entry) = models.get(&mid).cloned().or_else(|| {
        models.values().next().cloned()
    }) else {
        return Ok(default);
    };
    let info = entry.get("info").unwrap_or(&entry);
    let context_window = info
        .get("context_window")
        .and_then(|x| x.as_u64())
        .unwrap_or(500_000);
    let auto_compact_percent = info
        .get("auto_compact_threshold_percent")
        .and_then(|x| x.as_u64())
        .unwrap_or(80) as u32;
    let name = info
        .get("name")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let resolved_id = info
        .get("id")
        .or_else(|| info.get("model"))
        .and_then(|x| x.as_str())
        .unwrap_or(&mid)
        .to_string();
    let compactions_remaining = info.get("compactions_remaining").and_then(|x| {
        if x.is_null() {
            None
        } else {
            x.as_i64()
        }
    });
    Ok(ModelContextInfo {
        model_id: resolved_id,
        name,
        context_window,
        auto_compact_percent,
        compactions_remaining,
    })
}

#[tauri::command]
pub fn store_remove_thread(
    store: State<'_, AppStore>,
    project: String,
    id: String,
) -> Result<(), String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM thread_meta WHERE project = ?1 AND id = ?2",
        params![project, id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM chat_lines WHERE project = ?1 AND thread_id = ?2",
        params![project, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn store_save_chat(
    store: State<'_, AppStore>,
    project: String,
    thread_id: String,
    lines: Vec<ChatLineRow>,
) -> Result<(), String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    // Cap snapshot size
    let start = lines.len().saturating_sub(200);
    let slice = &lines[start..];
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chat_lines WHERE project = ?1 AND thread_id = ?2",
        params![project, thread_id],
    )
    .map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                r#"
                INSERT INTO chat_lines (
                  thread_id, project, seq, id, role, text, tool_key, parent_subagent_id, tool_status, tool_kind
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
                "#,
            )
            .map_err(|e| e.to_string())?;
        for (i, line) in slice.iter().enumerate() {
            stmt.execute(params![
                thread_id,
                project,
                i as i64,
                line.id,
                line.role,
                line.text,
                line.tool_key,
                line.parent_subagent_id,
                line.tool_status,
                line.tool_kind,
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn store_load_chat(
    store: State<'_, AppStore>,
    project: String,
    thread_id: String,
) -> Result<Vec<ChatLineRow>, String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, role, text, tool_key, parent_subagent_id, tool_status, tool_kind
            FROM chat_lines
            WHERE project = ?1 AND thread_id = ?2
            ORDER BY seq ASC
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project, thread_id], |r| {
            Ok(ChatLineRow {
                id: r.get(0)?,
                role: r.get(1)?,
                text: r.get(2)?,
                tool_key: r.get(3)?,
                parent_subagent_id: r.get(4)?,
                tool_status: r.get(5)?,
                tool_kind: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn store_kv_get(store: State<'_, AppStore>, key: String) -> Result<Option<String>, String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM kv WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(row.get(0).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn store_kv_set(store: State<'_, AppStore>, key: String, value: String) -> Result<(), String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn store_db_path() -> Result<String, String> {
    Ok(db_path()?.display().to_string())
}

#[tauri::command]
pub fn store_data_dir() -> Result<String, String> {
    let p = db_path()?;
    Ok(p
        .parent()
        .map(|d| d.display().to_string())
        .unwrap_or_else(|| p.display().to_string()))
}

/// Drop chat snapshots for a project (keeps thread_meta).
#[tauri::command]
pub fn store_clear_chat(
    store: State<'_, AppStore>,
    project: Option<String>,
) -> Result<u64, String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let n = if let Some(p) = project.filter(|s| !s.is_empty()) {
        conn.execute("DELETE FROM chat_lines WHERE project = ?1", params![p])
            .map_err(|e| e.to_string())?
    } else {
        conn.execute("DELETE FROM chat_lines", [])
            .map_err(|e| e.to_string())?
    };
    Ok(n as u64)
}

/// Drop thread_meta + chat for a project.
#[tauri::command]
pub fn store_clear_project(store: State<'_, AppStore>, project: String) -> Result<(), String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM chat_lines WHERE project = ?1",
        params![project],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM thread_meta WHERE project = ?1",
        params![project],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
