//! # Loreweaver Rust Backend (`lib.rs`)
//!
//! Main entry point and Tauri v2 application bootstrapper for Loreweaver.
//!
//! ## Architectural Overview & Key Responsibilities
//!
//! 1. **Tauri Application Lifecycle (`run`)**:
//!    - Initializes local-first application storage directories (`app_data_dir`, campaign vaults, plugins).
//!    - Initializes SQLite persistence (`db::init_db`) and seeds default TTRPG rules (`db::seed_default_rules`).
//!    - Spawns the real-time directory file watcher (`watcher::start_directory_watcher`).
//!    - Launches background vector embedding initialization and indexing (`search::init_search_engine`).
//!    - Exposes the Tauri IPC command interface (`tauri::generate_handler!`) for React frontend invocation.
//!
//! 2. **Shared State Management (`AppState`)**:
//!    - Process-wide thread-safe state managed by Tauri and injected into command handlers via `state: State<AppState>`.
//!    - Double-locking design (`Mutex<Arc<Mutex<rusqlite::Connection>>>`) allows background threads (file watcher,
//!      vector indexing flusher) to execute concurrent database operations while permitting live vault switching.
//!
//! 3. **Tauri IPC Command Contract (`Result<T, String>`)**:
//!    - All exposed command handlers (`#[tauri::command]`) return `Result<T, String>`.
//!    - `Ok(T)` values automatically serialize into JSON to resolve JavaScript Promises on the React frontend.
//!    - `Err(String)` error messages serialize into rejected Promises, enabling standard `try { await invoke(...) } catch (err)` handling.
//!
//! 4. **Security & Vault Boundary Validation (`validate_safe_path`)**:
//!    - Strict path normalization and boundary checking prevents directory traversal attacks (`../`).
//!    - Guarantees all filesystem I/O is strictly contained within the active campaign vault directory.
//!
//! 5. **Submodule Orchestration**:
//!    - [`agent`]: Multi-provider AI LLM client integration, RAG prompt assembly, and agentic workflows.
//!    - [`db`]: SQLite schema setup, note/rule metadata storage, and FTS5 lexical indexing.
//!    - [`ingest`]: SRD rule text ingestion and markdown section chunking.
//!    - [`plugins`]: Boa JavaScript engine host executing user-provided plugins in a restricted sandbox.
//!    - [`search`]: Fastembed local vector search engine and cosine similarity ranking.
//!    - [`watcher`]: Real-time notify file watcher, frontmatter parser, and auto-sync flusher.

use base64::{engine::general_purpose, Engine as _};
use notify::RecommendedWatcher;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, Manager, State};
use tokio::sync::Mutex as TokioMutex;

pub mod agent;
mod db;
mod ingest;
mod pdf;
mod plugins;
pub mod providers;
mod search;
mod watcher;

// --- App State ---

/// Shared, thread-safe application state managed by Tauri (`app.manage(...)`).
///
/// Injected into Tauri command handlers via `state: State<AppState>`.
///
/// ### Multi-Threading & Locking Architecture
/// - **Path Fields** (`db_path`, `vault_path`, `plugins_path`): Wrapped in `Mutex<String>` to permit live vault
///   switching without requiring application restarts.
/// - **Watcher Handle** (`watcher`): Wrapped in `Mutex<Option<RecommendedWatcher>>` to allow stopping and replacing
///   the active file watcher when switching active campaign vaults.
/// - **Database Handle** (`conn`): Uses double-mutex nesting (`Mutex<Arc<Mutex<rusqlite::Connection>>>`).
///   - The outer `Mutex` allows replacing the database connection reference during vault switching.
///   - The inner `Arc<Mutex<...>>` allows sharing the active SQLite handle safely across background watcher
///     and vector-indexing threads.
pub struct AppState {
    /// Absolute filesystem path to the current campaign's SQLite database.
    pub db_path: TokioMutex<String>,
    /// Absolute filesystem path to the active campaign vault root directory.
    pub vault_path: TokioMutex<String>,
    /// Absolute filesystem path to the plugins directory.
    pub plugins_path: TokioMutex<String>,
    /// Active directory file watcher handle monitoring vault markdown changes.
    pub watcher: TokioMutex<Option<RecommendedWatcher>>,
    /// Thread-safe shared connection handle to the active SQLite database.
    ///
    /// Outer `tokio::sync::Mutex` permits async command handlers to await the lock without
    /// blocking the runtime; inner `std::sync::Mutex<Arc<...>>` lets background threads clone
    /// and share the SQLite connection, which is not `Send`.
    pub conn: TokioMutex<Arc<Mutex<rusqlite::Connection>>>,
    /// Root directory containing all campaign vault folders.
    pub campaigns_root: std::path::PathBuf,
    /// Cooperative shutdown signal for background watcher/indexer threads.
    ///
    /// Held inside a `tokio::sync::Mutex` so `switch_vault` can atomically replace the flag
    /// shared with the active watcher flusher thread.
    pub shutdown: TokioMutex<Arc<AtomicBool>>,
}

// Shared command input/output data shapes. Included here and by build.rs for Specta export.
mod export_types;
pub use export_types::*;

#[derive(Serialize, Deserialize, Clone, Debug, Default, specta::Type)]
pub struct VaultSettings {
    pub name: Option<String>,
    pub campaign_system: Option<String>,
    pub description: Option<String>,
    pub tag_colors: Option<HashMap<String, String>>,
}

// --- Tauri Commands ---

/// Derive a machine-specific key from the user's home directory path.
/// Kept private for the legacy repeating-XOR fallback only; will be removed
/// once existing keys have migrated to the OS keyring.
fn machine_key() -> Vec<u8> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "loreweaver".to_string());
    let seed = format!("loreweaver::{}", home);
    seed.bytes().collect()
}

/// Legacy repeating-XOR decrypt kept for one release so existing stored keys
/// keep working after the switch to keyring-backed storage.
fn legacy_decrypt_api_key(ciphertext: &str, _provider_id: &str) -> Result<String, String> {
    if ciphertext.is_empty() {
        return Ok(String::new());
    }
    let key = machine_key();
    match general_purpose::STANDARD.decode(ciphertext) {
        Ok(bytes) => {
            let decoded: Vec<u8> = bytes
                .iter()
                .enumerate()
                .map(|(i, &b)| b ^ key[i % key.len()])
                .collect();
            String::from_utf8(decoded)
                .map_err(|_| "Legacy key contained invalid UTF-8".to_string())
        }
        Err(_) => {
            // If decode fails, it might be a legacy plaintext value — return as-is
            Ok(ciphertext.to_string())
        }
    }
}

/// Legacy repeating-XOR encrypt. Kept non-test-only because `encrypt_api_key`
/// falls back to legacy obfuscation when the OS keyring is unavailable.
fn legacy_encrypt_api_key(plaintext: &str, _provider_id: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    let key = machine_key();
    let bytes: Vec<u8> = plaintext
        .bytes()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    general_purpose::STANDARD.encode(&bytes)
}

fn keyring_entry(provider_id: &str) -> keyring::Entry {
    keyring::Entry::new("loreweaver", &format!("api-key-{}", provider_id))
        .unwrap_or_else(|_| panic!("Failed to create keyring entry"))
}

fn keyring_is_available() -> bool {
    keyring_entry("__loreweaver_probe__")
        .set_password("")
        .is_ok()
}

fn encrypt_api_key(key: &str, provider_id: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if keyring_is_available() {
        let entry = keyring_entry(provider_id);
        match entry.set_password(key) {
            Ok(()) => {
                // Return an opaque handle so the existing settings schema still stores a string.
                return format!("keyring:{}", provider_id);
            }
            Err(e) => {
                eprintln!(
                    "Keyring unavailable for provider {}, falling back to legacy obfuscation: {}",
                    provider_id, e
                );
            }
        }
    }
    // Fallback: keep storing with legacy repeating-XOR obfuscation for one release
    // so the key is not lost when the OS keyring cannot be accessed.
    legacy_encrypt_api_key(key, provider_id)
}

fn decrypt_api_key(ciphertext: &str, provider_id: &str) -> Result<String, String> {
    if let Some(stored_provider) = ciphertext.strip_prefix("keyring:") {
        if stored_provider != provider_id {
            return Err("Provider mismatch for keyring key".to_string());
        }
        let entry = keyring_entry(provider_id);
        entry.get_password().map_err(|e| format!("Keyring error: {}", e))
    } else {
        // Legacy repeating-XOR fallback for migration and headless environments.
        legacy_decrypt_api_key(ciphertext, provider_id)
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Welcome to Loreweaver, {}! Let's build some worlds.", name)
}

/// Load all campaign notes from the local SQLite database.
///
/// ### IPC Error Contract
/// Returns `Result<Vec<CampaignNote>, String>`. If locking the SQLite connection fails,
/// the error is converted to a readable `String` which rejects the frontend Promise.
#[tauri::command]
async fn load_notes(state: State<'_, AppState>) -> Result<Vec<CampaignNote>, String> {
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    db::load_all_notes(&conn).map_err(|e| e.to_string())
}

/// Normalizes and validates that `note_path` stays strictly within `vault_path`.
///
/// ### Security & Directory Traversal Defense
/// Prevents malicious paths (e.g., `../../etc/passwd`) from escaping the vault boundary.
/// 1. Combines `vault_path` and `note_path`.
/// 2. Iterates over path components using a `VecDeque` stack to resolve relative `.` and `..` segments.
/// 3. Normalizes both the target path and vault path.
/// 4. Enforces that `normalized.starts_with(&normalized_vault)`, returning an error if traversal is detected.
fn validate_safe_path(vault_path: &str, note_path: &str) -> Result<std::path::PathBuf, String> {
    let vault = std::path::Path::new(vault_path);
    let target = vault.join(note_path);
    let canonical_vault = std::fs::canonicalize(vault)
        .map_err(|e| format!("Failed to canonicalize vault path: {}", e))?;
    let canonical_target = std::fs::canonicalize(&target)
        .or_else(|_| {
            // Allow paths to not-yet-created files, but resolve any parent symlinks first.
            let canonical_parent = target
                .parent()
                .and_then(|p| std::fs::canonicalize(p).ok())
                .unwrap_or_else(|| canonical_vault.clone());
            Ok::<_, std::io::Error>(canonical_parent.join(target.file_name().unwrap_or_default()))
        })
        .map_err(|e| format!("Failed to canonicalize target path: {}", e))?;
    if !canonical_target.starts_with(&canonical_vault) {
        return Err("Security Violation: Attempted directory traversal outside the vault boundary.".to_string());
    }
    Ok(canonical_target)
}

/// Validates an AI provider URL to prevent SSRF through private ranges or credential leaks.
///
/// - Only `http` and `https` schemes are permitted.
/// - URLs with userinfo (username/password) are rejected.
/// - Loopback, private, link-local, and multicast IPs are blocked unless
///   `allow_local` is `true`.
/// - `localhost`, `.local`, and `127.0.0.1` domain names are also blocked unless
///   `allow_local` is `true`.
pub fn validate_provider_url(raw: &str, allow_local: bool) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("Invalid provider URL: {}", e))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Provider URL must use http or https".to_string());
    }
    if parsed.username() != "" || parsed.password().is_some() {
        return Err("Provider URL must not contain credentials".to_string());
    }
    if !allow_local {
        if let Some(host) = parsed.host() {
            match host {
                url::Host::Domain(d) => {
                    if d == "localhost" || d.ends_with(".local") || d == "127.0.0.1" {
                        return Err("Private/localhost provider URLs are not allowed".to_string());
                    }
                }
                url::Host::Ipv4(ip) => {
                    if ip.is_loopback()
                        || ip.is_private()
                        || ip.is_link_local()
                        || ip.is_multicast()
                    {
                        return Err("Private IP provider URLs are not allowed".to_string());
                    }
                }
                url::Host::Ipv6(ip) => {
                    if ip.is_loopback() {
                        return Err("Loopback IPv6 provider URLs are not allowed".to_string());
                    }
                }
            }
        }
    }
    Ok(parsed)
}

