//! ACP client terminal/* support + user shell one-shots for the dock.

use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::State;
use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitStatus {
    pub exit_code: Option<u32>,
    pub signal: Option<String>,
}

struct TerminalEntry {
    command: String,
    cwd: String,
    output: String,
    byte_limit: usize,
    truncated: bool,
    exit: Option<TerminalExitStatus>,
    child: Option<Child>,
}

pub struct TerminalPool {
    inner: Arc<Mutex<HashMap<String, TerminalEntry>>>,
}

impl TerminalPool {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn env_pairs(env: Option<Vec<serde_json::Value>>) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if let Some(list) = env {
        for v in list {
            if let Some(obj) = v.as_object() {
                let name = obj
                    .get("name")
                    .or_else(|| obj.get("key"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                let value = obj
                    .get("value")
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                if !name.is_empty() {
                    out.push((name.to_string(), value.to_string()));
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn terminal_create(
    pool: State<'_, Arc<TerminalPool>>,
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<Vec<serde_json::Value>>,
    output_byte_limit: Option<u64>,
) -> Result<serde_json::Value, String> {
    let tid = format!("t{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));
    let workdir = cwd
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    let limit = output_byte_limit.unwrap_or(512_000) as usize;
    let args = args.unwrap_or_default();
    let display = if args.is_empty() {
        command.clone()
    } else {
        format!("{command} {}", args.join(" "))
    };

    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);

    for (k, v) in env_pairs(env) {
        cmd.env(k, v);
    }

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let pool_arc = Arc::clone(&pool.inner);
    {
        let mut map = pool.inner.lock().await;
        map.insert(
            tid.clone(),
            TerminalEntry {
                command: display.clone(),
                cwd: workdir.clone(),
                output: String::new(),
                byte_limit: limit,
                truncated: false,
                exit: None,
                child: Some(child),
            },
        );
    }

    // Pump stdout/stderr into buffer
    let tid_out = tid.clone();
    let pool_out = pool_arc.clone();
    if let Some(out) = stdout {
        tokio::spawn(async move {
            let mut reader = BufReader::new(out);
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        let mut map = pool_out.lock().await;
                        if let Some(e) = map.get_mut(&tid_out) {
                            append_output(e, &chunk);
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    let tid_err = tid.clone();
    let pool_err = pool_arc.clone();
    if let Some(err) = stderr {
        tokio::spawn(async move {
            let mut reader = BufReader::new(err);
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        let mut map = pool_err.lock().await;
                        if let Some(e) = map.get_mut(&tid_err) {
                            append_output(e, &chunk);
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Wait for exit in background
    let tid_wait = tid.clone();
    let pool_wait = pool_arc;
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            let mut map = pool_wait.lock().await;
            let Some(entry) = map.get_mut(&tid_wait) else {
                break;
            };
            let Some(child) = entry.child.as_mut() else {
                break;
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    entry.exit = Some(TerminalExitStatus {
                        exit_code: status.code().map(|c| c as u32),
                        signal: None,
                    });
                    entry.child = None;
                    break;
                }
                Ok(None) => {}
                Err(_) => {
                    entry.exit = Some(TerminalExitStatus {
                        exit_code: None,
                        signal: Some("error".into()),
                    });
                    entry.child = None;
                    break;
                }
            }
        }
    });

    Ok(serde_json::json!({ "terminalId": tid, "command": display, "cwd": workdir }))
}

fn append_output(entry: &mut TerminalEntry, chunk: &str) {
    if entry.truncated {
        return;
    }
    entry.output.push_str(chunk);
    if entry.output.len() > entry.byte_limit {
        let keep = entry.byte_limit.saturating_sub(64);
        entry.output = format!(
            "…[truncated]…\n{}",
            &entry.output[entry.output.len().saturating_sub(keep)..]
        );
        entry.truncated = true;
    }
}

#[tauri::command]
pub async fn terminal_output(
    pool: State<'_, Arc<TerminalPool>>,
    terminal_id: String,
) -> Result<serde_json::Value, String> {
    let map = pool.inner.lock().await;
    let e = map
        .get(&terminal_id)
        .ok_or_else(|| format!("unknown terminal: {terminal_id}"))?;
    Ok(serde_json::json!({
        "output": e.output,
        "truncated": e.truncated,
        "exitStatus": e.exit,
        "command": e.command,
        "cwd": e.cwd,
    }))
}

#[tauri::command]
pub async fn terminal_kill(
    pool: State<'_, Arc<TerminalPool>>,
    terminal_id: String,
) -> Result<serde_json::Value, String> {
    let mut map = pool.inner.lock().await;
    let e = map
        .get_mut(&terminal_id)
        .ok_or_else(|| format!("unknown terminal: {terminal_id}"))?;
    if let Some(mut child) = e.child.take() {
        let _ = child.kill().await;
        e.exit = Some(TerminalExitStatus {
            exit_code: None,
            signal: Some("SIGKILL".into()),
        });
    }
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn terminal_release(
    pool: State<'_, Arc<TerminalPool>>,
    terminal_id: String,
) -> Result<serde_json::Value, String> {
    let mut map = pool.inner.lock().await;
    if let Some(mut e) = map.remove(&terminal_id) {
        if let Some(mut child) = e.child.take() {
            let _ = child.kill().await;
        }
    }
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn terminal_wait_for_exit(
    pool: State<'_, Arc<TerminalPool>>,
    terminal_id: String,
) -> Result<serde_json::Value, String> {
    // Poll up to 10 minutes
    for _ in 0..6000 {
        {
            let map = pool.inner.lock().await;
            let e = map
                .get(&terminal_id)
                .ok_or_else(|| format!("unknown terminal: {terminal_id}"))?;
            if let Some(ref st) = e.exit {
                return Ok(serde_json::json!({
                    "exitCode": st.exit_code,
                    "signal": st.signal,
                }));
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err("wait_for_exit timeout".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellResult {
    pub command: String,
    pub cwd: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
}

/// User-facing one-shot shell via `/bin/zsh -lc`.
#[tauri::command]
pub async fn shell_exec(command: String, cwd: Option<String>) -> Result<ShellResult, String> {
    let workdir = cwd
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    let started = std::time::Instant::now();
    let output = Command::new("/bin/zsh")
        .arg("-lc")
        .arg(&command)
        .current_dir(&workdir)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    Ok(ShellResult {
        command,
        cwd: workdir,
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        exit_code: output.status.code(),
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub async fn terminal_list(pool: State<'_, Arc<TerminalPool>>) -> Result<Vec<serde_json::Value>, String> {
    let map = pool.inner.lock().await;
    let mut list: Vec<_> = map
        .iter()
        .map(|(id, e)| {
            serde_json::json!({
                "terminalId": id,
                "command": e.command,
                "cwd": e.cwd,
                "outputLen": e.output.len(),
                "running": e.child.is_some() && e.exit.is_none(),
                "exitStatus": e.exit,
            })
        })
        .collect();
    list.sort_by(|a, b| {
        a["terminalId"]
            .as_str()
            .unwrap_or("")
            .cmp(b["terminalId"].as_str().unwrap_or(""))
    });
    Ok(list)
}
