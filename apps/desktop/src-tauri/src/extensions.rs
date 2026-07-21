//! Skills / MCP / Plugins discovery for the gorkX Extensions hub.
//! Runtime is still the Grok kernel — all kernel-backed data is surfaced from
//! gorkX's app-owned `GROK_HOME`, never the user's `~/.grok` by default.

use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub path: String,
    /// user | project | bundled | agents | claude | cursor | commands
    pub scope: String,
    pub user_invocable: bool,
    pub when_to_use: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub name: String,
    pub enabled: bool,
    pub scope: String,
    pub command: Option<String>,
    pub url: Option<String>,
    pub args: Vec<String>,
    /// Redacted env keys only (values never returned).
    pub env_keys: Vec<String>,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub name: String,
    pub enabled: bool,
    pub scope: String,
    pub version: Option<String>,
    pub path: Option<String>,
    pub description: String,
    pub raw: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionsSnapshot {
    pub skills: Vec<SkillInfo>,
    pub mcp: Vec<McpServerInfo>,
    pub plugins: Vec<PluginInfo>,
    pub skill_roots: Vec<String>,
    pub config_path: String,
    pub error: Option<String>,
}

fn grok_bin(override_cmd: Option<&str>) -> PathBuf {
    crate::paths::resolve_grok_bin(override_cmd)
}

fn run_grok_json(bin: &Path, args: &[&str]) -> Result<serde_json::Value, String> {
    let _ = crate::paths::ensure_dirs();
    let mut cmd = Command::new(bin);
    cmd.args(args);
    crate::paths::apply_engine_env(&mut cmd);
    let out = cmd
        .output()
        .map_err(|e| format!("spawn {}: {e}", bin.display()))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !out.status.success() && stdout.is_empty() {
        return Err(if stderr.is_empty() {
            format!("grok {:?} failed ({})", args, out.status)
        } else {
            stderr
        });
    }
    if stdout.is_empty() || stdout == "null" {
        return Ok(serde_json::json!([]));
    }
    serde_json::from_str(&stdout).map_err(|e| format!("json parse: {e}; body={stdout}"))
}

/// Very small YAML-ish frontmatter reader (enough for SKILL.md fields).
fn parse_skill_frontmatter(text: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    let Some(rest) = text.strip_prefix("---") else {
        return map;
    };
    let rest = rest.trim_start_matches(['\r', '\n']);
    let end = rest.find("\n---").or_else(|| rest.find("\r\n---"));
    let Some(end) = end else {
        return map;
    };
    let block = &rest[..end];
    let mut current_key: Option<String> = None;
    let mut current_val = String::new();
    let flush = |key: &Option<String>, val: &str, map: &mut BTreeMap<String, String>| {
        if let Some(k) = key {
            let v = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
            if !k.is_empty() {
                map.insert(k.clone(), v);
            }
        }
    };
    for line in block.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            // multiline continuation
            if current_key.is_some() {
                if !current_val.is_empty() {
                    current_val.push(' ');
                }
                current_val.push_str(line.trim());
            }
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            flush(&current_key, &current_val, &mut map);
            current_key = Some(k.trim().to_string());
            current_val = v.trim().to_string();
            // folded block indicators
            if current_val == ">" || current_val == "|" || current_val == ">-" || current_val == "|-"
            {
                current_val.clear();
            }
        }
    }
    flush(&current_key, &current_val, &mut map);
    map
}

fn first_paragraph(body: &str) -> String {
    let mut out = String::new();
    for line in body.lines() {
        let t = line.trim();
        if t.is_empty() {
            if !out.is_empty() {
                break;
            }
            continue;
        }
        if t.starts_with('#') {
            continue;
        }
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(t);
        if out.len() > 220 {
            break;
        }
    }
    if out.len() > 220 {
        out.truncate(217);
        out.push_str("…");
    }
    out
}

fn collect_skills_in_dir(dir: &Path, scope: &str, out: &mut Vec<SkillInfo>, seen: &mut BTreeMap<String, usize>) {
    if !dir.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        // Flat command markdown under commands/
        if path.is_file()
            && path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
            && scope == "commands"
        {
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("cmd")
                .to_string();
            let text = fs::read_to_string(&path).unwrap_or_default();
            let fm = parse_skill_frontmatter(&text);
            let name = fm.get("name").cloned().unwrap_or(stem);
            let desc = fm
                .get("description")
                .cloned()
                .filter(|s| !s.is_empty() && s != ">")
                .unwrap_or_else(|| first_paragraph(&text));
            let invocable = fm
                .get("user-invocable")
                .map(|v| v != "false")
                .unwrap_or(true);
            upsert_skill(
                out,
                seen,
                SkillInfo {
                    name,
                    description: desc,
                    path: path.display().to_string(),
                    scope: scope.into(),
                    user_invocable: invocable,
                    when_to_use: fm.get("when-to-use").cloned().unwrap_or_default(),
                },
            );
            continue;
        }
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.is_file() {
            // one-level nest (bundled layout)
            if let Ok(sub) = fs::read_dir(&path) {
                for s in sub.flatten() {
                    let sp = s.path();
                    let sm = sp.join("SKILL.md");
                    if sm.is_file() {
                        push_skill_file(&sm, scope, out, seen);
                    }
                }
            }
            continue;
        }
        push_skill_file(&skill_md, scope, out, seen);
    }
}

