//! Spawn and multiplex local `grok agent stdio` processes.
//! Frontend talks JSON-RPC NDJSON over Tauri events + invoke.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use crate::paths;
use crate::models_config;

/// Soft ceiling only to avoid runaway process spawn (not a product "max 4 agents" limit).
pub const MAX_AGENTS: usize = 64;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub pid: u32,
    pub permission_mode: String,
    pub working_directory: String,
}

struct LiveAgent {
    child: Child,
    stdin: ChildStdin,
    permission_mode: String,
    working_directory: String,
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

/// Engine stderr is not an ACP protocol channel. Treat it as untrusted diagnostic
/// text: upstream tracing can include credential-derived fields (for example a
/// refresh-token prefix). A generic message is more useful than leaking a value
/// into the WebView, persisted task activity, or crash reports.
fn sanitize_engine_diagnostic(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    let sensitive = [
        "token", "api_key", "apikey", "secret", "password", "authorization", "rt_prefix",
    ]
    .iter()
    .any(|needle| lower.contains(needle));
    if sensitive {
        "[engine diagnostic redacted: credential-related detail omitted]".into()
    } else {
        raw.replace('\u{1b}', "")
    }
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

/// The OS-level sandbox is fixed at kernel-process startup, before ACP's
/// `session/new` supplies a cwd. Resolve and validate the task directory here
/// so the kernel applies its profile to the same project the task will open.
fn resolve_agent_working_directory(working_directory: Option<String>) -> Result<PathBuf, String> {
    if let Some(raw) = working_directory.filter(|path| !path.trim().is_empty()) {
        let path = std::fs::canonicalize(&raw)
            .map_err(|e| format!("Project folder is unavailable for the agent sandbox: {e}"))?;
        if !path.is_dir() {
            return Err("Project folder is not a directory for the agent sandbox.".into());
        }
        Ok(path)
    } else {
        std::env::current_dir().map_err(|e| format!("resolve agent working directory: {e}"))
    }
}

#[tauri::command]
pub async fn agent_start(
    app: AppHandle,
    pool: State<'_, Arc<AgentPool>>,
    permission_mode: String,
    grok_cmd: Option<String>,
    reasoning_effort: Option<String>,
    working_directory: Option<String>,
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
    let working_directory = resolve_agent_working_directory(working_directory)?;

    let mut command = Command::new(&bin);
    command
        .args(&args)
        .current_dir(&working_directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    paths::apply_engine_env_tokio(&mut command);
    models_config::apply_keychain_env_tokio(&mut command);

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
                let line = sanitize_engine_diagnostic(&line);
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
        working_directory: working_directory.display().to_string(),
    };

    pool.agents.lock().await.insert(
        id,
        LiveAgent {
            child,
            stdin,
            permission_mode: mode,
            working_directory: info.working_directory.clone(),
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
            working_directory: a.working_directory.clone(),
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelDoctor {
    pub status: GrokStatus,
    pub grok_home_writable: bool,
    pub issues: Vec<String>,
    pub repair_hint: String,
    /// Findings reported by the bundled Grok Build `doctor --json` command.
    /// This keeps the desktop view aligned with kernel diagnostics instead of
    /// pretending that gorkX's own preflight is the whole diagnosis.
    pub engine_findings: Vec<KernelDoctorFinding>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelDoctorFinding {
    pub id: String,
    pub disposition: String,
    pub message: String,
    pub note: Option<String>,
    pub remediation: Option<String>,
    pub automatic_fix_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelDoctorFix {
    pub fix_id: String,
    pub success: bool,
    pub output: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineDoctorDocument {
    #[serde(default)]
    findings: Vec<EngineDoctorFinding>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineDoctorFinding {
    id: String,
    disposition: String,
    message: String,
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    remediation: Option<serde_json::Value>,
    #[serde(default)]
    automatic_remediation: Option<EngineDoctorAutomaticRemediation>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineDoctorAutomaticRemediation {
    fix_id: String,
}

fn engine_doctor_findings(bin: &Path) -> Result<Vec<KernelDoctorFinding>, String> {
    let mut command = std::process::Command::new(bin);
    command.args(["doctor", "--json"]);
    paths::apply_engine_env(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("run Grok Build doctor: {error}"))?;
    if !output.status.success() {
        return Err(sanitize_engine_diagnostic(&String::from_utf8_lossy(&output.stderr)));
    }
    let document: EngineDoctorDocument = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Grok Build returned invalid doctor data: {error}"))?;
    Ok(document.findings.into_iter().map(|finding| KernelDoctorFinding {
        id: finding.id,
        disposition: finding.disposition,
        message: finding.message,
        note: finding.note,
        remediation: finding.remediation.map(|value| match value {
            serde_json::Value::String(value) => value,
            value => value.to_string(),
        }),
        automatic_fix_id: finding.automatic_remediation.map(|fix| fix.fix_id),
    }).collect())
}

fn safe_doctor_fix_id(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value.len() <= 120
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

#[tauri::command]
pub async fn grok_status(grok_cmd: Option<String>) -> Result<GrokStatus, String> {
    tauri::async_runtime::spawn_blocking(move || collect_grok_status(grok_cmd))
        .await
        .map_err(|e| e.to_string())?
}

/// Diagnose the local engine without downloading or modifying it. Repairing a missing
/// bundled binary requires reinstalling a verified gorkX build; this command must not
/// pretend that an arbitrary network download is a safe repair path.
#[tauri::command]
pub async fn kernel_doctor(grok_cmd: Option<String>) -> Result<KernelDoctor, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let status = collect_grok_status(grok_cmd)?;
        let home = paths::grok_home();
        let probe = home.join(".gorkx-write-probe");
        let grok_home_writable = std::fs::write(&probe, b"ok")
            .and_then(|_| std::fs::remove_file(&probe))
            .is_ok();
        let mut issues = Vec::new();
        if !status.installed {
            issues.push("Bundled engine is missing or cannot run.".into());
        }
        if !status.engine_app_owned {
            issues.push("The selected engine is external; it is not part of this gorkX install.".into());
        }
        if !grok_home_writable {
            issues.push("App GROK_HOME is not writable.".into());
        }
        if !status.authenticated {
            issues.push("No sign-in was found in App GROK_HOME.".into());
        }
        let repair_hint = if !status.installed {
            "Reinstall a gorkX build that contains Contents/Resources/grok, or select an explicit development engine path.".into()
        } else if !grok_home_writable {
            "Restore write access to Application Support/gorkX, then run the doctor again.".into()
        } else if !status.authenticated {
            "Sign in from Settings → Account; credentials will be stored under App GROK_HOME.".into()
        } else if !status.engine_app_owned {
            "Clear the advanced engine path to return to the app-bundled engine.".into()
        } else {
            "No repair is needed.".into()
        };
        let engine_findings = if status.installed {
            match engine_doctor_findings(Path::new(&status.grok_path)) {
                Ok(findings) => findings,
                Err(error) => {
                    issues.push(format!("Grok Build doctor could not run: {error}"));
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };
        Ok(KernelDoctor { status, grok_home_writable, issues, repair_hint, engine_findings })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Execute a remediation which the current Grok Build diagnostic explicitly
/// advertised. The renderer cannot pass arbitrary `grok` subcommands here.
#[tauri::command]
pub async fn kernel_doctor_fix(fix_id: String, grok_cmd: Option<String>) -> Result<KernelDoctorFix, String> {
    if !safe_doctor_fix_id(&fix_id) {
        return Err("Invalid Grok Build doctor repair identifier.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let status = collect_grok_status(grok_cmd)?;
        if !status.installed {
            return Err("Grok Build is unavailable; cannot apply a repair.".into());
        }
        let bin = Path::new(&status.grok_path);
        let advertised = engine_doctor_findings(bin)?
            .into_iter()
            .any(|finding| finding.automatic_fix_id.as_deref() == Some(fix_id.as_str()));
        if !advertised {
            return Err("This repair was not offered by the current Grok Build diagnosis.".into());
        }
        let mut command = std::process::Command::new(bin);
        command.args(["doctor", "fix", &fix_id]);
        paths::apply_engine_env(&mut command);
        let output = command
            .output()
            .map_err(|error| format!("run Grok Build doctor repair: {error}"))?;
        let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
        if !output.stderr.is_empty() {
            if !text.is_empty() { text.push('\n'); }
            text.push_str(&String::from_utf8_lossy(&output.stderr));
        }
        Ok(KernelDoctorFix {
            fix_id,
            success: output.status.success(),
            output: sanitize_engine_diagnostic(&text),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn channel_for(bin: &Path, override_set: bool) -> String {
    if !bin.is_file() {
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
                sanitize_engine_diagnostic(String::from_utf8_lossy(&out.stderr).trim())
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
            let err = sanitize_engine_diagnostic(String::from_utf8_lossy(&out.stderr).trim());
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

#[cfg(test)]
mod tests {
    use super::{resolve_agent_working_directory, safe_doctor_fix_id, sanitize_engine_diagnostic};

    #[test]
    fn engine_stderr_never_exposes_credential_derived_fields() {
        let safe = sanitize_engine_diagnostic(
            "auth refresh failed rt_prefix=\"value-that-must-not-escape\" token expired",
        );
        assert_eq!(safe, "[engine diagnostic redacted: credential-related detail omitted]");
        assert!(!safe.contains("value-that-must-not-escape"));
    }

    #[test]
    fn engine_stderr_keeps_non_sensitive_diagnostics() {
        assert_eq!(sanitize_engine_diagnostic("connection refused"), "connection refused");
    }

    #[test]
    fn agent_working_directory_is_canonical_project_folder() {
        let raw = std::env::temp_dir();
        let actual = resolve_agent_working_directory(Some(raw.display().to_string())).unwrap();
        assert!(actual.is_absolute());
        assert!(actual.is_dir());
    }

    #[test]
    fn agent_working_directory_rejects_a_missing_project() {
        let missing = std::env::temp_dir().join("gorkx-no-such-project-for-sandbox");
        assert!(resolve_agent_working_directory(Some(missing.display().to_string())).is_err());
    }

    #[test]
    fn doctor_fix_id_is_a_bounded_identifier_not_cli_input() {
        assert!(safe_doctor_fix_id("terminal.tmux-clipboard"));
        assert!(!safe_doctor_fix_id("--all"));
        assert!(!safe_doctor_fix_id("terminal.fix; rm -rf /"));
        assert!(!safe_doctor_fix_id(""));
    }
}
