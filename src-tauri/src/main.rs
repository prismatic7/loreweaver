// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(not(test))]
    tauri_app_lib::export_bindings();
    tauri_app_lib::run()
}
