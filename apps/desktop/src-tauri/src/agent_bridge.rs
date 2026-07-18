//! Spawn and multiplex local `grok agent stdio` processes.
//! Frontend talks JSON-RPC NDJSON over Tauri events + invoke.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use crate::paths;

/// Soft ceiling only to avoid runaway process spawn (not a product "max 4 agents" limit).
pub const MAX_AGENTS: usize = 64;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub pid: u32,
    pub permission_mode: String,
}

struct LiveAgent {
    child: Child,
    stdin: ChildStdin,
    permission_mode: String,
}

pub struct AgentPool {
    agents: Mutex<HashMap<String, LiveAgent>>,
}

impl AgentPool {
    pub fn new() -> Self {
        Self {
            agents: Mutex::new(HashMap::new()),
        }
    }

    pub async fn stop_all(&self) -> usize {
        let mut agents = self.agents.lock().await;
        let n = agents.len();
        for (_id, mut agent) in agents.drain() {
            let _ = agent.child.kill().await;
        }
        n
    }
}

fn resolve_grok_bin(override_cmd: Option<&str>) -> PathBuf {
    paths::resolve_grok_bin(override_cmd)
}

/// Map gorkX permission modes → grok agent CLI flags.
/// Codex-inspired trio:
/// - `default`  → ask (interactive ACP permissions)
/// - `auto`     → workspace-friendly (still interactive for risky ops; no yolo)
/// - `full`     → Full Access (`--always-approve`)
/// Reasoning effort is a real CLI flag: `grok agent --reasoning-effort <level> stdio`
fn agent_cli_args(permission_mode: &str, reasoning_effort: Option<&str>) -> Vec<String> {
    let mut args = vec!["agent".into()];
    match permission_mode {
        "full" => args.push("--always-approve".into()),
        _ => {}
    }
    if let Some(effort) = reasoning_effort {
        let e = effort.trim().to_lowercase();
        if matches!(e.as_str(), "low" | "medium" | "high" | "minimal" | "xhigh" | "none") {
            args.push("--reasoning-effort".into());
            args.push(e);
        }
    }
    args.push("stdio".into());
    args
}

#[tauri::command]
pub async fn agent_start(
    app: AppHandle,
    pool: State<'_, Arc<AgentPool>>,
    permission_mode: String,
    grok_cmd: Option<String>,
    reasoning_effort: Option<String>,
) -> Result<AgentInfo, String> {
    let mode = match permission_mode.as_str() {
        "auto" | "full" => permission_mode.clone(),
        _ => "default".to_string(),
    };

    {
        let agents = pool.agents.lock().await;
        if agents.len() >= MAX_AGENTS {
            return Err(format!(
                "Concurrent agent limit reached ({MAX_AGENTS}). Close a thread first."
            ));
        }
    }

    let bin = resolve_grok_bin(grok_cmd.as_deref());
    let args = agent_cli_args(&mode, reasoning_effort.as_deref());
    let _ = paths::ensure_dirs();

    let mut command = Command::new(&bin);
    command
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    paths::apply_engine_env_tokio(&mut command);

    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            // New process group so we can signal the whole tree.
            nix::unistd::setpgid(nix::unistd::Pid::from_raw(0), nix::unistd::Pid::from_raw(0))
                .map_err(std::io::Error::other)?;
            Ok(())
        });
    }

    let mut child = command.spawn().map_err(|e| {
        format!(
            "Failed to spawn engine `{} {}`: {e}. Bundle the Grok Build binary into the app (Resources/grok or Application Support/gorkX/runtime/grok).",
            bin.display(),
            args.join(" ")
        )
    })?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "agent stdin missing".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "agent stdout missing".to_string())?;
    let stderr = child.stderr.take();

    let id = format!("a{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
    let pid = child.id().unwrap_or(0);

    // stdout → frontend events
    {
        let app = app.clone();
        let id_out = id.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit(
                    "gorkx://agent-line",
                    serde_json::json!({ "agentId": id_out, "line": line, "stream": "stdout" }),
                );
            }
            let _ = app.emit(
                "gorkx://agent-exit",
                serde_json::json!({ "agentId": id_out, "stream": "stdout-closed" }),
            );
        });
    }

    // stderr → diagnostics (not ACP)
    if let Some(stderr) = stderr {
        let app = app.clone();
        let id_err = id.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit(
                    "gorkx://agent-line",
                    serde_json::json!({ "agentId": id_err, "line": line, "stream": "stderr" }),
                );
            }
        });
    }

    let info = AgentInfo {
        id: id.clone(),
        pid,
        permission_mode: mode.clone(),
    };

    pool.agents.lock().await.insert(
        id,
        LiveAgent {
            child,
            stdin,
            permission_mode: mode,
        },
    );

    Ok(info)
}