/// Validates that `target_path` is inside the current vault's parent (campaigns) directory.
/// Returns the canonicalized path on success.
fn validate_campaigns_path(
    campaigns_root: &std::path::Path,
    target_path: &str,
) -> Result<std::path::PathBuf, String> {
    let target = std::path::Path::new(target_path);
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Target path does not exist or cannot be resolved: {}", e))?;
    let canonical_campaigns = campaigns_root
        .canonicalize()
        .map_err(|e| format!("Campaigns directory cannot be resolved: {}", e))?;

    if !canonical_target.starts_with(&canonical_campaigns) {
        return Err(
            "Security Violation: Attempted path outside the campaigns directory boundary."
                .to_string(),
        );
    }

    Ok(canonical_target)
}

/// Serializes YAML frontmatter and markdown body, writing the note file to disk.
fn write_note_to_disk(
    file_path: &std::path::Path,
    content: &str,
    frontmatter: &HashMap<String, Value>,
) -> Result<(), String> {
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file_content = String::new();
    if !frontmatter.is_empty() {
        let yaml_str = serde_yaml::to_string(frontmatter)
            .map_err(|e| format!("Failed to serialize frontmatter to YAML: {}", e))?;
        file_content.push_str("---\n");
        let trimmed_yaml = yaml_str.trim_start_matches("---").trim();
        file_content.push_str(trimmed_yaml);
        file_content.push_str("\n---\n");
    }

    file_content.push_str(content);
    std::fs::write(file_path, file_content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Save note directly to disk and upsert into SQLite immediately.
///
/// Dual-writes to both filesystem and SQLite database so that subsequent queries
/// (like `load_notes`) immediately reflect modifications without waiting for the watcher flusher.
#[tauri::command]
async fn save_note(state: State<'_, AppState>, note: CampaignNote) -> Result<(), String> {
    let vault_path = state.vault_path.lock().await;
    let file_path = validate_safe_path(&vault_path, &note.path)?;
    write_note_to_disk(&file_path, &note.content, &note.frontmatter)?;

    // Also upsert directly into the DB so load_notes immediately reflects changes
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    let _ = db::upsert_note(
        &conn,
        &note.path,
        &note.title,
        &note.content,
        &note.frontmatter,
    );

    Ok(())
}

/// Sanitizes an asset filename so it is a single, non-hidden, non-empty file name.
/// Rejects paths containing directory separators or parent-directory references.
fn sanitize_asset_name(name: &str) -> Result<String, String> {
    let path = std::path::Path::new(name);
    if path.components().count() != 1 {
        return Err("Asset filename must not contain directories".to_string());
    }
    let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
        return Err("Invalid asset filename".to_string());
    };
    if file_name.is_empty() || file_name.starts_with('.') {
        return Err("Asset filename cannot be empty or hidden".to_string());
    }
    Ok(file_name.to_string())
}

/// Saves a base64 encoded asset into the note's co-located `_assets` subdirectory.
#[tauri::command]
async fn save_note_asset(
    state: State<'_, AppState>,
    note_path: &str,
    filename: &str,
    base64_data: &str,
) -> Result<String, String> {
    use base64::Engine;

    let vault_path = state.vault_path.lock().await;

    let note_file_path = validate_safe_path(&vault_path, note_path)?;
    let parent_dir = note_file_path
        .parent()
        .ok_or_else(|| "Invalid note parent directory".to_string())?;

    let assets_dir = parent_dir.join("_assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create _assets directory: {}", e))?;

    let clean_filename = sanitize_asset_name(filename)?;

    let asset_file_path = assets_dir.join(&clean_filename);

    let bytes = base64::prelude::BASE64_STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;

    std::fs::write(&asset_file_path, bytes)
        .map_err(|e| format!("Failed to write asset file: {}", e))?;

    Ok(format!("_assets/{}", clean_filename))
}

/// Resolves or auto-creates a note from a [[Wiki-link]] target.
#[tauri::command]
async fn resolve_wiki_link(state: State<'_, AppState>, target_name: &str) -> Result<CampaignNote, String> {
    let vault_path = state.vault_path.lock().await;

    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;

    // 1. Check if note already exists by title or path
    // Escape LIKE wildcards in the target name to prevent wildcard injection
    let escaped_name = target_name
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    let like_pattern = format!("%/{escaped_name}.md");
    let existing_note = conn.query_row(
        "SELECT id, path, title, content FROM notes WHERE LOWER(title) = LOWER(?1) OR LOWER(path) LIKE LOWER(?2) ESCAPE '\\'",
        params![target_name, like_pattern],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    );

    if let Ok((id, path, title, content)) = existing_note {
        let mut frontmatter = HashMap::new();
        if let Ok(mut meta_stmt) =
            conn.prepare("SELECT meta_key, meta_value FROM note_metadata WHERE note_id = ?1")
        {
            if let Ok(meta_rows) = meta_stmt.query_map(params![id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            }) {
                for meta in meta_rows.flatten() {
                    let val =
                        serde_json::from_str(&meta.1).unwrap_or_else(|_| Value::String(meta.1));
                    frontmatter.insert(meta.0, val);
                }
            }
        }
        return Ok(CampaignNote {
            id,
            title,
            path,
            frontmatter,
            content,
        });
    }

    // 2. Note does not exist: auto-create from default entity template
    let clean_title = target_name.trim();
    // Sanitize filename: replace path separators and illegal chars
    let safe_filename: String = clean_title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let rel_path = format!("Worldbuilding/{}.md", safe_filename);
    let full_path = validate_safe_path(&vault_path, &rel_path)?;

    let mut frontmatter = HashMap::new();
    frontmatter.insert("type".to_string(), Value::String("Lore".to_string()));
    frontmatter.insert(
        "created_at".to_string(),
        Value::String(chrono::Utc::now().to_rfc3339()),
    );
    frontmatter.insert(
        "tags".to_string(),
        Value::Array(vec![Value::String("auto-created".to_string())]),
    );

    let initial_content = format!(
        "# {}\n\n*Auto-created note for [[{}]]*\n",
        clean_title, clean_title
    );

    write_note_to_disk(&full_path, &initial_content, &frontmatter)?;

    // Parse and upsert into SQLite
    let note_id = db::upsert_note(
        &conn,
        &rel_path,
        clean_title,
        &initial_content,
        &frontmatter,
    )
    .map_err(|e| e.to_string())?;
    drop(conn);

    Ok(CampaignNote {
        id: note_id,
        title: clean_title.to_string(),
        path: rel_path,
        frontmatter,
        content: initial_content,
    })
}

#[tauri::command]
async fn trash_note(state: State<'_, AppState>, note_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().await;
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    trash_note_impl(&vault_path, &conn, note_path)
}

fn trash_note_impl(
    vault_path: &str,
    conn: &rusqlite::Connection,
    note_path: &str,
) -> Result<(), String> {
    // Normalize the relative path: strip leading slashes, "./" prefixes, and whitespace
    // so that "notes/foo.md", "/notes/foo.md", and "./notes/foo.md" all resolve identically.
    let clean_path = note_path
        .trim_start_matches('/')
        .trim_start_matches("./")
        .trim();

    let file_path = validate_safe_path(vault_path, clean_path)?;

    if !file_path.exists() {
        // Ghost note: File is already deleted from disk. Clean up the database record.
        eprintln!(
            "[trash_note] file not found; cleaning DB records for '{}' and '{}'",
            note_path, clean_path
        );
        // Try both the raw and cleaned path in case DB stores either variant
        let _ = db::delete_note_by_path(conn, note_path);
        let _ = db::delete_note_by_path(conn, clean_path);
        search::invalidate_cache();
        return Err(format!(
            "Could not find note file at '{}' (already deleted?)",
            clean_path
        ));
    }

    // Parse existing file to retain content and metadata
    let (_title, content, mut frontmatter) = watcher::parse_markdown_file(&file_path)?;

    // Add trash metadata: store the clean relative path for reliable restoration
    frontmatter.insert(
        "original_path".to_string(),
        Value::String(clean_path.to_string()),
    );
    frontmatter.insert(
        "deleted_at".to_string(),
        Value::Number(serde_json::Number::from(chrono::Utc::now().timestamp())),
    );

    let trash_dir = std::path::Path::new(vault_path).join(".trash");
    std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;

    let filename = file_path.file_name().ok_or("Invalid note filename")?;
    let trash_filename = format!("{}_{}", uuid::Uuid::new_v4(), filename.to_string_lossy());
    let trash_file_path = trash_dir.join(&trash_filename);

    // Write to trash
    write_note_to_disk(&trash_file_path, &content, &frontmatter)?;

    // Remove original file
    std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;

    // Also remove from SQLite DB directly
    let _ = db::delete_note_by_path(conn, note_path);
    let _ = db::delete_note_by_path(conn, clean_path);
    search::invalidate_cache();

    Ok(())
}

#[tauri::command]
async fn trash_folder(state: State<'_, AppState>, folder_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().await;
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    trash_folder_impl(&vault_path, &conn, folder_path)
}