fn push_skill_file(
    skill_md: &Path,
    scope: &str,
    out: &mut Vec<SkillInfo>,
    seen: &mut BTreeMap<String, usize>,
) {
    let text = fs::read_to_string(skill_md).unwrap_or_default();
    let fm = parse_skill_frontmatter(&text);
    let dir_name = skill_md
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("skill")
        .to_string();
    let name = fm
        .get("name")
        .cloned()
        .filter(|s| !s.is_empty())
        .unwrap_or(dir_name);
    let body = if let Some(i) = text.find("\n---") {
        let after = text[i + 4..].trim_start_matches('-').trim_start();
        after
    } else {
        text.as_str()
    };
    let desc = fm
        .get("description")
        .cloned()
        .filter(|s| !s.is_empty() && s != ">" && s != "|")
        .unwrap_or_else(|| first_paragraph(body));
    let invocable = fm
        .get("user-invocable")
        .map(|v| v != "false")
        .unwrap_or(true);
    upsert_skill(
        out,
        seen,
        SkillInfo {
            name,
            description: desc,
            path: skill_md
                .parent()
                .unwrap_or(skill_md)
                .display()
                .to_string(),
            scope: scope.into(),
            user_invocable: invocable,
            when_to_use: fm.get("when-to-use").cloned().unwrap_or_default(),
        },
    );
}

fn upsert_skill(out: &mut Vec<SkillInfo>, seen: &mut BTreeMap<String, usize>, skill: SkillInfo) {
    // Higher-priority scopes are scanned first; keep first.
    let key = skill.name.to_ascii_lowercase();
    if seen.contains_key(&key) {
        return;
    }
    seen.insert(key, out.len());
    out.push(skill);
}

fn discover_skills(project: Option<&str>) -> (Vec<SkillInfo>, Vec<String>) {
    let grok_home = crate::paths::grok_home();
    let mut skills = Vec::new();
    let mut seen = BTreeMap::new();
    let mut roots = Vec::new();

    // Priority order (first wins): project local → repo → user → bundled → agents → claude → cursor
    let mut candidates: Vec<(PathBuf, &str)> = Vec::new();

    if let Some(proj) = project {
        let p = PathBuf::from(proj);
        if p.is_dir() {
            candidates.push((p.join(".grok/skills"), "project"));
            candidates.push((p.join(".grok/commands"), "commands"));
            candidates.push((p.join(".agents/skills"), "project"));
            candidates.push((p.join(".claude/skills"), "claude"));
            candidates.push((p.join(".cursor/skills"), "cursor"));
            // Walk up a few parents for monorepos
            let mut cur = p.parent().map(|x| x.to_path_buf());
            for _ in 0..4 {
                let Some(c) = cur else { break };
                candidates.push((c.join(".grok/skills"), "repo"));
                candidates.push((c.join(".agents/skills"), "repo"));
                cur = c.parent().map(|x| x.to_path_buf());
            }
        }
    }

    candidates.push((grok_home.join("skills"), "user"));
    candidates.push((grok_home.join("commands"), "commands"));
    candidates.push((grok_home.join("bundled/skills"), "bundled"));

    for (dir, scope) in candidates {
        if dir.is_dir() {
            roots.push(dir.display().to_string());
            collect_skills_in_dir(&dir, scope, &mut skills, &mut seen);
        }
    }

    skills.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    (skills, roots)
}

