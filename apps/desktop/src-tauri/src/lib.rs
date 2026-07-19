mod agent_bridge;
mod app_update;
mod auth;
mod capture;
mod extensions;
mod git_panel;
mod github;
mod grok_admin;
mod memory;
mod models_config;
mod paths;
mod pty;
mod scheduler;
mod store;
mod terminal;
mod workspace;

use agent_bridge::AgentPool;
use std::sync::Arc;
use terminal::TerminalPool;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pool = Arc::new(AgentPool::new());
    let terminals = Arc::new(TerminalPool::new());
    let ptys = Arc::new(pty::PtyPool::new());
    let app_store = store::AppStore::open().expect("open gorkX sqlite store");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .manage(pool.clone())
        .manage(terminals)
        .manage(ptys)
        .manage(app_store)
        .setup(|app| {
            // System tray: Show / Quit (agents cleaned on quit)
            let show_i = MenuItem::with_id(app, "show", "Show gorkX", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .map_err(|e| format!("tray icon: {e}"))?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("gorkX")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(pool) = handle.try_state::<Arc<AgentPool>>() {
                                let _ = pool.stop_all().await;
                            }
                            handle.exit(0);
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_bridge::agent_start,
            agent_bridge::agent_write,
            agent_bridge::agent_stop,
            agent_bridge::agent_stop_all,
            agent_bridge::agent_list,
            agent_bridge::grok_status,
            agent_bridge::kernel_doctor,
            git_panel::git_snapshot,
            git_panel::git_file_diff,
            git_panel::git_stage,
            git_panel::git_unstage,
            github::github_status,
            github::github_connect_readonly,
            github::github_test_connection,
            github::github_disconnect,
            github::github_list_open_prs,
            github::github_list_pr_checks,
            github::github_list_pr_comments,
            grok_admin::grok_admin_exec,
            workspace::workspace_list_files,
            workspace::read_workspace_file_preview,
            extensions::extensions_snapshot,
            extensions::extensions_open_skills_dir,
            extensions::extensions_open_config,
            extensions::extensions_open_path,
            extensions::extensions_mcp_doctor,
            extensions::extensions_mcp_add_playwright_chrome,
            extensions::extensions_plugin_install,
            extensions::extensions_plugin_set_enabled,
            extensions::extensions_plugin_uninstall,
            extensions::extensions_marketplace,
            extensions::extensions_mcp_remove,
            terminal::terminal_create,
            terminal::terminal_output,
            terminal::terminal_kill,
            terminal::terminal_release,
            terminal::terminal_wait_for_exit,
            terminal::terminal_list,
            terminal::shell_exec,
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            pty::pty_list,
            store::store_list_threads,
            store::store_upsert_thread,
            store::store_remove_thread,
            store::store_save_chat,
            store::store_load_chat,
            store::store_kv_get,
            store::store_kv_set,
            store::store_db_path,
            store::store_data_dir,
            scheduler::scheduler_status,
            scheduler::scheduler_enable,
            scheduler::scheduler_disable,
            scheduler::scheduler_list_runs,
            store::store_clear_chat,
            store::store_clear_project,
            store::home_dir,
            store::projects_root,
            store::create_named_project,
            store::rename_project_folder,
            store::store_rekey_project,
            store::account_summary,
            store::list_available_models,
            store::model_context_info,
            auth::auth_logout,
            auth::auth_login_browser,
            auth::auth_session_present,
            app_update::app_update_check,
            app_update::app_update_install,
            app_update::app_current_version,
            capture::capture_screen_region,
            memory::memory_status,
            memory::memory_set_enabled,
            memory::memory_set_auto_learn,
            memory::memory_read_file,
            memory::memory_open_dir,
            memory::memory_append_note,
            memory::memory_injection_context,
            memory::memory_record_session,
            memory::memory_forget,
            memory::memory_delete_file,
            memory::memory_search,
            memory::memory_compact,
            models_config::models_list_custom,
            models_config::models_upsert_custom,
            models_config::models_remove_custom,
            models_config::models_set_default,
            models_config::models_open_config,
            models_config::models_test_connection,
            models_config::models_migrate_plaintext_keys,
            reveal_in_finder,
        ])
        .on_window_event(move |window, event| {
            match event {
                // Red close / Cmd+W: always quit the whole process.
                // (With a system tray, closing the window alone would otherwise leave the app running.)
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let app = window.app_handle().clone();
                    // Best-effort agent cleanup in background — never block exit on it.
                    if let Some(pool) = app.try_state::<Arc<AgentPool>>() {
                        let pool = pool.inner().clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = tokio::time::timeout(
                                std::time::Duration::from_millis(800),
                                pool.stop_all(),
                            )
                            .await;
                        });
                    }
                    // Exit immediately so the red button always feels like Quit.
                    app.exit(0);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running gorkX");
}

/// Entry point used by the launchd worker mode in the app executable.
pub fn run_scheduled_jobs() -> Result<scheduler::SchedulerRunSummary, String> {
    scheduler::run_due_jobs()
}

/// Open a path in Finder (macOS) / file manager.
#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("reveal_in_finder unsupported on this OS".into())
}
