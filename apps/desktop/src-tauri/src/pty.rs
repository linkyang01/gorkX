//! Interactive login-shell PTY for the terminal dock.

use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, State};

static NEXT: AtomicU64 = AtomicU64::new(1);

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    _child: Box<dyn Child + Send + Sync>,
    cwd: String,
}

pub struct PtyPool {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyPool {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyOutputEvent {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExitEvent {
    session_id: String,
}

#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    pool: State<'_, Arc<PtyPool>>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<serde_json::Value, String> {
    let workdir = cwd
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    let cols = cols.unwrap_or(100);
    let rows = rows.unwrap_or(28);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut cmd = CommandBuilder::new(&shell);
    // Login shell so PATH/rc load like Terminal.app
    cmd.arg("-l");
    cmd.cwd(&workdir);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // Prefer Chinese UI for tools that honor LANG
    if std::env::var_os("LANG").is_none() {
        cmd.env("LANG", "zh_CN.UTF-8");
    }
    if std::env::var_os("LC_ALL").is_none() {
        cmd.env("LC_ALL", "zh_CN.UTF-8");
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn shell: {e}"))?;
    // Drop slave so child owns it (portable-pty pattern)
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take writer: {e}"))?;

    let sid = format!("p{}", NEXT.fetch_add(1, Ordering::SeqCst));
    {
        let mut map = pool.sessions.lock();
        map.insert(
            sid.clone(),
            PtySession {
                master: pair.master,
                writer,
                _child: child,
                cwd: workdir.clone(),
            },
        );
    }

    let app2 = app.clone();
    let sid2 = sid.clone();
    let pool2 = Arc::clone(&*pool);
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app2.emit(
                        "pty://output",
                        PtyOutputEvent {
                            session_id: sid2.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        {
            let mut map = pool2.sessions.lock();
            map.remove(&sid2);
        }
        let _ = app2.emit("pty://exit", PtyExitEvent { session_id: sid2 });
    });

    Ok(serde_json::json!({
        "sessionId": sid,
        "cwd": workdir,
        "shell": shell,
    }))
}

#[tauri::command]
pub fn pty_write(
    pool: State<'_, Arc<PtyPool>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut map = pool.sessions.lock();
    let s = map
        .get_mut(&session_id)
        .ok_or_else(|| format!("unknown pty: {session_id}"))?;
    s.writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write: {e}"))?;
    s.writer.flush().ok();
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    pool: State<'_, Arc<PtyPool>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = pool.sessions.lock();
    let s = map
        .get(&session_id)
        .ok_or_else(|| format!("unknown pty: {session_id}"))?;
    s.master
        .resize(PtySize {
            rows: rows.max(4),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn pty_close(pool: State<'_, Arc<PtyPool>>, session_id: String) -> Result<(), String> {
    let mut map = pool.sessions.lock();
    if let Some(mut s) = map.remove(&session_id) {
        // Best-effort Ctrl-D / exit
        let _ = s.writer.write_all(b"\x04");
        let _ = s.writer.flush();
    }
    Ok(())
}

#[tauri::command]
pub fn pty_list(pool: State<'_, Arc<PtyPool>>) -> Result<Vec<serde_json::Value>, String> {
    let map = pool.sessions.lock();
    Ok(map
        .iter()
        .map(|(id, s)| {
            serde_json::json!({
                "sessionId": id,
                "cwd": s.cwd,
            })
        })
        .collect())
}
