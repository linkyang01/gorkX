//! App-owned paths: support dir, engine binary, GROK_HOME.
//! Product rule: user installs gorkX only — engine + data live under App control.

use std::path::{Path, PathBuf};

/// macOS: ~/Library/Application Support/gorkX
pub fn app_support_dir() -> PathBuf {
    dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Library/Application Support")))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("gorkX")
}

/// Engine data home (sessions, auth, memory, config). Official Grok uses GROK_HOME.
/// Default: Application Support/gorkX/grok-home
/// Escape hatch for debug only: GORKX_USE_SYSTEM_GROK_HOME=1 → ~/.grok
pub fn grok_home() -> PathBuf {
    if std::env::var("GORKX_USE_SYSTEM_GROK_HOME")
        .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes"))
        .unwrap_or(false)
    {
        return dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/"))
            .join(".grok");
    }
    if let Ok(v) = std::env::var("GROK_HOME") {
        let t = v.trim();
        if !t.is_empty() {
            return PathBuf::from(t);
        }
    }
    if let Ok(v) = std::env::var("GORKX_GROK_HOME") {
        let t = v.trim();
        if !t.is_empty() {
            return PathBuf::from(t);
        }
    }
    app_support_dir().join("grok-home")
}

/// Bundled / managed engine binary locations (never "user must install CLI" as default).
pub fn runtime_grok_bin() -> PathBuf {
    app_support_dir().join("runtime").join("grok")
}

pub fn ensure_dirs() -> Result<(), String> {
    let home = grok_home();
    std::fs::create_dir_all(&home).map_err(|e| format!("create GROK_HOME: {e}"))?;
    for sub in ["memory", "sessions", "bin"] {
        let _ = std::fs::create_dir_all(home.join(sub));
    }
    let _ = std::fs::create_dir_all(app_support_dir().join("runtime"));
    maybe_seed_from_legacy_home(&home);
    Ok(())
}

/// One-time soft seed: if App home has no auth but legacy ~/.grok has login, copy auth
/// so existing SuperGrok users are not stranded when we switch home.
fn maybe_seed_from_legacy_home(app_home: &Path) {
    let marker = app_home.join(".gorkx_seeded_auth");
    if marker.exists() {
        return;
    }
    let legacy = match dirs::home_dir() {
        Some(h) => h.join(".grok"),
        None => return,
    };
    if !legacy.is_dir() || legacy == app_home {
        return;
    }
    let app_auth = app_home.join("auth.json");
    let legacy_auth = legacy.join("auth.json");
    if app_auth.exists() || !legacy_auth.is_file() {
        let _ = std::fs::write(&marker, b"1");
        return;
    }
    if let Ok(bytes) = std::fs::read(&legacy_auth) {
        let _ = std::fs::write(&app_auth, bytes);
    }
    // Optional: seed models cache for offline picker
    let legacy_models = legacy.join("models_cache.json");
    let app_models = app_home.join("models_cache.json");
    if !app_models.exists() && legacy_models.is_file() {
        if let Ok(bytes) = std::fs::read(&legacy_models) {
            let _ = std::fs::write(&app_models, bytes);
        }
    }
    let _ = std::fs::write(&marker, b"1");
}

fn default_path_env() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let extras = [
        format!("{home}/.gorkx/bin"),
        format!("{home}/.grok/bin"),
        format!("{home}/.local/bin"),
        format!("{home}/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    format!("{}:{current}", extras.join(":"))
}

/// Resolve engine binary.
/// Priority: explicit override → GORKX_GROK_CMD → App Resources → App runtime →
/// App grok-home/bin → (dev only) ~/.gorkx/bin → ~/.grok/bin → PATH.
/// Product default is App-owned; PATH is last resort for development.
pub fn resolve_grok_bin(override_cmd: Option<&str>) -> PathBuf {
    if let Some(cmd) = override_cmd {
        if !cmd.trim().is_empty() {
            return PathBuf::from(cmd.trim());
        }
    }
    if let Ok(cmd) = std::env::var("GORKX_GROK_CMD") {
        if !cmd.trim().is_empty() {
            return PathBuf::from(cmd.trim());
        }
    }
    // macOS .app: Contents/MacOS/<exe> → Contents/Resources/grok
    if let Ok(exe) = std::env::current_exe() {
        if let Some(macos_dir) = exe.parent() {
            if let Some(contents) = macos_dir.parent() {
                for name in ["grok", "xai-grok-pager"] {
                    let res = contents.join("Resources").join(name);
                    if res.is_file() {
                        return res;
                    }
                }
            }
            for name in ["grok", "xai-grok-pager"] {
                let sibling = macos_dir.join(name);
                if sibling.is_file() {
                    return sibling;
                }
            }
        }
    }
    let runtime = runtime_grok_bin();
    if runtime.is_file() {
        return runtime;
    }
    let in_home = grok_home().join("bin").join("grok");
    if in_home.is_file() {
        return in_home;
    }
    if let Some(home) = dirs::home_dir() {
        for rel in [".gorkx/bin/grok", ".grok/bin/grok"] {
            let p = home.join(rel);
            if p.is_file() {
                return p;
            }
        }
    }
    for dir in default_path_env().split(':') {
        if dir.is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join("grok");
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from("grok")
}

/// Apply env for any process that must use App-owned Grok data.
pub fn apply_engine_env(cmd: &mut std::process::Command) {
    let _ = ensure_dirs();
    let home = grok_home();
    cmd.env("GROK_HOME", &home);
    cmd.env("PATH", default_path_env());
}

pub fn apply_engine_env_tokio(cmd: &mut tokio::process::Command) {
    let _ = ensure_dirs();
    let home = grok_home();
    cmd.env("GROK_HOME", &home);
    cmd.env("PATH", default_path_env());
}

pub fn config_toml_path() -> PathBuf {
    grok_home().join("config.toml")
}

pub fn memory_dir() -> PathBuf {
    grok_home().join("memory")
}

pub fn auth_json_path() -> PathBuf {
    grok_home().join("auth.json")
}

/// true when engine is from App Resources or App runtime (not PATH/legacy).
pub fn engine_is_app_owned(bin: &Path) -> bool {
    let s = bin.to_string_lossy();
    if s.contains("/Contents/Resources/") {
        return true;
    }
    if let Ok(rt) = runtime_grok_bin().canonicalize() {
        if let Ok(b) = bin.canonicalize() {
            if b == rt {
                return true;
            }
        }
    }
    false
}

