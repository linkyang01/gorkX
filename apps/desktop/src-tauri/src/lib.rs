mod agent_bridge;
mod extensions;
mod git_panel;
mod pty;
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
            git_panel::git_snapshot,
            git_panel::git_file_diff,
            git_panel::git_stage,
            git_panel::git_unstage,
            workspace::workspace_list_files,
            extensions::extensions_snapshot,
            extensions::extensions_open_skills_dir,
            extensions::extensions_open_config,
            extensions::extensions_open_path,
            extensions::extensions_mcp_doctor,
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
            store::store_clear_chat,
            store::store_clear_project,
            store::home_dir,
            store::account_summary,
            store::list_available_models,
            store::model_context_info,
            reveal_in_finder,
        ])
        .on_window_event(move |window, event| {
            match event {
                // Red close button: hide to tray, keep agents running.
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Destroyed => {
                    let app = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(pool) = app.try_state::<Arc<AgentPool>>() {
                            let _ = pool.stop_all().await;
                        }
                    });
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running gorkX");
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