fn trash_folder_impl(
    vault_path: &str,
    conn: &rusqlite::Connection,
    folder_path: &str,
) -> Result<(), String> {
    let clean_folder = folder_path
        .trim_start_matches('/')
        .trim_start_matches("./")
        .trim();
    let target_dir = validate_safe_path(vault_path, clean_folder)?;

    if !target_dir.exists() {
        // Folder is already gone from disk; ensure DB is cleaned up.
        let _ = db::delete_notes_in_folder(conn, folder_path);
        let _ = db::delete_notes_in_folder(conn, clean_folder);
        return Ok(());
    }

    let trash_dir = std::path::Path::new(vault_path).join(".trash");
    std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;

    // Collect all .md files in the target directory and its subdirectories.
    let mut files_to_trash: Vec<std::path::PathBuf> = Vec::new();
    for entry in walkdir::WalkDir::new(&target_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
            files_to_trash.push(path.to_path_buf());
        }
    }

    // Move each markdown file to trash and remove its DB record.
    for file_path in files_to_trash {
        let rel_path = match file_path.strip_prefix(vault_path) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => {
                eprintln!("Could not compute relative path for {:?}", file_path);
                continue;
            }
        };

        let (_title, content, mut frontmatter) =
            watcher::parse_markdown_file(&file_path).unwrap_or_default();
        frontmatter.insert("original_path".to_string(), Value::String(rel_path.clone()));
        frontmatter.insert(
            "deleted_at".to_string(),
            Value::Number(serde_json::Number::from(chrono::Utc::now().timestamp())),
        );

        let filename = file_path.file_name().unwrap_or_default();
        let trash_filename = format!("{}_{}", uuid::Uuid::new_v4(), filename.to_string_lossy());
        let trash_file_path = trash_dir.join(&trash_filename);

        if write_note_to_disk(&trash_file_path, &content, &frontmatter).is_ok() {
            let _ = std::fs::remove_file(&file_path);
            let _ = db::delete_note_by_path(conn, &rel_path);
        }
    }

    // Remove the now-empty directory tree from disk.
    let _ = std::fs::remove_dir_all(&target_dir);

    // Final DB cleanup for any lingering rows.
    let _ = db::delete_notes_in_folder(conn, folder_path);
    let _ = db::delete_notes_in_folder(conn, clean_folder);

    Ok(())
}

#[tauri::command]
async fn restore_note(state: State<'_, AppState>, trash_note_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().await;
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    restore_note_impl(&vault_path, &conn, trash_note_path)
}

fn restore_note_impl(
    vault_path: &str,
    conn: &rusqlite::Connection,
    trash_note_path: &str,
) -> Result<(), String> {
    let file_path = validate_safe_path(vault_path, trash_note_path)?;
    if !file_path.exists() {
        return Err("Trashed note file does not exist".to_string());
    }

    // Parse the trashed note
    let (_title, content, mut frontmatter) = watcher::parse_markdown_file(&file_path)?;

    // Retrieve original path from frontmatter
    let original_path_val = frontmatter.remove("original_path");
    frontmatter.remove("deleted_at");

    let original_rel_path = match original_path_val {
        Some(Value::String(p)) => p,
        _ => {
            // Fallback: restore to Worldbuilding/filename (strip UUID prefix safely)
            let filename = file_path
                .file_name()
                .ok_or("Invalid filename")?
                .to_string_lossy();
            let clean_filename = if filename.len() > 37 && filename.is_char_boundary(37) {
                &filename[37..]
            } else {
                &filename
            };
            format!("Worldbuilding/{}", clean_filename)
        }
    };

    let original_file_path = validate_safe_path(vault_path, &original_rel_path)?;

    // Write restored note
    write_note_to_disk(&original_file_path, &content, &frontmatter)?;

    // Remove from trash
    std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;

    // Explicitly re-index the restored note so it appears immediately even if the watcher is late.
    let title = frontmatter
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let note_id = db::upsert_note(conn, &original_rel_path, title, &content, &frontmatter)
        .unwrap_or_default();

    if watcher::should_ai_index(&original_file_path, &frontmatter) {
        let _ = search::index_note_vectors(conn, &note_id, &content);
    } else {
        let _ = db::clear_note_chunks(conn, &note_id);
    }
    search::invalidate_cache();

    Ok(())
}

#[tauri::command]
async fn load_trash_notes(state: State<'_, AppState>) -> Result<Vec<CampaignNote>, String> {
    let vault_path = state.vault_path.lock().await;
    load_trash_notes_impl(&vault_path)
}

fn load_trash_notes_impl(vault_path: &str) -> Result<Vec<CampaignNote>, String> {
    let trash_dir = std::path::Path::new(vault_path).join(".trash");
    if !trash_dir.exists() {
        return Ok(Vec::new());
    }

    let mut trashed_notes = Vec::new();
    if let Ok(entries) = std::fs::read_dir(trash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                if let Ok((title, content, frontmatter)) = watcher::parse_markdown_file(&path) {
                    let rel_path = path
                        .strip_prefix(vault_path)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .into_owned();
                    let id = format!(
                        "trash-{}",
                        path.file_stem().unwrap_or_default().to_string_lossy()
                    );
                    trashed_notes.push(CampaignNote {
                        id,
                        title,
                        path: rel_path,
                        frontmatter,
                        content,
                    });
                }
            }
        }
    }

    Ok(trashed_notes)
}

#[tauri::command]
async fn empty_trash(state: State<'_, AppState>) -> Result<(), String> {
    let vault_path = state.vault_path.lock().await;
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    let trash_dir = std::path::Path::new(&*vault_path).join(".trash");
    if trash_dir.exists() {
        // Remove each trashed note from the DB before deleting the file.
        if let Ok(entries) = std::fs::read_dir(&trash_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                    let rel_path = path
                        .strip_prefix(&*vault_path)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    let original_path = watcher::parse_markdown_file(&path)
                        .ok()
                        .and_then(|(_t, _c, fm)| {
                            fm.get("original_path")
                                .and_then(|v| v.as_str().map(String::from))
                        })
                        .unwrap_or(rel_path.clone());
                    let _ = db::delete_note_by_path(&conn, &rel_path);
                    let _ = db::delete_note_by_path(&conn, &original_path);
                }
            }
        }
        std::fs::remove_dir_all(&trash_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    }
    search::invalidate_cache();
    Ok(())
}

#[tauri::command]
async fn delete_trashed_note(state: State<'_, AppState>, trash_note_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().await;
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    let file_path = validate_safe_path(&vault_path, trash_note_path)?;
    if file_path.exists() {
        // Remove the DB entry that may still exist for this trashed note.
        let rel_path = file_path
            .strip_prefix(&*vault_path)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .to_string();
        let original_path = watcher::parse_markdown_file(&file_path)
            .ok()
            .and_then(|(_t, _c, fm)| {
                fm.get("original_path")
                    .and_then(|v| v.as_str().map(String::from))
            })
            .unwrap_or(rel_path.clone());
        let _ = db::delete_note_by_path(&conn, &rel_path);
        let _ = db::delete_note_by_path(&conn, &original_path);
        std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    search::invalidate_cache();
    Ok(())
}

fn cleanup_expired_trash(vault_path_str: &str, conn: &rusqlite::Connection) -> Result<(), String> {
    let retention_days_str = db::get_setting(conn, "trash_retention_days")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "30".to_string());
    let retention_days: i64 = retention_days_str.parse().unwrap_or(30);

    let trash_dir = std::path::Path::new(vault_path_str).join(".trash");
    if !trash_dir.exists() {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp();
    let max_age_seconds = retention_days * 86400;

    if let Ok(entries) = std::fs::read_dir(trash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                if let Ok((_title, _content, frontmatter)) = watcher::parse_markdown_file(&path) {
                    let mut delete_file = false;
                    if let Some(Value::Number(deleted_at_num)) = frontmatter.get("deleted_at") {
                        if let Some(deleted_at) = deleted_at_num.as_i64() {
                            if now - deleted_at > max_age_seconds {
                                delete_file = true;
                            }
                        }
                    } else {
                        if let Ok(metadata) = path.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                if let Ok(duration) = modified.elapsed() {
                                    if duration.as_secs() as i64 > max_age_seconds {
                                        delete_file = true;
                                    }
                                }
                            }
                        }
                    }

                    if delete_file {
                        println!("Permanently deleting expired trashed note: {:?}", path);
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }

    Ok(())
}

/// Retrieve the active campaign vault path.
#[tauri::command]
async fn get_vault_path(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.vault_path.lock().await.clone())
}

/// Load rulebooks from the SQLite database.
#[tauri::command]
async fn load_rules(state: State<'_, AppState>) -> Result<Vec<RuleEntry>, String> {
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, path, title, category, source, content FROM rules")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RuleEntry {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                category: row.get(3)?,
                source: row.get(4)?,
                content: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut rules = Vec::new();
    for r in rows {
        rules.push(r.map_err(|e| e.to_string())?);
    }
    Ok(rules)
}

/// Rebuilds all note and rule vector embeddings from stored content.
///
/// Used after changing the embedding provider/dimension. Clears and
/// regenerates every chunk embedding, then invalidates the search cache.
#[tauri::command]
async fn reindex_vault(state: State<'_, AppState>) -> Result<(), String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;

    // Rebuild note chunks by re-indexing each note's full content.
    let notes = db::load_all_notes(&conn).map_err(|e| e.to_string())?;
    for note in &notes {
        search::index_note_vectors(&conn, &note.id, &note.content)?;
    }

    // Rebuild rule chunks by re-indexing each rule's full content.
    let rules = db::load_all_rules(&conn).map_err(|e| e.to_string())?;
    for rule in &rules {
        db::reindex_rule_chunks(&conn, &rule.id, &rule.content).map_err(|e| e.to_string())?;
    }

    search::invalidate_cache();
    Ok(())
}

/// Performs a hybrid local search (SQLite FTS5 + vector search similarity).
#[tauri::command]
async fn search_vault(
    state: State<'_, AppState>,
    query: &str,
    category: &str,
) -> Result<Vec<SearchResult>, String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    search::hybrid_query(&conn, query, category)
}

/// Saves (creates or updates) a rule entry to the database.
#[tauri::command]
async fn save_rule(state: State<'_, AppState>, rule: RuleEntry) -> Result<String, String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    db::upsert_rule(
        &conn,
        &rule.id,
        &rule.path,
        &rule.title,
        &rule.category,
        &rule.source,
        &rule.content,
    )
    .map_err(|e| e.to_string())?;
    // Re-index vector chunks for the saved rule
    if let Err(e) = db::reindex_rule_chunks(&conn, &rule.id, &rule.content) {
        eprintln!("Failed to re-index rule chunks: {:?}", e);
    }
    search::invalidate_cache();
    Ok(rule.id)
}

/// Deletes a rule entry from the database by id.
#[tauri::command]
async fn delete_rule(state: State<'_, AppState>, rule_id: &str) -> Result<(), String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    db::delete_rule(&conn, rule_id).map_err(|e| e.to_string())?;
    search::invalidate_cache();
    Ok(())
}

