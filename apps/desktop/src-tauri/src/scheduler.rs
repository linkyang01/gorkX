//! Opt-in macOS launchd scheduler for due, read-only scheduled jobs.
//!
//! The worker is the same signed app executable started with
//! `--run-scheduled-jobs`; it shares the app-owned SQLite store and GROK_HOME.
//! It deliberately uses Grok Build plan mode, so a task left running after the
//! window exits cannot silently modify a repository or await an ACP permission.

use crate::{paths, store};
use chrono::{Datelike, Duration, Local, Timelike, Weekday};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const JOBS_KEY: &str = "scheduled_jobs_v1";
const RUNS_KEY: &str = "scheduled_job_runs_v1";
const LABEL: &str = "app.gorkx.scheduler";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledJob {
    id: String,
    title: String,
    prompt: String,
    project_path: String,
    kind: String,
    interval_minutes: i64,
    #[serde(default)]
    daily_hour: u32,
    #[serde(default)]
    daily_minute: u32,
    weekdays_only: bool,
    enabled: bool,
    last_run_at: Option<i64>,
    #[serde(default)]
    failure_count: i64,
    #[serde(default)]
    last_error: Option<String>,
    next_run_at: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStatus {
    pub supported: bool,
    pub enabled: bool,
    pub label: String,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerRunSummary {
    pub due: usize,
    pub succeeded: usize,
    pub failed: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerRun {
    pub job_id: String,
    pub title: String,
    pub started_at: i64,
    pub ok: bool,
    pub output: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn plist_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory unavailable".to_string())?;
    Ok(home
        .join("Library/LaunchAgents")
        .join(format!("{LABEL}.plist")))
}

#[cfg(target_os = "macos")]
fn installed_app_executable() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("current executable: {e}"))?;
    if exe.to_string_lossy().contains(".app/Contents/MacOS/") {
        Ok(exe)
    } else {
        Err(
            "Background scheduling requires the installed gorkX.app, not a development executable."
                .into(),
        )
    }
}

#[cfg(target_os = "macos")]
fn uid() -> Result<String, String> {
    let out = Command::new("id")
        .arg("-u")
        .output()
        .map_err(|e| format!("read uid: {e}"))?;
    if !out.status.success() {
        return Err("read uid failed".into());
    }
    String::from_utf8(out.stdout)
        .map(|s| s.trim().to_string())
        .map_err(|e| e.to_string())
}

fn read_jobs(conn: &Connection) -> Result<Vec<ScheduledJob>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM kv WHERE key = ?1",
            params![JOBS_KEY],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match raw {
        Some(v) => serde_json::from_str(&v).map_err(|e| format!("scheduled jobs decode: {e}")),
        None => Ok(Vec::new()),
    }
}

fn save_jobs(conn: &Connection, jobs: &[ScheduledJob]) -> Result<(), String> {
    let value = serde_json::to_string(jobs).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![JOBS_KEY, value]).map_err(|e| e.to_string())?;
    Ok(())
}

fn retry_at(failures: i64, now: i64) -> i64 {
    let power = failures.saturating_sub(1).clamp(0, 16) as u32;
    now + (5_i64 * (1_i64 << power)).min(360) * 60_000
}

fn next_at(job: &ScheduledJob, now: i64) -> i64 {
    if job.kind == "interval" {
        return now + job.interval_minutes.max(5) * 60_000;
    }
    let local_now = Local::now();
    let mut candidate = local_now
        .with_hour(job.daily_hour.min(23))
        .and_then(|v| v.with_minute(job.daily_minute.min(59)))
        .and_then(|v| v.with_second(0))
        .and_then(|v| v.with_nanosecond(0))
        .unwrap_or(local_now);
    if candidate.timestamp_millis() <= now {
        candidate += Duration::days(1);
    }
    while job.weekdays_only && matches!(candidate.weekday(), Weekday::Sat | Weekday::Sun) {
        candidate += Duration::days(1);
    }
    candidate.timestamp_millis()
}