#[tauri::command]
pub async fn agent_write(
    pool: State<'_, Arc<AgentPool>>,
    agent_id: String,
    line: String,
) -> Result<(), String> {
    let mut agents = pool.agents.lock().await;
    let agent = agents
        .get_mut(&agent_id)
        .ok_or_else(|| format!("Unknown agent {agent_id}"))?;
    let payload = if line.ends_with('\n') {
        line
    } else {
        format!("{line}\n")
    };
    agent
        .stdin
        .write_all(payload.as_bytes())
        .await
        .map_err(|e| format!("write failed: {e}"))?;
    agent
        .stdin
        .flush()
        .await
        .map_err(|e| format!("flush failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn agent_stop(
    pool: State<'_, Arc<AgentPool>>,
    agent_id: String,
) -> Result<(), String> {
    let mut agents = pool.agents.lock().await;
    let Some(mut agent) = agents.remove(&agent_id) else {
        return Ok(());
    };
    let _ = agent.child.kill().await;
    Ok(())
}

/// Kill every agent process (app quit / emergency).
#[tauri::command]
pub async fn agent_stop_all(pool: State<'_, Arc<AgentPool>>) -> Result<usize, String> {
    Ok(pool.stop_all().await)
}

#[tauri::command]
pub async fn agent_list(pool: State<'_, Arc<AgentPool>>) -> Result<Vec<AgentInfo>, String> {
    let agents = pool.agents.lock().await;
    Ok(agents
        .iter()
        .map(|(id, a)| AgentInfo {
            id: id.clone(),
            pid: a.child.id().unwrap_or(0),
            permission_mode: a.permission_mode.clone(),
        })
        .collect())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokStatus {
    pub installed: bool,
    pub version: String,
    pub authenticated: bool,
    pub auth_path: String,
    /// Resolved absolute (or as-invoked) path to the grok binary.
    pub grok_path: String,
    pub detail: String,
    /// `app` | `runtime` | `custom` | `env` | `legacy` | `missing`
    pub channel: String,
    /// Suggested open-source checkout for source upgrades (if present).
    pub source_repo_hint: String,
    /// One-liner: official binary update.
    pub upgrade_official: String,
    /// Multi-line: build from xai-org/grok-build source.
    pub upgrade_source: String,
    pub docs_url: String,
    pub source_url: String,
    /// App-owned GROK_HOME (sessions/auth/memory).
    pub grok_home: String,
    /// True when engine binary is App Resources or App runtime.
    pub engine_app_owned: bool,
    /// Product independence readiness (engine bundled + home app-owned).
    pub independent_ready: bool,
}

#[tauri::command]
pub async fn grok_status(grok_cmd: Option<String>) -> Result<GrokStatus, String> {
    tauri::async_runtime::spawn_blocking(move || collect_grok_status(grok_cmd))
        .await
        .map_err(|e| e.to_string())?
}

fn channel_for(bin: &Path, override_set: bool) -> String {
    let exists = bin.is_file() || (bin.to_string_lossy() != "grok" && bin.exists());
    if !exists && bin.to_string_lossy() == "grok" {
        return "missing".into();
    }
    if override_set {
        return "custom".into();
    }
    if std::env::var("GORKX_GROK_CMD")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
    {
        return "env".into();
    }
    let s = bin.to_string_lossy();
    if s.contains("/Contents/Resources/") {
        return "app".into();
    }
    if s.contains("/gorkX/runtime/") || s.contains("/gorkX/grok-home/bin/") {
        return "runtime".into();
    }
    if s.contains("/.grok/bin/") || s.contains("/.gorkx/bin/") {
        return "legacy".into();
    }
    "legacy".into()
}

fn source_repo_hint(home: &str) -> String {
    let candidates = [
        format!("{home}/projects/grok-build"),
        format!("{home}/code/grok-build"),
        format!("{home}/src/grok-build"),
        format!("{home}/Developer/grok-build"),
    ];
    for c in candidates {
        if Path::new(&c).join("Cargo.toml").is_file() {
            return c;
        }
    }
    format!("{home}/projects/grok-build")
}

fn collect_grok_status(grok_cmd: Option<String>) -> Result<GrokStatus, String> {
    let _ = paths::ensure_dirs();
    let override_set = grok_cmd
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let bin = resolve_grok_bin(grok_cmd.as_deref());
    let user_home = std::env::var("HOME").unwrap_or_default();
    let ghome = paths::grok_home();
    let auth_path = paths::auth_json_path();
    let auth_dir = ghome.join("auth");
    let api_key = std::env::var("XAI_API_KEY")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    let cached = auth_path.exists()
        || (auth_dir.is_dir()
            && std::fs::read_dir(&auth_dir)
                .map(|mut d| d.next().is_some())
                .unwrap_or(false));
    let authenticated = api_key || cached;
    let source_hint = source_repo_hint(&user_home);
    let upgrade_official =
        "Update engine via gorkX Settings → Updates (or rebuild open-source Grok Build into App runtime)."
            .to_string();
    let upgrade_source = format!(
        "git clone https://github.com/xai-org/grok-build.git\n\
cd {source_hint}\n\
git pull\n\
cargo build -p xai-grok-pager-bin --release\n\
# copy into gorkX:\n\
#   Application Support/gorkX/runtime/grok\n\
# or Contents/Resources/grok when packaging"
    );
    let docs_url = "https://docs.x.ai/build/overview".to_string();
    let source_url = "https://github.com/xai-org/grok-build".to_string();
    let channel = channel_for(&bin, override_set);
    let resolved = dunce_canonicalize(&bin);
    let engine_app_owned = paths::engine_is_app_owned(&bin) || channel == "app" || channel == "runtime";
    let independent_ready = engine_app_owned && ghome.starts_with(paths::app_support_dir());

    let base = |installed: bool, version: String, detail: String| GrokStatus {
        installed,
        version,
        authenticated: if installed { authenticated } else { false },
        auth_path: auth_path.to_string_lossy().to_string(),
        grok_path: resolved,
        detail,
        channel: channel.clone(),
        source_repo_hint: source_hint.clone(),
        upgrade_official: upgrade_official.clone(),
        upgrade_source: upgrade_source.clone(),
        docs_url: docs_url.clone(),
        source_url: source_url.clone(),
        grok_home: ghome.display().to_string(),
        engine_app_owned,
        independent_ready,
    };

    let mut ver_cmd = std::process::Command::new(&bin);
    ver_cmd.arg("--version");
    paths::apply_engine_env(&mut ver_cmd);
    let output = ver_cmd.output();

    match output {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let version = if version.is_empty() {
                String::from_utf8_lossy(&out.stderr).trim().to_string()
            } else {
                version
            };
            let detail = if !engine_app_owned {
                "Dev fallback: engine from PATH/legacy. Package Resources/grok for product independence.".into()
            } else if authenticated {
                "Engine ready (App-owned). Data under App GROK_HOME.".into()
            } else {
                "Engine found — sign in (Settings → Account) so auth lands in App GROK_HOME.".into()
            };
            Ok(base(
                true,
                version,
                detail,
            ))
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Ok(base(
                false,
                String::new(),
                if err.is_empty() {
                    "Engine binary failed --version".into()
                } else {
                    err
                },
            ))
        }
        Err(e) => Ok(base(
            false,
            String::new(),
            format!("Engine not found ({e}). Bundle open-source Grok Build into the app."),
        )),
    }
}

fn dunce_canonicalize(path: &Path) -> String {
    path.canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.to_string_lossy().to_string())
}