/// Recursively lists all directories inside the vault, relative to the vault root.
/// Excludes `.trash` and hidden directories starting with `.`.
#[tauri::command]
async fn list_folders(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let vault_path = state.vault_path.lock().await;
    let vault = std::path::Path::new(&*vault_path);
    if !vault.exists() {
        return Ok(Vec::new());
    }

    let mut folders: Vec<String> = Vec::new();

    fn collect_dirs(
        dir: &std::path::Path,
        vault: &std::path::Path,
        out: &mut Vec<String>,
    ) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name.starts_with('.') || name == "_assets" {
                continue;
            }
            let rel = path
                .strip_prefix(vault)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned();
            if !rel.is_empty() {
                out.push(rel);
            }
            collect_dirs(&path, vault, out)?;
        }
        Ok(())
    }

    if let Err(e) = collect_dirs(vault, vault, &mut folders) {
        eprintln!("list_folders error: {:?}", e);
    }

    folders.sort();
    folders.dedup();
    Ok(folders)
}

/// Deletes all rules whose path lives inside `folder_path` (e.g. a rulebook folder).
#[tauri::command]
async fn delete_rules_folder(state: State<'_, AppState>, folder_path: &str) -> Result<(), String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    db::delete_rules_in_folder(&conn, folder_path).map_err(|e| e.to_string())?;
    search::invalidate_cache();
    Ok(())
}

/// Ingests a new rulebook/SRD from raw markdown content.
#[tauri::command]
async fn ingest_srd_text(
    state: State<'_, AppState>,
    category: &str,
    source: &str,
    content: &str,
) -> Result<(), String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    ingest::ingest_markdown_text(&conn, content, category, source)
}

/// Converts a PDF (provided as base64 bytes) to Markdown using the local
/// pdf-inspector engine. Returns an error for scanned/image-based PDFs.
#[tauri::command]
async fn convert_pdf_to_markdown(base64_pdf: &str) -> Result<String, String> {
    let bytes = general_purpose::STANDARD
        .decode(base64_pdf)
        .map_err(|e| format!("Failed to decode PDF bytes: {e}"))?;
    run_blocking(move || pdf::pdf_bytes_to_markdown(&bytes)).await
}

/// Saves a persistent session memory fact for the active vault.
#[tauri::command]
async fn save_session_memory(
    state: State<'_, AppState>,
    fact: &str,
    category: &str,
) -> Result<String, String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    db::insert_session_memory(&conn, fact, category).map_err(|e| e.to_string())
}

/// Lists all session memory facts for the active vault, newest first.
#[tauri::command]
async fn list_session_memory(
    state: State<'_, AppState>,
) -> Result<Vec<(String, String, String, i64)>, String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    db::list_session_memory(&conn).map_err(|e| e.to_string())
}

/// Deletes a session memory fact by id.
#[tauri::command]
async fn delete_session_memory(state: State<'_, AppState>, id: &str) -> Result<(), String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;
    db::delete_session_memory(&conn, id).map_err(|e| e.to_string())
}

/// Generates a structured session summary from the current chat messages.
///
/// Takes the chat transcript as JSON, calls the configured LLM to produce a
/// recap (what happened, decisions, open threads), and returns Markdown.
#[tauri::command]
async fn summarize_session(
    state: State<'_, AppState>,
    messages_json: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, String> {
    let allow_local;
    {
        let conn_arc = state.conn.lock().await;
        let conn = conn_arc.lock().map_err(|_| "Mutex poisoned".to_string())?;
        allow_local = db::get_setting(&conn, "allow_local_providers")
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false);
    }

    if let Some(base) = base_url {
        validate_provider_url(base, allow_local)?;
    }

    let prompt = format!(
        "You are a session recorder for a tabletop RPG campaign. \
        Given the following chat transcript between a Game Master and the Campaign Architect, \
        produce a concise structured session summary in Markdown with these sections:\n\
        ## What Happened\n## Decisions Made\n## Open Threads / Follow-ups\n\n\
        Be specific and factual. Do not add conversational filler.\n\n\
        --- TRANSCRIPT ---\n{}\n------------------",
        messages_json
    );

    let prompt_owned = prompt.to_string();
    let provider_owned = provider.to_string();
    let model_owned = model.to_string();
    let api_key_owned = api_key.map(|k| k.to_string());
    let base_url_owned = base_url.map(|b| b.to_string());

    run_blocking(move || {
        let system_context = crate::providers::llm::SystemContext {
            system_prompt: "You are a concise, factual RPG session recorder.".to_string(),
            active_note_context: String::new(),
        };
        crate::providers::llm::generate_response(
            &system_context,
            &prompt_owned,
            &provider_owned,
            &model_owned,
            api_key_owned.as_deref(),
            base_url_owned.as_deref(),
            allow_local,
            &crate::providers::http_client(),
        )
    })
    .await
}

/// Runs a blocking synchronous computation on Tauri's blocking thread pool.
///
/// This keeps long-running HTTP or CPU-bound work out of the async runtime,
/// preventing DB locks from being held across I/O and keeping the UI responsive.
async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Blocking task panicked: {}", e))?
}

/// Orchestrates an AI response using the configured LLM backend.
#[tauri::command]
async fn orchestrate_agent(
    state: State<'_, AppState>,
    prompt: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    active_note_id: Option<&str>,
) -> Result<String, String> {
    let allow_local;
    let system_context;
    {
        let conn_arc = state.conn.lock().await;
        let conn = conn_arc.lock().map_err(|_| "Mutex poisoned".to_string())?;
        allow_local = db::get_setting(&conn, "allow_local_providers")
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false);
        system_context = agent::build_system_context(&conn, prompt, active_note_id)?;
    }

    if let Some(base) = base_url {
        validate_provider_url(base, allow_local)?;
    }

    let prompt_owned = prompt.to_string();
    let provider_owned = provider.to_string();
    let model_owned = model.to_string();
    let api_key_owned = api_key.map(|k| k.to_string());
    let base_url_owned = base_url.map(|b| b.to_string());

    run_blocking(move || {
        agent::generate_response(
            &system_context,
            &prompt_owned,
            &provider_owned,
            &model_owned,
            api_key_owned.as_deref(),
            base_url_owned.as_deref(),
            allow_local,
        )
    })
    .await
}

#[tauri::command]
async fn generate_image(
    prompt: &str,
    style: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, String> {
    if let Some(base) = base_url {
        if !base.trim().is_empty() {
            validate_provider_url(base.trim().trim_end_matches('/'), false)?;
        }
    }

    let provider_owned = provider.to_string();
    let prompt_owned = prompt.to_string();
    let style_owned = style.to_string();
    let model_owned = model.to_string();
    let api_key_owned = api_key.map(|k| k.to_string());
    let base_url_owned = base_url.map(|b| b.to_string());

    run_blocking(move || {
        let agent = crate::providers::http_client();
        crate::providers::image::generate_image(
            &prompt_owned,
            &style_owned,
            &provider_owned,
            &model_owned,
            api_key_owned.as_deref(),
            base_url_owned.as_deref(),
            &agent,
        )
    })
    .await
}

/// Generates speech audio from text using the configured TTS provider.
/// Returns a base64-encoded audio data URL suitable for <audio> playback.
#[tauri::command]
async fn generate_speech(
    text: &str,
    provider: &str,
    api_key: Option<&str>,
    voice: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text is required for speech generation".to_string());
    }

    if let Some(base) = base_url {
        if !base.trim().is_empty() {
            validate_provider_url(base.trim().trim_end_matches('/'), false)?;
        }
    }

    let provider_owned = provider.to_string();
    let text_owned = text.to_string();
    let api_key_owned = api_key.map(|k| k.to_string());
    let voice_owned = voice.map(|v| v.to_string());
    let base_url_owned = base_url.map(|b| b.to_string());

    run_blocking(move || {
        let agent = crate::providers::http_client();
        crate::providers::speech::generate_speech(
            &text_owned,
            &provider_owned,
            api_key_owned.as_deref(),
            voice_owned.as_deref(),
            base_url_owned.as_deref(),
            &agent,
        )
    })
    .await
}

/// Transcribes audio (base64) to text using the configured STT provider.
#[tauri::command]
async fn transcribe_speech(
    audio_base64: &str,
    provider: &str,
    api_key: Option<&str>,
) -> Result<String, String> {
    let provider_owned = provider.to_string();
    let audio_owned = audio_base64.to_string();
    let api_key_owned = api_key.map(|k| k.to_string());

    run_blocking(move || {
        let agent = crate::providers::http_client();
        crate::providers::speech::transcribe_speech(
            &audio_owned,
            &provider_owned,
            api_key_owned.as_deref(),
            &agent,
        )
    })
    .await
}

