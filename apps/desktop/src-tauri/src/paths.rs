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
/// Debug-only escape hatches can override this for isolated development tests.
/// A production bundle must never silently inherit a user's CLI home or an
/// externally supplied data directory: its authentication and sessions belong
/// to this application install.
pub fn grok_home() -> PathBuf {
    #[cfg(debug_assertions)]
    {
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
    }
    app_support_dir().join("grok-home")
}

/// Private OS-home view for Grok Build child processes. `GROK_HOME` alone is
/// insufficient because the kernel also discovers optional skills and
/// compatibility files relative to `HOME`. Keep that discovery app-owned so a
/// normal gorkX launch never imports a user's unrelated CLI configuration.
pub fn engine_process_home() -> PathBuf {
    app_support_dir().join("engine-home")
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
    let _ = std::fs::create_dir_all(engine_process_home());
    let _ = std::fs::create_dir_all(app_support_dir().join("runtime"));
    Ok(())
}

fn default_path_env() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let extras = [
        format!("{home}/.local/bin"),
        format!("{home}/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    format!("{}:{current}", extras.join(":"))
}

/// Resolve engine binary.
/// Priority: explicit override → explicit env override → App Resources → App runtime →
/// App grok-home/bin → development bundle resource. Legacy/PATH lookup is opt-in in
/// debug builds with `GORKX_ALLOW_LEGACY_ENGINE=1`.
/// Product default never reads or executes an engine from `~/.grok` or PATH.
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
    #[cfg(debug_assertions)]
    {
        let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("grok");
        if bundled.is_file() {
            return bundled;
        }
        if std::env::var("GORKX_ALLOW_LEGACY_ENGINE")
            .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes"))
            .unwrap_or(false)
        {
            if let Some(home) = dirs::home_dir() {
                for rel in [".gorkx/bin/grok", ".grok/bin/grok"] {
                    let p = home.join(rel);
                    if p.is_file() {
                        return p;
                    }
                }
            }
            for dir in default_path_env().split(':') {
                if !dir.is_empty() {
                    let candidate = Path::new(dir).join("grok");
                    if candidate.is_file() {
                        return candidate;
                    }
                }
            }
        }
    }
    // An absolute app-owned candidate gives a truthful "missing" error and avoids
    // Command::new silently finding a user's PATH-installed Grok binary.
    runtime_grok_bin()
}

/// Apply env for any process that must use App-owned Grok data.
pub fn apply_engine_env(cmd: &mut std::process::Command) {
    let _ = ensure_dirs();
    let home = grok_home();
    let process_home = engine_process_home();
    cmd.env("GROK_HOME", &home);
    cmd.env("HOME", process_home);
    cmd.env("PATH", default_path_env());
}

pub fn apply_engine_env_tokio(cmd: &mut tokio::process::Command) {
    let _ = ensure_dirs();
    let home = grok_home();
    let process_home = engine_process_home();
    cmd.env("GROK_HOME", &home);
    cmd.env("HOME", process_home);
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

#[cfg(test)]
mod tests {
    use super::{apply_engine_env, engine_process_home, grok_home};
    use std::process::Command;

    #[test]
    fn engine_child_uses_only_app_owned_home_locations() {
        let mut command = Command::new("/usr/bin/env");
        apply_engine_env(&mut command);
        let envs = command.get_envs().collect::<Vec<_>>();
        let value = |name: &str| {
            envs.iter()
                .find(|(key, _)| *key == std::ffi::OsStr::new(name))
                .and_then(|(_, value)| value.as_ref())
                .map(|value| value.to_string_lossy().into_owned())
        };
        assert_eq!(value("HOME"), Some(engine_process_home().display().to_string()));
        assert_eq!(value("GROK_HOME"), Some(grok_home().display().to_string()));
    }
}