fn append_run(conn: &Connection, run: SchedulerRun) -> Result<(), String> {
    let mut runs: Vec<SchedulerRun> = conn
        .query_row(
            "SELECT value FROM kv WHERE key = ?1",
            params![RUNS_KEY],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_default();
    runs.insert(0, run);
    runs.truncate(80);
    let value = serde_json::to_string(&runs).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![RUNS_KEY, value]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Execute each due job once. This is called only from the dedicated worker
/// process or an explicit diagnostic action; it never opens a window.
pub fn run_due_jobs() -> Result<SchedulerRunSummary, String> {
    let db = store::db_path()?;
    let conn = Connection::open(db).map_err(|e| format!("sqlite open: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    process_due_jobs(&conn, now_ms(), run_read_only_job)
}

/// Transactional queue transition, factored from the process launcher so it
/// can be exercised without a Grok account or a live app data directory.
fn process_due_jobs<F>(
    conn: &Connection,
    now: i64,
    mut runner: F,
) -> Result<SchedulerRunSummary, String>
where
    F: FnMut(&ScheduledJob) -> Result<String, String>,
{
    let mut jobs = read_jobs(&conn)?;
    let mut summary = SchedulerRunSummary {
        due: 0,
        succeeded: 0,
        failed: 0,
    };
    let due_indices: Vec<usize> = jobs
        .iter()
        .enumerate()
        .filter_map(|(index, job)| (job.enabled && job.next_run_at <= now).then_some(index))
        .collect();
    for index in due_indices {
        summary.due += 1;
        // Claim before spawning: a second launchd invocation cannot duplicate it.
        let job = &mut jobs[index];
        job.last_run_at = Some(now);
        job.next_run_at = next_at(job, now);
        job.failure_count = 0;
        job.last_error = None;
        save_jobs(&conn, &jobs)?;

        let claimed = jobs[index].clone();
        let result = runner(&claimed);
        let (ok, output) = match result {
            Ok(out) => (true, out),
            Err(err) => (false, err),
        };
        if ok {
            summary.succeeded += 1;
        } else {
            summary.failed += 1;
            jobs[index].failure_count += 1;
            jobs[index].last_error = Some(output.chars().take(500).collect());
            jobs[index].next_run_at = retry_at(jobs[index].failure_count, now);
        }
        append_run(
            &conn,
            SchedulerRun {
                job_id: claimed.id,
                title: claimed.title,
                started_at: now,
                ok,
                output: output.chars().take(8_000).collect(),
            },
        )?;
        save_jobs(&conn, &jobs)?;
    }
    Ok(summary)
}

fn run_read_only_job(job: &ScheduledJob) -> Result<String, String> {
    let cwd = if job.project_path.trim().is_empty() {
        std::env::current_dir().map_err(|e| e.to_string())?
    } else {
        PathBuf::from(&job.project_path)
    };
    if !cwd.is_dir() {
        return Err(format!(
            "scheduled project is unavailable: {}",
            cwd.display()
        ));
    }
    let bin = paths::resolve_grok_bin(None);
    if !bin.is_file() {
        return Err(format!(
            "Grok Build engine is unavailable: {}",
            bin.display()
        ));
    }
    let mut cmd = Command::new(bin);
    cmd.current_dir(&cwd).args([
        "--cwd",
        &cwd.to_string_lossy(),
        "--permission-mode",
        "plan",
        "--no-subagents",
        "--max-turns",
        "20",
        "--output-format",
        "json",
        "--single",
        &job.prompt,
    ]);
    paths::apply_engine_env(&mut cmd);
    let out = cmd
        .output()
        .map_err(|e| format!("start scheduled Grok job: {e}"))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if out.status.success() {
        Ok(text)
    } else {
        Err(format!("Grok exited {}: {}", out.status, text))
    }
}

#[tauri::command]
pub fn scheduler_status() -> Result<SchedulerStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let path = plist_path()?;
        let id = uid()?;
        let loaded = Command::new("launchctl")
            .args(["print", &format!("gui/{id}/{LABEL}")])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        let installed = installed_app_executable().is_ok();
        return Ok(SchedulerStatus {
            supported: installed,
            enabled: installed && path.is_file() && loaded,
            label: LABEL.into(),
            detail: if installed {
                path.display().to_string()
            } else {
                "Background scheduling requires the installed gorkX.app.".into()
            },
        });
    }
    #[cfg(not(target_os = "macos"))]
    Ok(SchedulerStatus {
        supported: false,
        enabled: false,
        label: LABEL.into(),
        detail: "Background scheduler currently requires macOS launchd.".into(),
    })
}

#[tauri::command]
pub fn scheduler_enable() -> Result<SchedulerStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let exe = installed_app_executable()?;
        let path = plist_path()?;
        let parent = path
            .parent()
            .ok_or_else(|| "LaunchAgents parent unavailable".to_string())?;
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(paths::app_support_dir()).map_err(|e| e.to_string())?;
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>{LABEL}</string><key>ProgramArguments</key><array><string>{}</string><string>--run-scheduled-jobs</string></array><key>StartInterval</key><integer>300</integer><key>ProcessType</key><string>Background</string><key>StandardOutPath</key><string>{}/scheduler.log</string><key>StandardErrorPath</key><string>{}/scheduler-error.log</string></dict></plist>"#,
            xml_escape(&exe.to_string_lossy()),
            xml_escape(&paths::app_support_dir().to_string_lossy()),
            xml_escape(&paths::app_support_dir().to_string_lossy())
        );
        std::fs::write(&path, xml).map_err(|e| format!("write launchd plist: {e}"))?;
        let id = uid()?;
        let _ = Command::new("launchctl")
            .args(["bootout", &format!("gui/{id}"), &path.to_string_lossy()])
            .output();
        let out = Command::new("launchctl")
            .args(["bootstrap", &format!("gui/{id}"), &path.to_string_lossy()])
            .output()
            .map_err(|e| format!("launchctl bootstrap: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "launchctl bootstrap failed: {}",
                String::from_utf8_lossy(&out.stderr)
            ));
        }
        return scheduler_status();
    }
    #[cfg(not(target_os = "macos"))]
    Err("Background scheduler currently requires macOS launchd.".into())
}