#[tauri::command]
async fn load_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;

    let allow_local_providers = db::get_setting(&conn, "allow_local_providers")
        .unwrap_or(None)
        .unwrap_or_else(|| "false".to_string())
        == "true";

    let llm_provider = db::get_setting(&conn, "llm_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "ollama".to_string());
    let llm_model = db::get_setting(&conn, "llm_model")
        .unwrap_or(None)
        .unwrap_or_else(|| "llama3:8b".to_string());
    let llm_api_key = decrypt_api_key(
        &db::get_setting(&conn, "llm_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
        &llm_provider,
    )
    .unwrap_or_default();
    let llm_base_url = db::get_setting(&conn, "llm_base_url")
        .unwrap_or(None)
        .unwrap_or_else(|| "http://localhost:11434".to_string());

    let embed_provider = db::get_setting(&conn, "embed_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let embed_model = db::get_setting(&conn, "embed_model")
        .unwrap_or(None)
        .unwrap_or_else(|| "all-MiniLM-L6-v2".to_string());
    let embed_api_key = decrypt_api_key(
        &db::get_setting(&conn, "embed_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
        &embed_provider,
    )
    .unwrap_or_default();
    let embed_base_url = db::get_setting(&conn, "embed_base_url")
        .unwrap_or(None)
        .unwrap_or_default();

    let image_provider = db::get_setting(&conn, "image_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let image_model = db::get_setting(&conn, "image_model")
        .unwrap_or(None)
        .unwrap_or_default();
    let image_api_key = decrypt_api_key(
        &db::get_setting(&conn, "image_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
        &image_provider,
    )
    .unwrap_or_default();
    let image_base_url = db::get_setting(&conn, "image_base_url")
        .unwrap_or(None)
        .unwrap_or_default();

    let tts_provider = db::get_setting(&conn, "tts_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let tts_api_key = decrypt_api_key(
        &db::get_setting(&conn, "tts_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
        &tts_provider,
    )
    .unwrap_or_default();
    let tts_voice = db::get_setting(&conn, "tts_voice")
        .unwrap_or(None)
        .unwrap_or_default();

    let stt_provider = db::get_setting(&conn, "stt_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let stt_api_key = decrypt_api_key(
        &db::get_setting(&conn, "stt_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
        &stt_provider,
    )
    .unwrap_or_default();

    Ok(AppSettings {
        allow_local_providers,
        llm_provider,
        llm_model,
        llm_api_key,
        llm_base_url,
        embed_provider,
        embed_model,
        embed_api_key,
        embed_base_url,
        image_provider,
        image_model,
        image_api_key,
        image_base_url,
        tts_provider,
        tts_api_key,
        tts_voice,
        stt_provider,
        stt_api_key,
    })
}

#[tauri::command]
async fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|e| e.to_string())?;

    db::set_setting(
        &conn,
        "allow_local_providers",
        if settings.allow_local_providers {
            "true"
        } else {
            "false"
        },
    )
    .map_err(|e| e.to_string())?;

    db::set_setting(&conn, "llm_provider", &settings.llm_provider).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "llm_model", &settings.llm_model).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "llm_api_key", &encrypt_api_key(&settings.llm_api_key, &settings.llm_provider))
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "llm_base_url", &settings.llm_base_url).map_err(|e| e.to_string())?;

    db::set_setting(&conn, "embed_provider", &settings.embed_provider)
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "embed_model", &settings.embed_model).map_err(|e| e.to_string())?;
    db::set_setting(
        &conn,
        "embed_api_key",
        &encrypt_api_key(&settings.embed_api_key, &settings.embed_provider),
    )
    .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "embed_base_url", &settings.embed_base_url)
        .map_err(|e| e.to_string())?;

    db::set_setting(&conn, "image_provider", &settings.image_provider)
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "image_model", &settings.image_model).map_err(|e| e.to_string())?;
    db::set_setting(
        &conn,
        "image_api_key",
        &encrypt_api_key(&settings.image_api_key, &settings.image_provider),
    )
    .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "image_base_url", &settings.image_base_url)
        .map_err(|e| e.to_string())?;

    db::set_setting(&conn, "tts_provider", &settings.tts_provider).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "tts_api_key", &encrypt_api_key(&settings.tts_api_key, &settings.tts_provider))
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "tts_voice", &settings.tts_voice).map_err(|e| e.to_string())?;

    db::set_setting(&conn, "stt_provider", &settings.stt_provider).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "stt_api_key", &encrypt_api_key(&settings.stt_api_key, &settings.stt_provider))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn test_provider_connection(
    provider: &str,
    base_url: &str,
    api_key: Option<&str>,
) -> Result<Vec<String>, String> {
    let clean_base = base_url.trim().trim_end_matches('/');

    if !clean_base.is_empty() {
        validate_provider_url(clean_base, false)?;
    }

    let provider_owned = provider.to_string();
    let clean_base_owned = clean_base.to_string();
    let api_key_owned = api_key.map(|k| k.to_string());

    run_blocking(move || {
        let agent = crate::providers::http_client();
        crate::providers::models::list_models(
            &provider_owned,
            &clean_base_owned,
            api_key_owned.as_deref(),
            &agent,
        )
    })
    .await
}

#[tauri::command]
async fn list_vaults(state: State<'_, AppState>) -> Result<Vec<HashMap<String, String>>, String> {
    let vault_path_str = state.vault_path.lock().await;
    let current_vault = std::path::Path::new(&*vault_path_str);

    // Resolve the campaigns directory as the canonicalized parent of the vault.
    // This prevents listing arbitrary directories if the vault is not under a
    // campaigns/ folder.
    let campaigns_dir = current_vault
        .parent()
        .ok_or("Invalid vault path structure: no parent directory")?;
    let canonical_campaigns = campaigns_dir
        .canonicalize()
        .map_err(|e| format!("Cannot resolve campaigns directory: {}", e))?;

    let mut list = Vec::new();
    if canonical_campaigns.is_dir() {
        for entry in std::fs::read_dir(&canonical_campaigns).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let mut map = HashMap::new();
                    map.insert("name".to_string(), name.to_string());
                    map.insert("path".to_string(), path.to_string_lossy().to_string());
                    list.push(map);
                }
            }
        }
    }
    Ok(list)
}

