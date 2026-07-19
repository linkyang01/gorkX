// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--run-scheduled-jobs") {
        match gorkx_lib::run_scheduled_jobs() {
            Ok(summary) => {
                eprintln!("scheduled jobs: due={}, succeeded={}, failed={}", summary.due, summary.succeeded, summary.failed);
                return;
            }
            Err(error) => {
                eprintln!("scheduled jobs failed: {error}");
                std::process::exit(1);
            }
        }
    }
    gorkx_lib::run()
}