#[tauri::command]
pub fn scheduler_disable() -> Result<SchedulerStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let path = plist_path()?;
        let id = uid()?;
        let _ = Command::new("launchctl")
            .args(["bootout", &format!("gui/{id}"), &path.to_string_lossy()])
            .output();
        if path.is_file() {
            std::fs::remove_file(&path).map_err(|e| format!("remove launchd plist: {e}"))?;
        }
        return scheduler_status();
    }
    #[cfg(not(target_os = "macos"))]
    Err("Background scheduler currently requires macOS launchd.".into())
}

#[tauri::command]
pub fn scheduler_list_runs() -> Result<Vec<SchedulerRun>, String> {
    let conn = Connection::open(store::db_path()?).map_err(|e| format!("sqlite open: {e}"))?;
    scheduler_list_runs_from(&conn)
}

fn scheduler_list_runs_from(conn: &Connection) -> Result<Vec<SchedulerRun>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM kv WHERE key = ?1",
            params![RUNS_KEY],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(raw
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default())
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(id: &str, next_run_at: i64) -> ScheduledJob {
        ScheduledJob {
            id: id.into(),
            title: format!("job {id}"),
            prompt: "inspect only".into(),
            project_path: String::new(),
            kind: "interval".into(),
            interval_minutes: 15,
            daily_hour: 9,
            daily_minute: 0,
            weekdays_only: false,
            enabled: true,
            last_run_at: None,
            failure_count: 0,
            last_error: None,
            next_run_at,
        }
    }

    fn memory_conn(jobs: &[ScheduledJob]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        )
        .unwrap();
        save_jobs(&conn, jobs).unwrap();
        conn
    }

    #[test]
    fn due_job_is_claimed_persisted_and_recorded() {
        let now = 1_000_000_i64;
        let conn = memory_conn(&[job("a", now)]);
        let summary = process_due_jobs(&conn, now, |_| Ok("structured result".into())).unwrap();
        assert_eq!((summary.due, summary.succeeded, summary.failed), (1, 1, 0));
        let updated = read_jobs(&conn).unwrap();
        assert_eq!(updated[0].last_run_at, Some(now));
        assert_eq!(updated[0].next_run_at, now + 15 * 60_000);
        let runs = scheduler_list_runs_from(&conn).unwrap();
        assert_eq!(runs.len(), 1);
        assert!(runs[0].ok);
        assert_eq!(runs[0].output, "structured result");
    }

    #[test]
    fn failed_job_uses_persisted_backoff() {
        let now = 1_000_000_i64;
        let conn = memory_conn(&[job("b", now)]);
        let summary = process_due_jobs(&conn, now, |_| Err("engine unavailable".into())).unwrap();
        assert_eq!((summary.due, summary.succeeded, summary.failed), (1, 0, 1));
        let updated = read_jobs(&conn).unwrap();
        assert_eq!(updated[0].failure_count, 1);
        assert_eq!(updated[0].next_run_at, retry_at(1, now));
        assert_eq!(updated[0].last_error.as_deref(), Some("engine unavailable"));
    }
}