#[tauri::command]
fn create_vault(state: State<AppState>, name: &str) -> Result<String, String> {
    let sanitized_name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == ' ')
        .collect();
    let sanitized_name = sanitized_name.trim();
    if sanitized_name.is_empty() {
        return Err("Invalid vault name".to_string());
    }

    let new_vault_path = state.campaigns_root.join(&sanitized_name);

    if new_vault_path.exists() {
        return Err("A campaign vault with this name already exists".to_string());
    }

    std::fs::create_dir_all(&new_vault_path).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(new_vault_path.join("Worldbuilding")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(new_vault_path.join("Characters")).map_err(|e| e.to_string())?;

    let seed_note_path = new_vault_path.join("Worldbuilding/Eldoria.md");
    std::fs::write(&seed_note_path, r#"---
type: Location
region: Eastern Reaches
ruler: Queen Valerius
safety: Medium
---
# Eldoria

Eldoria is a sprawling kingdom known for its towering white-stone structures and the shimmering River of Stars that flows through its capital."#).map_err(|e| e.to_string())?;

    Ok(new_vault_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn switch_vault(app: tauri::AppHandle, state: State<'_, AppState>, path: &str) -> Result<(), String> {
    let canonical_target = validate_campaigns_path(&state.campaigns_root, path)?;

    if !canonical_target.is_dir() {
        return Err("Target vault path does not exist or is not a directory".to_string());
    }

    // Signal old watcher/indexer threads to shut down and drop the old watcher.
    {
        let old_shutdown = state.shutdown.lock().await;
        old_shutdown.store(true, Ordering::Relaxed);
        let mut watcher_guard = state.watcher.lock().await;
        *watcher_guard = None;
    }

    let new_vault_path_str = canonical_target.to_string_lossy().to_string();
    let new_db_path_str = canonical_target
        .join("loreweaver_vault.db")
        .to_string_lossy()
        .to_string();

    let new_conn = db::init_db(&new_db_path_str).map_err(|e| e.to_string())?;
    db::seed_default_rules(&new_conn).map_err(|e| e.to_string())?;
    let new_conn = Arc::new(Mutex::new(new_conn));

    {
        let mut vault_path_guard = state.vault_path.lock().await;
        *vault_path_guard = new_vault_path_str.clone();

        let mut db_path_guard = state.db_path.lock().await;
        *db_path_guard = new_db_path_str.clone();

        let mut conn_guard = state.conn.lock().await;
        *conn_guard = Arc::clone(&new_conn);
    }

    // Reset shutdown flag for the new vault's background threads.
    let new_shutdown = Arc::new(AtomicBool::new(false));
    {
        let mut shutdown_guard = state.shutdown.lock().await;
        *shutdown_guard = Arc::clone(&new_shutdown);
    }

    let new_watcher = watcher::start_directory_watcher(
        new_vault_path_str.clone(),
        Arc::clone(&new_conn),
        app,
        Arc::clone(&new_shutdown),
    )?;
    {
        let mut watcher_guard = state.watcher.lock().await;
        *watcher_guard = Some(new_watcher);
    }

    let conn_clone = Arc::clone(&new_conn);
    let vault_path_clone = new_vault_path_str.clone();
    let new_db_path_clone = new_db_path_str.clone();
    let shutdown_clone = Arc::clone(&new_shutdown);

    let search_engine_dir = canonical_target
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "./data".to_string());

    std::thread::spawn(move || {
        if shutdown_clone.load(Ordering::Relaxed) {
            return;
        }
        search::set_db_path(&new_db_path_clone);
        match search::init_search_engine(&search_engine_dir) {
            Ok(_) => {
                if shutdown_clone.load(Ordering::Relaxed) {
                    return;
                }
                let conn_guard = conn_clone.lock().unwrap_or_else(|e| e.into_inner());
                if shutdown_clone.load(Ordering::Relaxed) {
                    return;
                }
                let _ = search::index_all_rules_vectors(&conn_guard);
                if shutdown_clone.load(Ordering::Relaxed) {
                    return;
                }
                let _ = watcher::sync_entire_directory(
                    std::path::Path::new(&vault_path_clone),
                    &conn_guard,
                );
                if shutdown_clone.load(Ordering::Relaxed) {
                    return;
                }
                let _ = cleanup_expired_trash(&vault_path_clone, &conn_guard);
                println!("New campaign vault notes vector-indexed successfully!");
            }
            Err(e) => eprintln!("Failed to initialize search engine for new vault: {:?}", e),
        }
    });

    Ok(())
}

#[tauri::command]
async fn delete_vault(state: State<'_, AppState>, vault_path: &str) -> Result<(), String> {
    let current_vault_path = state.vault_path.lock().await.clone();

    if current_vault_path == vault_path {
        return Err(
            "Cannot delete the currently active vault. Please switch to another vault first."
                .to_string(),
        );
    }

    let canonical_target = validate_campaigns_path(&state.campaigns_root, vault_path)?;

    if !canonical_target.is_dir() {
        return Err("Vault directory does not exist".to_string());
    }

    std::fs::remove_dir_all(&canonical_target)
        .map_err(|e| format!("Failed to delete vault directory: {}", e))?;
    Ok(())
}

#[tauri::command]
fn open_vault_dialog() -> Result<Option<String>, String> {
    let res = rfd::FileDialog::new()
        .set_title("Select Campaign Vault Directory")
        .pick_folder();

    match res {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}



#[tauri::command]
async fn load_vault_settings(state: State<'_, AppState>) -> Result<VaultSettings, String> {
    let vault_path_str = state.vault_path.lock().await;
    let config_file = std::path::Path::new(&*vault_path_str).join("vault_config.json");
    if !config_file.exists() {
        return Ok(VaultSettings::default());
    }
    let content = std::fs::read_to_string(&config_file).map_err(|e| e.to_string())?;
    let settings: VaultSettings = serde_json::from_str(&content).unwrap_or_default();
    Ok(settings)
}

#[tauri::command]
async fn save_vault_settings(state: State<'_, AppState>, settings: VaultSettings) -> Result<(), String> {
    let vault_path_str = state.vault_path.lock().await;
    let config_file = std::path::Path::new(&*vault_path_str).join("vault_config.json");
    let json_str = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&config_file, json_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_canvas_file(state: State<'_, AppState>, rel_path: &str) -> Result<String, String> {
    let vault_path_str = state.vault_path.lock().await;
    let full_path = validate_safe_path(&vault_path_str, rel_path)?;
    if !full_path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(full_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_canvas_file(state: State<'_, AppState>, rel_path: &str, content: &str) -> Result<(), String> {
    let vault_path_str = state.vault_path.lock().await;
    let full_path = validate_safe_path(&vault_path_str, rel_path)?;
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(full_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_templates(state: State<'_, AppState>) -> Result<Vec<TemplateEntry>, String> {
    let vault_path_str = state.vault_path.lock().await;
    let templates_dir = validate_safe_path(&vault_path_str, ".templates")?;
    if !templates_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let matter = gray_matter::Matter::<gray_matter::engine::YAML>::new();

    for entry in std::fs::read_dir(templates_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
            let name = path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();

            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let parsed = matter.parse::<std::collections::HashMap<String, serde_json::Value>>(&content);
            if let Ok(parsed_data) = parsed {
                if let Some(data) = parsed_data.data {
                    // Extract properties
                    let mut properties = std::collections::HashMap::new();
                    if let Some(props_val) = data.get("properties") {
                        if let Some(props_map) = props_val.as_object() {
                            for (k, v) in props_map {
                                if let Ok(prop) = serde_json::from_value::<TemplateProperty>(v.clone()) {
                                    properties.insert(k.clone(), prop);
                                }
                            }
                        }
                    }

                    // Extract actions
                    let mut actions = Vec::new();
                    if let Some(actions_val) = data.get("actions") {
                        if let Some(actions_arr) = actions_val.as_array() {
                            for act_val in actions_arr {
                                if let Ok(act) = serde_json::from_value::<TemplateAction>(act_val.clone()) {
                                    actions.push(act);
                                }
                            }
                        }
                    }

                    entries.push(TemplateEntry {
                        name,
                        properties,
                        actions,
                    });
                }
            }
        }
    }
    Ok(entries)
}

/// Loads all third-party plugins from the configured plugins folder.
#[tauri::command]
async fn load_plugins(state: State<'_, AppState>) -> Result<Vec<PluginInfo>, String> {
    let plugins_path = state.plugins_path.lock().await;
    let vault_path = state.vault_path.lock().await;
    plugins::load_all_plugins(&vault_path, &plugins_path)
}

/// Executes a callback hook in a specific loaded plugin sandbox.
#[tauri::command]
async fn execute_plugin_hook(
    state: State<'_, AppState>,
    plugin_id: &str,
    hook: &str,
    payload: &str,
) -> Result<String, String> {
    let vault_path = state.vault_path.lock().await;
    plugins::run_plugin_hook(&vault_path, plugin_id, hook, payload)
}

/// Main entry point and bootstrapper for the Tauri v2 desktop application.
///
/// ### Bootstrapping Sequence
/// 1. **Local Storage Setup**: Resolves OS-specific `app_data_dir` and creates `campaigns/default` and `plugins` directories.
/// 2. **Sample Plugin & Note Seeding**: Seeds a default `dice-roller` JS plugin and starter worldbuilding notes if uninitialized.
/// 3. **Database Initialization**: Connects SQLite (`db::init_db`) and seeds default TTRPG SRD rulebook entries (`db::seed_default_rules`).
/// 4. **Directory Watcher**: Spawns real-time `notify` filesystem watcher (`watcher::start_directory_watcher`).
/// 5. **Background Search Thread**: Spawns a background thread to load fastembed models (`search::init_search_engine`),
///    vector-index existing notes & rules, perform directory sync, and purge expired trash.
/// 6. **State Injection**: Injects initialized `AppState` into Tauri runtime (`app.manage(...)`).
/// 7. **IPC Command Registration**: Registers all exposed `#[tauri::command]` functions via `tauri::generate_handler![...]`.
/// 8. **Event Loop Launch**: Hands off execution to the Tauri window runtime with `tauri::generate_context!()`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            let err = |msg: String| -> Box<dyn std::error::Error> {
                msg.into()
            };

            // Resolve local-first directories
            let app_data_dir = app_handle.path().app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| err(format!("Failed to create app data dir: {}", e)))?;

            let vault_path = app_data_dir.join("campaigns/default").to_string_lossy().to_string();
            let db_path = app_data_dir.join("campaigns/default/loreweaver_vault.db").to_string_lossy().to_string();
            let plugins_path = app_data_dir.join("plugins").to_string_lossy().to_string();
            std::fs::create_dir_all(&vault_path)
                .map_err(|e| err(format!("Failed to create vault dir: {}", e)))?;
            std::fs::create_dir_all(&plugins_path)
                .map_err(|e| err(format!("Failed to create plugins dir: {}", e)))?;

            // Seed a sample notation dice roller plugin
            let sample_plugin_dir = app_data_dir.join("plugins/dice-roller");
            std::fs::create_dir_all(&sample_plugin_dir)
                .map_err(|e| err(format!("Failed to create sample plugin dir: {}", e)))?;

            let sample_manifest = sample_plugin_dir.join("manifest.json");
            if !sample_manifest.exists() {
                std::fs::write(&sample_manifest, r#"{
  "id": "dice-roller",
  "name": "Notation Dice Roller",
  "version": "1.0.0",
  "description": "Notation-based RPG dice roller supporting standard dice formats (e.g. 2d10+4).",
  "permissions": ["hooks"],
  "entry": "index.js"
}"#).map_err(|e| err(format!("Failed to write sample manifest: {}", e)))?;
            }

            let sample_script = sample_plugin_dir.join("index.js");
            if !sample_script.exists() {
                std::fs::write(&sample_script, r#"function roll_notation(payload) {
    let str = payload.toLowerCase().replace(/\s+/g, '');
    let termRegex = /([+-]?)(?:(\d*)d(\d+|%|f)|(\d+))/g;
    let match;
    let total = 0;
    let explanation = [];

    while ((match = termRegex.exec(str)) !== null) {
        let sign = match[1] === '-' ? -1 : 1;
        let signText = match[1] || (explanation.length > 0 ? '+' : '');

        if (match[4]) {
            let val = parseInt(match[4], 10);
            total += sign * val;
            explanation.push(signText + val);
        } else {
            let count = match[2] ? parseInt(match[2], 10) : 1;
            let sidesStr = match[3];
            let sides = sidesStr === '%' ? 100 : (sidesStr === 'f' ? 'f' : parseInt(sidesStr, 10));

            let termRolls = [];
            let termTotal = 0;
            for (let i = 0; i < count; i++) {
                let rollVal;
                if (sides === 'f') {
                    rollVal = Math.floor(Math.random() * 3) - 1;
                } else {
                    rollVal = Math.floor(Math.random() * sides) + 1;
                }
                termRolls.push(rollVal);
                termTotal += rollVal;
            }

            total += sign * termTotal;
            explanation.push(signText + count + "d" + sidesStr + "[" + termRolls.join(",") + "]");
        }
    }

    if (explanation.length === 0) {
        return JSON.stringify({
            notation: payload,
            total: 0,
            rolls: "Invalid dice notation"
        });
    }

    return JSON.stringify({
        notation: payload,
        total: total,
        rolls: explanation.join(" ")
    });
}"#).map_err(|e| err(format!("Failed to write sample script: {}", e)))?;
            }

            // Seed sample files if vault is completely empty
            let eldoria_path = app_data_dir.join("campaigns/default/Worldbuilding/Eldoria.md");
            if !eldoria_path.exists() {
                if let Some(parent) = eldoria_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| err(format!("Failed to create sample dir: {}", e)))?;
                }
                std::fs::write(&eldoria_path, r#"---
type: Location
region: Eastern Reaches
ruler: Queen Valerius
safety: Medium
---
# Eldoria

Eldoria is a sprawling kingdom known for its towering white-stone structures and the shimmering River of Stars that flows through its capital.

The city is divided into three major rings:
1. **The Sunlit Spire**: The royal court and administrative sector.
2. **The Canopy District**: A bustling commercial hub suspended on great white arches.
3. **The Shadowed Docks**: The lower slums alongside the River of Stars where contraband changes hands.

## Key Factions
- **The Silver Shield**: A group of paladins dedicated to the protection of the realm.
- **The Shadow Hand**: A clandestine thieves' guild operating in the lower slums."#).map_err(|e| err(format!("Failed to write sample note: {}", e)))?;
            }

            let malakor_path = app_data_dir.join("campaigns/default/Characters/Lord Malakor.md");
            if !malakor_path.exists() {
                if let Some(parent) = malakor_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| err(format!("Failed to create sample dir: {}", e)))?;
                }
                std::fs::write(&malakor_path, r#"---
type: NPC
system: dnd5e
alignment: Lawful Evil
hp: 120
ac: 18
---
# Lord Malakor

Lord Malakor is the ruler of the Shadow Keep, a forbidding fortress built into the side of Mount Obsidian. He seeks to unlock the Obsidian Gate in Eldoria.

## Personality Traits
- **Flaw**: Underestimates the resolve of the common folk.
- **Ideal**: Power. Only the strong deserve to rule."#).map_err(|e| err(format!("Failed to write sample note: {}", e)))?;
            }

            // Init Database and Seed Rules
            let conn = db::init_db(&db_path)
                .map_err(|e| err(format!("Failed to init database: {}", e)))?;
            db::seed_default_rules(&conn)
                .map_err(|e| err(format!("Failed to seed default rules: {}", e)))?;
            let conn = Arc::new(Mutex::new(conn));

            // Cooperative shutdown flag shared by watcher flusher and background indexer threads.
            let shutdown = Arc::new(AtomicBool::new(false));

            // Spawn Fs Watcher (triggers initial index scan automatically)
            let watcher = watcher::start_directory_watcher(
                vault_path.clone(),
                Arc::clone(&conn),
                app_handle.clone(),
                Arc::clone(&shutdown),
            )
            .map_err(|e| err(format!("Failed to start directory watcher: {}", e)))?;

            // Spawn local search engine initialization and subsequent vector indexing in a background thread
            let app_data_dir_str = app_data_dir.to_string_lossy().to_string();
            let conn_clone = Arc::clone(&conn);
            let vault_path_clone = vault_path.clone();
            let db_path_clone = db_path.clone();
            let shutdown_clone = Arc::clone(&shutdown);
            std::thread::spawn(move || {
                if shutdown_clone.load(Ordering::Relaxed) {
                    return;
                }
                search::set_db_path(&db_path_clone);
                match search::init_search_engine(&app_data_dir_str) {
                    Ok(_) => {
                        if shutdown_clone.load(Ordering::Relaxed) {
                            return;
                        }
                        println!("Search engine loaded. Vector-indexing existing notes and rules...");
                        let conn_guard = conn_clone.lock().unwrap_or_else(|e| e.into_inner());
                        if shutdown_clone.load(Ordering::Relaxed) {
                            return;
                        }
                        let _ = search::index_all_rules_vectors(&conn_guard);
                        if shutdown_clone.load(Ordering::Relaxed) {
                            return;
                        }
                        let _ = watcher::sync_entire_directory(
                            std::path::Path::new(&vault_path_clone),
                            &conn_guard,
                        );
                        if shutdown_clone.load(Ordering::Relaxed) {
                            return;
                        }
                        let _ = cleanup_expired_trash(
                            &vault_path_clone,
                            &conn_guard,
                        );
                        println!("Notes and rules successfully vector indexed!");
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize search engine: {:?}", e);
                    }
                }
            });

            let campaigns_root = app_data_dir.join("campaigns");

            app.manage(AppState {
                db_path: TokioMutex::new(db_path),
                vault_path: TokioMutex::new(vault_path),
                plugins_path: TokioMutex::new(plugins_path),
                watcher: TokioMutex::new(Some(watcher)),
                conn: TokioMutex::new(conn),
                campaigns_root,
                shutdown: TokioMutex::new(shutdown),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            load_notes,
            load_trash_notes,
            empty_trash,
            save_note,
            save_note_asset,
            resolve_wiki_link,
            load_rules,
            save_rule,
            delete_rule,
            get_vault_path,
            search_vault,
            ingest_srd_text,
            orchestrate_agent,
            generate_image,
            generate_speech,
            transcribe_speech,
            load_plugins,
            execute_plugin_hook,
            load_settings,
            save_settings,
            test_provider_connection,
            list_vaults,
            create_vault,
            switch_vault,
            trash_note,
            trash_folder,
            restore_note,
            delete_trashed_note,
            delete_rules_folder,
            list_folders,
            delete_vault,
            open_vault_dialog,
            load_vault_settings,
            save_vault_settings,
            load_canvas_file,
            save_canvas_file,
            list_templates,
            reindex_vault,
            convert_pdf_to_markdown,
            save_session_memory,
            list_session_memory,
            delete_session_memory,
            summarize_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Export TypeScript bindings for all Tauri command input/output types.
///
/// Called from `build.rs` at compile time so the React frontend can import strongly-typed
/// interfaces from `src/bindings.ts`.
pub fn export_bindings_to(path: impl AsRef<std::path::Path>) {
    tauri_specta::Builder::<tauri::Wry>::new()
        .typ::<CampaignNote>()
        .typ::<RuleEntry>()
        .typ::<SearchResult>()
        .typ::<AppSettings>()
        .typ::<VaultSettings>()
        .typ::<TemplateEntry>()
        .typ::<TemplateProperty>()
        .typ::<TemplateAction>()
        .typ::<PluginInfo>()
        .dangerously_cast_bigints_to_number()
        .export(specta_typescript::Typescript::default(), path)
        .expect("Failed to export bindings");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn test_trash_note() {
        let temp_dir = std::env::temp_dir().join("loreweaver_test_vault");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let note_dir = temp_dir.join("Worldbuilding");
        std::fs::create_dir_all(&note_dir).unwrap();

        let note_path = note_dir.join("TestNote.md");
        std::fs::write(&note_path, "---\ntitle: Test\ntags: [a]\n---\nHello World").unwrap();

        let db_path = temp_dir.join("test.db");
        let db_path_str = db_path.to_string_lossy().to_string();
        let conn = Arc::new(Mutex::new(db::init_db(&db_path_str).unwrap()));
        let state = AppState {
            db_path: TokioMutex::new(db_path_str),
            vault_path: TokioMutex::new(temp_dir.to_string_lossy().to_string()),
            plugins_path: TokioMutex::new(temp_dir.join("plugins").to_string_lossy().to_string()),
            watcher: TokioMutex::new(None),
            conn: TokioMutex::new(Arc::clone(&conn)),
            campaigns_root: temp_dir.parent().unwrap().to_path_buf(),
            shutdown: TokioMutex::new(Arc::new(AtomicBool::new(false))),
        };

        tauri::async_runtime::block_on(async {
            let vault_path = state.vault_path.lock().await;

            // 1. Trash the note within a scope to release locks immediately
            {
                let binding = state.conn.lock().await;
                let conn_guard = binding.lock().map_err(|e| e.to_string()).unwrap();
                let res = trash_note_impl(&vault_path, &conn_guard, "Worldbuilding/TestNote.md");
                assert!(res.is_ok(), "trash_note failed: {:?}", res);
            }

            // Verify file was moved to .trash/
            let trash_dir = temp_dir.join(".trash");
            assert!(trash_dir.exists(), "Trash directory not created");

            let entries: Vec<_> = std::fs::read_dir(trash_dir)
                .unwrap()
                .map(|e| e.unwrap().path())
                .collect();
            assert_eq!(entries.len(), 1, "Expected 1 file in trash");

            let trashed_file_path = &entries[0];
            let file_name = trashed_file_path.file_name().unwrap().to_string_lossy();
            assert!(
                file_name.contains("_TestNote.md"),
                "Unexpected file in trash: {}",
                file_name
            );

            // Verify original file is gone
            assert!(!note_path.exists(), "Original file not deleted");

            // Verify DB entry is gone
            let count: i64 = conn
                .lock()
                .map_err(|e| e.to_string())
                .unwrap()
                .query_row(
                    "SELECT count(*) FROM notes WHERE path = 'Worldbuilding/TestNote.md'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "Note still exists in DB");

            // Verify load_trash_notes
            let trashed = load_trash_notes_impl(&vault_path).unwrap();
            assert_eq!(trashed.len(), 1, "Expected 1 note in load_trash_notes");
            assert_eq!(trashed[0].title, "Test");

            // Test restore_note within a separate scope to avoid deadlocks
            {
                let binding = state.conn.lock().await;
                let conn_guard = binding.lock().map_err(|e| e.to_string()).unwrap();
                let restore_res = restore_note_impl(&vault_path, &conn_guard, &trashed[0].path);
                assert!(
                    restore_res.is_ok(),
                    "restore_note failed: {:?}",
                    restore_res
                );
            }

            // Verify original file is back
            assert!(note_path.exists(), "Original file not restored");
        });
    }

    #[test]
    fn test_symlink_escapes_vault_is_rejected() {
        use std::fs;
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("vault");
        let outside = tmp.path().join("outside.txt");
        let link = vault.join("escape.md");
        fs::create_dir(&vault).unwrap();
        fs::write(&outside, "secret").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&outside, &link).unwrap();
        let result = validate_safe_path(vault.to_str().unwrap(), "escape.md");
        assert!(result.is_err(), "symlink escape must be rejected");
    }

    #[test]
    fn test_empty_note_and_folder_trashing() {
        let temp_dir = std::env::temp_dir().join("loreweaver_test_vault_empty");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let note_dir = temp_dir.join("Worldbuilding");
        std::fs::create_dir_all(&note_dir).unwrap();

        let empty_note_path = note_dir.join("EmptyNote.md");
        std::fs::write(&empty_note_path, "").unwrap(); // Completely empty file

        let db_path = temp_dir.join("test.db");
        let db_path_str = db_path.to_string_lossy().to_string();
        let conn = Arc::new(Mutex::new(db::init_db(&db_path_str).unwrap()));
        let state = AppState {
            db_path: TokioMutex::new(db_path_str),
            vault_path: TokioMutex::new(temp_dir.to_string_lossy().to_string()),
            plugins_path: TokioMutex::new(temp_dir.join("plugins").to_string_lossy().to_string()),
            watcher: TokioMutex::new(None),
            conn: TokioMutex::new(Arc::clone(&conn)),
            campaigns_root: temp_dir.parent().unwrap().to_path_buf(),
            shutdown: TokioMutex::new(Arc::new(AtomicBool::new(false))),
        };

        tauri::async_runtime::block_on(async {
            let vault_path = state.vault_path.lock().await;
            let binding = state.conn.lock().await;
            let conn_guard = binding.lock().map_err(|e| e.to_string()).unwrap();

            // 1. Verify parsing and trashing empty note directly
            let res = trash_note_impl(&vault_path, &conn_guard, "Worldbuilding/EmptyNote.md");
            assert!(res.is_ok(), "trash_note failed on empty note: {:?}", res);

            // 2. Re-create empty note and test folder trashing
            std::fs::write(&empty_note_path, "").unwrap();
            let trash_folder_res = trash_folder_impl(&vault_path, &conn_guard, "Worldbuilding");
            assert!(
                trash_folder_res.is_ok(),
                "trash_folder failed: {:?}",
                trash_folder_res
            );

            // Verify folder is gone
            assert!(!note_dir.exists(), "Folder still exists");
        });
    }

    #[test]
    fn test_api_key_round_trip() {
        let key = "sk-test-12345";
        let provider = "test-provider";

        if !keyring_is_available() {
            // OS keyring is unavailable in headless/CI environments; skip rather
            // than silently testing the legacy fallback. The legacy path is
            // covered separately by `test_legacy_api_key_round_trip`.
            println!(
                "Skipping keyring round-trip: OS keyring unavailable in this environment"
            );
            return;
        }

        let encrypted = encrypt_api_key(key, provider);
        assert!(!encrypted.contains(key));
        assert!(encrypted.starts_with("keyring:"));
        let decrypted = decrypt_api_key(&encrypted, provider).unwrap();
        assert_eq!(decrypted, key);
    }

    #[test]
    fn test_legacy_api_key_round_trip() {
        let key = "sk-test-12345";
        let provider = "test-provider";
        let legacy_ciphertext = legacy_encrypt_api_key(key, provider);
        assert!(!legacy_ciphertext.contains(key));
        let decrypted = decrypt_api_key(&legacy_ciphertext, provider).unwrap();
        assert_eq!(decrypted, key);
    }

    #[test]
    fn test_save_note_asset_rejects_traversal_filename() {
        assert!(sanitize_asset_name("../../../etc/passwd").is_err());
        assert_eq!(sanitize_asset_name("evil.png").unwrap(), "evil.png");
        assert!(sanitize_asset_name(".hidden").is_err());
        assert!(sanitize_asset_name("dir/file.png").is_err());
    }

    #[test]
    fn test_provider_url_blocks_private_ranges() {
        for bad in &[
            "http://localhost:11434",
            "http://127.0.0.1",
            "http://192.168.1.1",
            "http://10.0.0.1",
            "http://[::1]",
        ] {
            assert!(
                validate_provider_url(bad, false).is_err(),
                "{} should be blocked",
                bad
            );
        }
        assert!(validate_provider_url("https://api.openai.com", false).is_ok());
        assert!(validate_provider_url("http://localhost:11434", true).is_ok());
    }

    #[test]
    fn test_resolve_wiki_link_escaped_wildcards() {
        let temp_dir = std::env::temp_dir().join("loreweaver_wiki_test");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        let world_dir = temp_dir.join("Worldbuilding");
        std::fs::create_dir_all(&world_dir).unwrap();

        // Seed two notes: one whose title contains a literal '%' and another that would match a wildcard.
        std::fs::write(
            world_dir.join("50% discount.md"),
            "# 50% discount\n\ncontent",
        )
        .unwrap();
        std::fs::write(
            world_dir.join("Goblin.md"),
            "# Goblin\n\ncontent",
        )
        .unwrap();

        let db_path = temp_dir.join("test.db");
        let db_path_str = db_path.to_string_lossy().to_string();
        let conn = Arc::new(Mutex::new(db::init_db(&db_path_str).unwrap()));
        let state = AppState {
            db_path: TokioMutex::new(db_path_str),
            vault_path: TokioMutex::new(temp_dir.to_string_lossy().to_string()),
            plugins_path: TokioMutex::new(temp_dir.join("plugins").to_string_lossy().to_string()),
            watcher: TokioMutex::new(None),
            conn: TokioMutex::new(Arc::clone(&conn)),
            campaigns_root: temp_dir.parent().unwrap().to_path_buf(),
            shutdown: TokioMutex::new(Arc::new(AtomicBool::new(false))),
        };

        tauri::async_runtime::block_on(async {
        // Create notes in DB from disk content
        let binding = state.conn.lock().await;
        let conn_guard = binding.lock().map_err(|e| e.to_string()).unwrap();
        let _ = db::upsert_note(
            &conn_guard,
            "Worldbuilding/50% discount.md",
            "50% discount",
            "content",
            &HashMap::new(),
        )
        .unwrap();
        let _ = db::upsert_note(
            &conn_guard,
            "Worldbuilding/Goblin.md",
            "Goblin",
            "content",
            &HashMap::new(),
        )
        .unwrap();
        drop(conn_guard);
        drop(binding);

        // Resolve the literal '%' target. It should match the exact note, not every note.
        let note = unsafe {
            let s: tauri::State<AppState> = std::mem::transmute(&state);
            resolve_wiki_link(s, "50% discount").await
        };
        assert!(note.is_ok(), "resolve_wiki_link failed: {:?}", note);
        let note = note.unwrap();
        assert_eq!(note.title, "50% discount");

        // A wildcard-only target should not match all notes; it should auto-create a new one.
        let wildcard = unsafe {
            let s: tauri::State<AppState> = std::mem::transmute(&state);
            resolve_wiki_link(s, "%").await
        };
        assert!(wildcard.is_ok(), "resolve_wiki_link wildcard failed: {:?}", wildcard);
        let wildcard = wildcard.unwrap();
        assert_eq!(wildcard.title, "%");
        assert!(wildcard.path.contains("Worldbuilding/_.md"));
        });

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    fn test_state(temp_dir: &std::path::Path) -> AppState {
        let db_path = temp_dir.join("test.db");
        let db_path_str = db_path.to_string_lossy().to_string();
        let conn = Arc::new(Mutex::new(db::init_db(&db_path_str).unwrap()));
        AppState {
            db_path: TokioMutex::new(db_path_str),
            vault_path: TokioMutex::new(temp_dir.to_string_lossy().to_string()),
            plugins_path: TokioMutex::new(temp_dir.join("plugins").to_string_lossy().to_string()),
            watcher: TokioMutex::new(None),
            conn: TokioMutex::new(conn),
            campaigns_root: temp_dir.parent().unwrap().to_path_buf(),
            shutdown: TokioMutex::new(Arc::new(AtomicBool::new(false))),
        }
    }

    #[test]
    fn test_save_and_load_notes() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("Worldbuilding")).unwrap();
        let state = test_state(tmp.path());
        let note = CampaignNote {
            id: "note-1".to_string(),
            title: "Ancient City".to_string(),
            path: "Worldbuilding/AncientCity.md".to_string(),
            frontmatter: HashMap::new(),
            content: "# Ancient City\nA city built on stone arches.".to_string(),
        };

        tauri::async_runtime::block_on(async {
            {
                let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
                save_note(s, note.clone()).await.unwrap();
            }

            // Verify file written to disk
            let on_disk = tmp.path().join("Worldbuilding/AncientCity.md");
            assert!(on_disk.exists(), "note file not written to disk");
            let disk_content = std::fs::read_to_string(&on_disk).unwrap();
            assert!(disk_content.contains("Ancient City"));

            // Verify load_notes returns the note
            {
                let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
                let notes = load_notes(s).await.unwrap();
                assert_eq!(notes.len(), 1);
                assert_eq!(notes[0].title, "Ancient City");
                assert_eq!(notes[0].path, "Worldbuilding/AncientCity.md");
                assert!(notes[0].content.contains("Ancient City"));
            }
        });
    }

    #[test]
    fn test_list_folders_excludes_trash_hidden_assets() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();
        std::fs::create_dir_all(vault.join("Worldbuilding").join("Cities")).unwrap();
        std::fs::create_dir_all(vault.join("Characters")).unwrap();
        std::fs::create_dir_all(vault.join(".trash")).unwrap();
        std::fs::create_dir_all(vault.join("Worldbuilding/.hidden")).unwrap();
        std::fs::create_dir_all(vault.join("Worldbuilding/Cities/_assets")).unwrap();

        let state = test_state(vault);

        tauri::async_runtime::block_on(async {
            let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
            let folders = list_folders(s).await.unwrap();

            assert!(folders.contains(&"Worldbuilding".to_string()));
            assert!(folders.contains(&"Characters".to_string()));
            assert!(folders.contains(&"Worldbuilding/Cities".to_string()));
            // Excluded paths
            assert!(!folders.contains(&".trash".to_string()));
            assert!(!folders.contains(&"Worldbuilding/.hidden".to_string()));
            assert!(!folders.contains(&"Worldbuilding/Cities/_assets".to_string()));
            // Hidden and assets dirs must not appear anywhere
            assert!(folders.iter().all(|f| !f.starts_with('.') && !f.contains("/.") && !f.ends_with("_assets")));
        });
    }

    #[test]
    fn test_save_load_delete_rule() {
        let tmp = tempfile::tempdir().unwrap();
        let state = test_state(tmp.path());
        let rule = RuleEntry {
            id: "rule-abc".to_string(),
            path: "Combat/Charge.md".to_string(),
            title: "Charge".to_string(),
            category: "Combat".to_string(),
            source: "Homebrew".to_string(),
            content: "Move at least 20 feet in a straight line, then gain advantage.".to_string(),
        };

        tauri::async_runtime::block_on(async {
            {
                let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
                let saved_id = save_rule(s, rule.clone()).await.unwrap();
                assert_eq!(saved_id, "rule-abc");
            }

            {
                let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
                let rules = load_rules(s).await.unwrap();
                assert_eq!(rules.len(), 1);
                assert_eq!(rules[0].id, "rule-abc");
                assert_eq!(rules[0].title, "Charge");
                assert_eq!(rules[0].category, "Combat");
            }

            {
                let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
                delete_rule(s, "rule-abc").await.unwrap();
            }

            {
                let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
                let rules = load_rules(s).await.unwrap();
                assert!(rules.is_empty(), "rule should be deleted");
            }
        });
    }

    #[test]
    fn test_search_vault_returns_matching_note() {
        let tmp = tempfile::tempdir().unwrap();
        let state = test_state(tmp.path());

        // Seed a note directly into the DB with a distinctive lexical token.
        tauri::async_runtime::block_on(async {
            {
                let conn_guard = state.conn.lock().await;
                let conn = conn_guard.lock().unwrap();
                db::upsert_note(
                    &conn,
                    "Worldbuilding/GoblinHoard.md",
                    "Goblin Hoard",
                    "The goblins buried their glittering hoard beneath the hill.",
                    &HashMap::new(),
                )
                .unwrap();
            }
            search::invalidate_cache();

            let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
            let results = search_vault(s, "goblin", "notes").await.unwrap();
            assert!(
                results.iter().any(|r| r.title == "Goblin Hoard"),
                "expected a note titled 'Goblin Hoard' in results, got {:?}",
                results.iter().map(|r| &r.title).collect::<Vec<_>>()
            );

            search::invalidate_cache();
        });
    }

    #[test]
    fn test_build_system_context_includes_active_note() {
        let tmp = tempfile::tempdir().unwrap();
        let state = test_state(tmp.path());

        tauri::async_runtime::block_on(async {
            let note_id = {
                let conn_guard = state.conn.lock().await;
                let conn = conn_guard.lock().unwrap();
                db::upsert_note(
                    &conn,
                    "Worldbuilding/SwordOfDawn.md",
                    "Sword of Dawn",
                    "A radiant blade forged at dawn.",
                    &HashMap::new(),
                )
                .unwrap()
            };
            search::invalidate_cache();

            {
                let conn_guard = state.conn.lock().await;
                let conn = conn_guard.lock().unwrap();
                let context =
                    agent::build_system_context(&conn, "what about the blade", Some(&note_id))
                        .unwrap();
                assert!(
                    context.system_prompt.contains("Sword of Dawn"),
                    "system prompt should reference the active note title"
                );
                assert!(
                    context.active_note_context.contains("Sword of Dawn"),
                    "active note context should include the note"
                );
            }
            search::invalidate_cache();
        });
    }

    #[test]
    fn test_orchestrate_agent_rejects_unsupported_provider() {
        let tmp = tempfile::tempdir().unwrap();
        let state = test_state(tmp.path());

        tauri::async_runtime::block_on(async {
            let s: tauri::State<AppState> = unsafe { std::mem::transmute(&state) };
            let res = orchestrate_agent(
                s,
                "hello",
                "nonexistent",
                "some-model",
                None,
                None,
                None,
            )
            .await;
            assert!(
                res.is_err(),
                "unsupported provider should fail before any HTTP call"
            );
            let err = res.unwrap_err();
            assert!(
                err.contains("Unsupported LLM provider"),
                "unexpected error: {}",
                err
            );
        });
    }
}

#[cfg(test)]
mod template_tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn test_list_templates_parser() {
        let temp_dir = std::env::temp_dir().join(format!("vault_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let templates_dir = temp_dir.join(".templates");
        fs::create_dir_all(&templates_dir).unwrap();

        let template_path = templates_dir.join("Character.md");
        let mut file = fs::File::create(&template_path).unwrap();
        write!(file, "---\nname: Character\nproperties:\n  hp: {{ type: \"number\", default: 10 }}\nactions:\n  - label: \"Roll Initiative\"\n    hook: \"roll_initiative\"\n    plugin: \"character-roller\"\n---\n# Character Content").unwrap();

        // Mock app state
        let db_path = temp_dir.join("test.db");
        let db_path_str = db_path.to_string_lossy().to_string();
        let conn = Arc::new(Mutex::new(db::init_db(&db_path_str).unwrap()));
        let app_state = AppState {
            db_path: TokioMutex::new(db_path_str),
            vault_path: TokioMutex::new(temp_dir.to_string_lossy().to_string()),
            plugins_path: TokioMutex::new(temp_dir.join("plugins").to_string_lossy().to_string()),
            watcher: TokioMutex::new(None),
            conn: TokioMutex::new(Arc::clone(&conn)),
            campaigns_root: temp_dir.parent().unwrap().to_path_buf(),
            shutdown: TokioMutex::new(Arc::new(AtomicBool::new(false))),
        };

        tauri::async_runtime::block_on(async {
        let state: tauri::State<AppState> = unsafe { std::mem::transmute(&app_state) };
        let entries = list_templates(state).await.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Character");
        assert!(entries[0].properties.contains_key("hp"));
        });

        let _ = fs::remove_dir_all(temp_dir);
    }
}