fn parse_mcp_list(val: serde_json::Value) -> Vec<McpServerInfo> {
    let arr = match val {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Object(o) => o
            .get("servers")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        _ => vec![],
    };
    arr.into_iter()
        .filter_map(|item| {
            let obj = item.as_object()?;
            let name = obj
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unnamed")
                .to_string();
            let enabled = obj
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let scope = obj
                .get("scope")
                .and_then(|v| v.as_str())
                .unwrap_or("user")
                .to_string();
            let command = obj
                .get("command")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let url = obj
                .get("url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let args: Vec<String> = obj
                .get("args")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let env_keys = obj
                .get("env")
                .and_then(|v| v.as_object())
                .map(|m| m.keys().cloned().collect::<Vec<_>>())
                .unwrap_or_default();
            let detail = if let Some(c) = &command {
                format!("{} {}", c, args.join(" ")).trim().to_string()
            } else if let Some(u) = &url {
                u.clone()
            } else {
                String::new()
            };
            Some(McpServerInfo {
                name,
                enabled,
                scope,
                command,
                url,
                args,
                env_keys,
                detail,
            })
        })
        .collect()
}

fn parse_plugin_list(val: serde_json::Value) -> Vec<PluginInfo> {
    let arr = match val {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Object(o) => o
            .get("plugins")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        _ => vec![],
    };
    arr.into_iter()
        .map(|item| {
            let obj = item.as_object();
            let name = obj
                .and_then(|o| o.get("name").or_else(|| o.get("id")))
                .and_then(|v| v.as_str())
                .unwrap_or("plugin")
                .to_string();
            let enabled = obj
                .and_then(|o| o.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let scope = obj
                .and_then(|o| o.get("scope").or_else(|| o.get("source")))
                .and_then(|v| v.as_str())
                .unwrap_or("user")
                .to_string();
            let version = obj
                .and_then(|o| o.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let path = obj
                .and_then(|o| o.get("path").or_else(|| o.get("dir")))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let description = obj
                .and_then(|o| o.get("description"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            PluginInfo {
                name,
                enabled,
                scope,
                version,
                path,
                description,
                raw: item,
            }
        })
        .collect()
}

fn collect_snapshot(project: Option<String>, grok_cmd: Option<String>) -> ExtensionsSnapshot {
    let config_path = crate::paths::config_toml_path().display().to_string();
    let bin = grok_bin(grok_cmd.as_deref());
    let (skills, skill_roots) = discover_skills(project.as_deref());

    let mut errors: Vec<String> = Vec::new();

    let mcp = match run_grok_json(&bin, &["mcp", "list", "--json"]) {
        Ok(v) => parse_mcp_list(v),
        Err(e) => {
            errors.push(format!("mcp: {e}"));
            Vec::new()
        }
    };

    let plugins = match run_grok_json(&bin, &["plugin", "list", "--json"]) {
        Ok(v) => parse_plugin_list(v),
        Err(e) => {
            errors.push(format!("plugin: {e}"));
            Vec::new()
        }
    };

    ExtensionsSnapshot {
        skills,
        mcp,
        plugins,
        skill_roots,
        config_path,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    }
}

#[tauri::command]
pub async fn extensions_snapshot(
    project: Option<String>,
    grok_cmd: Option<String>,
) -> Result<ExtensionsSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || collect_snapshot(project, grok_cmd))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn extensions_open_skills_dir() -> Result<String, String> {
    let dir = crate::paths::grok_home().join("skills");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open_path(dir.display().to_string())
}

#[tauri::command]
pub async fn extensions_open_config() -> Result<String, String> {
    let path = crate::paths::config_toml_path();
    if !path.is_file() {
        return Err(format!("missing {}", path.display()));
    }
    open_path(path.display().to_string())
}

#[tauri::command]
pub async fn extensions_open_path(path: String) -> Result<String, String> {
    open_path(path)
}

fn open_path(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(path);
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(path);
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(path);
    }
    #[allow(unreachable_code)]
    Err("open unsupported".into())
}

/// Toggle MCP server enabled flag via `grok mcp` when possible; else edit config is left to user.
fn redact_mcp_doctor_output(raw: String) -> String {
    raw.lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            let sensitive = ["token", "api_key", "apikey", "secret", "password", "authorization"]
                .iter()
                .any(|needle| lower.contains(needle));
            if !sensitive {
                return line.to_string();
            }
            if let Some((key, _)) = line.split_once('=') {
                return format!("{key}=<redacted>");
            }
            if let Some((key, _)) = line.split_once(':') {
                return format!("{key}: <redacted>");
            }
            "<redacted sensitive MCP diagnostic>".into()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[tauri::command]
pub async fn extensions_mcp_doctor(grok_cmd: Option<String>) -> Result<String, String> {
    let bin = grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        run_grok_text(&bin, &["mcp", "doctor"]).map(redact_mcp_doctor_output)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::redact_mcp_doctor_output;

    #[test]
    fn doctor_output_redacts_sensitive_values() {
        let raw = "playwright: healthy\nAPI_KEY=abc123\nauthorization: Bearer xyz\nserver ready";
        let safe = redact_mcp_doctor_output(raw.into());
        assert!(safe.contains("playwright: healthy"));
        assert!(safe.contains("API_KEY=<redacted>"));
        assert!(safe.contains("authorization: <redacted>"));
        assert!(!safe.contains("abc123"));
        assert!(!safe.contains("xyz"));
    }
}

/// Configure the supported Playwright MCP against the user's visible Chrome.
/// It deliberately runs through the app-owned Grok binary and GROK_HOME.
#[tauri::command]
pub async fn extensions_mcp_add_playwright_chrome(
    grok_cmd: Option<String>,
) -> Result<String, String> {
    let bin = grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        run_grok_text(
            &bin,
            &[
                "mcp",
                "add",
                "playwright",
                "--",
                "npx",
                "-y",
                "@playwright/mcp@latest",
                "--browser",
                "chrome",
            ],
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extensions_plugin_install(
    source: String,
    grok_cmd: Option<String>,
) -> Result<String, String> {
    let src = source.trim().to_string();
    if src.is_empty() {
        return Err("empty plugin source".into());
    }
    let bin = grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        let _ = crate::paths::ensure_dirs();
        let mut cmd = Command::new(&bin);
        cmd.args(["plugin", "install", &src]);
        crate::paths::apply_engine_env(&mut cmd);
        let out = cmd
            .output()
            .map_err(|e| e.to_string())?;
        let mut s = String::from_utf8_lossy(&out.stdout).to_string();
        let err = String::from_utf8_lossy(&out.stderr);
        if !err.trim().is_empty() {
            if !s.is_empty() {
                s.push('\n');
            }
            s.push_str(&err);
        }
        if !out.status.success() {
            return Err(if s.trim().is_empty() {
                format!("plugin install failed ({})", out.status)
            } else {
                s
            });
        }
        Ok(s)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn run_grok_text(bin: &Path, args: &[&str]) -> Result<String, String> {
    let _ = crate::paths::ensure_dirs();
    let mut cmd = Command::new(bin);
    cmd.args(args);
    crate::paths::apply_engine_env(&mut cmd);
    let out = cmd
        .output()
        .map_err(|e| format!("spawn {}: {e}", bin.display()))?;
    let mut s = String::from_utf8_lossy(&out.stdout).to_string();
    let err = String::from_utf8_lossy(&out.stderr);
    if !err.trim().is_empty() {
        if !s.is_empty() {
            s.push('\n');
        }
        s.push_str(&err);
    }
    if !out.status.success() {
        return Err(if s.trim().is_empty() {
            format!("grok {:?} failed ({})", args, out.status)
        } else {
            s
        });
    }
    Ok(s)
}

#[tauri::command]
pub async fn extensions_plugin_set_enabled(
    name: String,
    enabled: bool,
    grok_cmd: Option<String>,
) -> Result<String, String> {
    let n = name.trim().to_string();
    if n.is_empty() {
        return Err("empty plugin name".into());
    }
    let bin = grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        let sub = if enabled { "enable" } else { "disable" };
        run_grok_text(&bin, &["plugin", sub, &n])
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extensions_plugin_uninstall(
    name: String,
    grok_cmd: Option<String>,
) -> Result<String, String> {
    let n = name.trim().to_string();
    if n.is_empty() {
        return Err("empty plugin name".into());
    }
    let bin = grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || run_grok_text(&bin, &["plugin", "uninstall", &n]))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceInfo {
    pub sources: Vec<serde_json::Value>,
    pub raw: String,
}

#[tauri::command]
pub async fn extensions_marketplace(grok_cmd: Option<String>) -> Result<MarketplaceInfo, String> {
    let bin = grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        // Prefer JSON; fall back to text
        match run_grok_json(&bin, &["plugin", "marketplace", "list", "--json"]) {
            Ok(v) => {
                let sources = match v {
                    serde_json::Value::Array(a) => a,
                    other => vec![other],
                };
                Ok(MarketplaceInfo {
                    sources,
                    raw: String::new(),
                })
            }
            Err(_) => {
                let raw = run_grok_text(&bin, &["plugin", "marketplace", "list"])?;
                Ok(MarketplaceInfo {
                    sources: vec![],
                    raw,
                })
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extensions_mcp_remove(
    name: String,
    grok_cmd: Option<String>,
) -> Result<String, String> {
    let n = name.trim().to_string();
    if n.is_empty() {
        return Err("empty mcp name".into());
    }
    let bin = grok_bin(grok_cmd.as_deref());
    tauri::async_runtime::spawn_blocking(move || run_grok_text(&bin, &["mcp", "remove", &n]))
        .await
        .map_err(|e| e.to_string())?
}
