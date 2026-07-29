//! Local SQLite store for thread metadata + recent chat snapshots.

use rusqlite::{params, Connection, OptionalExtension};
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
    #[serde(default)]
    pub attachments_json: Option<String>,
    #[serde(default)]
    pub at: Option<i64>,
}

/// A bounded, local-only task search result. It deliberately contains only
/// task metadata and one short message excerpt; attachments and raw SQLite
/// rows never leave the App data store through this search surface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSearchHit {
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
    pub archived: bool,
    pub session_goal_text: Option<String>,
    pub session_goal_status: Option<String>,
    pub session_goal_message: Option<String>,
    pub excerpt: String,
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
              attachments_json TEXT,
              at INTEGER,
              PRIMARY KEY (project, thread_id, seq)
            );
            CREATE INDEX IF NOT EXISTS idx_chat_thread
              ON chat_lines(project, thread_id, seq);

            CREATE TABLE IF NOT EXISTS kv (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            -- Local accounting for token counters reported by ACP.  This is
            -- intentionally separate from subscription billing: ACP reports
            -- per-session counters while the provider billing API reports a
            -- quota percentage.
            CREATE TABLE IF NOT EXISTS daily_token_usage (
              day TEXT PRIMARY KEY,
              total_tokens INTEGER NOT NULL DEFAULT 0,
              input_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              cached_read_tokens INTEGER NOT NULL DEFAULT 0,
              reasoning_tokens INTEGER NOT NULL DEFAULT 0,
              updated_at INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS token_usage_events (
              event_key TEXT PRIMARY KEY,
              recorded_at INTEGER NOT NULL
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
        let _ = conn.execute("ALTER TABLE chat_lines ADD COLUMN attachments_json TEXT", []);
        let _ = conn.execute("ALTER TABLE chat_lines ADD COLUMN at INTEGER", []);
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageInput {
    pub total_tokens: Option<i64>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cached_read_tokens: Option<i64>,
    pub reasoning_tokens: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTokenUsageRow {
    pub day: String,
    pub total_tokens: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_read_tokens: i64,
    pub reasoning_tokens: i64,
    pub updated_at: i64,
}

fn nonnegative(value: Option<i64>) -> i64 {
    value.unwrap_or(0).max(0)
}

fn valid_usage_day(day: &str) -> bool {
    day.len() == 10
        && day.as_bytes().get(4) == Some(&b'-')
        && day.as_bytes().get(7) == Some(&b'-')
        && day.chars().enumerate().all(|(index, c)| match index {
            4 | 7 => c == '-',
            _ => c.is_ascii_digit(),
        })
}

fn read_daily_usage(conn: &Connection, day: &str) -> Result<DailyTokenUsageRow, String> {
    conn.query_row(
        "SELECT day, total_tokens, input_tokens, output_tokens, cached_read_tokens, reasoning_tokens, updated_at FROM daily_token_usage WHERE day = ?1",
        params![day],
        |row| Ok(DailyTokenUsageRow {
            day: row.get(0)?,
            total_tokens: row.get(1)?,
            input_tokens: row.get(2)?,
            output_tokens: row.get(3)?,
            cached_read_tokens: row.get(4)?,
            reasoning_tokens: row.get(5)?,
            updated_at: row.get(6)?,
        }),
    )
    .map_err(|e| e.to_string())
}

/// Record a de-duplicated completed ACP prompt. Each item is the kernel's
/// per-turn PromptResponse usage, never a context/snapshot estimate.
#[tauri::command]
pub fn store_record_daily_token_usage(
    store: State<'_, AppStore>,
    day: String,
    event_key: String,
    usage: TokenUsageInput,
) -> Result<DailyTokenUsageRow, String> {
    if !valid_usage_day(&day) {
        return Err("invalid local usage day".into());
    }
    let event_key = event_key.trim();
    if event_key.is_empty() || event_key.len() > 384 {
        return Err("invalid usage event key".into());
    }
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono_like_now().parse::<i64>().unwrap_or(0);
    let inserted = conn.execute(
        "INSERT OR IGNORE INTO token_usage_events (event_key, recorded_at) VALUES (?1, ?2)",
        params![event_key, now],
    ).map_err(|e| e.to_string())?;
    if inserted == 0 {
        return read_daily_usage(&conn, &day);
    }
    let input = nonnegative(usage.input_tokens);
    let output = nonnegative(usage.output_tokens);
    let cached = nonnegative(usage.cached_read_tokens);
    let reasoning = nonnegative(usage.reasoning_tokens);
    // `totalTokens` is the kernel's full prompt sum (including cache). If an
    // older response omits it, input + output is the only non-overlapping
    // fallback available; cache/reasoning remain separately displayed.
    let total = usage.total_tokens.map(|value| value.max(0)).unwrap_or(input + output);
    conn.execute(
        "INSERT INTO daily_token_usage (day, total_tokens, input_tokens, output_tokens, cached_read_tokens, reasoning_tokens, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(day) DO UPDATE SET total_tokens = total_tokens + excluded.total_tokens, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens, cached_read_tokens = cached_read_tokens + excluded.cached_read_tokens, reasoning_tokens = reasoning_tokens + excluded.reasoning_tokens, updated_at = excluded.updated_at",
        params![day, total, input, output, cached, reasoning, now],
    ).map_err(|e| e.to_string())?;
    read_daily_usage(&conn, &day)
}

#[tauri::command]
pub fn store_get_daily_token_usage(
    store: State<'_, AppStore>,
    day: String,
) -> Result<DailyTokenUsageRow, String> {
    if !valid_usage_day(&day) {
        return Err("invalid local usage day".into());
    }
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let row = conn
        .query_row(
            "SELECT day, total_tokens, input_tokens, output_tokens, cached_read_tokens, reasoning_tokens, updated_at FROM daily_token_usage WHERE day = ?1",
            params![day],
            |row| Ok(DailyTokenUsageRow {
                day: row.get(0)?,
                total_tokens: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
                cached_read_tokens: row.get(4)?,
                reasoning_tokens: row.get(5)?,
                updated_at: row.get(6)?,
            }),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row.unwrap_or(DailyTokenUsageRow {
            day,
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            cached_read_tokens: 0,
            reasoning_tokens: 0,
            updated_at: 0,
        }))
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

fn search_thread_history(conn: &Connection, query: &str, limit: usize) -> Result<Vec<ThreadSearchHit>, String> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(vec![]);
    }
    // `instr(lower(...))` keeps the query parameter bound and works for exact
    // Unicode matches such as Chinese text, while retaining case-insensitive
    // matching for the common Latin task/project names.
    let mut stmt = conn
        .prepare(
            r#"
            SELECT m.id, m.project, m.title, m.session_id, m.model_id, m.cwd,
                   m.worktree_path, m.effort, m.chat_mode, m.updated_at,
                   COALESCE(m.archived, 0),
                   m.session_goal_text, m.session_goal_status, m.session_goal_message,
                   COALESCE((
                     SELECT substr(c.text,
                       CASE WHEN instr(lower(c.text), lower(?1)) > 120
                         THEN instr(lower(c.text), lower(?1)) - 120
                         ELSE 1 END,
                       420)
                     FROM chat_lines c
                     WHERE c.project = m.project AND c.thread_id = m.id
                       AND instr(lower(c.text), lower(?1)) > 0
                     ORDER BY c.seq DESC
                     LIMIT 1
                   ), '')
            FROM thread_meta m
            WHERE instr(lower(m.title), lower(?1)) > 0
               OR EXISTS (
                 SELECT 1 FROM chat_lines c
                 WHERE c.project = m.project AND c.thread_id = m.id
                   AND instr(lower(c.text), lower(?1)) > 0
               )
            ORDER BY m.updated_at DESC
            LIMIT ?2
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![needle, limit as i64], |r| {
        let archived: i64 = r.get(10)?;
        Ok(ThreadSearchHit {
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
            archived: archived != 0,
            session_goal_text: r.get(11)?,
            session_goal_status: r.get(12)?,
            session_goal_message: r.get(13)?,
            excerpt: r.get::<_, String>(14)?.chars().take(420).collect(),
        })
    })
    .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Search only gorkX's own persisted task metadata and chat snapshots. This
/// does not scan a user-installed Grok home, project files, or attachments.
#[tauri::command]
pub fn store_search_threads(
    store: State<'_, AppStore>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<ThreadSearchHit>, String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    search_thread_history(&conn, &query, limit.unwrap_or(36).clamp(1, 60))
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
    /// Server-confirmed cached choice; true means coding data sharing is off.
    pub coding_data_retention_opt_out: Option<bool>,
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
        coding_data_retention_opt_out: crate::auth::coding_data_retention_opt_out_from_auth_file(),
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

    // Match Grok Build's own billing extension. The `credits` format is the
    // account-quota payload used by `/usage`; the bare endpoint can return a
    // reduced billing shape without the SuperGrok weekly percentage.
    let url = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("gorkX/0.5.1")
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
    let mut pct = cfg.get("creditUsagePercent").and_then(billing_percent);
    // Fallback: GrokBuild product usage
    if pct.is_none() {
        if let Some(arr) = cfg.get("productUsage").and_then(|x| x.as_array()) {
            for p in arr {
                let name = p.get("product").and_then(|x| x.as_str()).unwrap_or("");
                if name.eq_ignore_ascii_case("GrokBuild") || name.contains("Build") {
                    pct = p.get("usagePercent").and_then(billing_percent);
                    break;
                }
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
            let up = p.get("usagePercent").and_then(billing_percent);
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
        // A billing-period end belongs to the same payload family as the
        // percentage. Do not show an on-demand reset date beside a missing
        // subscription quota.
        period_end: if pct.is_some() { period_end } else { None },
        product_usage: if products.is_empty() {
            None
        } else {
            Some(products)
        },
        coding_data_retention_opt_out: crate::auth::coding_data_retention_opt_out_from_auth_file(),
        quota_note: if pct.is_some() {
            "live from cli-chat-proxy billing percentage".into()
        } else {
            "billing ok but no creditUsagePercent field".into()
        },
    })
}

/// Billing has returned both JSON numbers and percentage strings across Grok
/// Build releases. Parse only a valid 0–100 percentage so a real `"0%"` is
/// never mistaken for a missing quota, while malformed values remain absent.
fn billing_percent(value: &serde_json::Value) -> Option<f64> {
    let raw = value.as_f64().or_else(|| {
        value
            .as_str()
            .map(str::trim)
            .map(|s| s.trim_end_matches('%').trim())
            .filter(|s| !s.is_empty())
            .and_then(|s| s.parse::<f64>().ok())
    })?;
    (0.0..=100.0).contains(&raw).then_some(raw)
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

/// The subscription-only model list. Unlike `list_available_models`, this
/// deliberately excludes custom providers configured by the user so the UI
/// can distinguish the Grok Build account response from a provider catalog.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionModelsSnapshot {
    pub models: Vec<CachedModelRow>,
    /// `live` means this call refreshed `/v1/models`; `cache` is the previous
    /// App GROK_HOME response; `none` means neither was available.
    pub source: String,
    pub fetched_at: Option<String>,
    pub refresh_error: Option<String>,
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

fn visible_models_from_cache(v: &serde_json::Value) -> Vec<CachedModelRow> {
    let mut rows = Vec::new();
    for (id, entry) in models_map_from_cache(v) {
        let info = entry.get("info").unwrap_or(&entry);
        if info.get("hidden").and_then(|x| x.as_bool()).unwrap_or(false) {
            continue;
        }
        rows.push(CachedModelRow {
            model_id: id.clone(),
            name: info
                .get("name")
                .or_else(|| info.get("system_prompt_label"))
                .and_then(|x| x.as_str())
                .map(str::to_owned)
                .or(Some(id)),
            context_window: info.get("context_window").and_then(|x| x.as_u64()),
            hidden: Some(false),
        });
    }
    rows.sort_by(|a, b| a.model_id.cmp(&b.model_id));
    rows
}

/// Read only the models returned to the current Grok Build CLI session.
///
/// A refresh failure is returned as data rather than silently looking like a
/// successful refresh of an old cache. This keeps the desktop model picker
/// honest when the account's entitlement changes or the network is offline.
#[tauri::command]
pub fn subscription_models_snapshot(refresh: Option<bool>) -> Result<SubscriptionModelsSnapshot, String> {
    let requested_refresh = refresh.unwrap_or(false);
    let refresh_error = if requested_refresh {
        refresh_models_cache_from_network().err()
    } else {
        None
    };
    let cache = read_models_cache_value()?;
    let models = cache
        .as_ref()
        .map(visible_models_from_cache)
        .unwrap_or_default();
    let fetched_at = cache.as_ref().and_then(|v| {
        v.get("fetched_at")
            .and_then(|value| value.as_str())
            .map(str::to_owned)
    });
    let source = if requested_refresh && refresh_error.is_none() {
        "live"
    } else if cache.is_some() {
        "cache"
    } else {
        "none"
    };
    Ok(SubscriptionModelsSnapshot {
        models,
        source: source.into(),
        fetched_at,
        refresh_error,
    })
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
        for row in visible_models_from_cache(&v) {
            seen.insert(row.model_id.clone());
            rows.push(row);
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
        .header("User-Agent", "gorkX/0.5.1")
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

#[cfg(test)]
mod model_cache_tests {
    use super::{billing_percent, parse_billing_body, search_thread_history, valid_usage_day, visible_models_from_cache};
    use rusqlite::{params, Connection};

    #[test]
    fn visible_models_excludes_hidden_entries_and_keeps_real_ids() {
        let cache = serde_json::json!({
            "models": {
                "grok-visible": { "info": { "name": "Grok Visible", "context_window": 128000 } },
                "internal": { "info": { "hidden": true } }
            }
        });

        let rows = visible_models_from_cache(&cache);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].model_id, "grok-visible");
        assert_eq!(rows[0].name.as_deref(), Some("Grok Visible"));
        assert_eq!(rows[0].context_window, Some(128000));
    }

    #[test]
    fn local_task_search_finds_titles_and_chat_across_projects() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE thread_meta (
              id TEXT, project TEXT, title TEXT, session_id TEXT, model_id TEXT,
              cwd TEXT, worktree_path TEXT, effort TEXT, chat_mode TEXT,
              updated_at INTEGER, archived INTEGER,
              session_goal_text TEXT, session_goal_status TEXT, session_goal_message TEXT
            );
            CREATE TABLE chat_lines (
              thread_id TEXT, project TEXT, seq INTEGER, text TEXT
            );
            "#,
        ).unwrap();
        conn.execute(
            "INSERT INTO thread_meta VALUES (?1, ?2, ?3, NULL, NULL, ?2, NULL, 'high', 'agent', ?4, ?5, NULL, NULL, NULL)",
            params!["a", "/project-a", "Quarterly report", 20_i64, 0_i64],
        ).unwrap();
        conn.execute(
            "INSERT INTO thread_meta VALUES (?1, ?2, ?3, NULL, NULL, ?2, NULL, 'high', 'plan', ?4, ?5, NULL, NULL, NULL)",
            params!["b", "/project-b", "归档任务", 10_i64, 1_i64],
        ).unwrap();
        conn.execute(
            "INSERT INTO chat_lines VALUES (?1, ?2, ?3, ?4)",
            params!["b", "/project-b", 0_i64, "请比较两种方案的成本与风险"],
        ).unwrap();

        let title_hits = search_thread_history(&conn, "report", 36).unwrap();
        assert_eq!(title_hits.len(), 1);
        assert_eq!(title_hits[0].id, "a");
        let chat_hits = search_thread_history(&conn, "成本", 36).unwrap();
        assert_eq!(chat_hits.len(), 1);
        assert_eq!(chat_hits[0].id, "b");
        assert!(chat_hits[0].archived);
        assert!(chat_hits[0].excerpt.contains("成本"));
    }

    #[test]
    fn daily_token_usage_requires_a_local_calendar_day() {
        assert!(valid_usage_day("2026-07-26"));
        assert!(!valid_usage_day("2026/07/26"));
    }

    #[test]
    fn billing_percent_preserves_zero_from_number_or_string() {
        assert_eq!(billing_percent(&serde_json::json!(0)), Some(0.0));
        assert_eq!(billing_percent(&serde_json::json!("0%")), Some(0.0));
        assert_eq!(billing_percent(&serde_json::json!("42.5")), Some(42.5));
        assert_eq!(billing_percent(&serde_json::json!("unknown")), None);
        assert_eq!(billing_percent(&serde_json::json!(101)), None);
    }

    #[test]
    fn billing_summary_reads_credit_and_product_usage_from_live_shape() {
        // The CLI billing endpoint returns this nested `config` shape for
        // subscription accounts. Keep the product rows separate from the
        // total: they are explanatory detail, not a locally inferred quota.
        let body = serde_json::json!({
            "config": {
                "creditUsagePercent": 17,
                "currentPeriod": { "end": "2026-08-01T12:51:38+00:00" },
                "productUsage": [
                    { "product": "GrokBuild", "usagePercent": 16 },
                    { "product": "GrokChat", "usagePercent": 1 }
                ]
            }
        });
        let summary = parse_billing_body(
            body,
            Some("person@example.invalid".into()),
            Some("Person".into()),
            Some("SuperGrok".into()),
            None,
        ).unwrap();
        assert_eq!(summary.credit_usage_percent, Some(17.0));
        assert_eq!(summary.quota_label.as_deref(), Some("已用 17% · 剩 83%"));
        assert_eq!(summary.period_end.as_deref(), Some("2026-08-01T12:51:38+00:00"));
        let product_usage = summary.product_usage.unwrap();
        assert_eq!(product_usage.len(), 2);
        assert_eq!(product_usage[0].product, "GrokBuild");
        assert_eq!(product_usage[0].usage_percent, Some(16.0));
    }
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
    crate::media::remove_thread_media(&id);
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
                  thread_id, project, seq, id, role, text, tool_key, parent_subagent_id, tool_status, tool_kind, attachments_json, at
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
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
                line.attachments_json,
                line.at,
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
            SELECT id, role, text, tool_key, parent_subagent_id, tool_status, tool_kind, attachments_json, at
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
                attachments_json: r.get(7)?,
                at: r.get(8)?,
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
fn chat_thread_ids(conn: &Connection, project: Option<&str>) -> Result<Vec<String>, String> {
    let (sql, params): (&str, Vec<&str>) = match project.filter(|value| !value.is_empty()) {
        Some(value) => (
            "SELECT DISTINCT thread_id FROM chat_lines WHERE project = ?1",
            vec![value],
        ),
        None => ("SELECT DISTINCT thread_id FROM chat_lines", Vec::new()),
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_clear_chat(
    store: State<'_, AppStore>,
    project: Option<String>,
) -> Result<u64, String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let project_ref = project.as_deref().filter(|value| !value.is_empty());
    let targets = chat_thread_ids(&conn, project_ref)?;
    let n = if let Some(p) = project_ref {
        conn.execute("DELETE FROM chat_lines WHERE project = ?1", params![p])
            .map_err(|e| e.to_string())?
    } else {
        conn.execute("DELETE FROM chat_lines", [])
            .map_err(|e| e.to_string())?
    };
    for id in targets {
        crate::media::remove_thread_media(&id);
    }
    Ok(n as u64)
}

/// Drop thread_meta + chat for a project.
#[tauri::command]
pub fn store_clear_project(store: State<'_, AppStore>, project: String) -> Result<(), String> {
    let conn = store.conn.lock().map_err(|e| e.to_string())?;
    let targets = chat_thread_ids(&conn, Some(&project))?;
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
    for id in targets {
        crate::media::remove_thread_media(&id);
    }
    Ok(())
}
